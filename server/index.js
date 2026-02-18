import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const projectRoot = join(__dirname, '..');
const configPath = join(projectRoot, 'config.json');
const publicConfigPath = join(projectRoot, 'public', 'config.json');

function loadServerConfig() {
  const path = existsSync(configPath) ? configPath : publicConfigPath;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    console.error('Failed to load config:', e.message);
    return null;
  }
}

function getSanitizedConfig() {
  const c = loadServerConfig();
  if (!c) return {};
  const out = { ...c };
  if (out.weather) {
    out.weather = { ...out.weather };
    delete out.weather.apiKey;
  }
  if (out.calendar) {
    out.calendar = {};
  }
  return out;
}

// Block direct access to config file (secrets must not be publicly fetchable)
app.get('/config.json', (req, res) => {
  res.status(404).end();
});

// Sanitized config for the client (no API keys or private URLs)
app.get('/api/config', (req, res) => {
  try {
    res.json(getSanitizedConfig());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Serve static files from dist in production
const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Reddit API proxy endpoint – use browser-like headers
const REDDIT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1'
};

app.get('/api/reddit/:subreddit', async (req, res) => {
  try {
    const { subreddit } = req.params;
    const sort = req.query.sort || 'hot';
    
    const basePath = `/r/${subreddit}/${sort}.json`;
    const hosts = ['https://www.reddit.com', 'https://old.reddit.com'];

    let lastError;
    for (const base of hosts) {
      try {
        const response = await axios.get(base + basePath, {
          headers: REDDIT_HEADERS,
          timeout: 10000,
          validateStatus: () => true
        });
        if (response.status === 200) {
          return res.json(response.data);
        }
        lastError = { status: response.status, statusText: response.statusText };
      } catch (err) {
        lastError = err.response
          ? { status: err.response.status, statusText: err.response.statusText }
          : err;
      }
    }

    const status = lastError?.status || 500;
    const message = lastError?.statusText || 'Failed to fetch Reddit data';
    res.status(status).json({ error: message });
  } catch (error) {
    console.error('Error fetching Reddit data:', error);
    const status = error.response?.status || 500;
    const message = error.response?.statusText || 'Failed to fetch Reddit data';
    res.status(status).json({ error: message });
  }
});

// RSS feed proxy endpoint
app.get('/api/rss', async (req, res) => {
  try {
    const url = req.query.url;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      responseType: 'text'
    });
    
    res.setHeader('Content-Type', 'application/xml');
    res.send(response.data);
  } catch (error) {
    console.error('Error fetching RSS feed:', error);
    const status = error.response?.status || 500;
    const message = error.response?.statusText || 'Failed to fetch RSS feed';
    res.status(status).json({ error: message });
  }
});

// Calendar .ics proxy endpoint (uses server config when url not provided)
app.get('/api/calendar', async (req, res) => {
  try {
    let url = req.query.url;
    if (!url) {
      const config = loadServerConfig();
      url = config?.calendar?.icsUrl;
    }
    if (!url) {
      return res.status(400).json({ error: 'Calendar URL not configured' });
    }
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      responseType: 'text'
    });
    res.setHeader('Content-Type', 'text/calendar');
    res.send(response.data);
  } catch (error) {
    console.error('Error fetching calendar:', error);
    const status = error.response?.status || 500;
    const message = error.response?.statusText || 'Failed to fetch calendar';
    res.status(status).json({ error: message });
  }
});

