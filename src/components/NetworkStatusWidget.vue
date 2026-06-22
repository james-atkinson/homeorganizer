<template>
  <div class="network-status-widget">
    <h2 class="section-title">Network Status</h2>
    <div v-if="loading" class="loading">Loading network status...</div>
    <div v-else class="status-content">
      <div class="status-main">
        <span class="status-group">
          <span class="status-dot" :class="statusDotClass"></span>
          <span class="status-label">{{ status.online ? 'Online' : 'Offline' }}</span>
          <span v-if="status.online && status.pingMs != null" class="status-ping">{{ formatMetric(status.pingMs) }} ms</span>
          <span class="quality-label" :class="pingQualityClass">{{ pingQualityLabel }}</span>
          <span class="status-meta">{{ pingFreshnessText }}</span>
        </span>
      </div>
      <div v-if="status.failureContext" class="status-main status-warning">
        <span>{{ status.failureContext }}</span>
      </div>
      <template v-if="status.speedTest">
        <div class="status-main status-secondary">
          <span class="speed-metric">Down: {{ formatMetric(status.speedTest.downloadMbps) }} Mbps</span>
          <span class="quality-label" :class="downloadQualityClass">{{ downloadQualityLabel }}</span>
          <span v-if="downloadTrendText" class="trend-label" :class="downloadTrendClass">{{ downloadTrendText }}</span>
        </div>
        <div class="status-main status-secondary">
          <span class="speed-metric">Up: {{ formatMetric(status.speedTest.uploadMbps) }} Mbps</span>
          <span class="quality-label" :class="uploadQualityClass">{{ uploadQualityLabel }}</span>
          <span v-if="uploadTrendText" class="trend-label" :class="uploadTrendClass">{{ uploadTrendText }}</span>
        </div>
      </template>
      <div v-else class="status-main status-secondary">
        <span class="speed-pending">Running first speed test...</span>
      </div>
      <div v-if="status.localNetwork?.enabled" class="status-main status-secondary">
        <span>Local: {{ localNetworkText }}</span>
        <span class="quality-label" :class="localNetworkQualityClass">{{ localNetworkQualityLabel }}</span>
      </div>
      <div class="status-main status-secondary">
        <span class="status-meta">{{ uptimeText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { fetchNetworkStatus } from '../services/networkStatus.js';

const status = ref({
  online: false,
  generatedAt: null,
  lastPingAt: null,
  lastPingAgeMs: null,
  pingStale: true,
  pingMs: null,
  failureReason: null,
  failureContext: null,
  localNetwork: null,
  uptime: null,
  thresholds: null,
  speedTest: null
});
const loading = ref(true);
let refreshInterval = null;

const DEFAULT_THRESHOLDS = {
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
};

function formatMetric(value) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return Number(value).toFixed(1);
}

function formatAge(timestamp) {
  if (!timestamp) return 'never checked';
  const ageMs = Math.max(Date.now() - timestamp, 0);
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function qualityLabel(kind, value) {
  if (value == null || Number.isNaN(Number(value))) return 'Unknown';
  const numeric = Number(value);
  if (kind === 'ping') {
    if (numeric <= thresholds.value.ping.goodMs) return 'Good';
    if (numeric <= thresholds.value.ping.slowMs) return 'Slow';
    return 'Poor';
  }
  if (kind === 'download') {
    if (numeric >= thresholds.value.download.goodMbps) return 'Good';
    if (numeric >= thresholds.value.download.limitedMbps) return 'Limited';
    return 'Poor';
  }
  if (kind === 'upload') {
    if (numeric >= thresholds.value.upload.goodMbps) return 'Good';
    if (numeric >= thresholds.value.upload.limitedMbps) return 'Limited';
    return 'Poor';
  }
  return 'Unknown';
}

function qualityClass(label) {
  if (label === 'Good') return 'quality-good';
  if (label === 'Slow' || label === 'Limited') return 'quality-warn';
  if (label === 'Poor' || label === 'Stale' || label === 'Offline') return 'quality-poor';
  return 'quality-muted';
}

function formatTrend(value) {
  if (value == null || Number.isNaN(Number(value))) return '';
  const numeric = Number(value);
  if (Math.abs(numeric) < 3) return 'stable';
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric}% vs usual`;
}

function trendClass(value) {
  if (value == null || Number.isNaN(Number(value)) || Math.abs(Number(value)) < 3) {
    return 'trend-stable';
  }
  return Number(value) > 0 ? 'trend-up' : 'trend-down';
}

function pluralize(value, singular, plural) {
  return value === 1 ? singular : plural;
}

const thresholds = computed(() => ({
  ping: {
    ...DEFAULT_THRESHOLDS.ping,
    ...(status.value.thresholds?.ping || {})
  },
  download: {
    ...DEFAULT_THRESHOLDS.download,
    ...(status.value.thresholds?.download || {})
  },
  upload: {
    ...DEFAULT_THRESHOLDS.upload,
    ...(status.value.thresholds?.upload || {})
  }
}));

const statusDotClass = computed(() => {
  if (!status.value.online) return 'status-dot-offline';
  return status.value.pingStale ? 'status-dot-stale' : 'status-dot-online';
});

const pingQualityLabel = computed(() => {
  if (status.value.pingStale) return 'Stale';
  if (!status.value.online) return 'Offline';
  return qualityLabel('ping', status.value.pingMs);
});

const pingQualityClass = computed(() => qualityClass(pingQualityLabel.value));
const pingFreshnessText = computed(() => `checked ${formatAge(status.value.lastPingAt)}`);

const downloadQualityLabel = computed(() => qualityLabel('download', status.value.speedTest?.downloadMbps));
const uploadQualityLabel = computed(() => qualityLabel('upload', status.value.speedTest?.uploadMbps));
const downloadQualityClass = computed(() => qualityClass(downloadQualityLabel.value));
const uploadQualityClass = computed(() => qualityClass(uploadQualityLabel.value));
const downloadTrendText = computed(() => formatTrend(status.value.speedTest?.trend?.downloadPct));
const uploadTrendText = computed(() => formatTrend(status.value.speedTest?.trend?.uploadPct));
const downloadTrendClass = computed(() => trendClass(status.value.speedTest?.trend?.downloadPct));
const uploadTrendClass = computed(() => trendClass(status.value.speedTest?.trend?.uploadPct));

const localNetworkQualityLabel = computed(() => {
  const local = status.value.localNetwork;
  if (!local?.enabled) return 'Off';
  if (local.online === true) return 'OK';
  if (local.online === false) return 'Failed';
  return 'Unknown';
});

const localNetworkQualityClass = computed(() => {
  const label = localNetworkQualityLabel.value;
  if (label === 'OK') return 'quality-good';
  if (label === 'Failed') return 'quality-poor';
  return 'quality-muted';
});

const localNetworkText = computed(() => {
  const local = status.value.localNetwork;
  if (!local?.enabled) return 'disabled';
  if (local.online === true) {
    const latency = local.pingMs != null ? ` ${formatMetric(local.pingMs)} ms` : '';
    return `${local.target || 'gateway'}${latency}`;
  }
  return local.failureReason || 'gateway unavailable';
});

const uptimeText = computed(() => {
  const uptime = status.value.uptime;
  if (!uptime || !uptime.sampleCount) return 'collecting uptime history';
  const outages = `${uptime.outageCount} ${pluralize(uptime.outageCount, 'outage', 'outages')}`;
  const outageDetail = uptime.currentOutageDurationMs != null
    ? `, current outage ${formatAge(Date.now() - uptime.currentOutageDurationMs)}`
    : '';
  return `${uptime.windowHours}h uptime: ${formatMetric(uptime.uptimePercent)}%, ${outages}${outageDetail}`;
});

async function loadNetworkStatus() {
  try {
    if (!status.value.generatedAt) {
      loading.value = true;
    }
    status.value = await fetchNetworkStatus({ force: true });
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadNetworkStatus();
  refreshInterval = setInterval(loadNetworkStatus, 30 * 1000);
});

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<style scoped>
.network-status-widget {
  padding: 2px;
  margin-top: 4px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  margin-bottom: 2px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 1px;
}

.loading {
  color: rgba(255, 255, 255, 0.8);
  text-align: center;
  padding: 6px;
  font-size: 0.85rem;
}

.status-content {
  margin-top: 4px;
}

.status-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.status-main > * + * {
  margin-left: 14px;
}

.status-secondary {
  margin-top: 3px;
}

.status-warning {
  margin-top: 3px;
  color: #ffb3b3;
}

.status-group {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.status-group > * + * {
  margin-left: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot-online {
  background: #8df57d;
  box-shadow: 0 0 4px rgba(141, 245, 125, 0.8);
}

.status-dot-stale {
  background: #ffd166;
  box-shadow: 0 0 4px rgba(255, 209, 102, 0.8);
}

.status-dot-offline {
  background: #ff6b6b;
  box-shadow: 0 0 4px rgba(255, 107, 107, 0.8);
}

.status-label {
  font-weight: 600;
  font-size: 0.85rem;
}

.status-ping {
  color: rgba(255, 255, 255, 0.85);
}

.status-meta {
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;
}

.speed-metric {
  white-space: nowrap;
}

.quality-label {
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.12);
}

.quality-good {
  color: #b7ffad;
}

.quality-warn {
  color: #ffd166;
}

.quality-poor {
  color: #ff9b9b;
}

.quality-muted {
  color: rgba(255, 255, 255, 0.72);
}

.trend-label {
  font-size: 0.62rem;
  font-weight: 700;
  white-space: nowrap;
}

.trend-up {
  color: #b7ffad;
}

.trend-down {
  color: #ffb3b3;
}

.trend-stable {
  color: rgba(255, 255, 255, 0.72);
}

.speed-pending {
  color: rgba(255, 255, 255, 0.8);
  font-style: italic;
}
</style>
