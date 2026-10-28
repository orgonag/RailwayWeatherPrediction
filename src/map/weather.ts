import type { ForecastPoint } from '../types';
import { forecastIndex, utcTime } from '../lib/weather';
export const HOUR=3600000;
export const hourDate=(date:Date)=>new Date(Math.floor(date.getTime()/HOUR)*HOUR);
export function valueAt(point:ForecastPoint|undefined,field:string,at:Date):number|null {
  const i=forecastIndex(point,at),values=point?.hourly?.[field as keyof ForecastPoint['hourly']];
  const value=i<0?null:values?.[i];return typeof value==='number'&&Number.isFinite(value)?value:null;
}
export function sumHours(point:ForecastPoint|undefined,field:string,at:Date,count:number):number|null {
  const start=forecastIndex(point,at);if(!point||start<0)return null;
  let sum=0;const base=hourDate(at).getTime();
  for(let h=1;h<=count;h++) {
    if(utcTime(point.hourly.time[start+h])!==base+h*HOUR)return null;
    const v=valueAt(point,field,new Date(base+h*HOUR));if(v===null||v<0)return null;sum+=v;
  }return sum;
}
export function liquidRain(point:ForecastPoint|undefined,at:Date,hours:number):number|null {
  const rain=sumHours(point,'rain',at,hours),showers=sumHours(point,'showers',at,hours);
  return rain===null||showers===null?null:rain+showers;
}
export function forecastFresh(point:ForecastPoint|undefined,now:Date):boolean {
  const fetched=point?utcTime(point.fetchedAt):NaN;
  return Number.isFinite(fetched)&&now.getTime()-fetched<=6*HOUR&&fetched<=now.getTime()+HOUR;
}
export function conditionAt(point:ForecastPoint|undefined,at:Date):string {
  const code=valueAt(point,'weather_code',at);
  if(code!==null) {
    if(code===0)return 'Clear';if(code<=3)return 'Cloudy';if(code===45||code===48)return 'Fog';
    if(code===56||code===57)return 'Freezing drizzle';if(code>=51&&code<=55)return 'Drizzle';
    if(code===66||code===67)return 'Freezing rain';if(code>=61&&code<=65)return 'Rain';
    if(code>=71&&code<=77)return 'Snow';if(code>=80&&code<=82)return 'Rain showers';
    if(code===85||code===86)return 'Snow showers';if(code>=95)return 'Thunderstorms';
  }
  const snow=valueAt(point,'snowfall',at),rain=valueAt(point,'rain',at),showers=valueAt(point,'showers',at),total=valueAt(point,'precipitation',at);
  if(snow!==null&&snow>0)return (rain??0)+(showers??0)>0?'Rain and snow':'Snow';
  if(rain!==null&&rain>0||showers!==null&&showers>0)return 'Rain';
  return total===0?'No precipitation':'Type unavailable';
}
export function compass(degrees:number|null):string {
  return degrees===null?'':(['N','NE','E','SE','S','SW','W','NW'][Math.round(degrees/45)%8]);
}
