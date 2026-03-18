const GANTT_SETTINGS_KEY = 'path-gantt-settings';
const GANTT_DEFAULTS = { manDaysPerWeek: 10, defaultTimeScale: 'weeks' };

export function getGanttSettings() {
  try {
    const raw = localStorage.getItem(GANTT_SETTINGS_KEY);
    if (!raw) return { ...GANTT_DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      manDaysPerWeek: typeof parsed.manDaysPerWeek === 'number' && parsed.manDaysPerWeek > 0 ? parsed.manDaysPerWeek : GANTT_DEFAULTS.manDaysPerWeek,
      defaultTimeScale: ['days', 'weeks', 'months'].includes(parsed.defaultTimeScale) ? parsed.defaultTimeScale : GANTT_DEFAULTS.defaultTimeScale
    };
  } catch {
    return { ...GANTT_DEFAULTS };
  }
}

export function saveGanttSettings(settings) {
  try {
    localStorage.setItem(GANTT_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Could not save Gantt settings', e);
  }
}

export { GANTT_DEFAULTS, GANTT_SETTINGS_KEY };
