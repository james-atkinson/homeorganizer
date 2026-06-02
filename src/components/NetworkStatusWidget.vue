<template>
  <div class="network-status-widget">
    <h2 class="section-title">Network Status</h2>
    <div v-if="loading" class="loading">Loading network status...</div>
    <div v-else class="status-content">
      <div class="status-row">
        <span class="status-dot" :class="status.online ? 'status-dot-online' : 'status-dot-offline'"></span>
        <span class="status-label">{{ status.online ? 'Online' : 'Offline' }}</span>
        <span v-if="status.online && status.pingMs != null" class="status-ping">{{ formatMetric(status.pingMs) }} ms</span>
      </div>
      <div v-if="status.speedTest" class="speed-metrics">
        <span class="speed-metric">Download: {{ formatMetric(status.speedTest.downloadMbps) }} Mbps</span>
        <span class="speed-metric">Upload: {{ formatMetric(status.speedTest.uploadMbps) }} Mbps</span>
      </div>
      <div v-else class="speed-pending">Running first speed test...</div>
      <div v-if="status.speedTest?.testedAt" class="last-tested">
        Last tested {{ formatRelativeTime(status.speedTest.testedAt) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { fetchNetworkStatus } from '../services/networkStatus.js';

const status = ref({
  online: false,
  lastPingAt: null,
  pingMs: null,
  speedTest: null
});
const loading = ref(true);
let refreshInterval = null;

function formatMetric(value) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return Number(value).toFixed(1);
}

function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

async function loadNetworkStatus() {
  try {
    loading.value = true;
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

.status-content > * + * {
  margin-top: 4px;
}

.status-row {
  display: flex;
  align-items: center;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.status-row > * + * {
  margin-left: 8px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot-online {
  background: #8df57d;
  box-shadow: 0 0 4px rgba(141, 245, 125, 0.8);
}

.status-dot-offline {
  background: #ff6b6b;
  box-shadow: 0 0 4px rgba(255, 107, 107, 0.8);
}

.status-label {
  font-weight: 600;
}

.status-ping {
  color: rgba(255, 255, 255, 0.85);
}

.speed-metrics {
  display: flex;
  flex-wrap: wrap;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.speed-metrics > * + * {
  margin-left: 14px;
}

.speed-metric {
  display: inline-block;
}

.speed-pending {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.last-tested {
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.65);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}
</style>
