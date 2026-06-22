import { isIP } from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog'
]);

function normalizeUrlString(rawUrl) {
  const parsed = new URL(rawUrl);
  parsed.hash = '';
  return parsed.toString();
}

function isBlockedIp(address) {
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true;
  if (address.startsWith('::ffff:')) {
    address = address.slice('::ffff:'.length);
  }

  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    const parts = address.split('.').map(Number);
    if (parts[0] === 127) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 0) return true;
    return false;
  }

  if (ipVersion === 6) {
    const lower = address.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80')) return true;
  }

  return false;
}

function isBlockedHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost')) return true;
  if (host.endsWith('.local')) return true;
  if (isBlockedIp(host)) return true;
  return false;
}

export function assertSafeOutboundUrl(rawUrl, options = {}) {
  const { allowedProtocols = ['http:', 'https:'] } = options;
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw new Error('Invalid URL');
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error('URL protocol not allowed');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URL credentials not allowed');
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error('URL host not allowed');
  }

  return parsed;
}

export function getConfiguredRssUrls(config) {
  const feeds = config?.news?.rssFeeds ?? [];
  return feeds
    .filter(feed => feed && feed.enabled !== false && feed.url)
    .map(feed => normalizeUrlString(feed.url));
}

export function isAllowedRssFeedUrl(rawUrl, allowedUrls) {
  if (!allowedUrls.length) return false;
  try {
    const normalized = normalizeUrlString(rawUrl);
    return allowedUrls.includes(normalized);
  } catch {
    return false;
  }
}
