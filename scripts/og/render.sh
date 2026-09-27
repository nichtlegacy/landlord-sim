#!/bin/sh
# Renders scripts/og/og.html to public/og.png (1200×630) with a headless Chromium.
# CHROME defaults to Playwright's headless shell; board.png is a crop of the Game tab screenshot.
set -e
cd "$(dirname "$0")"
CHROME=${CHROME:-$(ls -d ~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell | tail -1)}
"$CHROME" --no-sandbox --hide-scrollbars --allow-file-access-from-files --window-size=1200,630 \
  --virtual-time-budget=3000 --screenshot="$PWD/../../public/og.png" "file://$PWD/og.html" >/dev/null 2>&1
echo "public/og.png written"
