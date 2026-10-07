import os
import subprocess
import sys
import numpy as np
from scipy.io import wavfile
import whisper
import json

# ---------------- 配置 ----------------
ROOT = "/Users/lhp/Desktop/codeProject/ielts-dev/listening-word/chapter8"
silence_thresh = 0.01        # 静音阈值（0~1, 振幅比例）
min_silence_len = 1500       # 静音最短长度，单位毫秒
language = "en"
MODEL_NAME = "large"
DEVICE = "mps"               # whisper 只能单进程单并发
# --------------------------------------


def collect_mp3s(root):
    """递归收集 chapter8 下所有源 mp3（跳过已生成的 chunk 输出目录）。"""
    items = []
    for dirpath, _dirs, files in os.walk(root):
        # 跳过我们自己生成的输出目录
        if os.path.basename(dirpath).endswith("_chunks"):
            continue
        for f in files:
            if f.lower().endswith(".mp3"):
                items.append(os.path.join(dirpath, f))
    items.sort()
    return items


def split_silence(input_file, output_dir):
    """MP3 -> WAV -> 静音检测切割 -> 导出多个子 mp3，返回子文件列表。"""
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
    data = data.astype(np.float64)
    peak = np.max(np.abs(data))
    if peak == 0:
        os.remove(wav_file)
        return [], wav_file
    data = data / peak  # 归一化 [-1,1]

    # 3️⃣ 检测非静音段
    frame_size = int(rate * (min_silence_len / 1000))
    segments = []
    start = None
    for i in range(0, len(data), frame_size):
        frame = data[i:i + frame_size]
        if np.max(np.abs(frame)) > silence_thresh:
            if start is None:
                start = i
        else:
            if start is not None:
                segments.append((start, i))
                start = None
    if start is not None:
        segments.append((start, len(data)))

    print(f"  检测到 {len(segments)} 个非静音段")

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

    return chunk_files, wav_file


def process_mp3(model, input_file):
    """对单个源 mp3：切割 -> 逐个识别 -> 按内容重命名 -> 生成 words_list.json。"""
    base = os.path.splitext(input_file)[0]
    output_dir = base + "_chunks"

    words_file = os.path.join(output_dir, "words_list.json")
    if os.path.exists(words_file):
        print(f"  已处理，跳过 ({output_dir})")
        return

    chunk_files, wav_file = split_silence(input_file, output_dir)

    # 5️⃣ 识别、重命名、记录单词
    words_list = []
    for chunk_file in chunk_files:
        result = model.transcribe(chunk_file, language=language, fp16=False)
        text = result['text'].strip()
        if not text:
            text = "unknown"

        # 重命名
        safe_text = text.replace(" ", "_").lower()
        safe_text = safe_text.replace(".", "")  # 删除所有点号
        safe_text = safe_text.replace("/", "_")  # 避免路径分隔符
        new_name = os.path.join(output_dir, f"{safe_text}.mp3")
        counter = 1
        orig_name = new_name
        while os.path.exists(new_name):
            new_name = orig_name.replace(".mp3", f"_{counter}.mp3")
            counter += 1
        os.rename(chunk_file, new_name)
        print(f"  {os.path.basename(chunk_file)} -> {os.path.basename(new_name)}")

        words_list.append(text.lower().replace(".", ""))

    # 6️⃣ 保存单词列表
    with open(words_file, "w", encoding="utf-8") as f:
        json.dump(words_list, f, ensure_ascii=False, indent=2)
    print(f"  单词列表已保存到 {words_file}")

    # 7️⃣ 清理临时 WAV
    if os.path.exists(wav_file):
        os.remove(wav_file)


def main():
    mp3_files = collect_mp3s(ROOT)
    print(f"共发现 {len(mp3_files)} 个源 mp3")
    if not mp3_files:
        print("无 mp3 可处理")
        return

    # 加载 Whisper 模型（单进程单并发，只加载一次）
    print(f"加载 whisper 模型: {MODEL_NAME} on {DEVICE} ...")
    model = whisper.load_model(MODEL_NAME, device=DEVICE)
    print("模型加载完成")

    for idx, mp3 in enumerate(mp3_files, 1):
        rel = os.path.relpath(mp3, ROOT)
        print(f"[{idx}/{len(mp3_files)}] {rel}", flush=True)
        try:
            process_mp3(model, mp3)
        except Exception as e:
            print(f"  失败: {e}", file=sys.stderr)
            continue

    print("全部完成！")


if __name__ == "__main__":
    main()
