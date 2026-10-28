import type { GaugeDaily, GaugeHistory, GaugeReading } from './contracts';

export type GaugePeriod = '7d' | '30d' | 'season';
export type GaugeMetric = 'level' | 'flow';
type Qualified = { levelQualifier?: string | null; dischargeQualifier?: string | null };
type SourceMetadata = { historicalLevelDatumVerified?: boolean; historicalDatum?: string | null; levelContinuityBreaks?: string[] };
export interface GaugePoint {
  /** Display time; comparisons use the start of the matching station calendar day (CST). */
  time: string;
  value: number | null;
  /** Original observation timestamps or archive dates, never shifted source timestamps. */
  sourceTimes: string[];
  sampleCount: number;
  qualifiers: string[];
}
export interface GaugeLine {
  label: string;
  kind: 'native' | 'daily' | 'comparison';
  points: GaugePoint[];
  /** Render each segment separately: nulls and source-time gaps are never bridged. */
  segments: GaugePoint[][];
  coverage: { completeDays: number; totalDays: number; expectedYears: number; availableYears: number[] };
}
export interface GaugeSeries {
  unit: 'm' | 'm³/s';
  metric: GaugeMetric;
  datum: string | null;
  start: string;
  end: string;
  calendarDates: string[];
  actual: GaugeLine;
  previousYear: GaugeLine;
  priorThreeYears: GaugeLine;
  warnings: string[];
}
const DAY = 86_400_000;
const CST = 6 * 3_600_000;
const validNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const stationDate = (time: number) => new Date(time - CST).toISOString().slice(0, 10);
const dayTime = (date: string) => Date.parse(`${date}T06:00:00Z`);
function sourceDate(date: string, yearsAgo: number): string | null {
  const year = Number(date.slice(0, 4)) - yearsAgo;
  const candidate = `${year}${date.slice(4)}`;
  // Date.parse normalizes February 29 in a non-leap year; reject that normalization.
  return new Date(`${candidate}T00:00:00Z`).toISOString().slice(0, 10) === candidate ? candidate : null;
}
function segments(points: GaugePoint[], maxGap: number, breaks: number[] = []): GaugePoint[][] {
  const groups: GaugePoint[][] = [];
  let group: GaugePoint[] = [];
  for (const point of points) {
    if (point.value === null) { if (group.length) groups.push(group); group = []; continue; }
    if (group.length && (Date.parse(point.time) - Date.parse(group[group.length - 1].time) > maxGap ||
      breaks.some(t => Date.parse(group[group.length - 1].time) < t && Date.parse(point.time) >= t))) {
      groups.push(group); group = [];
    }
    group.push(point);
  }
  if (group.length) groups.push(group);
  return groups;
}

/**
 * Build observations and same-calendar-date daily comparisons against the supplied clock.
 * The caller passes the real clock, independently of the weather forecast slider. No future
 * gauge values are interpolated. The three-year mean requires one valid value in EACH of
 * the preceding three calendar years; its missing days stay null. Season means Jan 1–now.
 * Additive source metadata can withhold historic levels where datum continuity is unknown.
 */
