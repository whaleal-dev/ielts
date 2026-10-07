import json
import os
import time
from pathlib import Path

import requests

# ---------- 配置 ----------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR if (SCRIPT_DIR / "study_words.html").exists() else SCRIPT_DIR.parent
BOOK_ID = os.getenv("GUIXUE_BOOK_ID", "10174")
AUTH_TOKEN = os.getenv("GUIXUE_AUTH_TOKEN", "").strip()
BASE_URL = "https://v.guixue.com/ApiDictaction/getPracticePageInfo"
CHAPTER_INFO_FILE = PROJECT_ROOT / "data" / "source" / "chapters" / "章节信息.json"
OUTPUT_DIR = PROJECT_ROOT / "data" / "generated" / "word_groups"


def build_headers() -> dict[str, str]:
    if not AUTH_TOKEN:
        raise RuntimeError(
            "缺少授权 token。请先设置环境变量 GUIXUE_AUTH_TOKEN 后再运行脚本。"
        )
    return {
        "authorization": AUTH_TOKEN
    }


def load_chapter_info(path: Path) -> dict:
    """加载章节信息 JSON 文件"""
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def fetch_words(book_hierarchy_id: str) -> list:
    """请求某一组的单词列表，返回 data.words"""
    params = {
        "book_id": BOOK_ID,
        "book_hierarchy_id": book_hierarchy_id
    }
    try:
        resp = requests.get(BASE_URL, params=params, headers=build_headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if data.get("e") != "9999":
            print(f"  [警告] 接口返回异常: {data.get('m')}")
            return []
        return data.get("data", {}).get("words", [])
    except requests.RequestException as e:
        print(f"  [错误] 请求失败 ({book_hierarchy_id}): {e}")
        return []
    except ValueError as e:
        print(f"  [错误] 请求失败 ({book_hierarchy_id}): {e}")
        return []


def sanitize_filename(name: str) -> str:
    """将章节/组名处理成安全的文件名（保留中文）"""
    # 替换可能引起问题的字符
    for ch in [" ", "/", "\\", ":", "*", "?", "\"", "<", ">", "|"]:
        name = name.replace(ch, "_")
    return name


def main():
    build_headers()

    # 加载章节结构
    chapter_info = load_chapter_info(CHAPTER_INFO_FILE)
    chapters = chapter_info.get("data", {}).get("sub_step", [])
    if not chapters:
        print("未找到任何章节，退出。")
        return

    # 创建输出目录
    output_dir = OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    total_groups = 0
    for chapter in chapters:
        chapter_title = chapter.get("title", "未知章节")
        groups = chapter.get("sub_step", [])
        if not groups:
            continue

        print(f"\n处理章节: {chapter_title} ({len(groups)} 组)")

        for group in groups:
            group_title = group.get("title", "未知组")
            book_hierarchy_id = group.get("book_hierarchy_id")
            if not book_hierarchy_id:
                print(f"  [跳过] {group_title} 缺少 book_hierarchy_id")
                continue

            # 每隔 2 秒请求
            print(f"  正在获取: {group_title} (id={book_hierarchy_id})")
            time.sleep(2)

            words = fetch_words(book_hierarchy_id)
            if not words:
                print(f"    ⚠ 未获取到单词")
            else:
                print(f"    ✔ 获取到 {len(words)} 个单词")

            # 构造输出数据
            output_data = {
                "chapter": chapter_title,
                "group": group_title,
                "words": words
            }

            # 保存文件：章节名_组名.json
            filename = f"{sanitize_filename(chapter_title)}_{sanitize_filename(group_title)}.json"
            filepath = output_dir / filename

            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)

            print(f"    已保存 -> {filepath}")
            total_groups += 1

    print(f"\n全部完成！共处理 {total_groups} 组。输出目录: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
