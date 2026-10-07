import json
import os
import sys
import time
import logging
from typing import List, Set

# ================== 配置区 ==================
SYNONYM_FILE = "/Users/lhp/Desktop/codeProject/ielts-tool/words/data/source/synonyms/同义词-阅读538考点词.json"
WORDS_FILE = "/Users/lhp/Desktop/codeProject/ielts-tool/words/data/source/reference/words.json"
OUTPUT_FILE = "/Users/lhp/Desktop/同义词-阅读538考点词-llama.json"

BATCH_SIZE = 200
OLLAMA_MODEL = "llama3.1:8b"

LOG_FILE = "expand.log"   # 详细日志文件，设为 None 则不写文件
LOG_LEVEL = logging.DEBUG
# ============================================

def setup_logging():
    """配置日志：控制台显示 INFO，详细 DEBUG 写入文件"""
    logger = logging.getLogger()
    logger.setLevel(LOG_LEVEL)
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    # 控制台 handler
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.INFO)
    console.setFormatter(formatter)
    logger.addHandler(console)
    # 文件 handler
    if LOG_FILE:
        file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

def load_json(filename: str):
    logging.info(f"加载文件: {filename}")
    with open(filename, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(data, filename: str):
    logging.info(f"保存文件: {filename}")
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def build_prompt_for_single_group(group: List[str], batch_words: List[str]) -> str:
    group_str = json.dumps(group, ensure_ascii=False)
    words_str = json.dumps(batch_words, ensure_ascii=False)
    prompt = f"""你是一名语言学家，负责找出一批单词中与给定同义词组相关的单词。

同义词组：{group_str}
待筛选单词：{words_str}

请从这批单词中，找出与同义词组意义相近、可视为同义词或近义词的单词。
只返回一个 JSON 数组，包含找到的单词。如果没有任何相关单词，则返回空数组 []。
严格只输出 JSON，不要包含任何解释、标记或额外文本。

示例正确输出：["word1", "word2"]
"""
    return prompt

def query_ollama(prompt: str, model: str = OLLAMA_MODEL, retries: int = 3) -> str:
    """
    调用本地 ollama 模型，带详细日志和自动重试
    - 记录每次调用的 prompt 长度、模型、返回内容长度等
    - 失败时最多重试 retries 次（指数退避）
    """
    import ollama
    for attempt in range(1, retries + 1):
        logging.debug(f"Ollama 调用 (尝试 {attempt}/{retries}) | 模型: {model} | prompt 长度: {len(prompt)}")
        try:
            response = ollama.chat(
                model=model,
                messages=[{"role": "user", "content": prompt}]
            )
            content = response['message']['content'].strip()
            logging.debug(f"Ollama 返回内容长度: {len(content)}, 前200字符: {content[:200]}")
            if not content:
                raise ValueError("Ollama 返回空内容")
            return content
        except Exception as e:
            logging.warning(f"Ollama 调用失败 (尝试 {attempt}/{retries}): {e}")
            if attempt < retries:
                wait = 2 ** attempt  # 2,4,8 秒退避
                logging.info(f"等待 {wait} 秒后重试...")
                time.sleep(wait)
            else:
                logging.error(f"Ollama 调用最终失败，已重试 {retries} 次")
                raise  # 重试耗尽，抛出异常

def extract_array_from_response(response_text: str) -> List[str]:
    import re
    response_text = response_text.strip()
    logging.debug(f"开始解析返回内容，原始长度: {len(response_text)}")
    # 直接尝试解析
    try:
        arr = json.loads(response_text)
        if isinstance(arr, list):
            logging.debug("成功直接解析为 JSON 数组")
            return arr
    except json.JSONDecodeError:
        pass

    # 尝试去除代码块标记 ```json ... ```
    code_block = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', response_text, re.DOTALL)
    if code_block:
        try:
            arr = json.loads(code_block.group(1))
            if isinstance(arr, list):
                logging.debug("从代码块中解析成功")
                return arr
        except json.JSONDecodeError:
            pass

    # 尝试直接找第一个 [ 和最后一个 ]
    start = response_text.find('[')
    end = response_text.rfind(']')
    if start != -1 and end != -1:
        try:
            arr = json.loads(response_text[start:end+1])
            if isinstance(arr, list):
                logging.debug("从文本中截取 [ ] 解析成功")
                return arr
        except json.JSONDecodeError:
            pass

    raise ValueError(f"无法从响应中提取有效数组: {response_text[:200]}...")

def process_one_group(synonym_groups: List[List[str]], group_idx: int,
                      all_words: List[str], total_groups: int) -> None:
    group = synonym_groups[group_idx]
    group_name = f"[{group_idx}] {group[:5]}{'...' if len(group)>5 else ''}"
    logging.info(f"开始处理同义词组 {group_name}  ({group_idx+1}/{total_groups})")
    start_time = time.time()

    existing_words = set(group)
    new_found = set()

    total_batches = (len(all_words) + BATCH_SIZE - 1) // BATCH_SIZE
    for i in range(0, len(all_words), BATCH_SIZE):
        batch_words = all_words[i:i+BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        logging.info(f"  批次 {batch_num}/{total_batches} (单词数 {len(batch_words)})")

        prompt = build_prompt_for_single_group(group, batch_words)
        try:
            response_text = query_ollama(prompt)  # 内部已含重试和详细日志
        except Exception as e:
            logging.error(f"  批次 {batch_num} 最终失败，跳过: {e}")
            continue

        # 保存每次返回内容（调试用）
        debug_dir = "debug_calls"
        os.makedirs(debug_dir, exist_ok=True)
        debug_file = os.path.join(debug_dir, f"group{group_idx}_batch{batch_num}.txt")
        with open(debug_file, 'w', encoding='utf-8') as f:
            f.write(response_text)
        logging.debug(f"  返回内容已保存至 {debug_file}")

        try:
            words_from_batch = extract_array_from_response(response_text)
        except ValueError as e:
            logging.error(f"  批次 {batch_num} 解析失败: {e}")
            continue

        # 去重并记录新增单词
        for w in words_from_batch:
            if w not in existing_words:
                new_found.add(w)
                existing_words.add(w)
                logging.debug(f"  找到新单词: {w}")
        time.sleep(0.5)

    # 合并结果
    for w in new_found:
        synonym_groups[group_idx].append(w)

    elapsed = time.time() - start_time
    if new_found:
        logging.info(f"  完成 {group_name}，耗时 {elapsed:.1f}s，新增 {len(new_found)} 个: {sorted(new_found)}")
    else:
        logging.info(f"  完成 {group_name}，耗时 {elapsed:.1f}s，未找到新单词")

def main():
    setup_logging()
    start_total = time.time()

    synonym_groups = load_json(SYNONYM_FILE)
    all_words = load_json(WORDS_FILE)
    total_groups = len(synonym_groups)
    total_words = len(all_words)
    logging.info(f"已加载 {total_groups} 个同义词组，{total_words} 个待筛选单词。")

    estimated_calls = total_groups * ((total_words + BATCH_SIZE - 1) // BATCH_SIZE)
    logging.info(f"预计大模型调用次数: {estimated_calls}")

    for group_idx in range(total_groups):
        process_one_group(synonym_groups, group_idx, all_words, total_groups)
        # 临时保存进度
        temp_file = "temp_progress.json"
        save_json(synonym_groups, temp_file)
        logging.info(f"当前进度已保存至 {temp_file}")

    # 最终保存
    save_json(synonym_groups, OUTPUT_FILE)
    total_elapsed = time.time() - start_total
    logging.info(f"全部处理完成！总耗时 {total_elapsed/60:.1f} 分钟，结果已保存至: {OUTPUT_FILE}")

    if os.path.exists("temp_progress.json"):
        os.remove("temp_progress.json")

if __name__ == "__main__":
    main()