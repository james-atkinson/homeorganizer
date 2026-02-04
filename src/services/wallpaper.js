import { loadConfig } from '../utils/config.js';

let imagePool = [];
let lastFetchTime = 0;
let currentImageIndex = 0;

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;
const TARGET_ASPECT_RATIO = Math.round((TARGET_WIDTH / TARGET_HEIGHT) * 10) / 10;
const PICSUM_BASE = 'https://picsum.photos/1920/1080';
const PICSUM_POOL_SIZE = 20;

function getPicsumEntries() {
  const entries = [];
  for (let i = 0; i < PICSUM_POOL_SIZE; i++) {
    const seed = Math.floor(Math.random() * 100000) + 1;
    entries.push({
      url: `${PICSUM_BASE}?random=${seed}`,
      source: 'picsum',
      credit: 'Photos from Picsum'
    });
  }
  return entries;
}

// Fetch images from Reddit following the working pattern
async function fetchRedditImages(subreddits) {
  const images = [];
  
  for (const subreddit of subreddits) {
    try {
      const apiUrl = `/api/reddit/${subreddit}?limit=50&sort=hot`;
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        console.warn(`Reddit API returned ${response.status} for r/${subreddit}`);
        continue;
      }
      
      const data = await response.json();
      if (data.data && data.data.children) {
        data.data.children.forEach(item => {
          const postData = item.data;
          
          // Skip gallery posts
          if (postData.url && postData.url.includes('gallery')) {
            return;
          }
          
          // Must have preview images
          if (!postData.preview || !postData.preview.images || postData.preview.images.length === 0) {
            return;
          }
          
          const preview = postData.preview.images[0];
          const source = preview.source;
          
          // Check aspect ratio match (allow some tolerance)
          if (source && source.width && source.height) {
            const itemAspectRatio = Math.round((source.width / source.height) * 10) / 10;
            // Allow 0.1 tolerance for aspect ratio
            if (Math.abs(itemAspectRatio - TARGET_ASPECT_RATIO) > 0.1) {
              return;
            }
          }
          
          // Use the direct URL from postData.url (this is the actual image URL for image posts)
          // Fallback to preview source URL if needed
          let imageUrl = postData.url;
          
          // Verify it's an image URL
          if (!imageUrl || (!imageUrl.match(/\.(jpg|jpeg|png|webp)$/i) && !imageUrl.includes('i.redd.it'))) {
            // Try preview source as fallback
            if (source && source.url) {
              imageUrl = source.url.replace(/&amp;/g, '&');
            } else {
              return; // Skip if no valid image URL
            }
          }
          
          const title = postData.title || '';
          const creditTitle = title.length > 80 ? title.slice(0, 77) + '...' : title;
          const credit = creditTitle ? `${creditTitle} — r/${subreddit}` : `r/${subreddit}`;
          images.push({
            url: imageUrl,
            title: postData.title,
            author: postData.author,
            score: postData.score,
            subreddit: subreddit,
            source: 'reddit',
            credit
          });
        });
      }
    } catch (error) {
      console.warn(`Error fetching wallpaper from r/${subreddit}:`, error.message);
    }
  }
  
  return images;
}

export async function fetchWallpaperImages() {
  try {
    const config = await loadConfig();
    const { subreddits, imagePoolRefreshInterval, selectionType = 'random' } = config.wallpaper;
    
    const now = Date.now();
    
    // Return cached pool if still fresh
    if (imagePool.length > 0 && (now - lastFetchTime) < imagePoolRefreshInterval) {
      return imagePool;
    }

    let images = [];

    // Fetch from Reddit
    if (subreddits && subreddits.length > 0) {
      images = await fetchRedditImages(subreddits);
    }

    // Add Picsum images to the pool
    const picsumEntries = getPicsumEntries();
    images = [...images, ...picsumEntries];

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

/** Get a random image from the combined Reddit + Picsum pool (fetches pool if needed). */
export async function getRandomWallpaper() {
  const images = await fetchWallpaperImages();
  if (images.length === 0) {
    return { url: `${PICSUM_BASE}?random=${Date.now()}`, credit: 'Photos from Picsum' };
  }
  const index = Math.floor(Math.random() * images.length);
  const img = images[index];
  return { url: img.url, credit: img.credit || (img.source === 'reddit' ? `r/${img.subreddit}` : 'Photos from Picsum') };
}
