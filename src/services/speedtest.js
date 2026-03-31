let cachedSpeedTests = null;
let lastFetchTime = 0;
let cachedDays = null;
const CACHE_DURATION = 30 * 1000; // 30 seconds

export async function fetchSpeedTests(days = 7, options = {}) {
  const { force = false } = options;
  const safeDays = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 1), 60) : 7;
  const now = Date.now();

  if (!force && cachedSpeedTests && cachedDays === safeDays && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedSpeedTests;
  }

  try {
    const response = await fetch(`/api/speedtests?days=${safeDays}`);
    if (!response.ok) {
      throw new Error(response.statusText || 'Speed tests unavailable');
    }
    const data = await response.json();
    cachedSpeedTests = data;
    cachedDays = safeDays;
    lastFetchTime = now;
    return data;
  } catch (error) {
    console.error('Error fetching speed tests:', error);
    if (cachedSpeedTests && cachedDays === safeDays) {
      return cachedSpeedTests;
    }
    return { days: safeDays, points: [] };
  }
}
