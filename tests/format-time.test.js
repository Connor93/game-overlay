const { formatTime } = require('../src/shared/format-time');

const d = new Date(2026, 9, 20, 15, 4, 9); // 3:04:09 PM local

test('12h with seconds', () => expect(formatTime(d, { showSeconds: true, hour12: true })).toBe('03:04:09 PM'));
test('12h no seconds', () => expect(formatTime(d, { showSeconds: false, hour12: true })).toBe('03:04 PM'));
test('24h with seconds', () => expect(formatTime(d, { showSeconds: true, hour12: false })).toBe('15:04:09'));
test('midnight 24h is 00', () => expect(formatTime(new Date(2026, 0, 1, 0, 0, 0), { showSeconds: false, hour12: false })).toBe('00:00'));
test('midnight 12h is 12 AM', () => expect(formatTime(new Date(2026, 0, 1, 0, 5, 0), { showSeconds: false, hour12: true })).toBe('12:05 AM'));
test('noon 12h is 12 PM', () => expect(formatTime(new Date(2026, 0, 1, 12, 0, 0), { showSeconds: false, hour12: true })).toBe('12:00 PM'));
