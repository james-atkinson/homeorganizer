#!/bin/bash
# Launcher for Family Calendar Display on Debian / Raspberry Pi OS
# Tries chromium-browser (Raspberry Pi OS) then chromium (Debian)

if [ -z "$DISPLAY" ]; then #If not set DISPLAY is SSH remote or tty
	export DISPLAY=:0 # Set by default display
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

nohup node server/index.js > /dev/null 2>&1 &
sleep 3

if command -v chromium-browser &>/dev/null; then
  chromium-browser --kiosk --disable-infobars --disable-session-crashed-bubble --disable-restore-session-state http://localhost:3000
elif command -v chromium &>/dev/null; then
  chromium --kiosk --disable-infobars --disable-session-crashed-bubble --disable-restore-session-state http://localhost:3000
else
  echo "No Chromium found. Install with: sudo apt install chromium-browser" >&2
  exit 1
fi
