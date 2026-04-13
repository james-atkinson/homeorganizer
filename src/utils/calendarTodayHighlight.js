import Holidays from 'date-holidays';
import { getConfig } from './config.js';

/**
 * Resolved CSS theme keys for `.day-cell.today.today--{key}`.
 * Priority: library holiday (mapped or generic `holiday`) beats event-derived themes.
 * Among events (no holiday): dental > wellness > birthday > vacation > reminder > default.
 *
 * Public holidays come from `date-holidays` using `calendar.holidayCountry` /
 * `calendar.holidayState` from config (defaults: Canada, no province). Override in
 * `config.json` if your household uses another jurisdiction.
 *
 * Wellness matches general medical care, mental health, and common specialist titles
 * (see WELLNESS_PATTERNS). Dental stays separate (DENTAL_PATTERNS).
 */

export const TODAY_HIGHLIGHT_THEMES = [
  'default',
  'christmas',
  'valentines',
  'halloween',
  'independence',
  'easter',
  'thanksgiving',
  'holiday',
  'birthday',
  'vacation',
  'reminder',
  'dental',
  'wellness'
];

let holidaysCache = { key: '', instance: null };

export function resetTodayHighlightHolidayCache() {
  holidaysCache = { key: '', instance: null };
}

function calendarConfig() {
  const cfg = getConfig();
  return (cfg && cfg.calendar) || {};
}

function getOrCreateHolidays() {
  const cal = calendarConfig();
  const country = String(cal.holidayCountry || 'CA').toUpperCase();
  const state = String(cal.holidayState || '').trim().toUpperCase();
  const key = `${country}|${state}`;
  if (holidaysCache.key === key && holidaysCache.instance) {
    return holidaysCache.instance;
  }
  try {
    const inst = state ? new Holidays(country, state) : new Holidays(country);
    holidaysCache = { key, instance: inst };
    return inst;
  } catch (e) {
    console.warn('[calendarTodayHighlight] date-holidays init failed:', e);
    holidaysCache = { key, instance: null };
    return null;
  }
}

