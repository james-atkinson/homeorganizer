import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import {
  assertSafeOutboundUrl,
  getConfiguredRssUrls,
  isAllowedRssFeedUrl,
  sanitizeRedditSort,
  sanitizeRedditSubreddit
} from './urlSafety.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const projectRoot = join(__dirname, '..');
const configPath = join(projectRoot, 'config.json');
const publicConfigPath = join(projectRoot, 'public', 'config.json');
const dataDir = join(projectRoot, 'data');
const networkDbPath = join(dataDir, 'speedtests.sqlite');
const SPEED_TEST_INTERVAL_MS = 60 * 60 * 1000;
const PING_INTERVAL_MS = 3 * 60 * 1000;
const CONNECTIVITY_PING_TIMEOUT_MS = 10000;

mkdirSync(dataDir, { recursive: true });

const networkDb = new Database(networkDbPath);
networkDb.pragma('journal_mode = WAL');
networkDb.exec(`
  CREATE TABLE IF NOT EXISTS network_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    online INTEGER NOT NULL DEFAULT 0,
    last_ping_at INTEGER,
    last_ping_ms REAL,
    speed_tested_at INTEGER,
    download_mbps REAL,
    upload_mbps REAL,
    speed_ping_ms REAL,
    server_name TEXT
  );
`);

function migrateLegacySpeedTests() {
  const legacyTable = networkDb.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'speed_tests'
  `).get();
  if (!legacyTable) return;

  const latest = networkDb.prepare(`
    SELECT tested_at, download_mbps, upload_mbps, ping_ms, server_name
    FROM speed_tests
    ORDER BY tested_at DESC
    LIMIT 1
  `).get();

  if (latest) {
    upsertSpeedTestStmt.run({
      speed_tested_at: latest.tested_at,
      download_mbps: latest.download_mbps,
      upload_mbps: latest.upload_mbps,
      speed_ping_ms: latest.ping_ms,
      server_name: latest.server_name
    });
  }

  networkDb.exec('DROP TABLE IF EXISTS speed_tests');
  networkDb.exec('DROP INDEX IF EXISTS idx_speed_tests_tested_at');
}

const upsertSpeedTestStmt = networkDb.prepare(`
  INSERT INTO network_state (id, speed_tested_at, download_mbps, upload_mbps, speed_ping_ms, server_name)
  VALUES (1, @speed_tested_at, @download_mbps, @upload_mbps, @speed_ping_ms, @server_name)
  ON CONFLICT(id) DO UPDATE SET
    speed_tested_at = excluded.speed_tested_at,
    download_mbps = excluded.download_mbps,
    upload_mbps = excluded.upload_mbps,
    speed_ping_ms = excluded.speed_ping_ms,
    server_name = excluded.server_name
`);

const upsertPingStatusStmt = networkDb.prepare(`
  INSERT INTO network_state (id, online, last_ping_at, last_ping_ms)
  VALUES (1, @online, @last_ping_at, @last_ping_ms)
  ON CONFLICT(id) DO UPDATE SET
    online = excluded.online,
    last_ping_at = excluded.last_ping_at,
    last_ping_ms = excluded.last_ping_ms
`);

const selectNetworkStateStmt = networkDb.prepare(`
  SELECT online, last_ping_at, last_ping_ms, speed_tested_at, download_mbps, upload_mbps, speed_ping_ms, server_name
  FROM network_state
  WHERE id = 1
`);

migrateLegacySpeedTests();

function loadServerConfig() {
  const path = existsSync(configPath) ? configPath : publicConfigPath;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    console.error('Failed to load config:', e.message);
    return null;
  }
}

function getSanitizedConfig() {
  const c = loadServerConfig();
  if (!c) return {};
  const out = { ...c };
  if (out.weather) {
    out.weather = { ...out.weather };
    delete out.weather.apiKey;
  }
  if (out.calendar) {
    const cal = out.calendar;
    out.calendar = {
      ...(cal.holidayCountry != null && { holidayCountry: cal.holidayCountry }),
      ...(cal.holidayState != null && { holidayState: cal.holidayState })
    };
  }
  return out;
}

function toMbps(bitsPerSecond) {
  return Math.round((bitsPerSecond / 1_000_000) * 100) / 100;
}

async function runSpeedProbe() {
  const downloadBytes = 20 * 1024 * 1024;
  const uploadBytes = 5 * 1024 * 1024;
  const uploadBuffer = Buffer.alloc(uploadBytes, 'a');

  const pingStart = Date.now();
  await axios.get('https://speed.cloudflare.com/__down?bytes=1', { timeout: 10000 });
  const pingMs = Date.now() - pingStart;

  const downloadStart = Date.now();
  await axios.get(`https://speed.cloudflare.com/__down?bytes=${downloadBytes}`, {
    responseType: 'arraybuffer',
    timeout: 30000
  });
  const downloadDurationSec = Math.max((Date.now() - downloadStart) / 1000, 0.001);
  const downloadBitsPerSecond = (downloadBytes * 8) / downloadDurationSec;

  const uploadStart = Date.now();
  await axios.post('https://speed.cloudflare.com/__up', uploadBuffer, {
    headers: { 'Content-Type': 'application/octet-stream' },
    timeout: 30000
  });
  const uploadDurationSec = Math.max((Date.now() - uploadStart) / 1000, 0.001);
  const uploadBitsPerSecond = (uploadBytes * 8) / uploadDurationSec;

  return {
    downloadBitsPerSecond,
    uploadBitsPerSecond,
    pingMs,
    jitterMs: null,
    serverName: 'Cloudflare probe'
  };
}

