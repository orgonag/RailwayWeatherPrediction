import { expect,it } from 'vitest';
import { EMPTY_RULES,evaluateThresholds,futureThresholds,readRules } from '../src/map/alerts';
import type { WeatherSnapshot,Sample } from '../src/types';
const now=new Date('2026-10-28T03:00:00Z');
const samples:Sample[]=[{id:'s',subdivision:'Wynyard',chainId:'one',mp:null,positionKm:0,lat:51,lon:-104}];
function data():WeatherSnapshot{return {fetchedAt:now.toISOString(),source:'test',errors:[],points:{s:{sampleId:'s',latitude:51,longitude:-104,fetchedAt:now.toISOString(),hourly:{time:Array.from({length:120},(_,i)=>new Date(+now+i*3600000).toISOString()),temperature_2m:Array(120).fill(0),precipitation:Array(120).fill(2.5),rain:Array(120).fill(2),showers:Array(120).fill(0.5),snow_depth:Array(120).fill(0),snowfall:Array(120).fill(0),wind_speed_10m:Array(120).fill(10),wind_gusts_10m:Array(120).fill(20)}}}};}
it('fires at the exact rain threshold with a dated six-hour interval and retains unknown mileposts',()=>{
 const r=evaluateThresholds(samples,data(),{...EMPTY_RULES,rain6hMm:15},now,now);
 expect(r.alerts[0]).toMatchObject({value:15,threshold:15,from:'2026-10-28T03:00:00.000Z',to:'2026-10-28T09:00:00.000Z',mp:null});
 expect(r.unavailable).toBe(0);
});
it('keeps missing or stale rain unknown instead of treating it as no triggered rule',()=>{
 const d=data();d.points.s.hourly.showers![2]=null;
 expect(evaluateThresholds(samples,d,{...EMPTY_RULES,rain6hMm:15},now,now)).toMatchObject({alerts:[],unavailable:1,checked:1});
 expect(evaluateThresholds(samples,data(),{...EMPTY_RULES,rain6hMm:15},new Date(+now+72*3600000),new Date(+now+7*3600000)).unavailable).toBe(1);
});
it('evaluates future weather against current source freshness and finds an isolated +72h gust',()=>{
 const d=data();d.points.s.hourly.wind_gusts_10m[72]=95;
 const a=futureThresholds(samples,d,{...EMPTY_RULES,gustKmh:90},now);
 expect(a).toHaveLength(1);expect(a[0].from).toBe('2026-10-31T03:00:00.000Z');expect(a[0].value).toBe(95);
 expect(a[0].to).toBe(a[0].from);expect(a[0].label).toMatch(/hour ending/i);
});
it('accepts a freezing temperature rule at zero while rejecting invalid rain thresholds',()=>{
 const r=readRules({temperatureHighC:0,rain6hMm:-1,gustKmh:'90'});
 expect(r.temperatureHighC).toBe(0);expect(r.rain6hMm).toBeNull();expect(r.gustKmh).toBeNull();
 expect(evaluateThresholds(samples,data(),r,now,now).alerts).toHaveLength(1);
 expect(evaluateThresholds(samples,data(),EMPTY_RULES,now,now)).toMatchObject({alerts:[],checked:0,unavailable:0});
});
