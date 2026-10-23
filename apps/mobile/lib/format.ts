export const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');

/** `2h 14m`, `12m 40s`, `45s`; `1d 3h` past a day. */
export function duration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

/** Local wall-clock time, e.g. `21:42`, with the day if it isn't today. */
export function clock(at: number, now = Date.now()): string {
  const d = new Date(at);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (new Date(now).toDateString() === d.toDateString()) return time;
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
}

export function ago(at: number, now = Date.now()): string {
  const s = Math.floor((now - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
