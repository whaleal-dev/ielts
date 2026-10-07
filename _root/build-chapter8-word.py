import os
import re
import json

# ---------------- 配置 ----------------
CHAPTER_NUM = "8"
ROOT = "/Users/lhp/Desktop/codeProject/ielts-dev/listening-word/chapter8"
OUTPUT_FILE = os.path.join(ROOT, "word.json")
# --------------------------------------


def leading_num(name):
    """取名称开头的数字，去掉前导零。取不到返回 None。"""
    m = re.match(r"\s*(\d+)", name)
    if not m:
        return None
    return str(int(m.group(1)))


def main():
    result = {}

    # 第一层：分组目录，如 "1 number"
    for group_name in sorted(os.listdir(ROOT)):
        group_path = os.path.join(ROOT, group_name)
        if not os.path.isdir(group_path):
            continue
        group_num = leading_num(group_name)
        if group_num is None:
            continue

        # 第二层：chunks 目录，如 "01_Training_1-Test_1基本语料_chunks"
        for chunk_name in sorted(os.listdir(group_path)):
            chunk_path = os.path.join(group_path, chunk_name)
            if not os.path.isdir(chunk_path) or not chunk_name.endswith("_chunks"):
                continue
            item_num = leading_num(chunk_name)
            if item_num is None:
                continue

            words_file = os.path.join(chunk_path, "words_list.json")
            if not os.path.exists(words_file):
                print(f"跳过(无 words_list.json): {group_name}/{chunk_name}")
                continue

            with open(words_file, "r", encoding="utf-8") as f:
                words = json.load(f)

            key = f"{CHAPTER_NUM}{group_num}{item_num}"
            title = f"Chapter {CHAPTER_NUM} {group_name} {chunk_name}"
            result[key] = {
                "title": title,
                "words": words,
            }
            print(f"{key}  {title}  ({len(words)} 条)")

    # 按 key 数值排序输出
    ordered = {k: result[k] for k in sorted(result, key=lambda x: int(x))}

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(ordered, f, ensure_ascii=False, indent=4)

    print(f"\n共 {len(ordered)} 组，已写入 {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
