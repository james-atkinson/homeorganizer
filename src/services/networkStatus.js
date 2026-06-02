let cachedNetworkStatus = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30 * 1000;

const EMPTY_STATUS = {
  online: false,
  lastPingAt: null,
  pingMs: null,
  speedTest: null
};

export async function fetchNetworkStatus(options = {}) {
  const { force = false } = options;
  const now = Date.now();

  if (!force && cachedNetworkStatus && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedNetworkStatus;
  }

  try {
    const response = await fetch('/api/network-status');
    if (!response.ok) {
      throw new Error(response.statusText || 'Network status unavailable');
    }
    const data = await response.json();
    cachedNetworkStatus = data;
    lastFetchTime = now;
    return data;
  } catch (error) {
    console.error('Error fetching network status:', error);
    if (cachedNetworkStatus) {
      return cachedNetworkStatus;
    }
    return EMPTY_STATUS;
  }
}
