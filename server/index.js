import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import {
  assertSafeOutboundUrl,
  getConfiguredRssUrls,
  isAllowedRssFeedUrl
} from './urlSafety.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execFileAsync = promisify(execFile);

const projectRoot = join(__dirname, '..');
const configPath = join(projectRoot, 'config.json');
const publicConfigPath = join(projectRoot, 'public', 'config.json');
const dataDir = join(projectRoot, 'data');
const networkDbPath = join(dataDir, 'speedtests.sqlite');

function loadDotEnvFile() {
  const envPath = join(projectRoot, '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key] != null) continue;

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadDotEnvFile();

const app = express();
const PORT = process.env.PORT || 3000;

const SPEED_TEST_INTERVAL_MS = 60 * 60 * 1000;
const PING_INTERVAL_MS = 3 * 60 * 1000;
const CONNECTIVITY_PING_TIMEOUT_MS = 10000;
const PING_STALE_MS = (PING_INTERVAL_MS * 2) + CONNECTIVITY_PING_TIMEOUT_MS;
const SPEED_TEST_STALE_MS = SPEED_TEST_INTERVAL_MS * 3;
const LOCAL_NETWORK_PING_TIMEOUT_MS = 3000;
const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const SPEED_TREND_SAMPLE_COUNT = 7;
const OPENVERSE_IMAGE_SEARCH_URL = 'https://api.openverse.org/v1/images/';
const PEXELS_IMAGE_SEARCH_URL = 'https://api.pexels.com/v1/search';
const PIXABAY_IMAGE_SEARCH_URL = 'https://pixabay.com/api/';
const UNSPLASH_IMAGE_SEARCH_URL = 'https://api.unsplash.com/search/photos';
const DEFAULT_NETWORK_STATUS_CONFIG = {
  uptimeWindowHours: 24,
  localCheck: {
    enabled: true,
    target: 'auto'
  },
  thresholds: {
    ping: {
      goodMs: 60,
      slowMs: 150
    },
    download: {
      goodMbps: 50,
      limitedMbps: 15
    },
    upload: {
      goodMbps: 10,
      limitedMbps: 3
    }
  }
};

mkdirSync(dataDir, { recursive: true });

const networkDb = new Database(networkDbPath);
networkDb.pragma('journal_mode = WAL');
networkDb.exec(`
  CREATE TABLE IF NOT EXISTS network_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    online INTEGER NOT NULL DEFAULT 0,
    last_ping_at INTEGER,
    last_ping_ms REAL,
    internet_failure_reason TEXT,
    local_checked_at INTEGER,
    local_online INTEGER,
    local_ping_ms REAL,
    local_target TEXT,
    local_failure_reason TEXT,
    speed_tested_at INTEGER,
    download_mbps REAL,
    upload_mbps REAL,
    speed_ping_ms REAL,
    server_name TEXT
  );

  CREATE TABLE IF NOT EXISTS network_ping_history (
    checked_at INTEGER PRIMARY KEY,
    internet_online INTEGER NOT NULL,
    internet_ping_ms REAL,
    internet_failure_reason TEXT,
    local_online INTEGER,
    local_ping_ms REAL,
    local_target TEXT,
    local_failure_reason TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_network_ping_history_checked_at
    ON network_ping_history (checked_at);

  CREATE TABLE IF NOT EXISTS network_speed_history (
    tested_at INTEGER PRIMARY KEY,
    download_mbps REAL NOT NULL,
    upload_mbps REAL NOT NULL,
    ping_ms REAL,
    server_name TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_network_speed_history_tested_at
    ON network_speed_history (tested_at);
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = networkDb.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some(column => column.name === columnName)) return;
  networkDb.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function migrateNetworkStateColumns() {
  ensureColumn('network_state', 'internet_failure_reason', 'TEXT');
  ensureColumn('network_state', 'local_checked_at', 'INTEGER');
  ensureColumn('network_state', 'local_online', 'INTEGER');
  ensureColumn('network_state', 'local_ping_ms', 'REAL');
  ensureColumn('network_state', 'local_target', 'TEXT');
  ensureColumn('network_state', 'local_failure_reason', 'TEXT');
}

migrateNetworkStateColumns();

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

const insertSpeedHistoryStmt = networkDb.prepare(`
  INSERT OR REPLACE INTO network_speed_history (tested_at, download_mbps, upload_mbps, ping_ms, server_name)
  VALUES (@tested_at, @download_mbps, @upload_mbps, @ping_ms, @server_name)
`);

const upsertPingStatusStmt = networkDb.prepare(`
  INSERT INTO network_state (
    id,
    online,
    last_ping_at,
    last_ping_ms,
    internet_failure_reason,
    local_checked_at,
    local_online,
    local_ping_ms,
    local_target,
    local_failure_reason
  )
  VALUES (
    1,
    @online,
    @last_ping_at,
    @last_ping_ms,
    @internet_failure_reason,
    @local_checked_at,
    @local_online,
    @local_ping_ms,
    @local_target,
    @local_failure_reason
  )
  ON CONFLICT(id) DO UPDATE SET
    online = excluded.online,
    last_ping_at = excluded.last_ping_at,
    last_ping_ms = excluded.last_ping_ms,
    internet_failure_reason = excluded.internet_failure_reason,
    local_checked_at = excluded.local_checked_at,
    local_online = excluded.local_online,
    local_ping_ms = excluded.local_ping_ms,
    local_target = excluded.local_target,
    local_failure_reason = excluded.local_failure_reason
`);

const insertPingHistoryStmt = networkDb.prepare(`
  INSERT OR REPLACE INTO network_ping_history (
    checked_at,
    internet_online,
    internet_ping_ms,
    internet_failure_reason,
    local_online,
    local_ping_ms,
    local_target,
    local_failure_reason
  )
  VALUES (
    @checked_at,
    @internet_online,
    @internet_ping_ms,
    @internet_failure_reason,
    @local_online,
    @local_ping_ms,
    @local_target,
    @local_failure_reason
  )
`);

const selectNetworkStateStmt = networkDb.prepare(`
  SELECT
    online,
    last_ping_at,
    last_ping_ms,
    internet_failure_reason,
    local_checked_at,
    local_online,
    local_ping_ms,
    local_target,
    local_failure_reason,
    speed_tested_at,
    download_mbps,
    upload_mbps,
    speed_ping_ms,
    server_name
  FROM network_state
  WHERE id = 1
`);

function seedSpeedHistoryFromCurrentState() {
  const row = selectNetworkStateStmt.get();
  if (!row?.speed_tested_at || row.download_mbps == null || row.upload_mbps == null) return;
  insertSpeedHistoryStmt.run({
    tested_at: row.speed_tested_at,
    download_mbps: row.download_mbps,
    upload_mbps: row.upload_mbps,
    ping_ms: row.speed_ping_ms,
    server_name: row.server_name
  });
}

migrateLegacySpeedTests();
seedSpeedHistoryFromCurrentState();

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

function configuredImageProviders(providers) {
  const list = Array.isArray(providers) && providers.length ? providers : ['openverse'];
  const configured = list.filter(provider => {
    if (provider === 'openverse') return true;
    if (provider === 'pexels') return Boolean(process.env.PEXELS_API_KEY);
    if (provider === 'pixabay') return Boolean(process.env.PIXABAY_API_KEY);
    if (provider === 'unsplash') return Boolean(process.env.UNSPLASH_ACCESS_KEY);
    return false;
  });
  return configured.length ? configured : ['openverse'];
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function getNetworkStatusConfig() {
  const configured = loadServerConfig()?.networkStatus || {};
  const localCheck = configured.localCheck || {};
  const thresholds = configured.thresholds || {};
  const ping = thresholds.ping || {};
  const download = thresholds.download || {};
  const upload = thresholds.upload || {};

  return {
    uptimeWindowHours: positiveNumber(
      configured.uptimeWindowHours,
      DEFAULT_NETWORK_STATUS_CONFIG.uptimeWindowHours
    ),
    localCheck: {
      enabled: localCheck.enabled !== false,
      target: typeof localCheck.target === 'string' && localCheck.target.trim()
        ? localCheck.target.trim()
        : DEFAULT_NETWORK_STATUS_CONFIG.localCheck.target
    },
    thresholds: {
      ping: {
        goodMs: positiveNumber(ping.goodMs, DEFAULT_NETWORK_STATUS_CONFIG.thresholds.ping.goodMs),
        slowMs: positiveNumber(ping.slowMs, DEFAULT_NETWORK_STATUS_CONFIG.thresholds.ping.slowMs)
      },
      download: {
        goodMbps: positiveNumber(download.goodMbps, DEFAULT_NETWORK_STATUS_CONFIG.thresholds.download.goodMbps),
        limitedMbps: positiveNumber(download.limitedMbps, DEFAULT_NETWORK_STATUS_CONFIG.thresholds.download.limitedMbps)
      },
      upload: {
        goodMbps: positiveNumber(upload.goodMbps, DEFAULT_NETWORK_STATUS_CONFIG.thresholds.upload.goodMbps),
        limitedMbps: positiveNumber(upload.limitedMbps, DEFAULT_NETWORK_STATUS_CONFIG.thresholds.upload.limitedMbps)
      }
    }
  };
}

function getSanitizedConfig() {
  const c = loadServerConfig();
  if (!c) {
    return {
      networkStatus: getNetworkStatusConfig()
    };
  }
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
  if (out.wallpaper) {
    out.wallpaper = {
      ...out.wallpaper,
      providers: configuredImageProviders(out.wallpaper.providers)
    };
  }
  out.networkStatus = getNetworkStatusConfig();
  return out;
}

function toMbps(bitsPerSecond) {
  return Math.round((bitsPerSecond / 1_000_000) * 100) / 100;
}

function networkProbeErrorMessage(error, label) {
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return `${label} timed out`;
  }
  return `${label} failed`;
}

async function probeInternetConnectivity() {
  const pingStart = Date.now();
  try {
    await axios.get('https://speed.cloudflare.com/__down?bytes=1', {
      timeout: CONNECTIVITY_PING_TIMEOUT_MS
    });
    return {
      online: true,
      pingMs: Math.round((Date.now() - pingStart) * 100) / 100,
      failureReason: null
    };
  } catch (error) {
    return {
      online: false,
      pingMs: null,
      failureReason: networkProbeErrorMessage(error, 'Internet probe')
    };
  }
}

function isSafeNetworkTarget(target) {
  return /^[a-zA-Z0-9.-]{1,253}$/.test(target);
}

async function detectDefaultGateway() {
  try {
    const { stdout } = await execFileAsync('ip', ['route', 'show', 'default'], { timeout: 1000 });
    const match = stdout.match(/\bdefault\s+via\s+([^\s]+)/);
    if (match?.[1] && isSafeNetworkTarget(match[1])) return match[1];
  } catch (error) {
    // Fall through to the BSD/macOS route command.
  }

  try {
    const { stdout } = await execFileAsync('route', ['-n', 'get', 'default'], { timeout: 1000 });
    const match = stdout.match(/gateway:\s*([^\s]+)/);
    if (match?.[1] && isSafeNetworkTarget(match[1])) return match[1];
  } catch (error) {
    // No supported gateway discovery command was available.
  }

  return null;
}

async function pingNetworkTarget(target) {
  const startedAt = Date.now();
  const args = process.platform === 'darwin'
    ? ['-c', '1', '-W', String(LOCAL_NETWORK_PING_TIMEOUT_MS), target]
    : ['-c', '1', '-W', String(Math.ceil(LOCAL_NETWORK_PING_TIMEOUT_MS / 1000)), target];
  const { stdout } = await execFileAsync('ping', args, { timeout: LOCAL_NETWORK_PING_TIMEOUT_MS + 1000 });
  const match = stdout.match(/time[=<]([0-9.]+)\s*ms/);
  return match ? Number(match[1]) : Math.round((Date.now() - startedAt) * 100) / 100;
}

async function probeLocalNetwork(config) {
  if (!config.localCheck.enabled) {
    return {
      enabled: false,
      target: null,
      online: null,
      pingMs: null,
      failureReason: null
    };
  }

  const configuredTarget = config.localCheck.target;
  const target = configuredTarget === 'auto' ? await detectDefaultGateway() : configuredTarget;
  if (!target || !isSafeNetworkTarget(target)) {
    return {
      enabled: true,
      target: configuredTarget === 'auto' ? null : configuredTarget,
      online: null,
      pingMs: null,
      failureReason: 'Local gateway unavailable'
    };
  }

  try {
    const pingMs = await pingNetworkTarget(target);
    return {
      enabled: true,
      target,
      online: true,
      pingMs: Math.round(pingMs * 100) / 100,
      failureReason: null
    };
  } catch (error) {
    return {
      enabled: true,
      target,
      online: false,
      pingMs: null,
      failureReason: networkProbeErrorMessage(error, 'Local network probe')
    };
  }
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
  const networkConfig = getNetworkStatusConfig();
  const [internetResult, localResult] = await Promise.all([
    probeInternetConnectivity(),
    probeLocalNetwork(networkConfig)
  ]);
  const localOnline = localResult.online == null ? null : localResult.online ? 1 : 0;

  upsertPingStatusStmt.run({
    online: internetResult.online ? 1 : 0,
    last_ping_at: lastPingAt,
    last_ping_ms: internetResult.pingMs,
    internet_failure_reason: internetResult.failureReason,
    local_checked_at: localResult.enabled ? lastPingAt : null,
    local_online: localOnline,
    local_ping_ms: localResult.pingMs,
    local_target: localResult.target,
    local_failure_reason: localResult.failureReason
  });

  insertPingHistoryStmt.run({
    checked_at: lastPingAt,
    internet_online: internetResult.online ? 1 : 0,
    internet_ping_ms: internetResult.pingMs,
    internet_failure_reason: internetResult.failureReason,
    local_online: localOnline,
    local_ping_ms: localResult.pingMs,
    local_target: localResult.target,
    local_failure_reason: localResult.failureReason
  });

  networkDb.prepare('DELETE FROM network_ping_history WHERE checked_at < ?')
    .run(lastPingAt - HISTORY_RETENTION_MS);
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
    insertSpeedHistoryStmt.run({
      tested_at: testedAt,
      download_mbps: toMbps(result.downloadBitsPerSecond),
      upload_mbps: toMbps(result.uploadBitsPerSecond),
      ping_ms: Math.round(result.pingMs * 100) / 100,
      server_name: result.serverName
    });
    networkDb.prepare('DELETE FROM network_speed_history WHERE tested_at < ?')
      .run(testedAt - HISTORY_RETENTION_MS);
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

function percentChange(current, baseline) {
  if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(baseline)) || Number(baseline) <= 0) {
    return null;
  }
  return Math.round(((Number(current) - Number(baseline)) / Number(baseline)) * 100);
}

function getSpeedTrend(testedAt, downloadMbps, uploadMbps) {
  if (testedAt == null) return null;
  const rows = networkDb.prepare(`
    SELECT download_mbps, upload_mbps
    FROM network_speed_history
    WHERE tested_at < ?
    ORDER BY tested_at DESC
    LIMIT ?
  `).all(testedAt, SPEED_TREND_SAMPLE_COUNT);

  if (!rows.length) {
    return {
      sampleCount: 0,
      downloadPct: null,
      uploadPct: null
    };
  }

  const averageDownload = rows.reduce((sum, row) => sum + row.download_mbps, 0) / rows.length;
  const averageUpload = rows.reduce((sum, row) => sum + row.upload_mbps, 0) / rows.length;
  return {
    sampleCount: rows.length,
    downloadPct: percentChange(downloadMbps, averageDownload),
    uploadPct: percentChange(uploadMbps, averageUpload)
  };
}

function getUptimeSummary(generatedAt, windowHours) {
  const windowMs = windowHours * 60 * 60 * 1000;
  const rows = networkDb.prepare(`
    SELECT checked_at, internet_online
    FROM network_ping_history
    WHERE checked_at >= ?
    ORDER BY checked_at ASC
  `).all(generatedAt - windowMs);

  if (!rows.length) {
    return {
      windowHours,
      sampleCount: 0,
      uptimePercent: null,
      outageCount: 0,
      currentOutageDurationMs: null
    };
  }

  const onlineSamples = rows.filter(row => row.internet_online === 1).length;
  let outageCount = 0;
  let previousOnline = true;
  for (const row of rows) {
    const online = row.internet_online === 1;
    if (!online && previousOnline) {
      outageCount += 1;
    }
    previousOnline = online;
  }

  const latest = rows[rows.length - 1];
  let currentOutageDurationMs = null;
  if (latest.internet_online !== 1) {
    let outageStartedAt = latest.checked_at;
    for (let i = rows.length - 2; i >= 0; i -= 1) {
      if (rows[i].internet_online === 1) break;
      outageStartedAt = rows[i].checked_at;
    }
    currentOutageDurationMs = generatedAt - outageStartedAt;
  }

  return {
    windowHours,
    sampleCount: rows.length,
    uptimePercent: Math.round((onlineSamples / rows.length) * 1000) / 10,
    outageCount,
    currentOutageDurationMs
  };
}

function getFailureContext(row, pingStale) {
  if (pingStale) return 'Network status is stale';
  if (row.online === 1) {
    if (row.local_online === 0) return 'Internet reachable; local gateway check failed';
    return null;
  }
  if (row.local_online === 1) return 'Internet unreachable; local network reachable';
  if (row.local_online === 0) return 'Internet and local network checks failed';
  return row.internet_failure_reason || 'Internet probe failed';
}

function getNetworkStatusPayload() {
  const generatedAt = Date.now();
  const networkConfig = getNetworkStatusConfig();
  const row = selectNetworkStateStmt.get();
  if (!row) {
    return {
      online: false,
      generatedAt,
      lastPingAt: null,
      lastPingAgeMs: null,
      pingStale: true,
      pingMs: null,
      failureContext: 'No network checks have completed yet',
      localNetwork: {
        enabled: networkConfig.localCheck.enabled,
        checkedAt: null,
        target: null,
        online: null,
        pingMs: null,
        failureReason: null
      },
      uptime: getUptimeSummary(generatedAt, networkConfig.uptimeWindowHours),
      thresholds: networkConfig.thresholds,
      speedTest: null
    };
  }

  const lastPingAgeMs = row.last_ping_at != null ? generatedAt - row.last_ping_at : null;
  const pingStale = lastPingAgeMs == null || lastPingAgeMs > PING_STALE_MS;
  const speedTest = row.speed_tested_at != null
    ? {
        testedAt: row.speed_tested_at,
        ageMs: generatedAt - row.speed_tested_at,
        stale: (generatedAt - row.speed_tested_at) > SPEED_TEST_STALE_MS,
        downloadMbps: row.download_mbps,
        uploadMbps: row.upload_mbps,
        pingMs: row.speed_ping_ms,
        serverName: row.server_name,
        trend: getSpeedTrend(row.speed_tested_at, row.download_mbps, row.upload_mbps)
      }
    : null;

  return {
    online: row.online === 1,
    generatedAt,
    lastPingAt: row.last_ping_at ?? null,
    lastPingAgeMs,
    pingStale,
    pingMs: row.last_ping_ms ?? null,
    failureReason: row.internet_failure_reason ?? null,
    failureContext: getFailureContext(row, pingStale),
    localNetwork: {
      enabled: networkConfig.localCheck.enabled,
      checkedAt: row.local_checked_at ?? null,
      target: row.local_target ?? null,
      online: row.local_online == null ? null : row.local_online === 1,
      pingMs: row.local_ping_ms ?? null,
      failureReason: row.local_failure_reason ?? null
    },
    uptime: getUptimeSummary(generatedAt, networkConfig.uptimeWindowHours),
    thresholds: networkConfig.thresholds,
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

function sanitizeImageQuery(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 80) {
    throw new Error('Invalid image query');
  }
  return value;
}

function clampInteger(raw, fallback, min, max) {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function missingImageProviderKey(provider, envName) {
  return {
    status: 503,
    body: {
      error: `${provider} API key not configured`,
      env: envName
    }
  };
}

// Openverse image search proxy endpoint
app.get('/api/images/openverse', async (req, res) => {
  try {
    const query = sanitizeImageQuery(req.query.query || req.query.q);
    const limit = clampInteger(req.query.limit, 10, 1, 20);
    const page = clampInteger(req.query.page, 1, 1, 50);

    const response = await axios.get(OPENVERSE_IMAGE_SEARCH_URL, {
      params: {
        q: query,
        page_size: limit,
        page,
        aspect_ratio: 'wide',
        mature: false,
        excluded_source: 'wikimedia'
      },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'homeorganizer/1.0'
      },
      timeout: 10000,
      validateStatus: () => true
    });

    if (response.status !== 200 || !Array.isArray(response.data?.results)) {
      const message = response.statusText || 'Failed to fetch Openverse images';
      return res.status(response.status || 502).json({ error: message });
    }

    const images = response.data.results.map(image => ({
      id: image.id,
      title: image.title,
      url: image.url,
      thumbnail: image.thumbnail,
      creator: image.creator,
      creator_url: image.creator_url,
      license: image.license,
      license_version: image.license_version,
      license_url: image.license_url,
      provider: image.provider,
      source: image.source,
      foreign_landing_url: image.foreign_landing_url,
      attribution: image.attribution,
      mature: image.mature,
      width: image.width,
      height: image.height,
      filetype: image.filetype
    }));

    res.json({ images });
  } catch (error) {
    if (error.message === 'Invalid image query') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error fetching Openverse images:', error);
    const status = error.response?.status || 500;
    const message = error.response?.statusText || 'Failed to fetch Openverse images';
    res.status(status).json({ error: message });
  }
});

app.get('/api/images/pexels', async (req, res) => {
  try {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      const error = missingImageProviderKey('Pexels', 'PEXELS_API_KEY');
      return res.status(error.status).json(error.body);
    }

    const query = sanitizeImageQuery(req.query.query || req.query.q);
    const limit = clampInteger(req.query.limit, 10, 1, 20);
    const page = clampInteger(req.query.page, 1, 1, 50);

    const response = await axios.get(PEXELS_IMAGE_SEARCH_URL, {
      params: {
        query,
        orientation: 'landscape',
        per_page: limit,
        page
      },
      headers: {
        'Accept': 'application/json',
        'Authorization': apiKey
      },
      timeout: 10000,
      validateStatus: () => true
    });

    if (response.status !== 200 || !Array.isArray(response.data?.photos)) {
      const message = response.statusText || 'Failed to fetch Pexels images';
      return res.status(response.status || 502).json({ error: message });
    }

    const images = response.data.photos.map(photo => ({
      id: photo.id,
      title: photo.alt || `Pexels photo by ${photo.photographer}`,
      url: photo.src?.landscape || photo.src?.large2x || photo.src?.large || photo.src?.original,
      thumbnail: photo.src?.medium || photo.src?.small,
      creator: photo.photographer,
      creator_url: photo.photographer_url,
      provider: 'pexels',
      source: 'pexels',
      foreign_landing_url: photo.url,
      attribution: `Photo by ${photo.photographer} on Pexels`,
      mature: false,
      width: photo.width,
      height: photo.height,
      filetype: 'image/jpeg'
    }));

    res.json({ images });
  } catch (error) {
    if (error.message === 'Invalid image query') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error fetching Pexels images:', error);
    const status = error.response?.status || 500;
    const message = error.response?.statusText || 'Failed to fetch Pexels images';
    res.status(status).json({ error: message });
  }
});

app.get('/api/images/pixabay', async (req, res) => {
  try {
    const apiKey = process.env.PIXABAY_API_KEY;
    if (!apiKey) {
      const error = missingImageProviderKey('Pixabay', 'PIXABAY_API_KEY');
      return res.status(error.status).json(error.body);
    }

    const query = sanitizeImageQuery(req.query.query || req.query.q);
    const limit = clampInteger(req.query.limit, 10, 3, 20);
    const page = clampInteger(req.query.page, 1, 1, 50);

    const response = await axios.get(PIXABAY_IMAGE_SEARCH_URL, {
      params: {
        key: apiKey,
        q: query,
        image_type: 'photo',
        orientation: 'horizontal',
        safesearch: true,
        per_page: limit,
        page
      },
      headers: {
        'Accept': 'application/json'
      },
      timeout: 10000,
      validateStatus: () => true
    });

    if (response.status !== 200 || !Array.isArray(response.data?.hits)) {
      const message = response.statusText || 'Failed to fetch Pixabay images';
      return res.status(response.status || 502).json({ error: message });
    }

    const images = response.data.hits.map(image => ({
      id: image.id,
      title: image.tags || 'Pixabay photo',
      url: image.largeImageURL || image.webformatURL,
      thumbnail: image.previewURL || image.webformatURL,
      creator: image.user,
      creator_url: image.user ? `https://pixabay.com/users/${image.user}-${image.user_id}/` : null,
      provider: 'pixabay',
      source: 'pixabay',
      foreign_landing_url: image.pageURL,
      attribution: image.user ? `Image by ${image.user} on Pixabay` : 'Image from Pixabay',
      mature: false,
      width: image.imageWidth,
      height: image.imageHeight,
      filetype: 'image/jpeg'
    }));

    res.json({ images });
  } catch (error) {
    if (error.message === 'Invalid image query') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error fetching Pixabay images:', error);
    const status = error.response?.status || 500;
    const message = error.response?.statusText || 'Failed to fetch Pixabay images';
    res.status(status).json({ error: message });
  }
});