export function buildGaugeSeries(gauge: GaugeHistory, now: Date, period: GaugePeriod, metric: GaugeMetric): GaugeSeries {
  const endMs = now.getTime();
  const today = stationDate(endMs);
  const startMs = period === 'season' ? dayTime(`${today.slice(0, 4)}-01-01`) : dayTime(today) - (period === '7d' ? 6 : 29) * DAY;
  const dates: string[] = [];
  for (let t = startMs; t <= endMs; t += DAY) dates.push(stationDate(t));
  const metadata = (gauge as GaugeHistory & { sourceMetadata?: SourceMetadata }).sourceMetadata;
  const historicalLevelBlocked = metric === 'level' && (!gauge.datum || metadata?.historicalLevelDatumVerified === false);
  const warnings = [...gauge.errors];
  let iceCount = 0;
  let partialCount = 0;
  const visibleQualifiers = new Set<string>();
  let continuityExcluded = false;
  const read = (record: (GaugeReading | GaugeDaily) & Qualified, historical: boolean) => {
    const qualifier = metric === 'level' ? record.levelQualifier : record.dischargeQualifier;
    const raw = metric === 'level' ? record.levelM : record.dischargeM3s;
    const ice = Boolean(qualifier && /ice/i.test(qualifier));
    const partial = Boolean(historical && qualifier && /partial.day/i.test(qualifier));
    if (ice) iceCount++;
    if (partial) partialCount++;
    if (qualifier) visibleQualifiers.add(qualifier);
    return { value: historical && historicalLevelBlocked || ice || partial || !validNumber(raw) ? null : raw,
      qualifiers: qualifier ? [qualifier] : [] };
  };
  const daily = new Map(gauge.daily.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date)).map(d => [d.date, d]));
  const native = [...gauge.observations].filter(p => {
    const t = Date.parse(p.time); return Number.isFinite(t) && t >= startMs && t <= endMs;
  }).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  let actualPoints = native.map(record => {
    const value = read(record, false);
    return { time: record.time, ...value, sampleCount: value.value === null ? 0 : 1, sourceTimes: [record.time] };
  });
  let kind: GaugeLine['kind'] = 'native';
  // Archived values remain at their actual dates. They never stand in for present readings.
  if (!native.length) {
    kind = 'daily';
    actualPoints = dates.flatMap(date => {
      const record = daily.get(date); if (!record) return [];
      const value = read(record, true);
      return [{ time: new Date(dayTime(date)).toISOString(), ...value, sampleCount: value.value === null ? 0 : 1, sourceTimes: [date] }];
    });
  }
  const line = (label: string, points: GaugePoint[], expectedYears: number, lineKind: GaugeLine['kind'], maxGap: number): GaugeLine => ({
    label, points, kind: lineKind, segments: segments(points, maxGap),
    coverage: {
      completeDays: new Set(points.filter(p => p.value !== null).map(p => stationDate(Date.parse(p.time)))).size,
      totalDays: dates.length, expectedYears,
      availableYears: [...new Set(points.flatMap(p => p.sourceTimes.map(t => Number(t.slice(0, 4)))))] .sort(),
    },
  });
  const comparison = (count: number) => dates.map(date => {
    const sourceTimes: string[] = []; const values: number[] = []; const qualifiers: string[] = [];
    for (let year = 1; year <= count; year++) {
      const original = sourceDate(date, year); const record = original ? daily.get(original) : undefined;
      if (!record) continue;
      const crossesBreak = metric === 'level' && metadata?.levelContinuityBreaks?.some(breakDate => original! < breakDate && date >= breakDate);
      if (crossesBreak) continuityExcluded = true;
      const result = read(record, true);
      qualifiers.push(...result.qualifiers);
      if (result.value !== null && !crossesBreak) { values.push(result.value); sourceTimes.push(original!); }
    }
    return { time: new Date(dayTime(date)).toISOString(), value: values.length === count ? values.reduce((a, b) => a + b, 0) / count : null,
      sampleCount: values.length, sourceTimes, qualifiers: [...new Set(qualifiers)] };
  });
  const deltas = actualPoints.slice(1).map((p, i) => Date.parse(p.time) - Date.parse(actualPoints[i].time)).filter(n => n > 0).sort((a, b) => a - b);
  const cadence = deltas.length ? deltas[Math.floor((deltas.length - 1) / 2)] : 300_000;
  const actualGap = kind === 'daily' ? DAY * 1.5 : Math.min(6 * 3_600_000, Math.max(60_000, cadence * 1.5));
  const actual = line(kind === 'native' ? 'Actual readings' : 'Archive daily means', actualPoints, 1, kind,
    actualGap);
  if (metric === 'level' && metadata?.levelContinuityBreaks?.length) actual.segments = segments(actualPoints, actualGap, metadata.levelContinuityBreaks.map(dayTime));
  const previousYear = line("Previous year's daily means", comparison(1), 1, 'comparison', DAY * 1.5);
  const priorThreeYears = line('Prior 3-year daily mean', comparison(3), 3, 'comparison', DAY * 1.5);
  if (historicalLevelBlocked) warnings.push('Historical level comparisons withheld: continuity with the current station datum is unverified.');
  if (continuityExcluded) warnings.push(`Level comparisons across a documented station relocation / continuity break are withheld (${metadata?.levelContinuityBreaks?.join(', ')}).`);
  if (iceCount) warnings.push('Ice-qualified values are excluded from chart lines; source qualifiers remain available with the records.');
  if (partialCount) warnings.push('Partial-day means are excluded from historical lines and complete-day coverage.');
  if (visibleQualifiers.size) warnings.push(`Source qualifiers in this period: ${[...visibleQualifiers].sort().join(', ')}. Estimated values retain their source qualifier.`);
  if (gauge.historyAvailableThrough) warnings.push(`Daily archive available through ${gauge.historyAvailableThrough}; later missing years are not substituted.`);
  return { unit: metric === 'level' ? 'm' : 'm³/s', metric, datum: gauge.datum,
    start: new Date(startMs).toISOString(), end: now.toISOString(), calendarDates: dates,
    actual, previousYear, priorThreeYears, warnings: [...new Set(warnings)] };
}
