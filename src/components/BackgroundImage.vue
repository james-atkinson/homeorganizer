<template>
  <div 
    class="background-image-container"
    :style="backgroundStyle"
  >
    <div 
      class="background-overlay" 
      :style="{ background: overlayStyle }"
      aria-hidden="true"
    />
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

const DEFAULT_OVERLAY_OPACITY = 0.3;
const currentImage = ref(null);
const credit = ref('Photos from Picsum');
const showCredit = ref(true);
const overlayOpacity = ref(DEFAULT_OVERLAY_OPACITY);

let rotationInterval = null;

const backgroundStyle = computed(() => {
  const url = currentImage.value?.url || `${PICSUM_BASE}?random=1`;
  return {
    backgroundImage: `url('${url}')`
  };
});

const overlayStyle = computed(() => {
  return `rgba(0, 0, 0, ${overlayOpacity.value})`;
});

/**
 * Sample image brightness by drawing to a small canvas. Returns 0 (dark) to 1 (bright).
 * Falls back to default opacity if CORS blocks pixel read.
 */
function measureBrightness(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let sum = 0;
        const len = data.length;
        for (let i = 0; i < len; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          sum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        }
        const luminance = sum / (len / 4);
        resolve(luminance);
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Map luminance (0–1) to overlay opacity. Brighter images get a stronger overlay for readability.
 */
function opacityForLuminance(luminance) {
  if (luminance == null) return DEFAULT_OVERLAY_OPACITY;
  const minOpacity = 0.2;
  const maxOpacity = 0.55;
  return minOpacity + luminance * (maxOpacity - minOpacity);
}

async function loadRandomImage() {
  try {
    const img = await getRandomWallpaper();
    currentImage.value = img;
    credit.value = img.credit;
    const luminance = await measureBrightness(img.url);
    overlayOpacity.value = opacityForLuminance(luminance);
  } catch (err) {
    console.warn('Background image load failed, using Picsum fallback:', err);
    currentImage.value = { url: `${PICSUM_BASE}?random=${Date.now()}`, credit: 'Photos from Picsum' };
    credit.value = 'Photos from Picsum';
    overlayOpacity.value = DEFAULT_OVERLAY_OPACITY;
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

.background-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  transition: background 0.8s ease;
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