async function runConnectivityPing() {
  const lastPingAt = Date.now();
  try {
    const pingStart = Date.now();
    await axios.get('https://speed.cloudflare.com/__down?bytes=1', {
      timeout: CONNECTIVITY_PING_TIMEOUT_MS
    });
    const pingMs = Math.round((Date.now() - pingStart) * 100) / 100;
    upsertPingStatusStmt.run({
      online: 1,
      last_ping_at: lastPingAt,
      last_ping_ms: pingMs
    });
  } catch (error) {
    upsertPingStatusStmt.run({
      online: 0,
      last_ping_at: lastPingAt,
      last_ping_ms: null
    });
  }
}

async function runSpeedTestAndStore() {
  const testedAt = Date.now();
  try {
    const result = await runSpeedProbe();
    upsertSpeedTestStmt.run({
      speed_tested_at: testedAt,
      download_mbps: toMbps(result.downloadBitsPerSecond),
      upload_mbps: toMbps(result.uploadBitsPerSecond),
      speed_ping_ms: Math.round(result.pingMs * 100) / 100,
      server_name: result.serverName
    });
  } catch (error) {
    console.error('Speed test failed:', error.message);
  }
}

let speedTestInProgress = false;
let pingInProgress = false;

async function runScheduledSpeedTest() {
  if (speedTestInProgress) {
    return;
  }

  speedTestInProgress = true;
  try {
    await runSpeedTestAndStore();
    console.log('Hourly speed test completed.');
  } catch (error) {
    console.error('Hourly speed test failed:', error.message);
  } finally {
    speedTestInProgress = false;
  }
}

function startSpeedTestScheduler() {
  runScheduledSpeedTest();
  setInterval(runScheduledSpeedTest, SPEED_TEST_INTERVAL_MS);
}

async function runScheduledConnectivityPing() {
  if (pingInProgress) {
    return;
  }

  pingInProgress = true;
  try {
    await runConnectivityPing();
  } catch (error) {
    console.error('Connectivity ping failed:', error.message);
  } finally {
    pingInProgress = false;
  }
}

function startConnectivityScheduler() {
  runScheduledConnectivityPing();
  setInterval(runScheduledConnectivityPing, PING_INTERVAL_MS);
}

function getNetworkStatusPayload() {
  const row = selectNetworkStateStmt.get();
  if (!row) {
    return {
      online: false,
      lastPingAt: null,
      pingMs: null,
      speedTest: null
    };
  }

  const speedTest = row.speed_tested_at != null
    ? {
        testedAt: row.speed_tested_at,
        downloadMbps: row.download_mbps,
        uploadMbps: row.upload_mbps,
        pingMs: row.speed_ping_ms,
        serverName: row.server_name
      }
    : null;

  return {
    online: row.online === 1,
    lastPingAt: row.last_ping_at ?? null,
    pingMs: row.last_ping_ms ?? null,
    speedTest
  };
}

