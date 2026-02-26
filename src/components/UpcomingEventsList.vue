<template>
  <div
    class="upcoming-events"
    :class="densityClass"
  >
    <h2 class="section-title">Upcoming Events</h2>
    <div v-if="loading" class="loading">Loading events...</div>
    <div v-else-if="events.length === 0" class="no-events">No upcoming events</div>
    <div v-else class="events-list">
      <div v-for="event in events" :key="event.uid" class="event-item">
        <div class="event-date">
          <div class="event-day">{{ formatDay(event.start) }}</div>
          <div class="event-month">{{ formatMonth(event.start) }}</div>
        </div>
        <div class="event-details">
          <div class="event-top-row">
            <div class="event-countdown">{{ timeUntil(event) }}</div>
            <div class="event-title">{{ event.summary }}</div>
            <div class="event-time">{{ formatTime(event) }}</div>
          </div>
          <div v-if="event.location" class="event-location">{{ event.location }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getUpcomingEvents } from '../services/calendar.js';

const events = ref([]);
const loading = ref(true);

const densityClass = computed(() => {
  const n = events.value.length;
  if (n >= 8) return 'packed';
  if (n >= 4) return 'dense';
  return '';
});

async function loadEvents() {
  try {
    loading.value = true;
    const upcoming = await getUpcomingEvents(15);
    events.value = upcoming;
  } catch (error) {
    console.error('Error loading events:', error);
  } finally {
    loading.value = false;
  }
}

function formatDay(date) {
  return date.getDate();
}

function formatMonth(date) {
  return date.toLocaleDateString('en-US', { month: 'short' });
}

function timeUntil(event) {
  const now = new Date();
  const start = new Date(event.start);
  const diffMs = start - now;
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));

  // Use calendar days (today = day 0) so "in 2 days" is correct
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diffCalendarDays = Math.round((startDay - nowStart) / (24 * 60 * 60 * 1000));

  if (diffMins < 0) return 'Started';
  if (diffCalendarDays === 0) {
    if (diffMins < 60) return diffMins <= 1 ? 'in 1 minute' : `in ${diffMins} minutes`;
    if (diffHours < 24) return diffHours === 1 ? 'in 1 hour' : `in ${diffHours} hours`;
    return 'Today';
  }
  if (diffCalendarDays === 1) return 'Tomorrow';
  return `in ${diffCalendarDays} days`;
}

