import React, { useMemo, useState } from 'react';
import './GanttChart.css';

const LEFTWIDTH = 330;
/** Minimum width per tick so axis labels stay readable (no overlap) */
const TICK_WIDTH = { days: 52, weeks: 40, months: 48 };
const MIN_CHART_WIDTH = 200;

function getMonday(d) {
  const d2 = new Date(d);
  const day = d2.getDay();
  const diff = d2.getDate() - day + (day === 0 ? -6 : 1);
  d2.setDate(diff);
  d2.setHours(0, 0, 0, 0);
  return d2;
}

function addDays(date, days) {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

function formatAxisLabel(date, scale) {
  if (scale === 'months') {
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  if (scale === 'weeks') {
    const mon = getMonday(date);
    return `${mon.getDate()}/${mon.getMonth() + 1}`;
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function computeGanttBars(items, manDaysPerWeek, startFromToday = false) {
  const cap = Math.max(0.5, manDaysPerWeek);
  const startDate = startFromToday ? new Date() : getMonday(new Date());
  startDate.setHours(0, 0, 0, 0);
  let current = new Date(startDate);
  const bars = [];

  for (const item of items) {
    const effort = typeof item.effort_days === 'number' && item.effort_days > 0 ? item.effort_days : 0.5;
    const durationWeeks = effort / cap;
    const durationMs = durationWeeks * 7 * 24 * 60 * 60 * 1000;
    const end = new Date(current.getTime() + durationMs);
    bars.push({
      id: item.id,
      title: item.title || 'Untitled',
      color: item.project_color || '#297D2D',
      startDate: new Date(current),
      endDate: end
    });
    current = end;
  }

  return { bars, startDate, endDate: bars.length ? bars[bars.length - 1].endDate : startDate };
}

export default function GanttChart({
  items,
  manDaysPerWeek = 10,
  timeScale: controlledScale,
  onTimeScaleChange,
  className = ''
}) {
  const [localScale, setLocalScale] = useState(() => {
    try {
      const raw = localStorage.getItem('path-gantt-settings');
      if (!raw) return 'weeks';
      const p = JSON.parse(raw);
      return ['days', 'weeks', 'months'].includes(p.defaultTimeScale) ? p.defaultTimeScale : 'weeks';
    } catch {
      return 'weeks';
    }
  });

  const timeScale = controlledScale ?? localScale;
  const setTimeScale = (v) => {
    if (onTimeScaleChange) onTimeScaleChange(v);
    else {
      setLocalScale(v);
      try {
        const raw = localStorage.getItem('path-gantt-settings');
        const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem('path-gantt-settings', JSON.stringify({ ...prev, defaultTimeScale: v }));
      } catch {}
    }
  };

  const { bars, startDate, endDate } = useMemo(
    () => computeGanttBars(items, manDaysPerWeek),
    [items, manDaysPerWeek]
  );

  const { ticks, totalMs } = useMemo(() => {
    const start = startDate.getTime();
    const end = endDate.getTime();
    let totalMs = end - start;
    if (totalMs <= 0) totalMs = 7 * 24 * 60 * 60 * 1000;

    const tickMs =
      timeScale === 'months'
        ? 30 * 24 * 60 * 60 * 1000
        : timeScale === 'weeks'
          ? 7 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;

    const ticks = [];
    let t = getMonday(startDate).getTime();
    if (timeScale === 'months') {
      const d = new Date(startDate);
      d.setDate(1);
      t = d.getTime();
    }
    const endT = end + tickMs * 2;
    while (t <= endT) {
      ticks.push(new Date(t));
      t += tickMs;
    }
    return { ticks, totalMs };
  }, [startDate, endDate, timeScale]);

  const scaleStart = ticks[0] ? ticks[0].getTime() : startDate.getTime();
  const scaleEnd = ticks.length > 0 ? ticks[ticks.length - 1].getTime() + (ticks[1] ? ticks[1].getTime() - ticks[0].getTime() : 0) : scaleStart + totalMs;

  const tickWidth = TICK_WIDTH[timeScale] ?? TICK_WIDTH.weeks;
  const chartWidth = Math.max(ticks.length * tickWidth, MIN_CHART_WIDTH);

  return (
    <div className={`gantt-wrap ${className}`}>
      <div className="gantt-toolbar">
        <span className="gantt-toolbar-label">Scale:</span>
        <select
          value={timeScale}
          onChange={(e) => setTimeScale(e.target.value)}
          className="gantt-scale-select"
          aria-label="Time scale"
        >
          <option value="days">Days</option>
          <option value="weeks">Weeks</option>
          <option value="months">Months</option>
        </select>
      </div>
      <div className="gantt-scroll">
        <div className="gantt-container" style={{ width: LEFTWIDTH + chartWidth }}>
          {/* Header row: one row with label + ticks */}
          <div className="gantt-row gantt-header-row">
            <div className="gantt-cell gantt-label-cell gantt-header-label" style={{ width: LEFTWIDTH }}>Task</div>
            <div className="gantt-header-times" style={{ width: chartWidth }}>
              {ticks.map((tick, i) => (
                <div key={i} className="gantt-header-tick" style={{ width: tickWidth, minWidth: tickWidth }}>
                  {formatAxisLabel(tick, timeScale)}
                </div>
              ))}
            </div>
          </div>
          {/* Task rows: one row per task with label + bar so they share the same height */}
          {bars.map((bar) => {
            const startMs = bar.startDate.getTime();
            const endMs = bar.endDate.getTime();
            const left = ((startMs - scaleStart) / (scaleEnd - scaleStart)) * 100;
            const width = Math.max(((endMs - startMs) / (scaleEnd - scaleStart)) * 100, 1);
            return (
              <div key={bar.id} className="gantt-row gantt-task-row">
                <div className="gantt-cell gantt-label-cell gantt-task-label" style={{ width: LEFTWIDTH }} title={bar.title}>
                  {bar.title}
                </div>
                <div className="gantt-bar-track" style={{ width: chartWidth }}>
                  <div
                    className="gantt-bar"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: bar.color
                    }}
                    title={`${bar.title}: ${bar.startDate.toLocaleDateString()} – ${bar.endDate.toLocaleDateString()}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {bars.length === 0 && (
        <p className="gantt-empty">No items to show. Add items with effort (days) to see them on the Gantt chart.</p>
      )}
    </div>
  );
}
