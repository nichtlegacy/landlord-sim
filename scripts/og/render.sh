#!/bin/sh
# Renders scripts/og/og.html to public/og.png (1200×630) and the GitHub social preview
# .github/images/social-preview.png (1280×640, upload it under Settings → Social preview).
# CHROME defaults to Playwright's headless shell; board.png is a crop of the Game tab screenshot.
set -e
cd "$(dirname "$0")"
CHROME=${CHROME:-$(ls -d ~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell | tail -1)}
shot() { # size, output, query
  "$CHROME" --no-sandbox --hide-scrollbars --allow-file-access-from-files --window-size="$1" \
    --virtual-time-budget=3000 --screenshot="$2" "file://$PWD/og.html$3" >/dev/null 2>&1
  echo "$2 written"
}
shot 1200,630 "$PWD/../../public/og.png" ''
shot 1280,640 "$PWD/../../.github/images/social-preview.png" '?social'

