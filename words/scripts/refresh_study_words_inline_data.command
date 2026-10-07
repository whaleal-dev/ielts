#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT="$SCRIPT_DIR"

if [[ ! -f "$PROJECT_ROOT/study_words.html" ]]; then
  PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
fi

PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "未找到 Python 虚拟环境: $PYTHON_BIN"
  exit 1
fi

cd "$PROJECT_ROOT"
"$PYTHON_BIN" "$PROJECT_ROOT/scripts/refresh_study_words_inline_data.py"

echo
echo "已完成：study_words.html 内联数据已刷新。"