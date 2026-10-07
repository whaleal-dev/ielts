import os
import re
import json

# ---------------- 配置 ----------------
ROOT = "/Users/lhp/Desktop/codeProject/ielts-dev/listening-word/chapter8"
DRY_RUN = False   # True = 只打印不改动；False = 实际改名/写回
# --------------------------------------


def normalize_word(w):
    """把单词内部的分隔连字符 - 转成空格。

    规则：只有当 - 两侧都是 >=2 个字母的纯英文词时才保留（真正的连字词，
    如 twenty-second）；数字间、字母拼读(d-e-v-o-n)、字母-数字混合等一律转空格。
    """
    n = len(w)
    out = []
    for idx, ch in enumerate(w):
        if ch == "-":
            l = idx - 1
            while l >= 0 and w[l].isalnum():
                l -= 1
            left = w[l + 1:idx]
            r = idx + 1
            while r < n and w[r].isalnum():
                r += 1
            right = w[idx + 1:r]
            keep = left.isalpha() and len(left) >= 2 and right.isalpha() and len(right) >= 2
            out.append("-" if keep else " ")
        else:
            out.append(ch)
    res = "".join(out)
    res = re.sub(r" +", " ", res).strip()
    return res


def audio_base(word):
    """单词 -> 音频基名（空格/ 都换成下划线，连字符按单词里的保留情况原样保留）。"""
    return word.replace(" ", "_").replace("/", "_") + ".mp3"


def ordered_names(words, name_fn):
    """按顺序给每个词分配实际文件名，复刻重复词 _N 后缀逻辑。"""
    used = {}
    names = []
    for w in words:
        base = name_fn(w)
        k = used.get(base, 0)
        used[base] = k + 1
        names.append(base if k == 0 else base[:-4] + f"_{k}.mp3")
    return names


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

    new_words = [normalize_word(w) for w in words]
    old_names = ordered_names(words, audio_base)
    new_names = ordered_names(new_words, audio_base)

    renames = [(o, nw) for o, nw in zip(old_names, new_names) if o != nw]
    word_changes = [(w, nw) for w, nw in zip(words, new_words) if w != nw]

    if not renames and not word_changes:
        return {"dir": rel, "words": 0, "renamed": 0, "missing": 0}

    print(f"\n=== {rel} ===")
    for w, nw in word_changes:
        print(f"  词: {w!r} -> {nw!r}")

    # 改名：先全部移到临时名，再落到目标名，避免互相覆盖
    missing = []
    if not DRY_RUN:
        tmp_map = []
        for i, (old, new) in enumerate(renames):
            src = os.path.join(chunk_dir, old)
            if not os.path.exists(src):
                missing.append(old)
                continue
            tmp = os.path.join(chunk_dir, f"__ren_{i}__.mp3")
            os.rename(src, tmp)
            tmp_map.append((tmp, new))
        for tmp, new in tmp_map:
            os.rename(tmp, os.path.join(chunk_dir, new))
    else:
        for old, new in renames:
            if not os.path.exists(os.path.join(chunk_dir, old)):
                missing.append(old)

    for old, new in renames:
        flag = "  (源缺失!)" if old in missing else ""
        print(f"  音频: {old} -> {new}{flag}")

    # 写回 json
    if word_changes and not DRY_RUN:
        with open(words_file, "w", encoding="utf-8") as f:
            json.dump(new_words, f, ensure_ascii=False, indent=2)

    return {"dir": rel, "words": len(word_changes), "renamed": len(renames) - len(missing), "missing": len(missing)}


def main():
    chunk_dirs = find_chunk_dirs(ROOT)
    print(f"共 {len(chunk_dirs)} 个 _chunks 目录")
    if DRY_RUN:
        print("** DRY_RUN：只预览，不改动 **")

    stats = [process_dir(d) for d in chunk_dirs]

    print("\n========== 汇总 ==========")
    print(f"改动词条: {sum(s['words'] for s in stats)}")
    print(f"重命名音频: {sum(s['renamed'] for s in stats)}")
    miss = sum(s["missing"] for s in stats)
    if miss:
        print(f"⚠ 源音频缺失: {miss}")
        for s in stats:
            if s["missing"]:
                print(f"  {s['dir']}: {s['missing']}")


if __name__ == "__main__":
    main()
