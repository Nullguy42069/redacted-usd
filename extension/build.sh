#!/bin/bash
# Pack the extension for Chrome Web Store submission.
# Run from extension/ directory: ./build.sh
# Outputs: redacted-multisig-vN.N.N.zip (alongside the dir, not inside it).

set -euo pipefail

EXT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$(dirname "$EXT_DIR")"
VERSION=$(python3 -c "import json; print(json.load(open('$EXT_DIR/manifest.json'))['version'])")
ZIP_NAME="redacted-multisig-v${VERSION}.zip"
ZIP_PATH="$OUT_DIR/$ZIP_NAME"

rm -f "$ZIP_PATH"

cd "$EXT_DIR"
zip -rq "$ZIP_PATH" . \
  -x "*.DS_Store" \
  -x ".git/*" \
  -x "build.sh" \
  -x "node_modules/*" \
  -x "icons/_old/*" \
  -x "*.md"

echo "Built $ZIP_PATH"
echo "Size: $(du -h "$ZIP_PATH" | cut -f1)"

# Also copy to the web app's public dir so /install can serve it.
PUBLIC_ZIP="$OUT_DIR/apps/web/public/extension/redacted-multisig.zip"
if [ -d "$(dirname "$PUBLIC_ZIP")" ]; then
  cp "$ZIP_PATH" "$PUBLIC_ZIP"
  echo "Copied to $PUBLIC_ZIP"
fi

echo
echo "Files included:"
unzip -l "$ZIP_PATH" | head -30
