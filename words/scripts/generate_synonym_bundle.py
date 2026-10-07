import json
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR if (SCRIPT_DIR / "study_words.html").exists() else SCRIPT_DIR.parent
SOURCE_DIR = PROJECT_ROOT / "data" / "source" / "synonyms"
MANIFEST_FILE = PROJECT_ROOT / "data" / "generated" / "synonyms" / "synonym_sources_manifest.js"
OUTPUT_DIR = PROJECT_ROOT / "data" / "generated" / "synonyms" / "sources"
SOURCE_PATTERN = "同义词*.json"


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


def load_sources() -> list[dict]:
    sources: list[dict] = []
    for json_file in sorted(SOURCE_DIR.glob(SOURCE_PATTERN)):
        try:
            with json_file.open("r", encoding="utf-8") as file:
                payload = json.load(file)
        except json.JSONDecodeError as error:
            print(f"[跳过] {json_file.name} 不是合法 JSON: {error}")
            continue

        if not isinstance(payload, list):
            raise ValueError(f"{json_file.name} 顶层必须是数组")

        groups = []
        for raw_group in payload:
            group = normalize_group(raw_group)
            if len(group) >= 2:
                groups.append(group)

        sources.append(
            {
                "source": json_file.name,
                "groups": groups,
                "groupCount": len(groups),
            }
        )
    return sources


def main() -> None:
    sources = load_sources()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest_lines = [
        f"window.SYNONYM_BUNDLE_META = {json.dumps({
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'totalSources': len(sources),
            'totalGroups': sum(source['groupCount'] for source in sources),
        }, ensure_ascii=False, indent=2)};",
        "window.SYNONYM_SOURCE_MAP = {};",
    ]

    for index, source in enumerate(sources, start=1):
        source_file = OUTPUT_DIR / f"source_{index:03d}.js"
        source_file.write_text(
            "window.SYNONYM_SOURCE_MAP = window.SYNONYM_SOURCE_MAP || {};\n"
            f"window.SYNONYM_SOURCE_MAP[{json.dumps(source['source'], ensure_ascii=False)}] = "
            + json.dumps(source, ensure_ascii=False, indent=2)
            + ";\n",
            encoding="utf-8",
        )
        relative_path = source_file.relative_to(PROJECT_ROOT).as_posix()
        manifest_lines.append(
            f'document.write(\'<script src="{relative_path}"><\\/script>\');'
        )

    MANIFEST_FILE.write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")

    print(f"Synonym manifest written to: {MANIFEST_FILE}")
    print(f"Synonym source files written to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()