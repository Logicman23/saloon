/**
 * Trading hours, used to size the calendar's time grid.
 *
 * Promote these to a `salon_settings` table when the owner needs to change
 * them without a deploy — the calendar reads them from one place precisely so
 * that swap stays contained.
 */
export const OPEN_HOUR = 10;
export const CLOSE_HOUR = 20;
