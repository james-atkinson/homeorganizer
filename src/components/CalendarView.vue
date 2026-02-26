<template>
  <div class="calendar-view">
    <div class="calendar-header">
      <h2 class="month-year">{{ monthYear }}</h2>
    </div>
    <div class="calendar-grid">
      <div class="weekday-header">
        <div v-for="day in weekdays" :key="day" class="weekday">{{ day }}</div>
      </div>
      <div class="days-grid">
        <div
          v-for="(day, index) in calendarDays"
          :key="index"
          class="day-cell"
          :class="{
            'other-month': !day.isCurrentMonth,
            'today': day.isToday
          }"
        >
          <div class="day-number">{{ day.date }}</div>
          <div v-if="day.events.length" class="day-events">
            <div
              v-for="(ev, i) in day.events"
              :key="ev.uid || i"
              class="day-event"
              :style="{ '--event-bg': eventColor(ev) }"
              :title="ev.summary + (ev.isAllDay ? '' : ' ' + formatEventTime(ev))"
            >
              <div class="event-time">{{ ev.isAllDay ? 'All day' : formatEventTime(ev) }}</div>
              <div class="event-summary">{{ ev.summary }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getEventsForMonth } from '../services/calendar.js';

const currentDate = ref(new Date());
const events = ref([]);
const loading = ref(true);

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatEventTime(event) {
  const start = event.start;
  return start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function eventColor(event) {
  const str = (event.uid || event.summary || '') + (event.start ? event.start.getTime() : '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash % 360);
  return `hsla(${hue}, 20%, 32%, 0.38)`;
}

const monthYear = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
});

const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();
  
  // Get first day of month and last day of month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  // Get first day of week for the month
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  
  // Get last day to show (end of last week)
  const endDate = new Date(lastDay);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
  
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const current = new Date(startDate);
  while (current <= endDate) {
    const currentDay = new Date(current);
    currentDay.setHours(0, 0, 0, 0);
    const currentDayUTC = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
    const dayEvents = events.value
      .filter(event => {
        const eventStartUTC = Date.UTC(event.start.getUTCFullYear(), event.start.getUTCMonth(), event.start.getUTCDate());
        let eventEndUTC = Date.UTC(event.end.getUTCFullYear(), event.end.getUTCMonth(), event.end.getUTCDate());
        if (event.isAllDay) {
          eventEndUTC -= 24 * 60 * 60 * 1000;
        }
        return currentDayUTC >= eventStartUTC && currentDayUTC <= eventEndUTC;
      })
      .sort((a, b) => {
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        if (a.isAllDay && b.isAllDay) return 0;
        return a.start - b.start;
      });
    
    const isToday = current.getTime() === today.getTime();
    const isCurrentMonth = current.getMonth() === month;
    
    days.push({
      date: current.getDate(),
      isCurrentMonth,
      isToday,
      eventCount: dayEvents.length,
      events: dayEvents
    });
    
    current.setDate(current.getDate() + 1);
  }
  
  return days;
});

async function loadEvents() {
  try {
    loading.value = true;
    const year = currentDate.value.getFullYear();
    const month = currentDate.value.getMonth();
    const monthEvents = await getEventsForMonth(year, month);
    events.value = monthEvents;
  } catch (error) {
    console.error('Error loading calendar events:', error);
  } finally {
    loading.value = false;
  }
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
.calendar-view {
  padding: 5px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.calendar-header {
  margin-bottom: 6px;
}

.month-year {
  font-size: 2.5rem;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  text-align: right;
  margin: 0;
}

.calendar-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: auto;
  grid-auto-rows: minmax(0, 1fr);
  grid-gap: 0;
  min-height: 0;
  align-self: stretch;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
}

.weekday-header {
  display: contents;
}

.weekday {
  text-align: center;
  font-weight: 600;
  font-size: 1.2rem;
  color: rgba(255, 255, 255, 0.9);
  padding: 6px 4px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0;
}

.days-grid {
  display: contents;
}

.day-cell {
  padding: 4px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  position: relative;
  cursor: default;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 0;
  min-height: 0;
  overflow: hidden;
}

.day-cell.other-month {
  opacity: 0.5;
}

.day-cell.today {
  background: rgba(0, 0, 0, 0.5);
}

.day-number {
  font-size: 1.1rem;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
  flex-shrink: 0;
  text-align: center;
}

.day-events {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.day-events > * + * {
  margin-top: 4px;
}

.day-event {
  flex: 0 1 auto;
  min-height: 2.25em;
  display: flex;
  flex-direction: column;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--event-bg, rgba(74, 144, 226, 0.25));
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.day-event > * + * {
  margin-top: 1px;
}

.event-time {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.5);
  letter-spacing: 0.02em;
  line-height: 1.2;
}

.event-summary {
  flex: 1;
  min-height: 0;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
  color: #ffffff;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
