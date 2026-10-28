import { expect, it } from 'vitest';
import { forecastIndex, summarizeWeather } from '../src/lib/weather';
import type { ForecastPoint } from '../src/types';

const now = new Date('2026-10-27T12:30:00Z');
const point: ForecastPoint = {
  sampleId:'test',latitude:52,longitude:-105,fetchedAt:'2026-10-27T12:00:00Z',
  hourly:{time:Array.from({length:48},(_,i)=>new Date(Date.parse('2026-10-27T00:00Z')+i*3600000).toISOString().slice(0,16)),temperature_2m:Array(48).fill(2),precipitation:Array(48).fill(1),wind_speed_10m:Array(48).fill(20),wind_gusts_10m:Array(48).fill(35),snow_depth:Array(48).fill(0.04)}
};
it('reads provider timezone-less timestamps as UTC and selects the current forecast hour', () => {
  expect(forecastIndex(point,now)).toBe(12);
  expect(forecastIndex(point,new Date('2026-11-01T00:00Z'))).toBe(-1);
});
it('uses the next 24 hours, independent of browser timezone', () => {
  const s = summarizeWeather(point,now);
  expect(s.rain24Mm).toBe(24);
  expect(s.positiveDegreeDays).toBe(2);
  expect(s.snowDepthM).toBe(0.04);
  expect(s.stale).toBe(false);
});
it('returns unknown for an incomplete rain window rather than zero-filling', () => {
  const broken = structuredClone(point);broken.hourly.precipitation[15]=null;
  const s = summarizeWeather(broken,now);
  expect(s.rain24Mm).toBeNull();
  expect(s.validHours).toBe(23);
});
it('keeps liquid rainfall separate from total precipitation including snow',()=>{
  const snowy=structuredClone(point);snowy.hourly.rain=Array(48).fill(0.25);snowy.hourly.showers=Array(48).fill(0);
  expect(summarizeWeather(snowy,now).liquidRain24Mm).toBe(6);
  expect(summarizeWeather(snowy,now).rain24Mm).toBe(24);
});
it('excludes the preceding hour and includes the hour ending the next24h rain window',()=>{
  const p=structuredClone(point);p.hourly.precipitation[12]=99;p.hourly.precipitation[36]=5;
  expect(summarizeWeather(p,now).rain24Mm).toBe(28);
});
it('includes convective showers in liquid rainfall without treating missing showers as zero',()=>{
  const p=structuredClone(point);p.hourly.rain=Array(48).fill(0.25);p.hourly.showers=Array(48).fill(0.5);
  expect(summarizeWeather(p,now).liquidRain24Mm).toBe(18);
  delete p.hourly.showers;
  expect(summarizeWeather(p,now).liquidRain24Mm).toBeNull();
});
it('marks data older than six hours stale and refuses past forecast windows', () => {
  expect(summarizeWeather(point,new Date('2026-10-27T19:00Z')).stale).toBe(true);
  expect(summarizeWeather(point,new Date('2026-11-01T00:00Z')).rain24Mm).toBeNull();
});
it('refuses a gapped 24-row window that spans 46 hours',()=>{
  const gapped=structuredClone(point);
  gapped.hourly.time=Array.from({length:48},(_,i)=>new Date(Date.parse('2026-10-27T00:00Z')+i*7200000).toISOString());
  const s=summarizeWeather(gapped,now);
  expect(s.rain24Mm).toBeNull();expect(s.positiveDegreeDays).toBeNull();expect(s.validHours).toBe(0);
});
it('keeps a missing snow-depth array unavailable without crashing the page',()=>{
  const malformed=structuredClone(point);delete (malformed.hourly as Partial<ForecastPoint['hourly']>).snow_depth;
  expect(summarizeWeather(malformed,now).snowDepthM).toBeNull();
});
