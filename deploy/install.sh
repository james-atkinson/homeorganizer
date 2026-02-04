#!/bin/bash

# Family Calendar Display Board - Installation Script
# Target: Debian / Raspberry Pi OS (armv7l or aarch64)
# Sets up the application and autostart for kiosk mode on boot.

set -e

# Run from project root (script lives in deploy/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "Installing Family Calendar Display Board (Debian / Raspberry Pi OS)..."

# Node 18 requires glibc >= 2.28 (Debian 10 Buster+). Stretch (Debian 9) has 2.24 and cannot run Node 18.
if [ -f /etc/os-release ]; then
  . /etc/os-release
  if [ "${VERSION_ID:-0}" = "9" ] || [ "${VERSION_ID:-0}" = "8" ]; then
    echo "This system is $PRETTY_NAME (Debian $VERSION_ID). Node.js 18 requires glibc >= 2.28 (Debian 10 Buster or newer)."
    echo "Please upgrade to Raspberry Pi OS Buster or newer, then run this script again."
    echo "See: https://www.raspberrypi.com/documentation/computers/os.html#upgrading"
    exit 1
  fi
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing Node.js..."
    # Vite 5 (used by pnpm run build) requires Node 18+
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Check Node.js version (Vite 5 requires Node 18+ for the build)
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Node.js version 18+ required (Vite build). Current version: $(node -v)"
    exit 1
fi

echo "Node.js version: $(node -v)"

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "pnpm not found. Installing pnpm..."
    # Try using corepack first (comes with Node.js 16.10+)
    if command -v corepack &> /dev/null; then
        echo "Using corepack to install pnpm..."
        corepack enable
        corepack prepare pnpm@latest --activate
    else
        # Fallback to npm install
        npm install -g pnpm@latest
    fi
fi

echo "pnpm version: $(pnpm -v)"

# Install project dependencies
echo "Installing project dependencies..."
pnpm install

# Build production bundle
echo "Building production bundle..."
pnpm run build

# Build will create the dist folder which the server will serve

# Create autostart directory if it doesn't exist
AUTOSTART_DIR="$HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"

# Make launcher script executable
chmod +x "$PROJECT_DIR/deploy/launch-display.sh"

# Copy autostart desktop file and inject project path
echo "Setting up autostart..."
sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" "$PROJECT_DIR/deploy/autostart.desktop" > "$AUTOSTART_DIR/homeorganizer.desktop"
chmod +x "$AUTOSTART_DIR/homeorganizer.desktop"

echo "Installation complete!"
echo ""
echo "To start the application:"
echo "  1. Reboot (autostart will launch the display), or"
echo "  2. Run manually: $PROJECT_DIR/deploy/launch-display.sh"
echo ""
echo "Ensure Chromium is installed: sudo apt install chromium-browser"
echo "Create config.json at project root with your API keys and calendar URL before running!"
