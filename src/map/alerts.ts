import type { Sample, WeatherSnapshot } from '../types';
import { forecastFresh, hourDate, HOUR, liquidRain, sumHours, valueAt } from './weather';
export interface ThresholdRules {rain6hMm:number|null;rain24hMm:number|null;gustKmh:number|null;snow24hCm:number|null;temperatureHighC:number|null;temperatureLowC:number|null}
export const EMPTY_RULES:ThresholdRules={rain6hMm:null,rain24hMm:null,gustKmh:null,snow24hCm:null,temperatureHighC:null,temperatureLowC:null};
export interface ThresholdAlert {id:string;sampleId:string;subdivision:string;mp:number|null;rule:keyof ThresholdRules;label:string;value:number;threshold:number;unit:string;from:string;to:string;fetchedAt:string}
export const RULE_INFO:{key:keyof ThresholdRules;label:string;unit:string;hours:number;min?:number}[]=[
  {key:'rain6hMm',label:'Rain in 6 hours',unit:'mm',hours:6,min:0},
  {key:'rain24hMm',label:'Rain in 24 hours',unit:'mm',hours:24,min:0},
  {key:'gustKmh',label:'Wind gusts',unit:'km/h',hours:0,min:0},
  {key:'snow24hCm',label:'Snowfall in 24 hours',unit:'cm',hours:24,min:0},
  {key:'temperatureHighC',label:'High air temperature',unit:'°C',hours:0},
  {key:'temperatureLowC',label:'Low air temperature',unit:'°C',hours:0}
];
export function readRules(value:unknown):ThresholdRules {
  const output={...EMPTY_RULES};if(!value||typeof value!=='object')return output;
  for(const rule of RULE_INFO){const v=(value as Record<string,unknown>)[rule.key];if(typeof v==='number'&&Number.isFinite(v)&&(rule.min===undefined||v>rule.min))output[rule.key]=v;}return output;
}
export function evaluateThresholds(samples:Sample[],weather:WeatherSnapshot|null,rules:ThresholdRules,at:Date,now:Date):{alerts:ThresholdAlert[];checked:number;unavailable:number} {
  const alerts:ThresholdAlert[]=[];let checked=0,unavailable=0;const when=hourDate(at);
  for(const sample of samples)for(const rule of RULE_INFO){
    const threshold=rules[rule.key];if(threshold===null||!Number.isFinite(threshold))continue;
    checked++;const point=weather?.points[sample.id];if(!forecastFresh(point,now)){unavailable++;continue;}
    const value=rule.key==='rain6hMm'?liquidRain(point,when,6):rule.key==='rain24hMm'?liquidRain(point,when,24):rule.key==='snow24hCm'?sumHours(point,'snowfall',when,24):rule.key==='gustKmh'?valueAt(point,'wind_gusts_10m',when):valueAt(point,'temperature_2m',when);
    if(value===null){unavailable++;continue;}
    if(rule.key==='temperatureLowC'?value>threshold:value<threshold)continue;
    alerts.push({id:sample.id+':'+rule.key+':'+when.toISOString(),sampleId:sample.id,subdivision:sample.subdivision,mp:sample.mp,rule:rule.key,label:rule.key==='gustKmh'?rule.label+' · hour ending':rule.label,value,threshold,unit:rule.unit,from:when.toISOString(),to:new Date(when.getTime()+rule.hours*HOUR).toISOString(),fetchedAt:point!.fetchedAt});
  }return {alerts,checked,unavailable};
}
export function futureThresholds(samples:Sample[],weather:WeatherSnapshot|null,rules:ThresholdRules,now:Date):ThresholdAlert[] {
  const seen=new Set<string>(),output:ThresholdAlert[]=[];
  for(let h=0;h<=72;h++)for(const item of evaluateThresholds(samples,weather,rules,new Date(hourDate(now).getTime()+h*HOUR),now).alerts){const key=item.sampleId+':'+item.rule;if(!seen.has(key)){seen.add(key);output.push(item);}}
  return output;
}
