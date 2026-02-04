# Family Calendar Display Board

A Vue 3 application for a Raspberry Pi kitchen display board featuring calendar, weather, configurable RSS feeds, and Reddit feeds. This is a non-interactive display - all content updates automatically with no user interaction required.

## Features

- **Monthly Calendar View**: Displays events from a Google Calendar .ics file
- **Date & Time Display**: Large, readable current date and time
- **Upcoming Events List**: Shows all events up to 15 days out
- **Weather Widget**: Current weather and 5-day forecast from OpenWeatherMap
- **News Headlines**: Rotating headlines from configurable RSS feeds and Reddit
- **Rotating Background**: Beautiful wallpapers from Reddit that rotate every 30 minutes
- **1080p Optimized**: Designed specifically for 1920x1080 displays

## Prerequisites

- Node.js 18+ installed
- pnpm installed using one of these methods:
  - **Recommended**: Use corepack (comes with Node.js 16.10+): `corepack enable` then `corepack prepare pnpm@latest --activate`
  - Alternative: Standalone installer: `curl -fsSL https://get.pnpm.io/install.sh | sh -`
  - Alternative: npm: `npm install -g pnpm@latest` (may require fixing npm cache permissions first)
- OpenWeatherMap API key (free tier available at [openweathermap.org](https://openweathermap.org/api))
- Google Calendar .ics file URL (public or private share link)

## Architecture

The application consists of two parts:
- **Backend API Server** (Express.js): Runs on port 3000, provides proxy endpoints for Reddit, RSS feeds, and Calendar to avoid CORS issues
- **Frontend** (Vue 3 + Vite): The display interface that calls the backend API endpoints

## Installation

### Development Setup

1. Clone or download this repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Configure your settings in `config.json` at the project root (see Configuration section). The file is not served to the web; the app receives a sanitized config from `/api/config`.
4. Start the development servers (both backend API and frontend):
   ```bash
   pnpm run dev
   ```
   This starts:
   - Backend API server on `http://localhost:3000`
   - Frontend dev server on `http://localhost:5173`
5. Open `http://localhost:5173` in your browser (the frontend will proxy API calls to the backend)

### Production Build

1. Build the production bundle:
   ```bash
   pnpm run build
   ```
2. Start the production server:
   ```bash
   pnpm start
   ```
   This starts the Express server on `http://localhost:3000` which serves both the API and the built frontend.

### Raspberry Pi / Debian Deployment

Target: **Debian** or **Raspberry Pi OS** (e.g. armv7l). **Raspberry Pi OS Buster (Debian 10) or newer is required** — Node.js 18 needs glibc ≥ 2.28; Stretch (Debian 9) has 2.24 and cannot run Node 18. If you're on Stretch, [upgrade your Raspberry Pi OS](https://www.raspberrypi.com/documentation/computers/os.html#upgrading) before running the installer.

1. Copy the project to the Pi
2. Install Chromium if needed: `sudo apt install chromium-browser`
3. Run the installation script from the project root:
   ```bash
   ./deploy/install.sh
   ```
4. Create `config.json` at the project root with your API keys and calendar URL (see Configuration section)
5. Reboot (or run `./deploy/launch-display.sh` to start manually)

The application will autostart in fullscreen kiosk mode on login. The launcher uses `chromium-browser` (Raspberry Pi OS) or `chromium` (Debian) if available.

### Ubuntu Server (headless)

Target: **Ubuntu Server 20.04 or newer**. Installs the app as a systemd user service (no display; access via browser from another device).

1. Copy or clone the project to the server
2. From the project root, run:
   ```bash
   chmod +x deploy/install-ubuntu.sh
   ./deploy/install-ubuntu.sh
   ```
3. Create `config.json` at the project root (see Configuration section)
4. Open `http://<server-hostname-or-IP>:3000` in a browser

The installer installs Node.js 18, builds the app, and enables a user systemd service so it starts on boot. Use `systemctl --user status homeorganizer` to check status and `journalctl --user -u homeorganizer -f` for logs.

## Configuration

Create or edit `config.json` at the **project root** (not in `public/`). The server reads this file and never serves it directly; the web interface receives a sanitized copy from `/api/config` (API keys and private calendar URLs are omitted). Both `config.json` and `public/config.json` are in `.gitignore` so secrets are not committed.

### Calendar

```json
{
  "calendar": {
    "icsUrl": "https://calendar.google.com/calendar/ical/YOUR_CALENDAR_ID/basic.ics"
  }
}
```

To get your Google Calendar .ics URL:
1. Open Google Calendar
2. Go to Settings → Settings for my calendars
3. Select your calendar
4. Scroll to "Integrate calendar"
5. Copy the "Public URL to .ics file" or "Secret address in iCal format"

### Weather

```json
{
  "weather": {
    "apiKey": "YOUR_OPENWEATHER_API_KEY",
    "location": {
      "city": "Edmonton",
      "country": "CA"
    }
  }
}
```

Get your free API key at [openweathermap.org](https://openweathermap.org/api)

### News

```json
{
  "news": {
    "rssFeeds": [
      {
        "name": "CBC Canada News",
        "url": "http://rss.cbc.ca/lineup/canada.xml",
        "enabled": true
      }
    ],
    "reddit": {
      "enabled": true,
      "subreddits": ["politics"]
    },
    "refreshInterval": 600000,
    "headlineDisplayInterval": 6000
  }
}
```

- `rssFeeds`: Array of RSS feeds to fetch headlines from
- `reddit.subreddits`: Array of subreddit names (without r/)
- `refreshInterval`: How often to refresh headlines (milliseconds)
- `headlineDisplayInterval`: How long to display each headline (milliseconds)

### Wallpaper

```json
{
  "wallpaper": {
    "enabled": true,
    "subreddits": ["wallpaper", "wallpapers"],
    "rotationInterval": 1800000,
    "imagePoolRefreshInterval": 7200000
  }
}
```

- `subreddits`: Reddit subreddits to fetch wallpapers from
- `rotationInterval`: How often to rotate background image (milliseconds, default 30 minutes)
- `imagePoolRefreshInterval`: How often to refresh the image pool (milliseconds, default 2 hours)

## Development

### Project Structure

```
homeorganizer/
├── src/
│   ├── components/      # Vue components
│   ├── services/        # API service modules
│   ├── utils/           # Utility functions
│   └── styles/          # Global styles
├── config.json          # Configuration (project root; not served; see .gitignore)
├── public/
├── deploy/              # Deployment scripts
└── dist/                # Production build output
```

### Available Scripts

- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production
- `pnpm run preview` - Preview production build

### Testing

The application can be tested locally in any modern browser:
- Use browser fullscreen mode (F11) to simulate kiosk experience
- Test at 100% zoom to verify 1080p layout
- Use browser dev tools to debug API calls and component state

## Troubleshooting

### `apt update` fails with "does no longer have a Release file" (Raspbian Stretch)

If you see a 404 for `raspbian stretch Release`, your Raspberry Pi is on **Raspbian Stretch** (Debian 9), which is end-of-life. Use the **legacy** mirror (neither the old mirror nor `archive.raspbian.org` host Stretch anymore):

```bash
sudo sed -i 's|http://archive.raspbian.org/raspbian|http://legacy.raspbian.org/raspbian|g' /etc/apt/sources.list
sudo sed -i 's|http://mirrordirector.raspbian.org/raspbian|http://legacy.raspbian.org/raspbian|g' /etc/apt/sources.list
```

Then run `sudo apt update`. If you have files in `/etc/apt/sources.list.d/` that reference `archive.raspbian.org` or `mirrordirector.raspbian.org` for Raspbian, change those to `http://legacy.raspbian.org/raspbian` as well.

Then run `sudo apt update` again. **Recommendation:** plan an upgrade to a supported Raspberry Pi OS (e.g. Bookworm) when you can; Stretch no longer receives security updates.

### `apt install nodejs` fails with "libc6 (>= 2.28) but 2.24 is to be installed"

Your system is **Raspbian Stretch** (Debian 9). Node.js 18 requires glibc ≥ 2.28; Stretch only has 2.24, so Node 18 cannot be installed on Stretch. **You need to upgrade Raspberry Pi OS** to Buster (Debian 10) or newer, then run the installer again. See [Raspberry Pi OS upgrading](https://www.raspberrypi.com/documentation/computers/os.html#upgrading). There is no supported way to run Node 18 on Stretch.

### Calendar events not showing

- Verify the .ics URL is accessible
- Check browser console for CORS errors
- Ensure the calendar URL is correct and publicly accessible

### Weather not loading

- Verify your OpenWeatherMap API key is correct
- Check that the API key has not exceeded rate limits
- Ensure the city and country are spelled correctly

### Wallpapers not loading

- Check that the Reddit subreddits exist and have image posts
- Verify network connectivity
- Check browser console for errors

### Application not starting on boot

- Verify the autostart desktop file exists in `~/.config/autostart/homeorganizer.desktop`
- Check that Chromium is installed: `which chromium-browser` or `which chromium` (Debian/Raspberry Pi OS)
- Ensure the launcher is executable: `chmod +x /path/to/project/deploy/launch-display.sh`
- Verify the project path in the autostart file matches your install
- Check system logs for errors

## License

This project is for personal use.
