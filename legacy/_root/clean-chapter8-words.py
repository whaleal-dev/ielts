import os
import re
import json

# ---------------- 配置 ----------------
ROOT = "/Users/lhp/Desktop/codeProject/ielts-dev/listening-word/chapter8"
DRY_RUN = False   # True = 只打印不改动；False = 实际删除/写回
# --------------------------------------

CJK = re.compile(r"[一-鿿]")


def is_chinese(word):
    """含有中日韩统一表意文字即视为中文条目。"""
    return bool(CJK.search(word))


def audio_name(word):
    """json 单词(空格拼接) -> 对应音频基名(下划线拼接)。

    复刻 transcribe-chapter8.py 的命名：空格->_，/->_。
    （json 里的词已是小写且去掉了英文句点）
    """
    return word.replace(" ", "_").replace("/", "_") + ".mp3"


def find_chunk_dirs(root):
    dirs = []
    for dirpath, _dirs, files in os.walk(root):
        if dirpath.endswith("_chunks") and "words_list.json" in files:
            dirs.append(dirpath)
    dirs.sort()
    return dirs


def process_dir(chunk_dir):
    rel = os.path.relpath(chunk_dir, ROOT)
    words_file = os.path.join(chunk_dir, "words_list.json")
    with open(words_file, "r", encoding="utf-8") as f:
        words = json.load(f)

    existing_mp3 = {f for f in os.listdir(chunk_dir) if f.lower().endswith(".mp3")}

    # 1️⃣ 移除中文条目，并同步删除其对应音频
    kept = []
    removed_cn = []
    deleted_audio = []
    for w in words:
        if is_chinese(w):
            removed_cn.append(w)
            fn = audio_name(w)
            if fn in existing_mp3:
                if not DRY_RUN:
                    os.remove(os.path.join(chunk_dir, fn))
                existing_mp3.discard(fn)
                deleted_audio.append(fn)
        else:
            kept.append(w)

    # 2️⃣ 按 words_list 顺序检查 单词<->音频 对应（复刻重复词 _N 后缀逻辑）
    expected = set()
    used = {}
    missing = []      # 有词但缺音频
    for w in kept:
        base = audio_name(w)
        if base not in used:
            used[base] = 0
            name = base
        else:
            used[base] += 1
            name = base[:-4] + f"_{used[base]}.mp3"
        expected.add(name)
        if name not in existing_mp3:
            missing.append((w, name))

    # 3️⃣ 孤立音频：目录里有 mp3 但没有任何词对应（只报告）
    orphan = sorted(existing_mp3 - expected)

    # 写回清理后的 json
    if removed_cn and not DRY_RUN:
        with open(words_file, "w", encoding="utf-8") as f:
            json.dump(kept, f, ensure_ascii=False, indent=2)

    # 报告
    print(f"\n=== {rel} ===")
    print(f"  词条 {len(words)} -> {len(kept)} (移除中文 {len(removed_cn)})")
    if removed_cn:
        for w in removed_cn:
            print(f"    [删中文] {w[:40]}")
        print(f"  已删音频 {len(deleted_audio)}: {deleted_audio}")
    if missing:
        print(f"  ⚠ 缺音频 {len(missing)}:")
        for w, name in missing:
            print(f"    词 \"{w}\" 期望 -> {name} (不存在)")
    if orphan:
        print(f"  ⚠ 孤立音频 {len(orphan)} (仅报告，未删):")
        for o in orphan:
            print(f"    {o}")
    if not missing and not orphan:
        print("  ✓ 单词与音频一一对应")

    return {
        "dir": rel,
        "removed_cn": len(removed_cn),
        "deleted_audio": len(deleted_audio),
        "missing": len(missing),
        "orphan": len(orphan),
    }


def main():
    chunk_dirs = find_chunk_dirs(ROOT)
    print(f"共发现 {len(chunk_dirs)} 个 _chunks 目录")
    if DRY_RUN:
        print("** DRY_RUN 模式：只报告，不改动文件 **")

    stats = [process_dir(d) for d in chunk_dirs]

    print("\n========== 汇总 ==========")
    tot_cn = sum(s["removed_cn"] for s in stats)
    tot_del = sum(s["deleted_audio"] for s in stats)
    tot_missing = sum(s["missing"] for s in stats)
    tot_orphan = sum(s["orphan"] for s in stats)
    print(f"移除中文词条: {tot_cn}，同步删除音频: {tot_del}")
    print(f"缺音频(需关注): {tot_missing}，孤立音频(需关注): {tot_orphan}")
    bad = [s for s in stats if s["missing"] or s["orphan"]]
    if bad:
        print(f"有不一致的目录 {len(bad)} 个:")
        for s in bad:
            print(f"  {s['dir']}: 缺{s['missing']} 孤立{s['orphan']}")
    else:
        print("所有目录 单词<->音频 完全一致 ✓")


if __name__ == "__main__":
    main()
