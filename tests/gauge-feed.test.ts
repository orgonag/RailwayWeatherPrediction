import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GaugeHistory } from '../src/map/contracts';
import { refreshGaugeObservations } from '../src/map/gauge-feed';
import { buildGaugeSeries } from '../src/map/hydrology';

const station = '05MA011';
const clock = new Date('2026-10-28T12:00:00Z');
const gauge = (): GaugeHistory & { sourceMetadata: object } => ({
  station, name: 'Birch Creek', lat: 51.747, lon: -103.87, datum: 'CGVD2013',
  sourceUrl: 'https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=05MA011',
  observations: [{time:'2026-10-27T12:00:00Z',levelM:540,dischargeM3s:1}],
  daily: [{date:'2023-10-28',levelM:542,dischargeM3s:0}], historyAvailableThrough:'2024-12-31',
  sourceMetadata: {levelContinuityBreaks:['2025-06-10'],historicalLevelDatumVerified:true},
  errors: ['Daily archive ends 2024-12-31.', 'No current station observations were returned in the preceding 30 days.'],
});
const feature = (time: string, values: Record<string, unknown> = {}, coordinates: unknown = [-103.8,51.8]) => ({
  type:'Feature', id:`${station}.${time}`, geometry:{type:'Point',coordinates},
  properties:{STATION_NUMBER:station,IDENTIFIER:`${station}.${time}`,DATETIME:time,LEVEL:540.1,DISCHARGE:0,...values},
});
const collection = (features: unknown[], links: unknown[] = []) => ({type:'FeatureCollection',features,links});
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(clock); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('requests the actual last 30 days, preserves archive metadata, and replaces sorted native readings including zero/null/qualifiers', async () => {
  const original = gauge();
  const calls: URL[] = [];
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    calls.push(new URL(input));
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return Response.json(collection([
      feature('2026-10-28T11:55:00Z',{LEVEL:null,DISCHARGE:0,DISCHARGE_SYMBOL_EN:'Ice Conditions'}),
      feature('2026-10-28T11:50:00Z',{LEVEL:540,DISCHARGE:null,LEVEL_SYMBOL_EN:'Partial Day'}),
    ]));
  });
  const result = await refreshGaugeObservations(original);
  expect(calls[0].origin+calls[0].pathname).toBe('https://api.weather.gc.ca/collections/hydrometric-realtime/items');
  expect(calls[0].searchParams.get('STATION_NUMBER')).toBe(station);
  expect(calls[0].searchParams.get('datetime')).toBe('2026-09-28T12:00:00.000Z/2026-10-28T12:00:00.000Z');
  expect(calls[0].searchParams.get('limit')).toBe('10000');
  expect(result.daily).toBe(original.daily);
  expect((result as typeof original).sourceMetadata).toBe(original.sourceMetadata);
  expect(result.sourceUrl).toBe(original.sourceUrl);
  expect(result.datum).toBe('CGVD2013');
  expect(result.observations).toEqual([
    {time:'2026-10-28T11:50:00Z',levelM:540,dischargeM3s:null,levelQualifier:'Partial Day'},
    {time:'2026-10-28T11:55:00Z',levelM:null,dischargeM3s:0,dischargeQualifier:'Ice Conditions'},
  ]);
  expect(result.lat).toBe(51.8);
  expect(result.lon).toBe(-103.8);
  expect(result.errors.join(' ')).toMatch(/Daily archive ends/);
  expect(result.errors.join(' ')).not.toMatch(/No current station observations/);
  expect(buildGaugeSeries(result,clock,'7d','flow').actual.segments).toHaveLength(0);
  expect(original.observations[0].time).toBe('2026-10-27T12:00:00Z');
});

it('follows provider pagination and deduplicates one instant without discarding quality symbols', async () => {
  const next = 'https://api.weather.gc.ca/collections/hydrometric-realtime/items?STATION_NUMBER=05MA011&limit=10000&offset=10000';
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: string) => {
    calls.push(input);
    return Response.json(calls.length === 1 ? collection([feature('2026-10-28T11:50:00Z')],[{rel:'next',href:next}]) : collection([
      feature('2026-10-28T11:50:00Z',{DISCHARGE:0.2,DISCHARGE_SYMBOL_EN:'Estimated'}),
      feature('2026-10-28T11:55:00Z'),
    ]));
  });
  const result = await refreshGaugeObservations(gauge());
  expect(calls).toHaveLength(2);
  expect(new URL(calls[1]).searchParams.get('offset')).toBe('10000');
  expect(result.observations).toHaveLength(2);
  expect(result.observations[0]).toMatchObject({dischargeM3s:0.2,dischargeQualifier:'Estimated'});
});