// Weather proxy (keeps API key on server)
app.get('/api/weather', async (req, res) => {
  try {
    const config = loadServerConfig();
    const { apiKey, location } = config?.weather || {};
    if (!apiKey || apiKey === 'YOUR_OPENWEATHER_API_KEY' || !location?.city) {
      return res.status(503).json({ error: 'Weather not configured' });
    }
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${location.city},${location.country}&appid=${apiKey}&units=metric`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${location.city},${location.country}&appid=${apiKey}&units=metric`;
    const [currentRes, forecastRes] = await Promise.all([
      axios.get(currentUrl),
      axios.get(forecastUrl).catch(() => ({ data: null }))
    ]);
    const currentData = currentRes.data;
    const forecastData = forecastRes.data;
    const dailyForecast = processForecast(forecastData);
    const today = dailyForecast[0];
    const expectedPrecip = today ? { pop: today.pop, precipitation: today.precipitation } : null;
    res.json({
      current: {
        temperature: Math.round(currentData.main.temp),
        feelsLike: Math.round(currentData.main.feels_like),
        condition: currentData.weather[0].main,
        description: currentData.weather[0].description,
        icon: currentData.weather[0].icon,
        high: Math.round(currentData.main.temp_max),
        low: Math.round(currentData.main.temp_min),
        humidity: currentData.main.humidity,
        windSpeed: currentData.wind?.speed ?? 0,
        windDeg: currentData.wind?.deg ?? 0,
        sunrise: currentData.sys?.sunrise,
        sunset: currentData.sys?.sunset,
        expectedPrecip
      },
      forecast: dailyForecast,
      location: `${currentData.name}, ${currentData.sys.country}`
    });
  } catch (error) {
    console.error('Error fetching weather:', error);
    res.status(error.response?.status || 500).json({ error: error.response?.statusText || 'Weather unavailable' });
  }
});

function processForecast(forecastData) {
  if (!forecastData?.list) return [];
  const dailyData = {};
  forecastData.list.forEach(item => {
    const date = new Date(item.dt * 1000);
    const dayKey = date.toDateString();
    if (!dailyData[dayKey]) {
      dailyData[dayKey] = { date, temps: [], conditions: [], descriptions: [], icons: [], pops: [], rainMm: 0, snowMm: 0 };
    }
    dailyData[dayKey].temps.push(item.main.temp);
    dailyData[dayKey].conditions.push(item.weather[0].main);
    dailyData[dayKey].descriptions.push(item.weather[0].description ?? item.weather[0].main);
    dailyData[dayKey].icons.push(item.weather[0].icon);
    if (item.pop != null) dailyData[dayKey].pops.push(item.pop);
    dailyData[dayKey].rainMm += item.rain?.['3h'] ?? item.rain?.['1h'] ?? 0;
    dailyData[dayKey].snowMm += item.snow?.['3h'] ?? item.snow?.['1h'] ?? 0;
  });
  return Object.values(dailyData).slice(0, 7).map(day => {
    const popMax = day.pops?.length ? Math.round(Math.max(...day.pops) * 100) : null;
    const rainMm = (day.rainMm || 0) > 0 ? Math.round(day.rainMm * 10) / 10 : null;
    const snowMm = (day.snowMm || 0) > 0 ? Math.round(day.snowMm * 10) / 10 : null;
    const mid = Math.floor(day.conditions.length / 2);
    const condition = day.conditions[mid];
    // Precipitation in correct unit: snow → cm (from mm liquid equiv), rain/other → mm
    const precipitation = condition === 'Snow' && snowMm != null
      ? Math.round((snowMm / 10) * 10) / 10
      : rainMm != null ? rainMm : null;
    return {
      date: day.date,
      dayName: day.date.toLocaleDateString('en-US', { weekday: 'short' }),
      high: Math.round(Math.max(...day.temps)),
      low: Math.round(Math.min(...day.temps)),
      condition,
      description: day.descriptions[mid] ?? condition,
      icon: day.icons[mid],
      pop: popMax,
      precipitation
    };
  });
}

const indexPath = join(distPath, 'index.html');
const hasBuild = existsSync(indexPath);

// Serve the Vue app for all other routes (SPA fallback)
app.get('*', (req, res) => {
  if (!hasBuild) {
    res.status(503).set('Content-Type', 'text/html').send(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Build required</title></head><body style="font-family:sans-serif;padding:2rem;max-width:40em;">' +
      '<h1>Build required</h1><p>No built app found. From the project directory run:</p><pre>pnpm run build</pre>' +
      '<p>Then restart the server.</p><p>If you just cloned the repo, run <code>./deploy/install.sh</code> first.</p></body></html>'
    );
    return;
  }
  res.sendFile(indexPath);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api`);
  if (!hasBuild) {
    console.warn('WARNING: dist/ has no index.html. Run "pnpm run build". Browsers will see a "Build required" page.');
  }
});
