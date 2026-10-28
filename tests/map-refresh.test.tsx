// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { refreshForecast } from '../src/lib/feeds';
import { refreshLayerCatalog } from '../src/map/layers';
import type { ForecastPoint, Network, Sample, WeatherSnapshot } from '../src/types';
import type { BasinSnowSnapshot, HydrologySnapshot, LayerCatalog, MapProps } from '../src/map/contracts';

vi.mock('../src/components/TrackMap', () => ({default: ({network,onSelect,weatherLayer}: MapProps) => <div>
  <output aria-label="Forecast map model run">{weatherLayer?.runTime ?? 'Unavailable'}</output>
  {network.samples.map(sample => <button key={sample.id} onClick={() => onSelect(sample)}>Select {sample.subdivision} sample</button>)}
</div>}));
vi.mock('../src/lib/feeds', () => ({refreshForecast: vi.fn()}));
vi.mock('../src/map/layers', async importOriginal => ({...await importOriginal<typeof import('../src/map/layers')>(), refreshLayerCatalog: vi.fn()}));

const clock = new Date('2026-10-28T03:15:00Z');
const freshAt = '2026-10-28T03:00:00Z';
const staleAt = '2026-10-27T03:00:00Z';
const samples: Sample[] = [
  {id:'a',subdivision:'Wynyard',chainId:'one',lat:51.7,lon:-103.8,mp:10,positionKm:0},
  {id:'b',subdivision:'Melfort',chainId:'two',lat:52.8,lon:-104.6,mp:20,positionKm:0},
];
const network: Network = {
  metadata:{version:'test',retrievedAt:freshAt,sourceVintage:'historical',attribution:'OGL fixture',snapshotSha256:'fixture'},
  subdivisions:samples.map(s => ({id:s.subdivision,name:s.subdivision,role:'core',color:'#234',extent:'Test extent',notes:'Historical test geometry',chainIds:[s.chainId]})),
  samples, tracks:{type:'FeatureCollection',features:[]}, assets:{type:'FeatureCollection',features:[]},
};
function forecastPoint(sample: Sample, fetchedAt: string, temperature: number): ForecastPoint {
  const time = Array.from({length:120}, (_,i) => new Date(Date.parse(freshAt)+i*3_600_000).toISOString());
  const values = (value: number) => Array(time.length).fill(value);
  return {sampleId:sample.id,latitude:sample.lat,longitude:sample.lon,fetchedAt,
    current:{time:freshAt,temperature_2m:temperature,precipitation:0,weather_code:0,wind_speed_10m:10,wind_gusts_10m:20},
    hourly:{time,temperature_2m:values(temperature),precipitation:values(0),rain:values(0),showers:values(0),snowfall:values(0),snow_depth:values(0),weather_code:values(0),wind_speed_10m:values(10),wind_gusts_10m:values(20),wind_direction_10m:values(180),precipitation_probability:values(0),soil_temperature_0cm:values(2),soil_moisture_0_to_1cm:values(0.3)},
  };
}
const weather = (points: ForecastPoint[], fetchedAt = freshAt): WeatherSnapshot => ({fetchedAt,source:'Open-Meteo fixture',points:Object.fromEntries(points.map(point => [point.sampleId,point])),errors:[]});
function catalog(runTime: string): LayerCatalog {
  return {fetchedAt:runTime,sourceUrl:'https://geo.weather.gc.ca/geomet',errors:[],products:{precipitationType:{id:'precipitationType',label:'RDPS precipitation type',unit:'type',wmsLayer:'RDPS_10km_PrecipType-Instant',style:'INSTPRECIPITATIONTYPE',sourceUrl:'https://geo.weather.gc.ca/geomet',times:[freshAt],runTime,legendUrl:null,status:'available'}}};
}
const cachedCatalog = catalog('2026-10-28T00:00:00Z');
const liveCatalog = catalog('2026-10-28T03:00:00Z');
const hydrology: HydrologySnapshot = {fetchedAt:staleAt,gauges:[{station:'05MA011',name:'Birch Creek near Elfros',lat:51.747,lon:-103.87,sourceUrl:'https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=05MA011',datum:'CGVD2013',observations:[{time:staleAt,levelM:540.5,dischargeM3s:0}],daily:[{date:'2023-10-28',levelM:541,dischargeM3s:0.3}],historyAvailableThrough:'2024-12-31',errors:['2025 archive unavailable.']}],errors:[]};
const snow: BasinSnowSnapshot = {fetchedAt:staleAt,basins:[{station:'05MA011',name:'Birch Creek basin',time:staleAt,sweMm:0,snowDepthCm:0,seasonalMeanMm:null,coverageFraction:1,sampleCount:2,method:'Model SWE fixture',sourceUrl:'https://geo.weather.gc.ca/geomet'}],errors:[]};
const basins = {type:'FeatureCollection',features:[{type:'Feature',properties:{StationNum:'05MA011',NameNom:'Birch Creek basin',Area_km2:1137},geometry:{type:'Polygon',coordinates:[[[-104,51],[-103,51],[-103,52],[-104,52],[-104,51]]]}}]};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => {resolve = complete;});
  return {promise,resolve};
}
function installCachedFeeds(hydrologyResponse?: Promise<Response>) {
  const cachedWeather = weather([forecastPoint(samples[0],staleAt,-5),forecastPoint(samples[1],staleAt,-8)],staleAt);
  const files: Record<string, unknown> = {
    'network.json':network,'weather.json':cachedWeather,'map-layers.json':cachedCatalog,
    'gauges.json':{fetchedAt:staleAt,gauges:[{station:'05MA011',name:'Birch Creek near Elfros',lat:51.747,lon:-103.87,time:staleAt,levelM:540.5,dischargeM3s:0,previousTime:null,previousLevelM:null,sourceUrl:hydrology.gauges[0].sourceUrl}]},
    'basins.geojson':basins,'hydrology.json':hydrology,'basin-snow.json':snow,
  };
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = String(input); const file = url.slice(url.lastIndexOf('/')+1);
    if (!(file in files)) throw new Error(`Unexpected network request in App race test: ${url}`);
    return file === 'hydrology.json' && hydrologyResponse ? hydrologyResponse : Response.json(files[file]);
  });
}
beforeEach(() => {localStorage.clear();vi.setSystemTime(clock);vi.mocked(refreshLayerCatalog).mockResolvedValue(liveCatalog);});
afterEach(() => {cleanup();vi.unstubAllGlobals();vi.resetAllMocks();vi.useRealTimers();});

