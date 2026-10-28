// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { availableLayerTime, parseWmsTimes, productFor, productFromCapabilities, refreshLayerCatalog } from '../src/map/layers';
import type { LayerCatalog, WeatherLayerProduct } from '../src/map/contracts';

const layer:WeatherLayerProduct={id:'temperature',label:'Air temperature',unit:'°C',wmsLayer:'RDPS_10km_AirTemp_2m',sourceUrl:'https://geo.weather.gc.ca/geomet',times:['2026-10-28T02:00:00Z','2026-10-28T04:00:00Z'],runTime:null,legendUrl:null,status:'available'};
afterEach(()=>vi.unstubAllGlobals());

it('expands WMS hourly intervals and explicit times without filling gaps',()=>{
 expect(parseWmsTimes('2026-10-28T02:00:00Z/2026-10-28T04:00:00Z/PT1H,2026-10-28T06:00:00Z')).toEqual(['2026-10-28T02:00:00.000Z','2026-10-28T03:00:00.000Z','2026-10-28T04:00:00.000Z','2026-10-28T06:00:00.000Z']);
});
it('accepts the provider single analysis with PT0H and minute radar cadence',()=>{
 expect(parseWmsTimes('2026-10-27T18:00:00Z/2026-10-27T18:00:00Z/PT0H')).toEqual(['2026-10-27T18:00:00.000Z']);
 expect(parseWmsTimes('2026-10-28T02:00:00Z/2026-10-28T02:12:00Z/PT6M')).toHaveLength(3);
});
it.each(['2026-10-28T02:00/2026-10-28T04:00/PT1H','2026-10-28T02:00Z/2026-10-28T04:00Z/PT0H','2026-10-28T02:00Z/2026-10-28T04:00Z/P1M','2026-10-28T04:00Z/2026-10-28T02:00Z/PT1H','2026-02-30T00:00:00Z','2026-10-28T24:00:00Z','2000-01-01T00:00Z/2030-01-01T00:00Z/PT1S'])('rejects unsafe or unsupported WMS time range %s',value=>{
 expect(()=>parseWmsTimes(value)).toThrow();
});
it('only returns an exact advertised frame, preserving missing hours and unavailable products',()=>{
 expect(availableLayerTime(layer,new Date('2026-10-28T02:00Z'))).toBe('2026-10-28T02:00:00Z');
 expect(availableLayerTime(layer,new Date('2026-10-28T03:00Z'))).toBeNull();
 expect(availableLayerTime(layer,new Date('2026-10-28T02:30Z'))).toBeNull();
 expect(availableLayerTime({...layer,status:'unavailable'},new Date('2026-10-28T02:00Z'))).toBeNull();
 expect(availableLayerTime(layer,new Date('2026-10-31T02:00Z'))).toBeNull();
});
it('selects each precipitation product independently and retains unavailable status',()=>{
 const catalog:LayerCatalog={fetchedAt:'',sourceUrl:'',errors:[],products:{precipitationType:{...layer,id:'type'},precipitationRate:{...layer,id:'rate'},precipitationAccumulation:{...layer,id:'accumulation',status:'unavailable'},temperature:layer,wind:{...layer,id:'wind'}}};
 expect(productFor(catalog,'precipitation','type')?.id).toBe('type');
 expect(productFor(catalog,'precipitation','rate')?.id).toBe('rate');
 expect(productFor(catalog,'precipitation','accumulation')?.status).toBe('unavailable');
 expect(productFor(catalog,'wind','type')?.id).toBe('wind');
 expect(productFor(catalog,'none','type')).toBeNull();
});
const caps=`<WMS_Capabilities xmlns="http://www.opengis.net/wms" xmlns:xlink="http://www.w3.org/1999/xlink"><Capability><Layer><Layer><Name>RDPS_10km_AirTemp_2m</Name><Dimension name="time">2026-10-28T02:00:00Z/2026-10-28T04:00:00Z/PT1H</Dimension><Dimension name="reference_time" default="2026-10-27T18:00:00Z">2026-10-27T12:00:00Z/2026-10-27T18:00:00Z/PT6H</Dimension><Style><Name>TEMPERATURE-LINEAR</Name><LegendURL><OnlineResource xlink:href="https://geo.weather.gc.ca/legend.png"/></LegendURL></Style></Layer></Layer></Capability></WMS_Capabilities>`;
it('parses requested layer and advertised style/run while ignoring parent layer names',()=>{
 const parsed=productFromCapabilities('temperature',caps);
 expect(parsed.status).toBe('available');expect(parsed.times).toHaveLength(3);
 expect(parsed.runTime).toBe('2026-10-27T18:00:00.000Z');expect(parsed.legendUrl).toBe('https://geo.weather.gc.ca/legend.png');
});
it('marks exceptions, absent styles and missing time metadata unavailable',()=>{
 expect(productFromCapabilities('temperature','<ServiceExceptionReport>Bad layer</ServiceExceptionReport>').status).toBe('unavailable');
 expect(productFromCapabilities('temperature',caps.replace('TEMPERATURE-LINEAR','UNKNOWN')).status).toBe('unavailable');
 expect(productFromCapabilities('temperature',caps.replace('name="time"','name="ignored"')).status).toBe('unavailable');
 expect(productFromCapabilities('temperature',caps.replace('name="reference_time"','name="ignored"')).status).toBe('unavailable');
});
it('reports refresh failures per product and does not rebrand stale fallback frames as fresh',async()=>{
 vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>String(input).includes('RDPS_10km_AirTemp_2m')?new Response(caps):new Response('down',{status:503}));
 const catalog=await refreshLayerCatalog();
 expect(catalog.products.temperature.status).toBe('available');expect(catalog.products.precipitationType.status).toBe('unavailable');
 expect(catalog.products.precipitationType.times).toEqual([]);expect(catalog.errors).toHaveLength(6);
});
