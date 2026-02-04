#!/bin/bash

# Family Calendar Display Board - Installation Script for Ubuntu Server
# Target: Ubuntu Server 20.04 or newer (headless; no display/Chromium)
# Installs Node.js 18, builds the app, and adds a systemd user service to run on boot.

set -e

# Run from project root (script lives in deploy/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "Installing Family Calendar Display Board (Ubuntu Server)..."

# Require Ubuntu 20.04+ (Node 18 needs glibc >= 2.28; 20.04 has it)
if [ -f /etc/os-release ]; then
  . /etc/os-release
  if [ "$ID" != "ubuntu" ]; then
    echo "This script is for Ubuntu. Detected: $ID"
    echo "For Debian / Raspberry Pi OS use: ./deploy/install.sh"
    exit 1
  fi
  # Parse major version (e.g. 22.04 -> 22, 20.04 -> 20)
  UBUNTU_MAJOR="${VERSION_ID%%.*}"
  if [ -z "$UBUNTU_MAJOR" ] || [ "$UBUNTU_MAJOR" -lt 20 ]; then
    echo "Ubuntu 20.04 or newer is required. Detected: $VERSION_ID"
    exit 1
  fi
fi

# Install Node.js 18 if missing
if ! command -v node &> /dev/null; then
  echo "Node.js not found. Installing Node.js 18..."
  sudo apt-get update
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Node.js 18+ required. Current: $(node -v). Install from https://deb.nodesource.com/setup_18.x"
  exit 1
fi
echo "Node.js version: $(node -v)"

# pnpm
if ! command -v pnpm &> /dev/null; then
  echo "Installing pnpm..."
  if command -v corepack &> /dev/null; then
    corepack enable
    corepack prepare pnpm@latest --activate
  else
    npm install -g pnpm@latest
  fi
fi
echo "pnpm version: $(pnpm -v)"

# Dependencies and build
echo "Installing dependencies and building..."
pnpm install
pnpm run build

# systemd user service (runs on boot, restarts on failure)
NODE_PATH="$(command -v node)"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_USER_DIR"
SERVICE_FILE="$SYSTEMD_USER_DIR/homeorganizer.service"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Family Calendar Display Board
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$NODE_PATH server/index.js
Restart=on-failure
RestartSec=5
Environment=PORT=3000
# Optional: NODE_ENV=production

[Install]
WantedBy=default.target
EOF

echo "Created $SERVICE_FILE"
systemctl --user daemon-reload
systemctl --user enable homeorganizer.service
systemctl --user start homeorganizer.service

# So the user service runs at boot without being logged in (optional but recommended on headless)
if ! loginctl show-user "$USER" 2>/dev/null | grep -q 'Linger=yes'; then
  echo "Enabling user linger so the app starts on boot (sudo required once)..."
  sudo loginctl enable-linger "$USER" 2>/dev/null || true
fi

echo ""
echo "Installation complete."
echo "  App URL: http://$(hostname -s):3000  (or use this machine's IP/hostname)"
echo "  Create config.json at project root with API keys and calendar URL."
echo ""
echo "Commands:"
echo "  status:  systemctl --user status homeorganizer"
echo "  stop:    systemctl --user stop homeorganizer"
echo "  start:   systemctl --user start homeorganizer"
echo "  logs:    journalctl --user -u homeorganizer -f"
echo ""
