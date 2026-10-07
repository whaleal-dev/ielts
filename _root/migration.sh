#!/bin/bash
# 迁移脚本: ielts-tool -> ielts
# 排除: .vscode, fresh_env, path, .g* (隐藏文件)

SRC="/Users/lhp/Desktop/codeProject/ielts"
DEST="/Users/lhp/Desktop/codeProject/ielts-dev/"


# ========== 目录 ==========

# daily-status
rm -rf "$DEST/daily-status"
mv "$SRC/daily-status" "$DEST/daily-status"

# data
rm -rf "$DEST/data"
mv "$SRC/data" "$DEST/data"

# dictionary
rm -rf "$DEST/dictionary"
mv "$SRC/dictionary" "$DEST/dictionary"

# listening-word
rm -rf "$DEST/listening-word"
mv "$SRC/listening-word" "$DEST/listening-word"

# words
rm -rf "$DEST/words"
mv "$SRC/words" "$DEST/words"

# audio-playlist-player
rm -rf "$DEST/audio-playlist-player"
mv "$SRC/audio-playlist-player" "$DEST/audio-playlist-player"

# 发音
rm -rf "$DEST/发音"
mv "$SRC/发音" "$DEST/发音"

# 同义词学习
rm -rf "$DEST/同义词学习"
mv "$SRC/同义词学习" "$DEST/同义词学习"

# ========== 文件 ==========

# README.md
rm -f "$DEST/README.md"
mv "$SRC/README.md" "$DEST/README.md"

# core-files-guide.md
rm -f "$DEST/core-files-guide.md"
mv "$SRC/core-files-guide.md" "$DEST/core-files-guide.md"

# cp.txt
rm -f "$DEST/cp.txt"
mv "$SRC/cp.txt" "$DEST/cp.txt"

# e2wdef
rm -f "$DEST/e2wdef"
mv "$SRC/e2wdef" "$DEST/e2wdef"

# expand.py
rm -f "$DEST/expand.py"
mv "$SRC/expand.py" "$DEST/expand.py"

# test-section1.py
rm -f "$DEST/test-section1.py"
mv "$SRC/test-section1.py" "$DEST/test-section1.py"

# test-section2.py
rm -f "$DEST/test-section2.py"
mv "$SRC/test-section2.py" "$DEST/test-section2.py"

# test-section3.py
rm -f "$DEST/test-section3.py"
mv "$SRC/test-section3.py" "$DEST/test-section3.py"

# test-section4.py
rm -f "$DEST/test-section4.py"
mv "$SRC/test-section4.py" "$DEST/test-section4.py"

# test-section5.py
rm -f "$DEST/test-section5.py"
mv "$SRC/test-section5.py" "$DEST/test-section5.py"

# todo
rm -f "$DEST/todo"
mv "$SRC/todo" "$DEST/todo"

echo "迁移完成!"
