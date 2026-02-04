let config = null;

export async function loadConfig() {
  if (config) {
    return config;
  }

  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.statusText}`);
    }
    config = await response.json();
    return config;
  } catch (error) {
    console.error('Error loading config:', error);
    // Return default config if file doesn't exist
    return getDefaultConfig();
  }
}

function getDefaultConfig() {
  return {
    calendar: {
      icsUrl: ""  // Set in config.json; server uses it for /api/calendar
    },
    weather: {
      apiKey: "",
      location: {
        city: "Your City",
        country: "XX"
      }
    },
    news: {
      rssFeeds: [
        {
          name: "CBC Canada News",
          url: "http://rss.cbc.ca/lineup/canada.xml",
          enabled: true
        },
        {
          name: "CBC World News",
          url: "http://rss.cbc.ca/lineup/world.xml",
          enabled: true
        },
        {
          name: "CBC Hockey",
          url: "http://rss.cbc.ca/lineup/sports-nhl.xml",
          enabled: true
        },
        {
          name: "CBC Edmonton News",
          url: "http://rss.cbc.ca/lineup/canada-edmonton.xml",
          enabled: true
        }
      ],
      reddit: {
        enabled: true,
        subreddits: ["politics", "canada"]
      },
      refreshInterval: 600000,
      headlineDisplayInterval: 6000
    },
    wallpaper: {
      enabled: true,
      subreddits: ["wallpaper", "wallpapers"],
      selectionType: "random",
      rotationInterval: 1800000,
      imagePoolRefreshInterval: 7200000
    }
  };
}

export function getConfig() {
  return config || getDefaultConfig();
}
