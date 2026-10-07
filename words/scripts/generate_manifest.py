import json
import re
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR if (SCRIPT_DIR / "study_words.html").exists() else SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data" / "generated" / "word_groups"
OUTPUT_FILE = PROJECT_ROOT / "data" / "generated" / "manifests" / "word_groups_manifest.json"

CHINESE_NUMERALS = {
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
    "十": 10,
    "十一": 11,
    "十二": 12,
}


def parse_chapter_number(chapter_name: str) -> int:
    match = re.search(r"Chapter\s+(\d+)", chapter_name)
    return int(match.group(1)) if match else 10**9


def parse_group_number(group_name: str) -> int:
    match = re.search(r"第(.+?)组", group_name)
    if not match:
        return 10**9
    return CHINESE_NUMERALS.get(match.group(1), 10**9)


def main() -> None:
    if not DATA_DIR.exists():
        raise FileNotFoundError(f"Data directory not found: {DATA_DIR}")

    chapter_map: dict[str, dict] = {}

    for json_file in sorted(DATA_DIR.glob("*.json")):
        with json_file.open("r", encoding="utf-8") as file:
            payload = json.load(file)

        chapter_name = payload.get("chapter", "未命名章节")
        group_name = payload.get("group", "未命名组")
        words = payload.get("words", [])

        chapter_entry = chapter_map.setdefault(
            chapter_name,
            {
                "chapter": chapter_name,
                "chapterNumber": parse_chapter_number(chapter_name),
                "groups": [],
            },
        )

        chapter_entry["groups"].append(
            {
                "group": group_name,
                "groupNumber": parse_group_number(group_name),
                "file": str(json_file.relative_to(PROJECT_ROOT)).replace("\\", "/"),
                "wordCount": len(words),
            }
        )

    chapters = sorted(
        chapter_map.values(),
        key=lambda item: (item["chapterNumber"], item["chapter"]),
    )

    for chapter in chapters:
        chapter["groups"] = sorted(
            chapter["groups"],
            key=lambda item: (item["groupNumber"], item["group"]),
        )

    manifest = {
        "chapters": chapters,
        "totalChapters": len(chapters),
        "totalGroups": sum(len(chapter["groups"]) for chapter in chapters),
        "totalWords": sum(
            group["wordCount"]
            for chapter in chapters
            for group in chapter["groups"]
        ),
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8") as file:
        json.dump(manifest, file, ensure_ascii=False, indent=2)

    print(f"Manifest written to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()