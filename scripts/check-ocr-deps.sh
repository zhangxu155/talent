#!/usr/bin/env bash
set -euo pipefail

missing=0
for cmd in pdftoppm tesseract; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[check:ocr-deps] missing: $cmd"
    missing=1
  else
    echo "[check:ocr-deps] ok: $cmd -> $(command -v "$cmd")"
  fi
done

if [[ $missing -ne 0 ]]; then
  echo "[check:ocr-deps] OCR system dependencies are incomplete."
  echo "Run: npm run setup:ocr-deps"
  exit 1
fi

echo "[check:ocr-deps] all good"
