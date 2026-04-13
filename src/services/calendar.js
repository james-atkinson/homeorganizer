import ICAL from 'ical.js';
import { setFatalError, clearFatalError, fatalError } from '../utils/fatalError.js';

const CALENDAR_ERROR_MSG = 'Calendar failed to load';

/** @param {*} vevent ical.js VEVENT component */
function parseEventCategories(vevent) {
  const tokens = new Set();
  const props = vevent.getAllProperties('categories');
  for (let i = 0; i < props.length; i++) {
    const vals = props[i].getValues();
    for (let j = 0; j < vals.length; j++) {
      String(vals[j])
        .split(',')
        .forEach((piece) => {
          const t = piece.trim().toLowerCase();
          if (t) tokens.add(t);
        });
    }
  }
  return Array.from(tokens);
}

let cachedEvents = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function fetchCalendarEvents() {
  const now = Date.now();
  
  // Return cached events if still fresh
  if (cachedEvents.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedEvents;
  }

  try {
    const response = await fetch('/api/calendar');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch calendar: ${response.statusText}`);
    }

    const icsText = await response.text();
    const jcalData = ICAL.parse(icsText);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    const events = vevents.map(vevent => {
      const event = new ICAL.Event(vevent);
      const start = event.startDate.toJSDate();
      const end = event.endDate.toJSDate();

      return {
        uid: event.uid,
        summary: event.summary || 'No Title',
        start: start,
        end: end,
        location: event.location || '',
        description: event.description || '',
        isAllDay: event.startDate.isDate,
        categories: parseEventCategories(vevent)
      };
    });

    // Keep all events, sort by start date (month view shows full month; upcoming list filters separately)
    const sortedEvents = events.sort((a, b) => a.start - b.start);
    cachedEvents = sortedEvents;
    lastFetchTime = now;
    if (fatalError.value === CALENDAR_ERROR_MSG) clearFatalError();
    return sortedEvents;
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    if (cachedEvents.length === 0) setFatalError(CALENDAR_ERROR_MSG);
    return cachedEvents;
  }
}

export async function getEventsForMonth(year, month) {
  const events = await fetchCalendarEvents();
  return events.filter(event => {
    const eventDate = event.start;
    return eventDate.getFullYear() === year && eventDate.getMonth() === month;
  });
}

export async function getUpcomingEvents(days = 15) {
  const events = await fetchCalendarEvents();
  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + days);
  return events.filter(
    event => event.end >= now && event.start <= cutoffDate
  );
}
