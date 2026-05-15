#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 exported.heic" >&2
  exit 2
fi

INPUT="$1"

if [ ! -f "$INPUT" ]; then
  echo "File not found: $INPUT" >&2
  exit 2
fi

missing=0
for tool in exiftool heif-convert; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing required command: $tool" >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "Install dependencies with: brew install exiftool libheif" >&2
  exit 127
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/heic-hdr-check.XXXXXX")"

echo "Input: $INPUT"
echo "Temp directory: $TMP_DIR"
echo

echo "== Basic metadata =="
exiftool -a -G1 -s \
  -FileType -MIMEType \
  -PrimaryItemReference -AuxiliaryImageType -AuxiliaryImageRef \
  -HDRGainMapVersion -HDRGainMapHeadroom \
  -HDRHeadroom -HDRGain -MakerApple:all \
  -ProfileDescription -ColorSpace -ColorRepresentation -ColorPrimaries \
  -TransferCharacteristics -MatrixCoefficients -CICP:all \
  "$INPUT"
echo

echo "== HEIF item references =="
exiftool -v3 "$INPUT" \
  | grep -Ei 'PrimaryItem|PrimaryItemReference|AuxiliaryImageRef|auxl|auxC|HDRGainMap|Item [0-9]+|CICP|colr|nclx' \
  || true
echo

echo "== Extracted auxiliary images =="
if heif-convert --with-aux --no-colons "$INPUT" "$TMP_DIR/extracted.png"; then
  find "$TMP_DIR" -maxdepth 1 -type f -print | sort
else
  echo "heif-convert failed to extract images" >&2
  exit 1
fi
