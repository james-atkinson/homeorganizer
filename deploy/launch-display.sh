#!/bin/bash
# Launcher for Family Calendar Display on Debian / Raspberry Pi OS
# Tries chromium-browser (Raspberry Pi OS) then chromium (Debian)

if [ -z "$DISPLAY" ]; then
  export DISPLAY=:0
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Start server in background
nohup node server/index.js > /tmp/homeorganizer-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to listen on port 3000 (max 30s)
for i in $(seq 1 30); do
  if (echo >/dev/tcp/127.0.0.1/3000) 2>/dev/null; then
    break
  fi
  sleep 1
done

# Flags that often fix white/blank screen on Raspberry Pi.
# --ignore-certificate-errors: allow page to load when Pi's SSL to external (e.g. Google Fonts) fails.
CHROMIUM_FLAGS="--kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-restore-session-state --no-sandbox --disable-dev-shm-usage --disable-gpu --disable-software-rasterizer --disable-extensions --ignore-certificate-errors --ignore-ssl-errors"
URL="http://127.0.0.1:3000/"

if command -v chromium-browser &>/dev/null; then
  chromium-browser $CHROMIUM_FLAGS "$URL"
elif command -v chromium &>/dev/null; then
  chromium $CHROMIUM_FLAGS "$URL"
else
  echo "No Chromium found. Install with: sudo apt install chromium-browser" >&2
  kill $SERVER_PID 2>/dev/null
  exit 1
fi
