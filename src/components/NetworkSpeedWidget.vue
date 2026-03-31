<template>
  <div class="network-speed-widget">
    <h2 class="section-title">Network History</h2>
    <div v-if="loading" class="loading">Loading network speed data...</div>
    <div v-else-if="speedSeries.points.length > 1" class="speed-chart-body">
      <svg class="speed-chart-svg" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label="Network speed test trends">
        <path :d="downloadPath" class="speed-line speed-line-download"></path>
        <path :d="uploadPath" class="speed-line speed-line-upload"></path>
      </svg>
      <div class="speed-legend">
        <span class="speed-legend-item"><i class="legend-dot legend-download"></i>Download: {{ formatMetric(latestPoint?.downloadMbps) }} Mbps</span>
        <span class="speed-legend-item"><i class="legend-dot legend-upload"></i>Upload: {{ formatMetric(latestPoint?.uploadMbps) }} Mbps</span>
      </div>
    </div>
    <div v-else class="speed-chart-empty">Collecting hourly speed test data...</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { fetchSpeedTests } from '../services/speedtest.js';

const speedSeries = ref({ days: 60, points: [] });
const loading = ref(true);
let refreshInterval = null;

function createPath(points, key) {
  if (!points.length) return '';
  const allValues = points.flatMap(point => [
    Number(point.downloadMbps) || 0,
    Number(point.uploadMbps) || 0
  ]);
  const min = 0;
  const max = Math.max(...allValues, 1);
  const span = Math.max(max - min, 1);
  return points.map((point, index) => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100;
    const normalized = ((Number(point[key]) || 0) - min) / span;
    const y = 22 - (normalized * 20);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function formatMetric(value) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return Number(value).toFixed(1);
}

async function loadSpeedTests() {
  try {
    loading.value = true;
    speedSeries.value = await fetchSpeedTests(60, { force: true });
  } finally {
    loading.value = false;
  }
}

const latestPoint = computed(() => {
  const points = speedSeries.value?.points ?? [];
  if (!points.length) return null;
  return points[points.length - 1];
});

const downloadPath = computed(() => createPath(speedSeries.value?.points ?? [], 'downloadMbps'));
const uploadPath = computed(() => createPath(speedSeries.value?.points ?? [], 'uploadMbps'));

onMounted(() => {
  loadSpeedTests();
  refreshInterval = setInterval(loadSpeedTests, 30 * 1000);
});

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<style scoped>
.network-speed-widget {
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

.speed-chart-body {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
}

.speed-chart-body > * + * {
  margin-top: 4px;
}

.speed-chart-svg {
  width: 100%;
  height: 38px;
  overflow: visible;
}

.speed-line {
  fill: none;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.speed-line-download {
  stroke: #63d1ff;
}

.speed-line-upload {
  stroke: #8df57d;
}

.speed-legend {
  display: flex;
  flex-wrap: wrap;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.speed-legend > * + * {
  margin-left: 14px;
}

.speed-legend-item {
  display: inline-flex;
  align-items: center;
}

.speed-legend-item > * + * {
  margin-left: 6px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-download {
  background: #63d1ff;
}

.legend-upload {
  background: #8df57d;
}

.speed-chart-empty {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
  margin-top: 4px;
}
</style>
