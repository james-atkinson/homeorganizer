<template>
  <div class="weather-widget">
    <h2 class="section-title">Weather in {{ locationDisplay }}</h2>
    <div v-if="loading" class="loading">Loading weather...</div>
    <div v-else-if="weather" class="weather-content">
      <!-- Current: top row = temp (left) | icon + description (right) -->
      <div class="current-top">
        <div class="current-temp-block">
          <div class="temperature">{{ weather.current.temperature }}°C</div>
          <div class="feels-like">Feels like {{ weather.current.feelsLike }}°</div>
          <div class="high-low">
            <span>High {{ weather.current.high }}°</span>
            <span>Low {{ weather.current.low }}°</span>
          </div>
          <div v-if="weather.current.expectedPrecip && (weather.current.expectedPrecip.precipitation != null || weather.current.expectedPrecip.pop != null)" class="current-expected-precip">
            <span class="md-icon" aria-hidden="true">water_drop</span>
            <template v-if="weather.current.expectedPrecip.precipitation != null && weather.current.expectedPrecip.precipitation > 0">{{ weather.current.expectedPrecip.precipitation }} mm</template>
            <template v-else>{{ weather.current.expectedPrecip.pop != null ? weather.current.expectedPrecip.pop : 0 }}%</template>
          </div>
        </div>
        <div class="current-condition-block">
          <img
            :src="weatherIconUrl(weather.current.icon)"
            :alt="weather.current.description"
            class="current-icon"
          />
          <div class="current-condition-desc">{{ weather.current.description }}</div>
        </div>
      </div>
      <!-- Bottom row: sunrise, sunset, humidity, wind -->
      <div class="current-bottom">
        <div class="sun-wind">
          <span class="labeled"><span class="md-icon" aria-hidden="true">wb_twilight</span> {{ formatSunTime(weather.current.sunrise) }}</span>
          <span class="labeled"><span class="md-icon md-icon-sunset" aria-hidden="true">wb_twilight</span> {{ formatSunTime(weather.current.sunset) }}</span>
          <span class="labeled"><span class="md-icon" aria-hidden="true">opacity</span> {{ weather.current.humidity }}%</span>
          <span class="labeled"><span class="md-icon" aria-hidden="true">air</span> {{ weather.current.windSpeed }} m/s {{ windDirection(weather.current.windDeg) }}</span>
        </div>
      </div>
      <!-- 7-day forecast -->
      <div class="forecast">
        <h3 class="forecast-header">7 Day Forecast</h3>
        <div v-for="day in weather.forecast" :key="day.date" class="forecast-day">
          <div class="forecast-day-name">{{ day.dayName }}</div>
          <div class="forecast-condition">
            <img :src="weatherIconUrl(day.icon)" :alt="day.description" class="forecast-icon" />
            <span class="forecast-condition-text">{{ day.description }}</span>
          </div>
          <div class="forecast-high forecast-cell"><span class="md-icon forecast-temp-icon" aria-hidden="true">arrow_upward</span> {{ day.high }}°</div>
          <div class="forecast-low forecast-cell"><span class="md-icon forecast-temp-icon" aria-hidden="true">arrow_downward</span> {{ day.low }}°</div>
          <div class="forecast-precip forecast-cell" title="Precipitation">
            <template v-if="day.pop != null || day.precipitation != null">
              <span class="md-icon forecast-temp-icon" aria-hidden="true">water_drop</span>
              <template v-if="day.precipitation != null && day.precipitation > 0">{{ day.precipitation }} mm</template>
              <template v-else>{{ day.pop != null ? day.pop : 0 }}%</template>
            </template>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="error">Unable to load weather</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { loadConfig } from '../utils/config.js';
import { fetchWeather } from '../services/weather.js';

const weather = ref(null);
const loading = ref(true);
const locationDisplay = ref('Location');

const OWM_ICON_BASE = 'https://openweathermap.org/img/wn';

function weatherIconUrl(icon) {
  if (!icon) return `${OWM_ICON_BASE}/01d@2x.png`;
  return `${OWM_ICON_BASE}/${icon}@2x.png`;
}

