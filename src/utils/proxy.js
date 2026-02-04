// Utility to handle CORS in development by using Vite proxy
// In production, these should work directly (especially on Raspberry Pi)

const isDevelopment = import.meta.env.DEV;

export function getProxiedUrl(url) {
  if (!isDevelopment) {
    // In production, use URLs directly
    // Note: On Raspberry Pi, CORS may not be an issue since it's not a browser security concern
    return url;
  }

  // In development, use Vite proxy to avoid CORS
  try {
    const urlObj = new URL(url);
    const pathAndQuery = urlObj.pathname + urlObj.search;
    
    // Proxy RSS feeds
    if (urlObj.hostname.includes('rss.cbc.ca') || 
        (urlObj.hostname.includes('cbc.ca') && urlObj.pathname.includes('/lineup/'))) {
      return `/api/rss${pathAndQuery}`;
    }
    
    // Proxy Reddit API
    if (urlObj.hostname.includes('reddit.com')) {
      return `/api/reddit${pathAndQuery}`;
    }
    
    // Proxy Google Calendar
    if (urlObj.hostname.includes('calendar.google.com')) {
      return `/api/calendar${pathAndQuery}`;
    }
    
    // Return original URL if no proxy match
    return url;
  } catch (error) {
    // If URL parsing fails, return original
    console.warn('Failed to parse URL for proxy:', url, error);
    return url;
  }
}
