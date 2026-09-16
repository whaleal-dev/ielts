import glob
import json
import re
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR if (SCRIPT_DIR / "study_words.html").exists() else SCRIPT_DIR.parent
SOURCE_DIR = PROJECT_ROOT / "data" / "source"
HTML_FILE = PROJECT_ROOT / "study_words.html"


def load_json_array(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"{path.name} 顶层必须是数组")
    result: list[str] = []
    for item in payload:
        value = str(item).strip()
        if value:
            result.append(value)
    return result


def merge_unique_arrays(paths: list[Path]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for path in paths:
        for item in load_json_array(path):
            if item in seen:
                continue
            seen.add(item)
            merged.append(item)
    return merged


def normalize_group(raw_group) -> list[str]:
    if isinstance(raw_group, list):
        items = raw_group
    elif isinstance(raw_group, dict):
        items = raw_group.get("terms") or raw_group.get("items") or raw_group.get("words") or []
    else:
        items = []

    seen: set[str] = set()
    cleaned: list[str] = []
    for item in items:
        value = str(item).strip()
        if not value:
            continue
        normalized = " ".join(value.lower().split())
        if normalized in seen:
            continue
        seen.add(normalized)
        cleaned.append(value)
    return cleaned


def load_synonym_sources() -> list[dict]:
    sources: list[dict] = []
    for path_str in sorted(glob.glob(str(SOURCE_DIR / "synonyms" / "同义词*.json"))):
        path = Path(path_str)
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise ValueError(f"{path.name} 顶层必须是数组")

        groups = []
        for raw_group in payload:
            group = normalize_group(raw_group)
            if len(group) >= 2:
                groups.append(group)

        sources.append(
            {
                "source": path.name,
                "groups": groups,
                "groupCount": len(groups),
            }
        )
    return sources


def replace_block(content: str, pattern: str, replacement: str, description: str) -> str:
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise ValueError(f"未找到可替换的 {description}")
    return updated


def main() -> None:
    html = HTML_FILE.read_text(encoding="utf-8")

    reading_data = load_json_array(SOURCE_DIR / "vocabulary" / "阅读538词汇.json")
    listening_data = load_json_array(SOURCE_DIR / "vocabulary" / "听力179词汇.json")
    core_data = merge_unique_arrays(
        [
            Path(path)
            for path in sorted(glob.glob(str(SOURCE_DIR / "vocabulary" / "核心词汇*.json")))
        ]
    )
    synonym_sources = load_synonym_sources()

    html = html.replace('  <script src="synonym_sources_manifest.js"></script>\n', "")
    html = html.replace(
        '  <script src="data/generated/synonyms/synonym_sources_manifest.js"></script>\n',
        "",
    )

    html = replace_block(
        html,
        r"const READING_538_DATA = \[.*?\];",
        "const READING_538_DATA = " + json.dumps(reading_data, ensure_ascii=False) + ";",
        "阅读538词汇内联数组",
    )
    html = replace_block(
        html,
        r"const LISTENING_179_DATA = \[.*?\];",
        "const LISTENING_179_DATA = " + json.dumps(listening_data, ensure_ascii=False) + ";",
        "听力179词汇内联数组",
    )
    html = replace_block(
        html,
        r"const CORE_VOCAB_DATA = \[.*?\];",
        "const CORE_VOCAB_DATA = " + json.dumps(core_data, ensure_ascii=False) + ";",
        "核心词汇内联数组",
    )
    html = replace_block(
        html,
        r"const SYNONYM_SOURCE_DATA = .*?;",
        "const SYNONYM_SOURCE_DATA = " + json.dumps(synonym_sources, ensure_ascii=False) + ";",
        "同义词内联数据",
    )

    HTML_FILE.write_text(html, encoding="utf-8")

    print(
        json.dumps(
            {
                "readingCount": len(reading_data),
                "listeningCount": len(listening_data),
                "coreCount": len(core_data),
                "synonymSources": len(synonym_sources),
                "synonymGroups": sum(source["groupCount"] for source in synonym_sources),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()