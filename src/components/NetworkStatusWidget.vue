<template>
  <div class="network-status-widget">
    <h2 class="section-title">Network Status</h2>
    <div v-if="loading" class="loading">Loading network status...</div>
    <div v-else class="status-content">
      <div class="status-main">
        <span class="status-group">
          <span class="status-dot" :class="status.online ? 'status-dot-online' : 'status-dot-offline'"></span>
          <span class="status-label">{{ status.online ? 'Online' : 'Offline' }}</span>
          <span v-if="status.online && status.pingMs != null" class="status-ping">{{ formatMetric(status.pingMs) }} ms</span>
        </span>
        <template v-if="status.speedTest">
          <span class="speed-metric">Download: {{ formatMetric(status.speedTest.downloadMbps) }} Mbps</span>
          <span class="speed-metric">Upload: {{ formatMetric(status.speedTest.uploadMbps) }} Mbps</span>
        </template>
        <span v-else class="speed-pending">Running first speed test...</span>
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

.speed-metric {
  white-space: nowrap;
}

.speed-pending {
  color: rgba(255, 255, 255, 0.8);
  font-style: italic;
}
</style>
