import type { WeatherSnapshot } from '../types';
const acquired=(value:string)=>Number.isFinite(Date.parse(value))?Date.parse(value):-Infinity;
/** A late bundled cache must not replace a more recently acquired live snapshot. */
export function newerSnapshot<T extends {fetchedAt:string}>(previous:T|null,next:T):T {
  return previous&&acquired(previous.fetchedAt)>=acquired(next.fetchedAt)?previous:next;
}
/** Route refreshes are partial: choose source age per point rather than by response order. */
export function mergeWeather(previous:WeatherSnapshot|null,next:WeatherSnapshot):WeatherSnapshot {
  if(!previous)return next;
  const points={...previous.points};
  for(const [id,point] of Object.entries(next.points))if(!points[id]||acquired(point.fetchedAt)>acquired(points[id].fetchedAt))points[id]=point;
  return {...newerSnapshot(previous,next),points};
}
