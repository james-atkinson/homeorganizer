<template>
  <div 
    class="background-image-container"
    :style="backgroundStyle"
  >
    <div v-if="showCredit" class="background-credit">
      {{ credit }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { loadConfig } from '../utils/config.js';
import { getRandomWallpaper } from '../services/wallpaper.js';

const PICSUM_BASE = 'https://picsum.photos/1920/1080';

const currentImage = ref(null);
const credit = ref('Photos from Picsum');
const showCredit = ref(true);

let rotationInterval = null;

const backgroundStyle = computed(() => {
  const url = currentImage.value?.url || `${PICSUM_BASE}?random=1`;
  return {
    backgroundImage: `url('${url}')`
  };
});

async function loadRandomImage() {
  try {
    const img = await getRandomWallpaper();
    currentImage.value = img;
    credit.value = img.credit;
  } catch (err) {
    console.warn('Background image load failed, using Picsum fallback:', err);
    currentImage.value = { url: `${PICSUM_BASE}?random=${Date.now()}`, credit: 'Photos from Picsum' };
    credit.value = 'Photos from Picsum';
  }
}

function rotateImage() {
  loadRandomImage();
}

onMounted(async () => {
  await loadRandomImage();
  const config = await loadConfig();
  const interval = config.wallpaper?.rotationInterval ?? 600000; // 10 min default
  rotationInterval = setInterval(rotateImage, interval);
});

onUnmounted(() => {
  if (rotationInterval) {
    clearInterval(rotationInterval);
  }
});
</script>

<style scoped>
.background-image-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  overflow: hidden;
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center;
  transition: background-image 2s ease;
}

.background-image-container::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.background-credit {
  position: absolute;
  bottom: 0.5rem;
  right: 0.5rem;
  color: white;
  text-shadow: 1px 0 0 #000, 0 -1px 0 #000, 0 1px 0 #000, -1px 0 0 #000;
  font-weight: 600;
  font-size: 0.5rem;
  opacity: 0.7;
  z-index: 1;
}
</style>
