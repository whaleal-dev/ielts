import argparse
import hashlib
import json
import re
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR if (SCRIPT_DIR / "study_words.html").exists() else SCRIPT_DIR.parent
SOURCE_DIR = PROJECT_ROOT / "data" / "generated" / "word_groups"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "assets" / "audio" / "eng"
DEFAULT_WORD_OUTPUT_DIR = PROJECT_ROOT / "assets" / "audio" / "eng_by_word"
DEFAULT_MANIFEST_FILE = PROJECT_ROOT / "assets" / "audio" / "manifest.json"
DEFAULT_TIMEOUT = 30
DEFAULT_WORKERS = 8
DEFAULT_RETRIES = 3
USER_AGENT = "word-save-audio-downloader/1.0"
INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
WHITESPACE_RE = re.compile(r"\s+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="下载单词分组数据中的英式发音 mp3 到项目 assets/audio 目录。"
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=SOURCE_DIR,
        help="单词分组 JSON 所在目录，默认 data/generated/word_groups",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="原始音频名输出目录，默认 assets/audio/eng",
    )
    parser.add_argument(
        "--word-output-dir",
        type=Path,
        default=DEFAULT_WORD_OUTPUT_DIR,
        help="按单词名导出的音频目录，默认 assets/audio/eng_by_word",
    )
    parser.add_argument(
        "--manifest-file",
        type=Path,
        default=DEFAULT_MANIFEST_FILE,
        help="下载清单输出文件，默认 assets/audio/manifest.json",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=DEFAULT_WORKERS,
        help="并发下载线程数，默认 8",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help="单个请求超时时间（秒），默认 30",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=DEFAULT_RETRIES,
        help="单个文件失败后的重试次数，默认 3",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="即使本地文件已存在，也强制重新下载",
    )
    return parser.parse_args()


def iter_word_records(source_dir: Path) -> Iterable[dict]:
    if not source_dir.exists():
        raise FileNotFoundError(f"未找到数据目录: {source_dir}")

    for json_file in sorted(source_dir.glob("*.json")):
        with json_file.open("r", encoding="utf-8") as file:
            payload = json.load(file)

        chapter = payload.get("chapter", "")
        group = payload.get("group", "")

        for index, word in enumerate(payload.get("words", []), start=1):
            yield {
                "sourceFile": json_file.name,
                "chapter": chapter,
                "group": group,
                "index": index,
                "id": str(word.get("id") or "").strip(),
                "word": str(word.get("word") or "").strip(),
                "meaning": str(word.get("meaning") or "").strip(),
                "eng_sound": str(word.get("eng_sound") or "").strip(),
            }


def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    return parsed._replace(query="", fragment="").geturl()


def ensure_extension(filename: str, default_extension: str = ".mp3") -> str:
    path = Path(filename)
    if path.suffix:
        return filename
    return f"{filename}{default_extension}"


def sanitize_filename_part(value: str, fallback: str = "audio") -> str:
    cleaned = INVALID_FILENAME_CHARS.sub("_", str(value or "").strip())
    cleaned = WHITESPACE_RE.sub("_", cleaned)
    cleaned = cleaned.strip("._ ")
    return cleaned or fallback


def build_original_audio_filename(normalized_url: str) -> str:
    parsed = urlparse(normalized_url)
    basename = Path(parsed.path).name.strip()
    if basename:
        return ensure_extension(basename)

    stem = Path(parsed.path).stem.strip() or "audio"
    digest = hashlib.sha1(normalized_url.encode("utf-8")).hexdigest()[:10]
    return f"{stem}-{digest}.mp3"


def build_word_audio_filename(record: dict, normalized_url: str) -> str:
    word_name = sanitize_filename_part(record.get("word") or "")
    if word_name:
        return f"{word_name}.mp3"

    word_id = sanitize_filename_part(record.get("id") or "")
    if word_id:
        return f"{word_id}.mp3"

    parsed = urlparse(normalized_url)
    stem = sanitize_filename_part(Path(parsed.path).stem, "audio")
    digest = hashlib.sha1(normalized_url.encode("utf-8")).hexdigest()[:10]
    return f"{stem}-{digest}.mp3"


def uniquify_filename(filename: str, used_names: set[str], suffix_hint: str) -> str:
    candidate = filename
    if candidate not in used_names:
        used_names.add(candidate)
        return candidate

    path = Path(filename)
    stem = path.stem
    suffix = path.suffix or ".mp3"
    safe_hint = sanitize_filename_part(suffix_hint, "dup")
    candidate = f"{stem}-{safe_hint}{suffix}"
    if candidate not in used_names:
        used_names.add(candidate)
        return candidate

    counter = 2
    while True:
        candidate = f"{stem}-{safe_hint}-{counter}{suffix}"
        if candidate not in used_names:
            used_names.add(candidate)
            return candidate
        counter += 1