it('retains a newer live catalog and selected forecast when a delayed cached feed finally completes', async () => {
  const slowHydrology = deferred<Response>();
  installCachedFeeds(slowHydrology.promise);
  vi.mocked(refreshForecast).mockResolvedValue(weather([forecastPoint(samples[0],freshAt,12)]));
  render(<App/>);
  const select = await screen.findByRole('button',{name:'Select Wynyard sample'});
  await waitFor(() => expect(screen.getByLabelText('Forecast map model run').textContent).toBe(liveCatalog.products.precipitationType.runTime));
  fireEvent.click(select);
  await waitFor(() => expect(screen.getByLabelText('Temperature at selected time').textContent).toBe('12.0 °C'));
  await waitFor(() => expect((screen.getByRole('button',{name:'Refresh weather'}) as HTMLButtonElement).disabled).toBe(false));
  await act(async () => {slowHydrology.resolve(Response.json(hydrology));});
  expect(screen.getByLabelText('Forecast map model run').textContent).toBe('2026-10-28T03:00:00Z');
  expect(screen.getByLabelText('Temperature at selected time').textContent).toBe('12.0 °C');
});

it('automatically refreshes the newly selected stale route after an earlier route finishes refreshing', async () => {
  installCachedFeeds();
  const firstRoute = deferred<WeatherSnapshot>();
  const requested: string[][] = [];
  vi.mocked(refreshForecast).mockImplementation(async selected => {
    requested.push(selected.map(sample => sample.id));
    if (selected[0]?.id === 'a') return firstRoute.promise;
    if (selected[0]?.id === 'b') return weather([forecastPoint(samples[1],freshAt,22)]);
    throw new Error('Unexpected refresh route');
  });
  render(<App/>);
  fireEvent.click(await screen.findByRole('button',{name:'Select Wynyard sample'}));
  await waitFor(() => expect(requested).toEqual([['a']]));
  fireEvent.change(screen.getByRole('combobox',{name:'Subdivision'}),{target:{value:'Melfort'}});
  fireEvent.click(screen.getByRole('button',{name:'Select Melfort sample'}));
  expect(screen.getByLabelText('Temperature at selected time').textContent).toBe('-8.0 °C');
  await act(async () => {firstRoute.resolve(weather([forecastPoint(samples[0],freshAt,12)]));});
  await waitFor(() => expect(screen.getByLabelText('Temperature at selected time').textContent).toBe('22.0 °C'));
  expect(requested).toEqual([['a'],['b']]);
  expect((screen.getByRole('combobox',{name:'Subdivision'}) as HTMLSelectElement).value).toBe('Melfort');
});
