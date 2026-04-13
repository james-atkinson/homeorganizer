import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTodayHighlight,
  resolveEventDerivedTheme,
  mapHolidaysToTheme,
  themeFromHolidayName,
  sanitizeTodayHighlightTheme,
  resetTodayHighlightHolidayCache,
  normalizeHighlightDate
} from './calendarTodayHighlight.js';

describe('themeFromHolidayName', () => {
  it('maps Christmas variants', () => {
    assert.equal(themeFromHolidayName('Christmas Day'), 'christmas');
    assert.equal(themeFromHolidayName('Christmas Eve'), 'christmas');
  });

  it('maps valentines and halloween', () => {
    assert.equal(themeFromHolidayName("Valentine's Day"), 'valentines');
    assert.equal(themeFromHolidayName('Halloween'), 'halloween');
  });

  it('returns holiday for unknown names', () => {
    assert.equal(themeFromHolidayName('Boxing Day'), 'holiday');
  });
});

describe('mapHolidaysToTheme', () => {
  it('prefers christmas when present', () => {
    assert.equal(
      mapHolidaysToTheme([{ name: 'Some Day' }, { name: 'Christmas Day' }]),
      'christmas'
    );
  });
});

describe('resolveEventDerivedTheme', () => {
  it('detects dental separately from wellness', () => {
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Dentist — cleaning', description: '' }]),
      'dental'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Dental checkup', description: '' }]),
      'dental'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Orthodontist adjustment', description: '' }]),
      'dental'
    );
  });

  it('detects wellness before birthday', () => {
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Therapy', description: '' }]),
      'wellness'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Doctor appointment', description: '' }]),
      'wellness'
    );
  });

  it('detects medical specialists and related care', () => {
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Dermatology — Mohs', description: '' }]),
      'wellness'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Cardiologist follow-up', description: '' }]),
      'wellness'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Psychiatry intake', description: '' }]),
      'wellness'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'ENT consult', description: '' }]),
      'wellness'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Physical therapy', description: '' }]),
      'wellness'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'MRI appointment', description: '' }]),
      'wellness'
    );
  });

  it('detects birthday', () => {
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Mom birthday party', description: '' }]),
      'birthday'
    );
  });

  it('detects vacation when no higher-priority match', () => {
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'PTO — beach', description: '' }]),
      'vacation'
    );
  });

  it('returns default for empty or unrelated events', () => {
    assert.equal(resolveEventDerivedTheme([]), 'default');
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Standup', description: '' }]),
      'default'
    );
  });

  it('detects reminders from title text', () => {
    assert.equal(
      resolveEventDerivedTheme([{ summary: "Don't forget passport", description: '' }]),
      'reminder'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'REM: water plants', description: '' }]),
      'reminder'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Pick up dry cleaning', description: '' }]),
      'reminder'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'submit passport application', description: '' }]),
      'reminder'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Swing by post office', description: '' }]),
      'reminder'
    );
  });

  it('does not treat generic work applications as reminders', () => {
    assert.equal(
      resolveEventDerivedTheme([
        { summary: 'Submit application for senior engineer role', description: '' }
      ]),
      'default'
    );
  });

  it('detects reminders from ICS categories', () => {
    assert.equal(
      resolveEventDerivedTheme([
        { summary: 'Bins to curb', description: '', categories: ['reminder', 'home'] }
      ]),
      'reminder'
    );
    assert.equal(
      resolveEventDerivedTheme([{ summary: 'Weekly', description: '', categories: ['todo'] }]),
      'reminder'
    );
  });

  it('prefers medical themes over reminder when both apply', () => {
    assert.equal(
      resolveEventDerivedTheme([
        { summary: 'Reminder: therapy session', description: '', categories: ['reminder'] }
      ]),
      'wellness'
    );
  });
});

describe('resolveTodayHighlight', () => {
  beforeEach(() => {
    resetTodayHighlightHolidayCache();
  });

  it('uses injected holiday checker when holiday matches', () => {
    const d = normalizeHighlightDate(new Date(2024, 11, 25));
    const theme = resolveTodayHighlight(d, [{ summary: 'PTO', description: '' }], {
      holidayChecker: {
        isHoliday: () => [{ name: 'Christmas Day', type: 'public' }]
      }
    });
    assert.equal(theme, 'christmas');
  });

  it('ignores events when holiday checker returns holidays', () => {
    const d = normalizeHighlightDate(new Date(2025, 1, 14));
    const theme = resolveTodayHighlight(d, [{ summary: 'birthday dinner', description: '' }], {
      holidayChecker: {
        isHoliday: () => [{ name: "Valentine's Day", type: 'observance' }]
      }
    });
    assert.equal(theme, 'valentines');
  });

  it('falls back to event themes when no holiday', () => {
    const d = normalizeHighlightDate(new Date(2025, 5, 10));
    assert.equal(
      resolveTodayHighlight(
        d,
        [{ summary: 'Summer vacation starts', description: '' }],
        { holidayChecker: { isHoliday: () => false } }
      ),
      'vacation'
    );
  });
});

describe('sanitizeTodayHighlightTheme', () => {
  it('returns default for unknown keys', () => {
    assert.equal(sanitizeTodayHighlightTheme('not-a-theme'), 'default');
  });

  it('passes through known keys', () => {
    assert.equal(sanitizeTodayHighlightTheme('christmas'), 'christmas');
  });
});
