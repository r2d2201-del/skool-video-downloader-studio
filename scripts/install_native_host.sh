#!/bin/bash
# Install Native Messaging Host for Skool Video Downloader on macOS

TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$TARGET_DIR"

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/native_host.py"
chmod +x "$SCRIPT_PATH"

MANIFEST_PATH="$TARGET_DIR/com.cinematic.skool_downloader.json"

cat << EOF > "$MANIFEST_PATH"
{
  "name": "com.cinematic.skool_downloader",
  "description": "Skool Video Downloader & Cinematic LMS Native Host",
  "path": "$SCRIPT_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://fphcobejgolnnjdkegldnablfhnelnoc/",
    "chrome-extension://dnlkfclcfocjkmchbgfghhhffnchafek/",
    "chrome-extension://mefhkigjodfnocogchggflkiohnfeohd/",
    "chrome-extension://kpmcbmppphlkhjblnkmbjfdmngchpggp/"
  ]
}
EOF

echo "✅ Chrome Native Messaging Host registered at: $MANIFEST_PATH"
