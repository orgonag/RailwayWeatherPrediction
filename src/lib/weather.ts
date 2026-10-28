import type { ForecastPoint, WeatherSummary } from '../types';

export function utcTime(time: string): number {
  if(typeof time!=='string')return NaN;
  return Date.parse(/(Z|[+-]\d\d:\d\d)$/.test(time) ? time : `${time}Z`);
}
export function forecastIndex(point: ForecastPoint | undefined, at: Date): number {
  const hour = Math.floor(at.getTime() / 3_600_000) * 3_600_000;
  return Array.isArray(point?.hourly?.time) ? point.hourly.time.findIndex(t => utcTime(t) === hour) : -1;
}
export function summarizeWeather(point: ForecastPoint | undefined, now: Date): WeatherSummary {
  const start = forecastIndex(point, now);
  const hours = point?.hourly;
  const times=hours?.time?.slice(start,start+24)??[];
  const first=times[0]?utcTime(times[0]):NaN;
  const hourlyWindow=start>=0&&times.length===24&&times.every((t,i)=>utcTime(t)===first+i*3600000);
  const window = (values?: (number | null)[],interval=false) => {
    const i=start+(interval?1:0),t=hours?.time?.slice(i,i+24)??[];
    return start<0||!hourlyWindow||t.length!==24||!t.every((v,j)=>utcTime(v)===first+(j+(interval?1:0))*3600000)||!Array.isArray(values)||values.length!==hours?.time?.length?[]:values.slice(i,i+24);
  };
  const valid = (values: (number | null)[]) => values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const complete = (values: (number | null)[]) => values.length === 24 && valid(values).length === 24;
  const rain = window(hours?.precipitation,true),liquid=window(hours?.rain,true),showers=window(hours?.showers,true),temps=window(hours?.temperature_2m);
  const liquidRain=complete(liquid)&&complete(showers)?liquid.map((v,i)=>v!+showers[i]!):[];
  const winds=window(hours?.wind_speed_10m),gusts=window(hours?.wind_gusts_10m,true);
  const fetched = point ? utcTime(point.fetchedAt) : NaN;
  // Six hours is a display freshness rule, not a forecast skill threshold.
  return {
    rain24Mm: complete(rain) ? (rain as number[]).reduce((a,b)=>a+b,0) : null,
    liquidRain24Mm: complete(liquidRain) ? (liquidRain as number[]).reduce((a,b)=>a+b,0) : null,
    positiveDegreeDays: complete(temps) ? (temps as number[]).reduce((a,b)=>a+Math.max(0,b),0)/24 : null,
    minTempC: complete(temps) ? Math.min(...temps as number[]) : null,
    maxTempC: complete(temps) ? Math.max(...temps as number[]) : null,
    maxWindKmh: complete(winds) ? Math.max(...winds as number[]) : null,
    maxGustKmh: complete(gusts) ? Math.max(...gusts as number[]) : null,
    snowDepthM: start >= 0 && Number.isFinite(hours?.snow_depth?.[start]) ? hours!.snow_depth[start] : null,
    validHours: valid(rain).length,
    stale: !Number.isFinite(fetched) || now.getTime()-fetched > 6*3_600_000 || fetched > now.getTime()+3_600_000,
  };
}
