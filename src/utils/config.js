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
      icsUrl: "", // Set in config.json; server uses it for /api/calendar
      /** ISO country code for `date-holidays` (default Canada; override e.g. `"US"` if needed) */
      holidayCountry: "CA",
      /** Optional province/territory for regional holidays (e.g. `ON`, `BC`, `AB`, `QC`) */
      holidayState: "AB"
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
          url: "https://www.cbc.ca/webfeed/rss/rss-canada",
          enabled: true
        },
        {
          name: "CBC World News",
          url: "https://www.cbc.ca/webfeed/rss/rss-world",
          enabled: true
        },
        {
          name: "BBC World",
          url: "https://feeds.bbci.co.uk/news/world/rss.xml",
          enabled: true
        },
        {
          name: "Al Jazeera",
          url: "https://www.aljazeera.com/xml/rss/all.xml",
          enabled: true
        },
        {
          name: "The Guardian World",
          url: "https://www.theguardian.com/world/rss",
          enabled: true
        },
        {
          name: "NPR World",
          url: "https://feeds.npr.org/1004/rss.xml",
          enabled: true
        },
        {
          name: "DW World",
          url: "https://rss.dw.com/rdf/rss-en-world",
          enabled: true
        }
      ],
      refreshInterval: 600000,
      headlineDisplayInterval: 6000
    },
    wallpaper: {
      enabled: true,
      providers: ["openverse", "pexels", "pixabay", "unsplash"],
      queries: [
        "landscape",
        "scenic landscape",
        "panoramic view",
        "city skyline",
        "city at night",
        "street photography",
        "architecture",
        "modern architecture",
        "historic architecture",
        "ocean",
        "coastline",
        "beach",
        "waterfall",
        "river",
        "lake",
        "forest",
        "autumn forest",
        "misty forest",
        "mountains",
        "snowy mountains",
        "desert",
        "canyon",
        "prairie",
        "field",
        "sunrise",
        "sunset",
        "clouds",
        "storm clouds",
        "space",
        "stars",
        "galaxy",
        "abstract texture",
        "abstract pattern",
        "geometric pattern",
        "colorful abstract",
        "wildlife",
        "birds",
        "flowers",
        "botanical",
        "northern lights",
        "weather",
        "travel",
        "train",
        "bridge",
        "harbour",
        "island",
        "garden",
        "macro photography",
        "aerial photography",
        "night photography",
        "winter scene",
        "spring flowers",
        "summer landscape",
        "autumn landscape"
      ],
      selectionType: "random",
      rotationInterval: 1800000,
      imagePoolRefreshInterval: 7200000
    }
  };
}

export function getConfig() {
  return config || getDefaultConfig();
}
