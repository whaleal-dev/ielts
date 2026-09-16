import os
import subprocess
import numpy as np
from scipy.io import wavfile
import whisper
import json

# ---------------- 配置 ----------------
input_file = "/Users/lhp/Desktop/listening/chapter10/Section3.mp3"     # 原始音频文件
output_dir = "listening-word/chunks/section3/"    # 输出目录
silence_thresh = 0.01        # 静音阈值（0~1, 振幅比例）
min_silence_len = 1500       # 静音最短长度，单位毫秒
language = "en"
# --------------------------------------

os.makedirs(output_dir, exist_ok=True)

# 1️⃣ MP3 -> WAV
wav_file = os.path.join(output_dir, "temp.wav")
subprocess.run([
    "ffmpeg", "-y", "-i", input_file, wav_file
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# 2️⃣ 读取 WAV
rate, data = wavfile.read(wav_file)
if len(data.shape) > 1:  # stereo -> 左声道
    data = data[:, 0]
data = data / np.max(np.abs(data))  # 归一化 [-1,1]

# 3️⃣ 检测静音段
frame_size = int(rate * (min_silence_len / 1000))
segments = []
start = None
for i in range(0, len(data), frame_size):
    frame = data[i:i+frame_size]
    if np.max(np.abs(frame)) > silence_thresh:
        if start is None:
            start = i
    else:
        if start is not None:
            end = i
            segments.append((start, end))
            start = None
if start is not None:
    segments.append((start, len(data)))

print(f"检测到 {len(segments)} 个非静音段")

# 4️⃣ 导出每个片段
chunk_files = []
for idx, (start_idx, end_idx) in enumerate(segments):
    start_time = start_idx / rate
    duration = (end_idx - start_idx) / rate
    out_file = os.path.join(output_dir, f"chunk_{idx}.mp3")
    subprocess.run([
        "ffmpeg", "-y", "-i", wav_file,
        "-ss", str(start_time), "-t", str(duration),
        out_file
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    chunk_files.append(out_file)

print("切割完成")

# 5️⃣ 加载 Whisper 模型
model = whisper.load_model("large", device='mps')  # 可换 tiny/base

# 6️⃣ 识别、重命名、记录单词
words_list = []
for chunk_file in chunk_files:
    print(f"识别 {chunk_file} ...")
    result = model.transcribe(chunk_file, language=language)
    text = result['text'].strip()
    if not text:
        text = "unknown"

    # 重命名
    safe_text = text.replace(" ", "_").lower()
    safe_text = safe_text.replace(".", "")  # 删除所有点号
    new_name = os.path.join(output_dir, f"{safe_text}.mp3")
    counter = 1
    orig_name = new_name
    while os.path.exists(new_name):
        new_name = orig_name.replace(".mp3", f"_{counter}.mp3")
        counter += 1
    os.rename(chunk_file, new_name)
    print(f"{chunk_file} -> {new_name}")

    words_list.append(text.lower().replace(".", ""))

# 7️⃣ 保存单词列表到文件
words_file = os.path.join(output_dir, "words_list.json")
with open(words_file, "w", encoding="utf-8") as f:
    json.dump(words_list, f, ensure_ascii=False, indent=2)

print(f"单词列表已保存到 {words_file}")
print("全部完成！")

# 8️⃣ 清理临时 WAV
os.remove(wav_file)