def collect_downloads(source_dir: Path, output_dir: Path, word_output_dir: Path) -> list[dict]:
    downloads: dict[str, dict] = {}
    used_original_names: set[str] = set()
    used_word_names: set[str] = set()

    for record in iter_word_records(source_dir):
        url = record["eng_sound"]
        if not url:
            continue

        normalized_url = normalize_url(url)
        entry = downloads.get(normalized_url)
        if entry is None:
            original_filename = uniquify_filename(
                build_original_audio_filename(normalized_url),
                used_original_names,
                record.get("id") or record.get("word") or normalized_url,
            )
            word_filename = uniquify_filename(
                build_word_audio_filename(record, normalized_url),
                used_word_names,
                record.get("id") or normalized_url,
            )
            entry = {
                "id": record["id"],
                "word": record["word"],
                "meaning": record["meaning"],
                "chapter": record["chapter"],
                "group": record["group"],
                "sourceFile": record["sourceFile"],
                "eng_sound": url,
                "normalizedUrl": normalized_url,
                "relativePath": output_dir.joinpath(original_filename).relative_to(PROJECT_ROOT).as_posix(),
                "wordRelativePath": word_output_dir.joinpath(word_filename).relative_to(PROJECT_ROOT).as_posix(),
                "references": [],
            }
            downloads[normalized_url] = entry

        entry["references"].append(
            {
                "sourceFile": record["sourceFile"],
                "chapter": record["chapter"],
                "group": record["group"],
                "index": record["index"],
                "id": record["id"],
                "word": record["word"],
            }
        )

    return sorted(downloads.values(), key=lambda item: (item["word"].lower(), item["id"], item["normalizedUrl"]))


def download_file(url: str, destination: Path, timeout: int, retries: int) -> tuple[bool, str]:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    last_error = ""

    for attempt in range(1, retries + 1):
        try:
            with urlopen(request, timeout=timeout) as response:
                data = response.read()
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            return True, "downloaded"
        except (HTTPError, URLError, TimeoutError, OSError) as error:
            last_error = f"attempt {attempt}/{retries}: {error}"
            if attempt < retries:
                time.sleep(min(attempt, 3))

    return False, last_error or "unknown error"


def export_word_named_copy(source: Path, destination: Path) -> None:
    if source.resolve() == destination.resolve():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def run_downloads(downloads: list[dict], timeout: int, retries: int, workers: int, force: bool) -> dict:
    stats = {
        "total": len(downloads),
        "downloaded": 0,
        "skipped": 0,
        "failed": 0,
        "failures": [],
    }
    lock = threading.Lock()

    def task(entry: dict) -> tuple[str, dict, str]:
        original_destination = PROJECT_ROOT / entry["relativePath"]
        word_destination = PROJECT_ROOT / entry["wordRelativePath"]
        if original_destination.exists() and word_destination.exists() and not force:
            return "skipped", entry, "exists"

        if force or not original_destination.exists():
            ok, message = download_file(entry["eng_sound"], original_destination, timeout, retries)
            if not ok:
                return "failed", entry, message

        try:
            if force or not word_destination.exists():
                export_word_named_copy(original_destination, word_destination)
        except OSError as error:
            return "failed", entry, str(error)

        return "downloaded", entry, "exported"

    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = [executor.submit(task, entry) for entry in downloads]
        for future in as_completed(futures):
            status, entry, message = future.result()
            with lock:
                stats[status] += 1
                if status == "failed":
                    stats["failures"].append(
                        {
                            "word": entry["word"],
                            "id": entry["id"],
                            "url": entry["eng_sound"],
                            "error": message,
                        }
                    )

    return stats


def write_manifest(manifest_file: Path, downloads: list[dict], stats: dict, output_dir: Path, word_output_dir: Path) -> None:
    manifest_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "outputDir": output_dir.relative_to(PROJECT_ROOT).as_posix(),
        "wordOutputDir": word_output_dir.relative_to(PROJECT_ROOT).as_posix(),
        "totalFiles": stats["total"],
        "downloaded": stats["downloaded"],
        "skipped": stats["skipped"],
        "failed": stats["failed"],
        "items": downloads,
        "failures": stats["failures"],
    }
    manifest_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    word_output_dir = args.word_output_dir.resolve()
    manifest_file = args.manifest_file.resolve()
    source_dir = args.source_dir.resolve()

    downloads = collect_downloads(source_dir, output_dir, word_output_dir)
    if not downloads:
        print("没有发现可下载的 eng_sound 音频链接。")
        return

    print(
        f"发现 {len(downloads)} 个唯一英式发音文件，开始导出到: {output_dir} "
        f"和 {word_output_dir}"
    )
    stats = run_downloads(
        downloads=downloads,
        timeout=max(1, args.timeout),
        retries=max(1, args.retries),
        workers=max(1, args.workers),
        force=args.force,
    )
    write_manifest(manifest_file, downloads, stats, output_dir, word_output_dir)

    print(
        "下载完成: "
        f"总数 {stats['total']}，"
        f"新下载 {stats['downloaded']}，"
        f"已跳过 {stats['skipped']}，"
        f"失败 {stats['failed']}。"
    )
    print(f"原始命名目录: {output_dir}")
    print(f"单词命名目录: {word_output_dir}")
    print(f"清单文件: {manifest_file}")

    if stats["failed"]:
        print("以下音频下载失败，请稍后重试:")
        for failure in stats["failures"][:20]:
            print(f"- {failure['word']} ({failure['id']}): {failure['error']}")


if __name__ == "__main__":
    main()