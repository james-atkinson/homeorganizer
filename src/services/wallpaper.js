import { loadConfig } from '../utils/config.js';

let imagePool = [];
let lastFetchTime = 0;
let currentImageIndex = 0;

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;
const TARGET_ASPECT_RATIO = Math.round((TARGET_WIDTH / TARGET_HEIGHT) * 10) / 10;
const OPENVERSE_QUERY_LIMIT = 8;
const OPENVERSE_QUERIES_PER_REFRESH = 4;
const DEFAULT_IMAGE_POOL_REFRESH_INTERVAL = 2 * 60 * 60 * 1000;
const DEFAULT_PROVIDERS = ['openverse', 'pexels', 'pixabay', 'unsplash'];
const ALLOWED_PROVIDERS = new Set(DEFAULT_PROVIDERS);
const DEFAULT_QUERIES = [
  'landscape',
  'scenic landscape',
  'panoramic view',
  'city skyline',
  'city at night',
  'street photography',
  'architecture',
  'modern architecture',
  'historic architecture',
  'ocean',
  'coastline',
  'beach',
  'waterfall',
  'river',
  'lake',
  'forest',
  'autumn forest',
  'misty forest',
  'mountains',
  'snowy mountains',
  'desert',
  'canyon',
  'prairie',
  'field',
  'sunrise',
  'sunset',
  'clouds',
  'storm clouds',
  'space',
  'stars',
  'galaxy',
  'abstract texture',
  'abstract pattern',
  'geometric pattern',
  'colorful abstract',
  'wildlife',
  'birds',
  'flowers',
  'botanical',
  'northern lights',
  'weather',
  'travel',
  'train',
  'bridge',
  'harbour',
  'island',
  'garden',
  'macro photography',
  'aerial photography',
  'night photography',
  'winter scene',
  'spring flowers',
  'summer landscape',
  'autumn landscape'
];

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function imageCredit(image) {
  if (image.attribution) return image.attribution;

  const parts = [];
  if (image.title) parts.push(image.title);
  if (image.creator) parts.push(`by ${image.creator}`);
  if (image.license) parts.push(`CC ${String(image.license).toUpperCase()}`);
  if (image.provider) parts.push(`via ${image.provider}`);
  return parts.join(' — ');
}

function isSupportedImage(image) {
  const url = image?.url || image?.thumbnail;
  if (!url || !/^https?:\/\//i.test(url)) return false;

  const filetype = String(image.filetype || '').toLowerCase();
  const hasSupportedFiletype = filetype.startsWith('image/jpeg') ||
    filetype.startsWith('image/png') ||
    filetype.startsWith('image/webp');
  const hasSupportedExtension = /\.(jpe?g|png|webp)(?:[?#].*)?$/i.test(url);
  if (filetype && !hasSupportedFiletype) return false;
  if (!filetype && !hasSupportedExtension && !image.thumbnail) return false;

  if (image.mature) return false;

  if (image.width && image.height) {
    if (image.width < 800 || image.height < 450) return false;
    const itemAspectRatio = Math.round((image.width / image.height) * 10) / 10;
    if (itemAspectRatio < 1.2 || Math.abs(itemAspectRatio - TARGET_ASPECT_RATIO) > 0.8) return false;
  }

  return true;
}

async function fetchProviderImages(provider, queries) {
  const images = [];
  const queryList = Array.isArray(queries) && queries.length ? queries : DEFAULT_QUERIES;
  const selectedQueries = shuffle(queryList)
    .slice(0, OPENVERSE_QUERIES_PER_REFRESH);

  for (const query of selectedQueries) {
    try {
      const page = Math.floor(Math.random() * 10) + 1;
      const params = new URLSearchParams({
        query,
        limit: String(OPENVERSE_QUERY_LIMIT),
        page: String(page)
      });
      const apiUrl = `/api/images/${provider}?${params.toString()}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        console.warn(`${provider} image API returned ${response.status} for "${query}"`);
        continue;
      }

      const data = await response.json();
      if (Array.isArray(data.images)) {
        data.images
          .filter(isSupportedImage)
          .forEach(image => {
            const imageUrl = image.url || image.thumbnail;
            images.push({
              url: imageUrl,
              title: image.title,
              author: image.creator,
              source: provider,
              provider: image.provider || image.source,
              credit: imageCredit(image)
            });
          });
      }
    } catch (error) {
      console.warn(`Error fetching ${provider} images for "${query}":`, error.message);
    }
  }

  return images;
}

export async function fetchWallpaperImages() {
  try {
    const config = await loadConfig();
    const {
      providers = DEFAULT_PROVIDERS,
      queries = DEFAULT_QUERIES,
      imagePoolRefreshInterval = DEFAULT_IMAGE_POOL_REFRESH_INTERVAL,
      selectionType = 'random'
    } = config.wallpaper || {};
    const configuredProviders = (Array.isArray(providers) && providers.length ? providers : DEFAULT_PROVIDERS)
      .filter(provider => ALLOWED_PROVIDERS.has(provider));
    const providerList = configuredProviders.length ? configuredProviders : DEFAULT_PROVIDERS;
    
    const now = Date.now();
    
    // Return cached pool if still fresh
    if (imagePool.length > 0 && (now - lastFetchTime) < imagePoolRefreshInterval) {
      return imagePool;
    }

    let images = [];

    for (const provider of providerList) {
      const providerImages = await fetchProviderImages(provider, queries);
      images = [...images, ...providerImages];
    }

    // Sort by selection type
    if (selectionType === 'highest' && images.length > 0) {
      images = images.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (selectionType === 'random' && images.length > 0) {
      // Shuffle for random
      images = images.sort(() => Math.random() - 0.5);
    }

    // Filter out duplicates
    const uniqueImages = Array.from(
      new Map(images.map(img => [img.url, img])).values()
    );
    
    imagePool = uniqueImages;
    lastFetchTime = now;
    currentImageIndex = 0;
    
    return uniqueImages;
  } catch (error) {
    console.error('Error fetching wallpapers:', error);
    // Return cached pool on error, or empty array if no cache
    return imagePool.length > 0 ? imagePool : [];
  }
}


export async function getNextWallpaper() {
  const images = await fetchWallpaperImages();
  
  if (images.length === 0) {
    return null;
  }
  
  const image = images[currentImageIndex % images.length];
  currentImageIndex = (currentImageIndex + 1) % images.length;
  
  return image;
}

export function resetWallpaperIndex() {
  currentImageIndex = 0;
}

/** Get a random image from the configured wallpaper pool (fetches pool if needed). */
export async function getRandomWallpaper() {
  const images = await fetchWallpaperImages();
  if (images.length === 0) {
    return { url: null, credit: 'Background image unavailable' };
  }
  const index = Math.floor(Math.random() * images.length);
  const img = images[index];
  return { url: img.url, credit: img.credit || 'Background image' };
}
