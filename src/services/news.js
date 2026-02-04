import { loadConfig } from '../utils/config.js';
import { setFatalError, clearFatalError, fatalError } from '../utils/fatalError.js';

const NEWS_ERROR_MSG = 'News feeds failed to load';

// Browser-compatible RSS parser
async function parseRSSFeed(url) {
  try {
    const apiUrl = `/api/rss?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');
    
    // Check for parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('RSS parsing error');
    }
    
    const items = xmlDoc.querySelectorAll('item');
    const feedItems = [];
    
    items.forEach(item => {
      const title = item.querySelector('title')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '';
      const description = item.querySelector('description')?.textContent || '';
      const pubDateStr = item.querySelector('pubDate')?.textContent || '';
      const date = pubDateStr ? new Date(pubDateStr) : null;
      feedItems.push({
        title: title.trim(),
        link: link.trim(),
        description: description.trim(),
        date: isNaN(date?.getTime()) ? null : date
      });
    });
    
    return { items: feedItems };
  } catch (error) {
    console.error(`Error parsing RSS feed ${url}:`, error);
    throw error;
  }
}

let cachedHeadlines = [];
let lastFetchTime = 0;

export async function fetchHeadlines() {
  try {
    const config = await loadConfig();
    const { rssFeeds, reddit, refreshInterval } = config.news;
    
    const now = Date.now();
    
    // Return cached headlines if still fresh
    if (cachedHeadlines.length > 0 && (now - lastFetchTime) < refreshInterval) {
      return cachedHeadlines;
    }

    const headlines = [];

    // Fetch RSS feeds
    for (const feed of rssFeeds) {
      if (!feed.enabled) continue;
      
      try {
        const feedData = await parseRSSFeed(feed.url);
        feedData.items.slice(0, 10).forEach(item => {
          headlines.push({
            title: item.title || 'No Title',
            source: feed.name,
            type: 'rss',
            link: item.link || '',
            date: item.date || null
          });
        });
      } catch (error) {
        console.error(`Error fetching RSS feed ${feed.name}:`, error);
      }
    }

    // Fetch Reddit feeds
    if (reddit.enabled) {
      for (const subreddit of reddit.subreddits) {
        try {
          const apiUrl = `/api/reddit/${subreddit}?limit=10&sort=hot`;
          const response = await fetch(apiUrl);
          if (!response.ok) {
            console.warn(`Reddit API returned ${response.status} for r/${subreddit}`);
            continue;
          }
          
          const data = await response.json();
          if (data.data && data.data.children) {
            data.data.children.forEach(post => {
              const postData = post.data;
              const date = postData.created_utc != null ? new Date(postData.created_utc * 1000) : null;
              headlines.push({
                title: postData.title,
                source: `r/${subreddit}`,
                type: 'reddit',
                link: `https://www.reddit.com${postData.permalink}`,
                date
              });
            });
          }
        } catch (error) {
          console.error(`Error fetching Reddit r/${subreddit}:`, error);
        }
      }
    }

    // Sort by date, newest first (items without date go last)
    const sorted = headlines.sort((a, b) => {
      const aTime = a.date ? a.date.getTime() : 0;
      const bTime = b.date ? b.date.getTime() : 0;
      return bTime - aTime;
    });

    if (sorted.length === 0) {
      setFatalError(NEWS_ERROR_MSG);
    } else if (fatalError.value === NEWS_ERROR_MSG) {
      clearFatalError();
    }

    cachedHeadlines = sorted;
    lastFetchTime = now;

    return sorted;
  } catch (error) {
    console.error('Error fetching headlines:', error);
    if (cachedHeadlines.length === 0) {
      setFatalError(NEWS_ERROR_MSG);
    }
    return cachedHeadlines;
  }
}
