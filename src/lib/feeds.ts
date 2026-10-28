import type { ForecastPoint, Sample, WeatherSnapshot } from '../types';
import { utcTime } from './weather';
export async function refreshForecast(samples: Sample[], signal?: AbortSignal): Promise<WeatherSnapshot> {
  if(!samples.length) throw new Error('No weather samples for this subdivision.');
  const q=new URLSearchParams({latitude:samples.map(s=>s.lat).join(','),longitude:samples.map(s=>s.lon).join(','),hourly:'temperature_2m,precipitation,rain,showers,snow_depth,snowfall,weather_code,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m,soil_temperature_0cm,soil_moisture_0_to_1cm',current:'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',past_days:'1',forecast_days:'5',timezone:'GMT',wind_speed_unit:'kmh'});
  const response=await fetch(`https://api.open-meteo.com/v1/forecast?${q}`,{signal});
  if(!response.ok) throw new Error(`Weather provider returned ${response.status}; dated cache retained.`);
  const raw=await response.json(),data=Array.isArray(raw)?raw:[raw],fetchedAt=new Date().toISOString();
  if(data.length!==samples.length) throw new Error('Weather response does not match requested locations.');
  const points:Record<string,ForecastPoint>={};
  data.forEach((r,i)=>{
    const h=r.hourly;
    const fields=['temperature_2m','precipitation','rain','snow_depth','wind_speed_10m','wind_gusts_10m'];
    if(!h||!Array.isArray(h.time)||h.time.length===0||!h.time.every((t:unknown,i:number)=>typeof t==='string'&&Number.isFinite(utcTime(t))&&(i===0||utcTime(t)-utcTime(h.time[i-1])===3600000))||fields.some(key=>!Array.isArray(h[key])||h[key].length!==h.time.length||h[key].some((v:unknown)=>v!==null&&(typeof v!=='number'||!Number.isFinite(v)))))throw new Error('Weather provider returned incomplete or invalid hourly fields; dated cache retained.');
    points[samples[i].id]={...r,sampleId:samples[i].id,fetchedAt};
  });
  return {fetchedAt,source:'Open-Meteo Forecast API',points,errors:[]};
}