it('clears stale readings after a valid empty response, retaining archive and relocation evidence', async () => {
  const original = gauge();
  vi.stubGlobal('fetch',async () => Response.json(collection([])));
  const result = await refreshGaugeObservations(original);
  expect(result.observations).toEqual([]);
  expect(result.errors.join(' ')).toMatch(/No current.*30 days/);
  expect(result.daily).toBe(original.daily);
  expect((result as typeof original).sourceMetadata).toBe(original.sourceMetadata);
});

it('rejects bad station IDs, calendar times and out-of-window readings while keeping numeric unknowns distinct from zero', async () => {
  vi.stubGlobal('fetch', async () => Response.json(collection([
    feature('2026-10-28T11:50:00Z',{STATION_NUMBER:'05KB003'},[0,0]),
    feature('2026-10-28T11:51:00Z',{IDENTIFIER:'05KB003.2026-10-28T11:51:00Z'},[0,0]),
    feature('2026-02-30T00:00:00Z'), feature('2026-10-28T24:00:00Z'),
    feature('2026-10-28T12:05:00Z'), feature('2026-09-27T12:00:00Z'),
    feature('2026-10-28T11:55:00Z',{LEVEL:'540',DISCHARGE:false},[300,95]),
    feature('2026-10-28T11:56:00Z',{LEVEL:0,DISCHARGE:null},[300,95]),
  ])));
  const result = await refreshGaugeObservations(gauge());
  expect(result.observations).toEqual([
    {time:'2026-10-28T11:55:00Z',levelM:null,dischargeM3s:null},
    {time:'2026-10-28T11:56:00Z',levelM:0,dischargeM3s:null},
  ]);
  expect(result.lat).toBe(51.747);
  expect(result.lon).toBe(-103.87);
  expect(result.errors.join(' ')).toMatch(/discarded 6/i);
});

it.each([
  {name:'HTTP failure', response:() => new Response('unavailable',{status:503}), want:/503/},
  {name:'invalid response',response:() => Response.json({features:[]}),want:/invalid/i},
  {name:'silently truncated response',response:() => Response.json({...collection([]),numberMatched:3}),want:/incomplete|truncat/i},
  {name:'wrong-station pagination',response:() => Response.json(collection([],[{rel:'next',href:'https://api.weather.gc.ca/collections/hydrometric-realtime/items?STATION_NUMBER=05KB003'}])),want:/pagination/i},
])('throws on $name so the caller can retain its explicitly dated cache', async ({response,want}) => {
  const original = gauge();
  vi.stubGlobal('fetch',async () => response());
  await expect(refreshGaugeObservations(original)).rejects.toThrow(want);
  expect(original.observations).toHaveLength(1);
});

it('refuses an unbounded fourth page rather than returning a partial graph', async () => {
  let calls = 0;
  vi.stubGlobal('fetch',async () => { calls++; return Response.json(collection([],[{rel:'next',href:`https://api.weather.gc.ca/collections/hydrometric-realtime/items?STATION_NUMBER=05MA011&offset=${calls*10000}`}])) });
  await expect(refreshGaugeObservations(gauge())).rejects.toThrow(/page|budget|bound/i);
  expect(calls).toBe(3);
});

it('propagates caller cancellation and aborts a provider that exceeds its request deadline', async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch',async (_input: string, init: RequestInit) => new Promise((_resolve,reject) => {
    const signal = init.signal!;
    signals.push(signal);
    signal.addEventListener('abort',() => reject(signal.reason),{once:true});
  }));
  const controller = new AbortController();
  const cancelled = refreshGaugeObservations(gauge(),controller.signal);
  const cancellation = expect(cancelled).rejects.toThrow(/cancelled/);
  controller.abort(new Error('cancelled by selection change'));
  await cancellation;
  expect(signals[0].aborted).toBe(true);
  const hanging = refreshGaugeObservations(gauge());
  const deadline = expect(hanging).rejects.toThrow(/timed out/i);
  await vi.advanceTimersByTimeAsync(20_001);
  await deadline;
  expect(signals[1].aborted).toBe(true);
});