// Block direct access to config file (secrets must not be publicly fetchable)
app.get('/config.json', (req, res) => {
  res.status(404).end();
});

// Sanitized config for the client (no API keys or private URLs)
app.get('/api/config', (req, res) => {
  try {
    res.json(getSanitizedConfig());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Serve static files from dist in production
const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Reddit API proxy endpoint – use browser-like headers
const REDDIT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1'
};

app.get('/api/reddit/:subreddit', async (req, res) => {
  try {
    const subreddit = sanitizeRedditSubreddit(req.params.subreddit);
    const sort = sanitizeRedditSort(req.query.sort);
    
    const basePath = `/r/${subreddit}/${sort}.json`;
    const hosts = ['https://www.reddit.com', 'https://old.reddit.com'];

    let lastError;
    for (const base of hosts) {
      try {
        const response = await axios.get(base + basePath, {
          headers: REDDIT_HEADERS,
          timeout: 10000,
          validateStatus: () => true
        });
        if (response.status === 200) {
          return res.json(response.data);
        }
        lastError = { status: response.status, statusText: response.statusText };
      } catch (err) {
        lastError = err.response
          ? { status: err.response.status, statusText: err.response.statusText }
          : err;
      }
    }

    const status = lastError?.status || 500;
    const message = lastError?.statusText || 'Failed to fetch Reddit data';
    res.status(status).json({ error: message });
  } catch (error) {
    if (error.message === 'Invalid subreddit' || error.message === 'Invalid sort') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error fetching Reddit data:', error);
    const status = error.response?.status || 500;
    const message = error.response?.statusText || 'Failed to fetch Reddit data';
    res.status(status).json({ error: message });
  }
});

// RSS feed proxy endpoint
app.get('/api/rss', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const config = loadServerConfig();
    const allowedUrls = getConfiguredRssUrls(config);
    if (!isAllowedRssFeedUrl(url, allowedUrls)) {
      return res.status(403).json({ error: 'RSS feed URL not allowed' });
    }

    assertSafeOutboundUrl(url);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      responseType: 'text'
    });
    
    res.setHeader('Content-Type', 'application/xml');
    res.send(response.data);
  } catch (error) {
    console.error('Error fetching RSS feed:', error);
    const status = error.response?.status || 500;
    const message = error.response?.statusText || 'Failed to fetch RSS feed';
    res.status(status).json({ error: message });
  }
});

// Calendar .ics proxy endpoint (uses server config when url not provided)
app.get('/api/calendar', async (req, res) => {
  try {
    const config = loadServerConfig();
    const url = config?.calendar?.icsUrl;
    if (!url) {
      return res.status(400).json({ error: 'Calendar URL not configured' });
    }

    assertSafeOutboundUrl(url);

    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      responseType: 'text'
    });
    res.setHeader('Content-Type', 'text/calendar');
    res.send(response.data);
  } catch (error) {
    console.error('Error fetching calendar:', error);
    const status = error.response?.status || 500;
    const message = error.response?.statusText || 'Failed to fetch calendar';
    res.status(status).json({ error: message });
  }
});

// Weather proxy (keeps API key on server)
app.get('/api/weather', async (req, res) => {
  try {
    const config = loadServerConfig();
    const { apiKey, location } = config?.weather || {};
    if (!apiKey || apiKey === 'YOUR_OPENWEATHER_API_KEY' || !location?.city) {
      return res.status(503).json({ error: 'Weather not configured' });
    }
    const city = encodeURIComponent(location.city);
    const country = encodeURIComponent(location.country);
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city},${country}&appid=${apiKey}&units=metric`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${city},${country}&appid=${apiKey}&units=metric`;
    const [currentRes, forecastRes] = await Promise.all([
      axios.get(currentUrl),
      axios.get(forecastUrl).catch(() => ({ data: null }))
    ]);
    const currentData = currentRes.data;
    const forecastData = forecastRes.data;
    const dailyForecast = processForecast(forecastData);
    const today = dailyForecast[0];
    const expectedPrecip = today ? { pop: today.pop, precipitation: today.precipitation } : null;
    res.json({
      current: {
        temperature: Math.round(currentData.main.temp),
        feelsLike: Math.round(currentData.main.feels_like),
        condition: currentData.weather[0].main,
        description: currentData.weather[0].description,
        icon: currentData.weather[0].icon,
        high: Math.round(currentData.main.temp_max),
        low: Math.round(currentData.main.temp_min),
        humidity: currentData.main.humidity,
        windSpeed: currentData.wind?.speed ?? 0,
        windDeg: currentData.wind?.deg ?? 0,
        sunrise: currentData.sys?.sunrise,
        sunset: currentData.sys?.sunset,
        expectedPrecip
      },
      forecast: dailyForecast,
      location: `${currentData.name}, ${currentData.sys.country}`
    });
  } catch (error) {
    console.error('Error fetching weather:', error);
    res.status(error.response?.status || 500).json({ error: error.response?.statusText || 'Weather unavailable' });
  }
});

