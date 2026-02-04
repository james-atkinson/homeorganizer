import { setFatalError, clearFatalError, fatalError } from '../utils/fatalError.js';

const WEATHER_ERROR_MSG = 'Weather failed to load';

let cachedWeather = null;
let lastFetchTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

export async function fetchWeather() {
  const now = Date.now();
  
  // Return cached weather if still fresh
  if (cachedWeather && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedWeather;
  }

  try {
    const response = await fetch('/api/weather');
    if (!response.ok) {
      throw new Error(response.statusText || 'Weather unavailable');
    }
    const weather = await response.json();
    cachedWeather = weather;
    lastFetchTime = now;
    if (fatalError.value === WEATHER_ERROR_MSG) clearFatalError();
    return weather;
  } catch (error) {
    console.error('Error fetching weather:', error);
    if (!cachedWeather) setFatalError(WEATHER_ERROR_MSG);
    return cachedWeather;
  }
}
