<template>
  <div class="calendar-view">
    <div class="calendar-header">
      <h2 class="month-year">{{ monthYear }}</h2>
    </div>
    <div class="calendar-grid">
      <div class="weekday-header">
        <div v-for="d in weekdays" :key="d" class="weekday">{{ d }}</div>
      </div>
      <div class="days-grid">
        <div
          v-for="(day, index) in calendarDays"
          :key="index"
          class="day-cell"
          :class="dayCellClassList(day)"
        >
          <div class="day-cell-stack">
            <div class="day-cell-inner">
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
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getEventsForMonth } from '../services/calendar.js';
import {
  resolveTodayHighlight,
  sanitizeTodayHighlightTheme
} from '../utils/calendarTodayHighlight.js';

const currentDate = ref(new Date());
const events = ref([]);
const loading = ref(true);

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayCellClassList(day) {
  const list = {
    'other-month': !day.isCurrentMonth,
    today: day.isToday
  };
  if (day.isToday && day.todayHighlight) {
    list[`today--${day.todayHighlight}`] = true;
  }
  return list;
}

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

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());

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

    const isToday = currentDay.getTime() === today.getTime();
    const isCurrentMonth = current.getMonth() === month;

    let todayHighlight = null;
    if (isToday) {
      const raw = resolveTodayHighlight(currentDay, dayEvents);
      todayHighlight = sanitizeTodayHighlightTheme(raw);
    }

    days.push({
      date: current.getDate(),
      isCurrentMonth,
      isToday,
      todayHighlight,
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
  refreshInterval = setInterval(loadEvents, 5 * 60 * 1000);
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
  display: flex;
  flex-direction: column;
  padding: 4px;
  position: relative;
  cursor: default;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 0;
  min-height: 0;
  overflow: hidden;
}

.day-cell-stack {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.day-cell.other-month {
  opacity: 0.5;
}

.day-cell-inner {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  min-height: 0;
  flex: 1 1 auto;
}

/* ----- Today base + themes ----- */
.day-cell.today {
  background-color: rgba(0, 0, 0, 0.42);
  border-width: 2px;
  box-sizing: border-box;
}

.day-cell.today:not(.today--default)::before {
  content: '';
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  opacity: 0.18;
  background-repeat: no-repeat;
  background-position: center center;
  background-size: 55%;
}

.day-cell.today--default {
  border-color: #e6c200;
}

.day-cell.today--valentines {
  border-color: #e91e63;
  box-shadow: inset 0 0 0 1px rgba(255, 128, 171, 0.4), 0 0 10px rgba(233, 30, 99, 0.5);
}

.day-cell.today--valentines::before {
  background-image: url('../assets/calendar-today/heart.svg');
}

.day-cell.today--christmas {
  border-color: #2e7d32;
  box-shadow: inset 0 0 0 1px rgba(198, 40, 40, 0.45), 0 0 10px rgba(46, 125, 50, 0.55);
}

.day-cell.today--christmas::before {
  background-image: url('../assets/calendar-today/bauble.svg');
}

.day-cell.today--holiday {
  border-color: #ffa726;
  box-shadow: 0 0 8px rgba(255, 167, 38, 0.5);
}

.day-cell.today--holiday::before {
  background-image: url('../assets/calendar-today/sparkle.svg');
}

.day-cell.today--birthday {
  border-color: #ec407a;
  box-shadow: 0 0 9px rgba(236, 64, 122, 0.55);
}

.day-cell.today--birthday::before {
  background-image: url('../assets/calendar-today/cake.svg');
}

.day-cell.today--vacation {
  border-color: #26c6da;
  box-shadow: 0 0 8px rgba(38, 198, 218, 0.5);
}

.day-cell.today--vacation::before {
  background-image: url('../assets/calendar-today/sun.svg');
}

.day-cell.today--reminder {
  border-color: #ffb300;
  box-shadow: 0 0 8px rgba(255, 179, 0, 0.55);
}

.day-cell.today--reminder::before {
  background-image: url('../assets/calendar-today/bell.svg');
}

.day-cell.today--dental {
  border-color: #4dd0e1;
  box-shadow: 0 0 8px rgba(77, 208, 225, 0.5);
}

.day-cell.today--dental::before {
  background-image: url('../assets/calendar-today/tooth.svg');
}

.day-cell.today--wellness {
  border-color: #42a5f5;
  box-shadow: 0 0 8px rgba(66, 165, 245, 0.45);
}

.day-cell.today--wellness::before {
  background-image: url('../assets/calendar-today/cross-care.svg');
}

.day-cell.today--halloween {
  border-color: #ff6f00;
  box-shadow: 0 0 9px rgba(255, 111, 0, 0.55);
}

.day-cell.today--halloween::before {
  background-image: url('../assets/calendar-today/pumpkin.svg');
}

.day-cell.today--independence {
  border-color: #1565c0;
  box-shadow: 0 0 10px rgba(21, 101, 192, 0.55);
}

.day-cell.today--independence::before {
  background-image: url('../assets/calendar-today/star.svg');
}

.day-cell.today--easter {
  border-color: #ab47bc;
  box-shadow: 0 0 8px rgba(171, 71, 188, 0.5);
}

.day-cell.today--easter::before {
  background-image: url('../assets/calendar-today/egg.svg');
}

.day-cell.today--thanksgiving {
  border-color: #8d6e63;
  box-shadow: 0 0 8px rgba(141, 110, 99, 0.5);
}

.day-cell.today--thanksgiving::before {
  background-image: url('../assets/calendar-today/leaf.svg');
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
