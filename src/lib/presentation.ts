import type { ForecastPoint, Metric } from '../types';
import { forecastIndex, utcTime } from './weather';
export const fmt = (value: number | null | undefined, digits=1) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('en-CA',{maximumFractionDigits:digits,minimumFractionDigits:digits});
export const timeLabel = (value: string | null | undefined) => value ? new Date(utcTime(value)).toLocaleString('en-CA',{timeZone:'America/Regina',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Unavailable';
export function metricValue(point: ForecastPoint | undefined, metric: Metric, now: Date, offset=0): number | null {
  const at=new Date(now.getTime()+offset*3600000),i=forecastIndex(point,at);
  if (!point || i < 0) return null;
  const v=metric==='temperature'?point.hourly.temperature_2m[i]:metric==='rain'?point.hourly.precipitation[i]:point.hourly.wind_gusts_10m[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
export function metricColor(value: number | null, metric: Metric): string {
  if (value === null) return '#879899';
  if(metric==='temperature') return value < -5 ? '#637bc5' : value < 0 ? '#70a5c5' : value < 10 ? '#46999a' : value < 20 ? '#c29b48' : '#c76b4c';
  if(metric==='rain') return value >= 5 ? '#714995' : value >= 1 ? '#3d76ac' : value > 0 ? '#6da8b1' : '#b4c5bf';
  return value >= 70 ? '#bf5d48' : value >= 40 ? '#c79b49' : '#4e9391';
}
