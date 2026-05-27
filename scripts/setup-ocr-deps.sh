#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[setup:ocr-deps] 当前脚本仅支持 Debian/Ubuntu Linux。"
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "[setup:ocr-deps] 未检测到 apt-get，请手动安装: poppler-utils tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng"
  exit 1
fi

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "[setup:ocr-deps] 需要 root 或 sudo 权限安装系统依赖。"
    exit 1
  fi
fi

echo "[setup:ocr-deps] Installing OCR dependencies..."
$SUDO apt-get update
$SUDO apt-get install -y poppler-utils tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng

echo "[setup:ocr-deps] Done."