app.get('/api/images/unsplash', async (req, res) => {
  try {
    const apiKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!apiKey) {
      const error = missingImageProviderKey('Unsplash', 'UNSPLASH_ACCESS_KEY');
      return res.status(error.status).json(error.body);
    }

    const query = sanitizeImageQuery(req.query.query || req.query.q);
    const limit = clampInteger(req.query.limit, 10, 1, 20);
    const page = clampInteger(req.query.page, 1, 1, 50);

    const response = await axios.get(UNSPLASH_IMAGE_SEARCH_URL, {
      params: {
        query,
        orientation: 'landscape',
        content_filter: 'high',
        per_page: limit,
        page
      },
      headers: {
        'Accept': 'application/json',
        'Authorization': `Client-ID ${apiKey}`
      },
      timeout: 10000,
      validateStatus: () => true
    });

    if (response.status !== 200 || !Array.isArray(response.data?.results)) {
      const message = response.statusText || 'Failed to fetch Unsplash images';
      return res.status(response.status || 502).json({ error: message });
    }

    const images = response.data.results.map(photo => ({
      id: photo.id,
      title: photo.alt_description || photo.description || `Unsplash photo by ${photo.user?.name}`,
      url: photo.urls?.regular || photo.urls?.full,
      thumbnail: photo.urls?.small || photo.urls?.thumb,
      creator: photo.user?.name,
      creator_url: photo.user?.links?.html,
      provider: 'unsplash',
      source: 'unsplash',
      foreign_landing_url: photo.links?.html,
      attribution: photo.user?.name ? `Photo by ${photo.user.name} on Unsplash` : 'Photo from Unsplash',
      mature: false,
      width: photo.width,
      height: photo.height,
      filetype: 'image/jpeg'
    }));

    res.json({ images });
  } catch (error) {
    if (error.message === 'Invalid image query') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error fetching Unsplash images:', error);
    const status = error.response?.status || 500;
    const message = error.response?.statusText || 'Failed to fetch Unsplash images';
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
