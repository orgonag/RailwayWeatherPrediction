import { useId, useMemo, useState } from 'react';
import type { GaugeHistory } from '../map/contracts';
import { buildGaugeSeries, type GaugeMetric, type GaugePeriod, type GaugePoint } from '../map/hydrology';
import './gauge-chart.css';

const colors = ['#12747c', '#b47824', '#7866a8'];
const formatDate = (time: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Regina', month: 'short', day: 'numeric' }).format(new Date(time));
const number = (value: number | null) => value === null ? 'Unavailable' : value.toFixed(3);
export default function GaugeChart({ gauge, now }: { gauge: GaugeHistory; now: Date }) {
  const [period, setPeriod] = useState<GaugePeriod>('7d');
  const [metric, setMetric] = useState<GaugeMetric>('level');
  const [archiveStation, setArchiveStation] = useState<string | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const titleId = useId(); const detailId = useId();
  const archive = archiveStation === gauge.station && gauge.historyAvailableThrough !== null;
  const clock = archive ? new Date(`${gauge.historyAvailableThrough}T23:59:59-06:00`) : now;
  const series = useMemo(() => buildGaugeSeries(gauge, clock, period, metric), [gauge, clock.getTime(), period, metric]);
  const lines = [series.actual, series.previousYear, series.priorThreeYears];
  const all = lines.flatMap(l => l.points.filter(p => p.value !== null));
  const inspected = [...new Set(all.map(p => p.time))].sort();
  const selectedTime = inspected.length ? inspected[Math.min(index ?? inspected.length - 1, inspected.length - 1)] : null;
  const selected = lines.map(line => ({label: line.label, point: line.points.find(p => p.time === selectedTime)}));
  const width = 400; const height = 216; const left = 70; const right = 14; const top = 18; const bottom = 36;
  const low = all.length ? Math.min(...all.map(p => p.value!)) : 0;
  const high = all.length ? Math.max(...all.map(p => p.value!)) : 1;
  const padding = high === low ? Math.max(Math.abs(high) * 0.002, 0.01) : (high - low) * 0.1;
  const min = low - padding; const max = high + padding;
  const start = Date.parse(series.start); const end = Date.parse(series.end);
  const x = (time: string) => left + (Date.parse(time) - start) / Math.max(1, end - start) * (width - left - right);
  const y = (value: number) => top + (max - value) / (max - min) * (height - top - bottom);
  const path = (points: GaugePoint[]) => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(2)},${y(p.value!).toFixed(2)}`).join(' ');
  const reset = () => setIndex(null);
  return <section className="gauge-history" aria-label={`${gauge.name} history`}>
    <div className="gauge-history-controls">
      <div role="group" aria-label="Gauge chart period">{([['7d', '7 days'], ['30d', '30 days'], ['season', 'Season']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={period === value} onClick={() => { setPeriod(value); reset(); }}>{label}</button>)}</div>
      <div role="group" aria-label="Gauge chart metric">{(['level', 'flow'] as const).map(value =>
        <button key={value} type="button" aria-pressed={metric === value} onClick={() => { setMetric(value); reset(); }}>{value === 'level' ? 'Level' : 'Flow'}</button>)}</div>
    </div>
    <p className="gauge-history-period">{archive ? `Archive view · ${gauge.historyAvailableThrough}` : 'Recent observations'} · {formatDate(series.start)}–{formatDate(series.end)} {series.calendarDates.at(-1)?.slice(0, 4)} · CST</p>
    {archive && <p className="gauge-history-note">Comparisons use the displayed archive year. These are historical daily means.</p>}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId} onPointerMove={event => {
      if (!inspected.length) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const cursor = start + ((event.clientX - bounds.left) / Math.max(1, bounds.width) * width - left) / (width - left - right) * (end - start);
      let best = 0;
      for (let i = 1; i < inspected.length; i++) if (Math.abs(Date.parse(inspected[i]) - cursor) < Math.abs(Date.parse(inspected[best]) - cursor)) best = i;
      setIndex(best);
    }}>
      <title id={titleId}>{metric === 'level' ? 'Level' : 'Flow'} history in {series.unit} for {gauge.name}</title>
      {[0, 1, 2, 3].map(tick => { const value = min + (max - min) * tick / 3; return <g key={tick}>
        <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="gauge-history-grid"/>
        <text x={left - 8} y={y(value) + 4} textAnchor="end">{value.toFixed(metric === 'level' ? 2 : 3)}</text>
      </g>; })}
      <text x={left} y={12}>{series.unit}</text>
      {[series.start, new Date(start + (end - start) / 2).toISOString(), series.end].map((date, i) => <text key={i} x={x(date)} y={height - 12} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{formatDate(date)}</text>)}
      {lines.map((line, i) => <g key={line.label} stroke={colors[i]} fill="none" strokeWidth={i === 0 ? 2.5 : 1.8} strokeDasharray={i === 1 ? '6 4' : i === 2 ? '2 4' : undefined}>
        {line.segments.map((segment, s) => segment.length === 1 ? <circle key={s} cx={x(segment[0].time)} cy={y(segment[0].value!)} r={2.5} fill={colors[i]}/> : <path key={s} d={path(segment)}/>)}
      </g>)}
      {selectedTime && <line x1={x(selectedTime)} x2={x(selectedTime)} y1={top} y2={height - bottom} className="gauge-history-cursor"/>}
      {!all.length && <text x={(left + width - right) / 2} y={height / 2} textAnchor="middle">No chart values available</text>}
    </svg>
    {!series.actual.points.some(p => p.value !== null) && <p className="gauge-history-note">No readings in this period. Missing values remain unavailable.</p>}
    {inspected.length > 0 && <>
      <label className="gauge-history-scrub">Inspect readings<input type="range" aria-label="Inspect gauge readings" aria-describedby={detailId} min="0" max={Math.max(0, inspected.length - 1)} value={Math.min(index ?? inspected.length - 1, inspected.length - 1)} onChange={e => setIndex(Number(e.target.value))}/></label>
      <div id={detailId} className="gauge-history-reading" aria-live="polite">{selected.map(({label, point}) => point ? <div key={label}><span>{label}</span><strong>{number(point.value)} {point.value !== null && series.unit}</strong><small>{point.sourceTimes.join(', ') || 'No source value'}{point.qualifiers.length > 0 ? ` · ${point.qualifiers.join(', ')}` : ''}</small></div> : null)}</div>
    </>}
    <ul className="gauge-history-legend">{lines.map((line, i) => <li key={line.label}><span style={{background: colors[i]}}/><div><strong>{line.label}</strong><small>{i === 0 ? `${line.points.filter(p => p.value !== null).length} ${line.kind === 'native' ? 'native readings' : 'daily means'}` : `${line.coverage.completeDays} of ${line.coverage.totalDays} ${i === 2 ? 'complete ' : ''}daily means${i === 2 ? ' (3 of 3 years required)' : ''}`}</small>{i > 0 && <small>Available source years: {line.coverage.availableYears.join(', ') || 'none'}</small>}</div></li>)}</ul>
    <p className="gauge-history-note">{metric === 'level' ? `Station datum: ${series.datum ?? 'unavailable'}. Levels at different stations are not comparable.` : 'Flow in m³/s. Daily means are not instantaneous peaks.'} Season starts January 1. Daily archive dates use the station calendar; reading timestamps remain UTC.</p>
    {gauge.historyAvailableThrough && <button type="button" className="gauge-history-archive" onClick={() => { setArchiveStation(archive ? null : gauge.station); reset(); }}>{archive ? 'Return to current period' : 'View latest archive'}</button>}
    {series.warnings.length > 0 && <details className="gauge-history-sources"><summary>Coverage and source notes ({series.warnings.length})</summary><ul>{series.warnings.map(note => <li key={note}>{note}</li>)}</ul></details>}
    <a className="gauge-history-source" href={gauge.sourceUrl} target="_blank" rel="noreferrer">ECCC / Water Survey of Canada · {gauge.station}</a>
  </section>;
}
