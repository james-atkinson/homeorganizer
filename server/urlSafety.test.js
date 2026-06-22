import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSafeOutboundUrl,
  getConfiguredRssUrls,
  isAllowedRssFeedUrl
} from './urlSafety.js';

test('assertSafeOutboundUrl allows public https URLs', () => {
  const parsed = assertSafeOutboundUrl('https://rss.cbc.ca/lineup/canada.xml');
  assert.equal(parsed.hostname, 'rss.cbc.ca');
});

test('assertSafeOutboundUrl blocks localhost and private hosts', () => {
  assert.throws(() => assertSafeOutboundUrl('http://127.0.0.1/'), /not allowed/);
  assert.throws(() => assertSafeOutboundUrl('http://localhost/'), /not allowed/);
  assert.throws(() => assertSafeOutboundUrl('http://192.168.1.1/'), /not allowed/);
  assert.throws(() => assertSafeOutboundUrl('file:///etc/passwd'), /protocol not allowed/);
});

test('RSS allowlist only permits configured feeds', () => {
  const config = {
    news: {
      rssFeeds: [
        { url: 'http://rss.cbc.ca/lineup/canada.xml', enabled: true },
        { url: 'http://rss.cbc.ca/lineup/world.xml', enabled: false }
      ]
    }
  };
  const allowed = getConfiguredRssUrls(config);
  assert.equal(allowed.length, 1);
  assert.equal(
    isAllowedRssFeedUrl('http://rss.cbc.ca/lineup/canada.xml', allowed),
    true
  );
  assert.equal(
    isAllowedRssFeedUrl('http://evil.example/feed.xml', allowed),
    false
  );
});
