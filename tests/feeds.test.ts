import { afterEach, expect, it, vi } from 'vitest';
import { refreshForecast } from '../src/lib/feeds';
import type { Sample } from '../src/types';
afterEach(()=>vi.unstubAllGlobals());
const samples:Sample[]=[{id:'s',subdivision:'Wynyard',chainId:'c',lat:52,lon:-104,mp:10,positionKm:0}];
it('rejects a provider refresh missing arrays consumed by map and summary',async()=>{
  vi.stubGlobal('fetch',async()=>Response.json({latitude:52,longitude:-104,hourly:{time:['2026-10-27T00:00'],temperature_2m:[2],precipitation:[1]}}));
  await expect(refreshForecast(samples)).rejects.toThrow(/incomplete|invalid/i);
});
