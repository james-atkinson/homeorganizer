<template>
  <div class="news-headlines">
    <transition name="fade" mode="out-in">
      <div v-if="currentHeadline" :key="currentHeadlineIndex" class="headline">
        <span class="headline-source">{{ sourceWithAge }}</span>
        <span class="headline-title">{{ currentHeadline.title }}</span>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { fetchHeadlines } from '../services/news.js';
import { loadConfig } from '../utils/config.js';

const headlines = ref([]);
const currentHeadlineIndex = ref(0);
const currentHeadline = computed(() => {
  if (headlines.value.length === 0) return null;
  return headlines.value[currentHeadlineIndex.value % headlines.value.length];
});

const sourceWithAge = computed(() => {
  const h = currentHeadline.value;
  if (!h) return '';
  const age = timeAgo(h.date);
  return age ? `${h.source} - ${age}` : h.source;
});

function timeAgo(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffMins < 0) return 'just now';
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`;
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  if (diffDays < 7) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
  return '';
}

let headlineInterval = null;
let refreshInterval = null;

async function loadHeadlines() {
  try {
    const fetched = await fetchHeadlines();
    headlines.value = fetched;
    
    // Reset index if we got new headlines
    if (headlines.value.length > 0) {
      currentHeadlineIndex.value = 0;
    }
  } catch (error) {
    console.error('Error loading headlines:', error);
  }
}

function rotateHeadline() {
  if (headlines.value.length > 0) {
    currentHeadlineIndex.value = (currentHeadlineIndex.value + 1) % headlines.value.length;
  }
}

async function startRotation() {
  const config = await loadConfig();
  const baseInterval = config.news.headlineDisplayInterval || 6000;
  const interval = Math.round(baseInterval * 1.2);
  
  if (headlineInterval) {
    clearInterval(headlineInterval);
  }
  
  headlineInterval = setInterval(rotateHeadline, interval);
}

onMounted(async () => {
  await loadHeadlines();
  await startRotation();
  
  const config = await loadConfig();
  refreshInterval = setInterval(async () => {
    await loadHeadlines();
    await startRotation(); // Restart rotation with new headlines
  }, config.news.refreshInterval);
});

onUnmounted(() => {
  if (headlineInterval) {
    clearInterval(headlineInterval);
  }
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});
</script>

<style scoped>
.news-headlines {
  padding: 12px 16px;
  min-height: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.headline {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  max-width: 92%;
  min-height: 3.84rem;
}
.headline > * + * {
  margin-top: 5px;
}

.headline-source {
  flex-shrink: 0;
  font-size: 1.12rem;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
}

.headline-title {
  font-size: 2rem;
  line-height: 1.3;
  color: #ffffff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  text-align: center;
  min-height: 4.16rem;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.8s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