/** Local calendar date at noon — stable for `date-holidays` day checks. */
export function normalizeHighlightDate(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function themeFromHolidayName(name) {
  if (!name || typeof name !== 'string') return 'holiday';
  const n = name.toLowerCase();
  if (n.includes('christ') || n.includes('xmas')) return 'christmas';
  if (n.includes('valentine')) return 'valentines';
  if (n.includes('halloween') || n.includes('hallowe\'en')) return 'halloween';
  if (n.includes('independence') || n.includes('july 4') || n.includes('4th of july')) {
    return 'independence';
  }
  if (n.includes('easter')) return 'easter';
  if (n.includes('thanksgiving')) return 'thanksgiving';
  return 'holiday';
}

/**
 * When multiple holidays fall on one day, prefer the first match in this list.
 */
const HOLIDAY_THEME_PRECEDENCE = [
  'christmas',
  'valentines',
  'halloween',
  'independence',
  'easter',
  'thanksgiving',
  'holiday'
];

export function mapHolidaysToTheme(holidayList) {
  const mapped = (holidayList || []).map((h) => themeFromHolidayName(h.name));
  for (const t of HOLIDAY_THEME_PRECEDENCE) {
    if (mapped.includes(t)) return t;
  }
  return 'holiday';
}

const DENTAL_PATTERNS = [
  /\bdentist\b/i,
  /\bdental\b/i,
  /\borthodont/i,
  /\bhygien(?:e|ist)\b/i,
  /\bteeth\s+cleaning\b/i,
  /\bdental\s+cleaning\b/i,
  /\boral\s+surgeon\b/i,
  /\b(endodont|periodont|prosthodont)/i
];

const WELLNESS_PATTERNS = [
  /\btherapy\b/i,
  /\btherapist\b/i,
  /\bcounsel(?:l)?ing\b/i,
  /\bpsychiatr/i,
  /\bpsycholog/i,
  /\bpsych(?:iatric|otherapy)?\b/i,
  /\bpsych\s*[-]?\s*eval/i,
  /\b(?:lcsw|lcpc|lmft)\b/i,
  /\bdoctor\b/i,
  /\bphysician\b/i,
  /\bdr\.?\s+[a-z]/i,
  /\bclinic\b/i,
  /\bhospital\b/i,
  /\bcheckup\b/i,
  /\bcheck-up\b/i,
  /\b(?:medical|health)\s+appointment\b/i,
  /\bappointment\b.*\b(?:dr\.?|doctor|clinic|hospital)\b/i,
  /\b(?:dr\.?|doctor)\b.*\bappointment\b/i,
  /\bfollow[- ]?up\s+(?:with\s+)?(?:dr\.?|doctor)\b/i,
  /\bprimary\s+care\b/i,
  /\b(?:pcp|gp)\s+(?:visit|appointment|appt)\b/i,
  /\b(?:pcp|gp)\b.*\b(?:visit|appointment|appt|checkup)\b/i,
  /\bdermatolog/i,
  /\bcardiolog/i,
  /\boncolog/i,
  /\bneurolog/i,
  /\brheumatolog/i,
  /\bpulmonolog/i,
  /\burolog/i,
  /\bnephrolog/i,
  /\bendocrinolog/i,
  /\ballerg(?:ology|ist|y)\b/i,
  /\bimmunolog/i,
  /\bhematolog/i,
  /\bhepatolog/i,
  /\bproctolog/i,
  /\borthoped/i,
  /\b(?:otolaryngolog|otolaryngology|rhinolaryngolog)\b/i,
  /\bENT\b/i,
  /\bgastro(?:entero)?(?:log(?:y|ist)?|scopy)\b/i,
  /\b(?:podiatr|chiropod)/i,
  /\bophthalmolog/i,
  /\boptometr/i,
  /\b(?:obstetric|gyna?ecolog|gynecolog|\bgyn\b|\bobgyn\b|\bob-?gyn\b|prenatal|midwife)\b/i,
  /\bpediatric/i,
  /\bpaediatric/i,
  /\bsurgeon\b/i,
  /\bradiolog/i,
  /\b(?:mri|ct)\s+(?:scan|appointment|appt)\b/i,
  /\bimaging\s+(?:center|appointment|appt|visit)\b/i,
  /\banesthes/i,
  /\bphysical\s+therapy\b/i,
  /\bphysio(?:therapy)?\b/i,
  /\bpain\s+(?:management|clinic)\b/i,
  /\b(?:infectious\s+disease|sleep\s+(?:medicine|clinic|study))\b/i,
  /\b(?:audiolog|speech\s+therapy|occupational\s+therapy)\b/i,
  /\b(?:sports\s+medicine|urgent\s+care|walk-?in\s+clinic)\b/i,
  /\bskin\s+(?:doctor|specialist|check)\b/i,
  /\b(?:heart|lung|kidney|liver)\s+(?:doctor|specialist|clinic)\b/i
];

const BIRTHDAY_PATTERNS = [
  /\bbirthday\b/i,
  /\bb-day\b/i,
  /\bbday\b/i,
  /\bhappy birthday\b/i,
  /\bturns\s+\d+\b/i
];

const VACATION_PATTERNS = [
  /\bvacation\b/i,
  /\bpto\b/i,
  /\bout of office\b/i,
  /\booo\b/i,
  /\bon leave\b/i,
  /\btime off\b/i,
  /\baway from (?:the )?office\b/i,
  /\b(spring|summer|winter)\s+break\b/i,
  /\bholiday\b.*\b(trip|travel|vacation|getaway|resort|beach|flight)\b/i,
  /\b(travel|travelling|traveling)\b/i
];

const REMINDER_CATEGORY_HINTS = new Set([
  'reminder',
  'reminders',
  'todo',
  'to-do',
  'task',
  'tasks',
  'chore',
  'chores',
  'errand',
  'errands',
  'follow-up',
  'followup',
  'admin',
  'life-admin',
  'paperwork',
  'personal'
]);

const REMINDER_PATTERNS = [
  /\breminder\b/i,
  /\bremind(?:\s+me)?\s+to\b/i,
  /\bdon'?t\s+forget\b/i,
  /(^|[\n;])\s*rem:\s*/im,
  /\bnudge\b/i,
  /\btickler\b/i,
  /\bnotify\s+(?:me|us)\b/i,
  /\bcheck\s+in\s+on\b/i,
  /\bplease\s+(?:remember|file|send|mail)\b/i,
  /\btoday\s*:\s*(?:pick|drop|submit|call|pay|renew)\b/i,
  /\bpick\s+up\b/i,
  /\bpickup\b/i,
  /\bdrop\s+off\b/i,
  /\bdropoff\b/i,
  /\b(?:swing|stop)\s+by\b/i,
  /\bcollect\b.*\b(?:order|prescription|package|parcel|passport|tickets?|keys|dry\s+cleaning)\b/i,
  /\brun\s+to\s+(?:the\s+)?(?:store|bank|post\s+office|dmv|registry|clinic)\b/i,
  /\bdry\s+cleaning\b/i,
  /\border\s+(?:ready|for\s+pickup)\b/i,
  /\bready\s+for\s+pickup\b/i,
  /\b(?:passport|visa)\s+application\b/i,
  /\bsubmit\b.*\b(?:passport|visa)\b.*\bapplication\b|\bsubmit\b.*\bapplication\b.*\b(?:passport|visa|uscis|ircc|service\s+canada|immigration|citizenship|dmv|registry)\b/i,
  /\bsubmit\b.*\b(?:paperwork|forms?|renewal|request)\b.*\b(?:passport|visa|license|permit|benefits?|tax|government)\b/i,
  /\b(?:apply|applying)\s+for\b.*\b(?:passport|visa|permit|benefits?|license|grant|loan)\b/i,
  /\brenew\b.*\b(?:passport|visa|license|registration|plates?|insurance|membership|prescription)\b/i,
  /\b(?:passport|visa)\b.*\b(?:pickup|pick\s+up|renew|submit|office|photo|expir)\b/i,
  /\b(?:vehicle|car)\s+(?:registration|inspection|renewal)\b/i,
  /\binspection\s+(?:due|sticker|appointment)\b/i,
  /\b(?:file|mail)\s+(?:tax|taxes|return)\b/i,
  /\bpay\s+(?:fine|ticket|parking|citation)\b/i,
  /\bdeadline\b.*\b(?:file|submit|pay|register|renew)\b/i,
  /\bregister\s+(?:the|my|our|your)\s+(?:vehicle|car|truck)\b/i
];

function categoriesSuggestReminder(ev) {
  const cats = ev.categories;
  if (!cats || !cats.length) return false;
  for (let i = 0; i < cats.length; i++) {
    const c = String(cats[i]).trim().toLowerCase();
    if (REMINDER_CATEGORY_HINTS.has(c)) return true;
  }
  return false;
}

function eventBlob(ev) {
  const cats = (ev.categories && ev.categories.length) ? ev.categories.join('\n') : '';
  return `${ev.summary || ''}\n${ev.description || ''}\n${cats}`;
}

export function resolveEventDerivedTheme(events) {
  const list = events || [];
  const text = list.map(eventBlob).join('\n');
  if (DENTAL_PATTERNS.some((re) => re.test(text))) return 'dental';
  if (WELLNESS_PATTERNS.some((re) => re.test(text))) return 'wellness';
  if (BIRTHDAY_PATTERNS.some((re) => re.test(text))) return 'birthday';
  if (VACATION_PATTERNS.some((re) => re.test(text))) return 'vacation';
  if (REMINDER_PATTERNS.some((re) => re.test(text))) return 'reminder';
  if (list.some((ev) => categoriesSuggestReminder(ev))) return 'reminder';
  return 'default';
}

/**
 * @param {Date} date - calendar day (any time; normalized internally)
 * @param {Array<{summary?: string, description?: string, categories?: string[]}>} events - events for that day
 * @param {{ holidayChecker?: { isHoliday: (d: Date) => false|Array<{name: string}> } }} [options]
 * @returns {string} theme key in TODAY_HIGHLIGHT_THEMES
 */
export function resolveTodayHighlight(date, events = [], options = {}) {
  const local = normalizeHighlightDate(date);
  const checker = options.holidayChecker;

  let holidayResult = false;
  if (checker && typeof checker.isHoliday === 'function') {
    holidayResult = checker.isHoliday(local);
  } else {
    const hd = getOrCreateHolidays();
    if (hd) {
      holidayResult = hd.isHoliday(local);
    }
  }

  if (holidayResult && holidayResult.length) {
    return mapHolidaysToTheme(holidayResult);
  }

  return resolveEventDerivedTheme(events);
}

export function sanitizeTodayHighlightTheme(key) {
  if (TODAY_HIGHLIGHT_THEMES.includes(key)) return key;
  return 'default';
}
