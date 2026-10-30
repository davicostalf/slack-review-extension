#!/usr/bin/env bash
# Removes the host manifest from every browser directory install.sh may have used.
set -euo pipefail
HOST_NAME="com.claude_slack_review.host"
if [ "$(uname)" = "Darwin" ]; then
  B="$HOME/Library/Application Support"
  DIRS=("$B/Google/Chrome" "$B/Google/Chrome Beta" "$B/Chromium" "$B/BraveSoftware/Brave-Browser" "$B/Microsoft Edge" "$B/Arc/User Data")
else
  B="$HOME/.config"
  DIRS=("$B/google-chrome" "$B/chromium" "$B/BraveSoftware/Brave-Browser" "$B/microsoft-edge")
fi
for base in "${DIRS[@]}"; do
  f="$base/NativeMessagingHosts/$HOST_NAME.json"
  if [ -f "$f" ]; then rm -f "$f" && echo "Removido: $f"; fi
done
rm -f "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/run.sh"
echo "Pronto."