function formatSunTime(timestamp) {
  if (timestamp == null) return '--:--';
  const d = new Date(timestamp * 1000);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function windDirection(deg) {
  if (deg == null) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const i = Math.round(deg / 45) % 8;
  return dirs[i];
}

async function loadWeather() {
  try {
    loading.value = true;
    const data = await fetchWeather();
    weather.value = data;
  } catch (error) {
    console.error('Error loading weather:', error);
  } finally {
    loading.value = false;
  }
}

let refreshInterval = null;

onMounted(async () => {
  try {
    const config = await loadConfig();
    const loc = config.weather?.location;
    if (loc?.city) {
      locationDisplay.value = loc.city;
    }
  } catch (_) {}
  loadWeather();
  refreshInterval = setInterval(loadWeather, 15 * 60 * 1000);
});

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<style scoped>
.weather-widget {
  padding: 2px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  margin-bottom: 2px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 1px;
}

.loading, .error {
  color: rgba(255, 255, 255, 0.8);
  text-align: center;
  padding: 6px;
  font-size: 0.85rem;
}

/* Time is 4.84rem; temp 20% smaller = 3.87rem */
.current-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 4px;
}
.current-top > * + * {
  margin-left: 8px;
}

.current-temp-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.temperature {
  font-size: 3.87rem;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  line-height: 1;
}

.feels-like {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.9);
  margin-top: 2px;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.current-condition-block {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.current-condition-block > * + * {
  margin-top: 2px;
}

.current-icon {
  width: 7.2rem;
  height: 7.2rem;
  object-fit: contain;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
}

.current-condition-desc {
  font-size: 1.15rem;
  color: rgba(255, 255, 255, 0.95);
  text-transform: capitalize;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
  margin-top: 0;
  text-align: center;
  line-height: 1.2;
}

.current-expected-precip {
  display: inline-flex;
  align-items: center;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
  margin-top: 3px;
}
.current-expected-precip > * + * {
  margin-left: 4px;
}

.current-expected-precip .md-icon {
  font-family: 'Material Icons';
  font-weight: 400;
  font-size: 1rem;
  line-height: 1;
  vertical-align: middle;
  color: inherit;
  -webkit-font-smoothing: antialiased;
}

.current-bottom {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.high-low {
  display: flex;
  margin-top: 2px;
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}
.high-low > * + * {
  margin-left: 8px;
}

.sun-wind {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.sun-wind > * + * {
  margin-left: 20px;
}

.sun-wind .labeled {
  display: inline-flex;
  align-items: center;
}
.sun-wind .labeled > * + * {
  margin-left: 4px;
}

.sun-wind .md-icon {
  font-family: 'Material Icons';
  font-weight: 400;
  font-size: 1.15rem;
  line-height: 1;
  vertical-align: middle;
  color: inherit;
  -webkit-font-smoothing: antialiased;
}

.sun-wind .md-icon-sunset {
  transform: rotate(180deg);
}

.forecast {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
  padding-top: 2px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.forecast-header {
  font-size: 1.25rem;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
  margin-bottom: 4px;
  padding-bottom: 0;
}

.forecast-day {
  display: grid;
  grid-template-columns: 3.5rem 1fr 3.5rem 3.5rem 6rem;
  align-items: center;
  padding: 0;
  column-gap: 10px;
  row-gap: 0;
  line-height: 1.1;
  font-size: 1.05rem;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.forecast-day-name {
  font-weight: 600;
}

.forecast-condition {
  display: flex;
  align-items: center;
  min-width: 0;
}
.forecast-condition > * + * {
  margin-left: 8px;
}

.forecast-icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5));
}

.forecast-condition-text {
  text-transform: capitalize;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.forecast-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}
.forecast-cell > * + * {
  margin-left: 4px;
}

.forecast-precip {
  justify-content: flex-start;
}

.forecast-temp-icon {
  font-family: 'Material Icons';
  font-weight: 400;
  font-size: 1.2rem;
  line-height: 1;
  vertical-align: middle;
  color: inherit;
  -webkit-font-smoothing: antialiased;
}
</style>