function formatTime(event) {
  if (event.isAllDay) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const eventStartUTC = Date.UTC(event.start.getUTCFullYear(), event.start.getUTCMonth(), event.start.getUTCDate());
    const eventEndUTC = Date.UTC(event.end.getUTCFullYear(), event.end.getUTCMonth(), event.end.getUTCDate());
    const dayCount = Math.round((eventEndUTC - eventStartUTC) / msPerDay);
    if (dayCount > 1) {
      return dayCount === 2 ? '2 days' : `${dayCount} days`;
    }
    return 'All Day';
  }

  const start = event.start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  if (event.end) {
    const end = event.end.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${start} - ${end}`;
  }
  
  return start;
}

let refreshInterval = null;

onMounted(() => {
  loadEvents();
  refreshInterval = setInterval(loadEvents, 5 * 60 * 1000); // Refresh every 5 minutes
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});
</script>

<style scoped>
.upcoming-events {
  padding: 5px;
  margin-bottom: 5px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-title {
  flex-shrink: 0;
  font-size: 1.56rem;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  margin-bottom: 8px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 6px;
}

.upcoming-events.dense .section-title {
  font-size: 1.25rem;
  margin-bottom: 4px;
  padding-bottom: 4px;
}

.upcoming-events.packed .section-title {
  font-size: 1.12rem;
  margin-bottom: 2px;
  padding-bottom: 2px;
}

.loading, .no-events {
  color: rgba(255, 255, 255, 0.8);
  text-align: center;
  padding: 20px;
  font-size: 1.5rem;
}

.events-list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.events-list > * + * {
  margin-top: 8px;
}

.upcoming-events.dense .events-list > * + * {
  margin-top: 6px;
}

.upcoming-events.packed .events-list > * + * {
  margin-top: 4px;
}

.event-item {
  flex: 0 1 auto;
  min-height: 3.25em;
  display: flex;
  padding: 4px 5px;
  border-left: 3px solid #4a90e2;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.12);
  overflow: hidden;
}
.event-item > * + * {
  margin-left: 6px;
}

.upcoming-events.dense .event-item,
.upcoming-events.packed .event-item {
  flex: 1 1 0;
  min-height: 0;
}

.upcoming-events.dense .event-item {
  padding: 3px 4px;
}
.upcoming-events.dense .event-item > * + * {
  margin-left: 5px;
}

.upcoming-events.packed .event-item {
  padding: 2px 3px;
}
.upcoming-events.packed .event-item > * + * {
  margin-left: 4px;
}

.event-date {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  padding: 2px;
}

.upcoming-events.dense .event-date {
  min-width: 28px;
  padding: 1px 2px;
}

.upcoming-events.packed .event-date {
  min-width: 24px;
  padding: 1px 2px;
}

.event-day {
  font-size: 1.69rem;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.1;
}

.upcoming-events.dense .event-day {
  font-size: 1.05rem;
  line-height: 1.1;
}

.upcoming-events.packed .event-day {
  font-size: 0.9rem;
  line-height: 1.1;
}

.event-month {
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.9);
  text-transform: uppercase;
  margin-top: 2px;
  line-height: 1.1;
}

.upcoming-events.dense .event-month {
  font-size: 0.6rem;
  margin-top: 1px;
}

.upcoming-events.packed .event-month {
  font-size: 0.52rem;
  margin-top: 1px;
}

.event-details {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.event-top-row {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.upcoming-events.dense .event-top-row,
.upcoming-events.packed .event-top-row {
  flex-direction: row;
  align-items: baseline;
}
.upcoming-events.dense .event-top-row > * + * {
  margin-left: 6px;
}
.upcoming-events.packed .event-top-row > * + * {
  margin-left: 4px;
}

.event-countdown {
  font-size: 0.94rem;
  color: rgba(255, 255, 255, 0.75);
  margin-bottom: 1px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.upcoming-events.dense .event-countdown {
  font-size: 0.68rem;
  margin-bottom: 0;
  line-height: 1.15;
}

.upcoming-events.packed .event-countdown {
  font-size: 0.58rem;
  line-height: 1.1;
}

.event-title {
  font-size: 1.19rem;
  font-weight: 600;
  line-height: 1.25;
  color: #ffffff;
  text-shadow: 0 0 1px rgba(0, 0, 0, 0.4);
  margin-bottom: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  min-height: 1.25em;
}

.upcoming-events.dense .event-title {
  font-size: 0.82rem;
  line-height: 1.15;
  min-height: 1.15em;
  -webkit-line-clamp: 2;
  margin-bottom: 0;
}

.upcoming-events.dense .event-top-row .event-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  display: block;
  -webkit-line-clamp: unset;
}

.upcoming-events.packed .event-title {
  font-size: 0.7rem;
  line-height: 1.1;
  min-height: 1.1em;
  -webkit-line-clamp: 1;
  margin-bottom: 0;
}

.upcoming-events.packed .event-top-row .event-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  display: block;
  -webkit-line-clamp: unset;
}

.event-time {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.9);
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.upcoming-events.dense .event-time {
  font-size: 0.7rem;
  line-height: 1.15;
}

.upcoming-events.dense .event-top-row .event-time {
  flex-shrink: 0;
}

.upcoming-events.packed .event-time {
  font-size: 0.58rem;
  line-height: 1.1;
}

.upcoming-events.packed .event-top-row .event-time {
  flex-shrink: 0;
}

.upcoming-events.dense .event-top-row .event-countdown,
.upcoming-events.packed .event-top-row .event-countdown {
  flex-shrink: 0;
}

.event-location {
  font-size: 0.94rem;
  color: rgba(255, 255, 255, 0.7);
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.upcoming-events.dense .event-location {
  font-size: 0.62rem;
}

.upcoming-events.packed .event-location {
  font-size: 0.52rem;
}
</style>