app.get('/api/network-status', (req, res) => {
  try {
    res.json(getNetworkStatusPayload());
  } catch (error) {
    console.error('Error fetching network status:', error);
    res.status(500).json({ error: 'Failed to load network status' });
  }
});

function processForecast(forecastData) {
  if (!forecastData?.list) return [];
  const dailyData = {};
  forecastData.list.forEach(item => {
    const date = new Date(item.dt * 1000);
    const dayKey = date.toDateString();
    if (!dailyData[dayKey]) {
      dailyData[dayKey] = { date, temps: [], conditions: [], descriptions: [], icons: [], pops: [], rainMm: 0, snowMm: 0 };
    }
    dailyData[dayKey].temps.push(item.main.temp);
    dailyData[dayKey].conditions.push(item.weather[0].main);
    dailyData[dayKey].descriptions.push(item.weather[0].description ?? item.weather[0].main);
    dailyData[dayKey].icons.push(item.weather[0].icon);
    if (item.pop != null) dailyData[dayKey].pops.push(item.pop);
    dailyData[dayKey].rainMm += item.rain?.['3h'] ?? item.rain?.['1h'] ?? 0;
    dailyData[dayKey].snowMm += item.snow?.['3h'] ?? item.snow?.['1h'] ?? 0;
  });
  return Object.values(dailyData).slice(0, 7).map(day => {
    const popMax = day.pops?.length ? Math.round(Math.max(...day.pops) * 100) : null;
    const rainMm = (day.rainMm || 0) > 0 ? Math.round(day.rainMm * 10) / 10 : null;
    const snowMm = (day.snowMm || 0) > 0 ? Math.round(day.snowMm * 10) / 10 : null;
    const mid = Math.floor(day.conditions.length / 2);
    const condition = day.conditions[mid];
    // Precipitation in correct unit: snow → cm (from mm liquid equiv), rain/other → mm
    const precipitation = condition === 'Snow' && snowMm != null
      ? Math.round((snowMm / 10) * 10) / 10
      : rainMm != null ? rainMm : null;
    return {
      date: day.date,
      dayName: day.date.toLocaleDateString('en-US', { weekday: 'short' }),
      high: Math.round(Math.max(...day.temps)),
      low: Math.round(Math.min(...day.temps)),
      condition,
      description: day.descriptions[mid] ?? condition,
      icon: day.icons[mid],
      pop: popMax,
      precipitation
    };
  });
}

const indexPath = join(distPath, 'index.html');
const hasBuild = existsSync(indexPath);

// Serve the Vue app for all other routes (SPA fallback)
app.get('*', (req, res) => {
  if (!hasBuild) {
    res.status(503).set('Content-Type', 'text/html').send(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Build required</title></head><body style="font-family:sans-serif;padding:2rem;max-width:40em;">' +
      '<h1>Build required</h1><p>No built app found. From the project directory run:</p><pre>pnpm run build</pre>' +
      '<p>Then restart the server.</p><p>If you just cloned the repo, run <code>./deploy/install.sh</code> first.</p></body></html>'
    );
    return;
  }
  res.sendFile(indexPath);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api`);
  startSpeedTestScheduler();
  startConnectivityScheduler();
  if (!hasBuild) {
    console.warn('WARNING: dist/ has no index.html. Run "pnpm run build". Browsers will see a "Build required" page.');
  }
});
