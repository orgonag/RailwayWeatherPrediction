import { afterEach, expect, it, vi } from 'vitest';
import type { FeatureCollection, Polygon } from 'geojson';
import type { WeatherLayerProduct } from '../src/map/contracts';
import { basinRasterMean, readFloatGeoTiff, refreshBasinSnow } from '../src/map/snow-feed';

// Same 2×2 geographic pixel-area fixture and independent expected values as Python.
function floatTiff(values:number[], compression=1):ArrayBuffer {
  const entries:[number,number,number[]][]=[
    [256,4,[2]],[257,4,[2]],[258,3,[32]],[259,3,[compression]],
    [273,4,[0]],[277,3,[1]],[278,4,[2]],[279,4,[values.length*4]],[339,3,[3]],
    [33550,12,[1,1,0]],[33922,12,[0,0,0,-106,52,0]],
    [34735,3,[1,1,0,3,1024,0,1,2,1025,0,1,1,2048,0,1,4326]],
  ];
  const directoryEnd=8+2+entries.length*12+4;
  const extraSize=entries.reduce((sum,[,kind,vals])=>sum+(vals.length*({3:2,4:4,12:8}[kind]??0)>4?vals.length*({3:2,4:4,12:8}[kind]??0):0),0);
  const pixels=directoryEnd+extraSize, buffer=new ArrayBuffer(pixels+values.length*4), view=new DataView(buffer);
  view.setUint8(0,73);view.setUint8(1,73);view.setUint16(2,42,true);view.setUint32(4,8,true);view.setUint16(8,entries.length,true);
  let extra=directoryEnd;
  entries.forEach(([tag,kind,vals],index)=>{
    const entry=10+index*12,size=kind===3?2:kind===4?4:8;
    view.setUint16(entry,tag,true);view.setUint16(entry+2,kind,true);view.setUint32(entry+4,vals.length,true);
    let start=entry+8;
    if(vals.length*size>4){start=extra;view.setUint32(entry+8,extra,true);extra+=vals.length*size;}
    vals.forEach((value,i)=>kind===3?view.setUint16(start+i*size,value,true):kind===4?view.setUint32(start+i*size,tag===273?pixels:value,true):view.setFloat64(start+i*size,value,true));
  });
  values.forEach((value,index)=>view.setFloat32(pixels+index*4,value,true));
  return buffer;
}
const polygon:Polygon={type:'Polygon',coordinates:[[[-106,50],[-104,50],[-104,52],[-106,52],[-106,50]]]};
const basins:FeatureCollection={type:'FeatureCollection',features:[
  {type:'Feature',properties:{StationNum:'05MA011',NameNom:'Birch Creek'},geometry:polygon},
  {type:'Feature',properties:{StationNum:'05KB003',NameNom:'Carrot River'},geometry:polygon},
]};
const product:WeatherLayerProduct={id:'snowpack',label:'CaLDAS SWE',unit:'mm SWE',wmsLayer:'CaLDAS-NSRPS_2.5km_SnowWaterEquiv',sourceUrl:'https://geo.weather.gc.ca/geomet',times:['2026-10-27T18:00:00Z'],runTime:'2026-10-27T18:00:00Z',legendUrl:null,status:'available'};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

it('decodes real zero separately from model missing sentinel and weights valid sampled area',()=>{
  const raster=readFloatGeoTiff(floatTiff([0,4,1e30,8]));
  expect(raster.values[0]).toBe(0);expect(raster.values[2]).toBeGreaterThan(1e20);
  const mean=basinRasterMean(raster,polygon),north=Math.cos(51.5*Math.PI/180),south=Math.cos(50.5*Math.PI/180);
  expect(mean.mean).toBeCloseTo((4*north+8*south)/(2*north+south),10);
  expect(mean.count).toBe(3);expect(mean.coverage).toBeCloseTo((2*north+south)/(2*north+2*south),10);
});
it('excludes polygon holes and applies the same half-open center boundary rule as Python',()=>{
  const hole:Polygon={...polygon,coordinates:[...polygon.coordinates,[[-106,51],[-105,51],[-105,52],[-106,52],[-106,51]]]};
  expect(basinRasterMean(readFloatGeoTiff(floatTiff([0,4,1e30,8])),hole).count).toBe(2);
  const boundary:Polygon={type:'Polygon',coordinates:[[[-105.5,50.5],[-104.5,50.5],[-104.5,51.5],[-105.5,51.5],[-105.5,50.5]]]};
  expect(basinRasterMean(readFloatGeoTiff(floatTiff([1,2,3,4])),boundary)).toMatchObject({mean:3,count:1,cells:1,coverage:1});
});
it('preserves all missing as unknown while four numeric zero samples produce zero SWE',()=>{
  expect(basinRasterMean(readFloatGeoTiff(floatTiff([1e30,NaN,-1,Infinity])),polygon)).toMatchObject({mean:null,count:0,coverage:0});
  expect(basinRasterMean(readFloatGeoTiff(floatTiff([0,0,0,0])),polygon)).toMatchObject({mean:0,count:4,coverage:1});
});
it('rejects compressed, truncated and non-TIFF responses',()=>{
  for(const buffer of [floatTiff([0,0,0,0],5),floatTiff([0,0,0,0]).slice(0,-2),new TextEncoder().encode('<ServiceException>NoMatch</ServiceException>').buffer]){
    expect(()=>readFloatGeoTiff(buffer)).toThrow();
  }
});
it('fetches only the two bounded SWE subsets, pinning analysis valid time and run with browser-readable headers',async()=>{
  const requests:URL[]=[];
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{
    requests.push(new URL(String(input)));
    // Actual GeoMet CORS does not expose Content-Disposition. Content-Type is readable.
    return new Response(floatTiff([0,4,1e30,8]),{headers:{'Content-Type':'image/tiff'}});
  });
  const snapshot=await refreshBasinSnow(basins,product);
  expect(snapshot.basins).toHaveLength(2);expect(snapshot.errors).toEqual([]);expect(requests).toHaveLength(2);
  for(const url of requests){
    expect(url.origin).toBe('https://geo.weather.gc.ca');expect(url.searchParams.get('request')).toBe('GetCoverage');
    // GeoMet's dimension matcher rejects otherwise equivalent .000Z timestamps.
    expect(url.searchParams.get('time')).toBe('2026-10-27T18:00:00Z');
    expect(url.searchParams.get('dim_reference_time')).toBe('2026-10-27T18:00:00Z');
    expect(url.searchParams.getAll('subset')).toEqual(['lat(50,52)','long(-106,-104)']);
  }
  expect(snapshot.basins[0]).toMatchObject({station:'05MA011',sampleCount:3,snowDepthCm:null,seasonalMeanMm:null});
  expect(Date.parse(snapshot.basins[0].time!)).toBe(Date.parse('2026-10-27T18:00:00Z'));
});
it('rejects unavailable products and inconsistent analysis reference time before requesting a grid',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(refreshBasinSnow(basins,{...product,status:'unavailable'})).rejects.toThrow();
  await expect(refreshBasinSnow(basins,{...product,runTime:'2026-10-27T12:00:00Z'})).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it('throws on provider XML and CORS/network failure so callers can retain the dated cache',async()=>{
  vi.stubGlobal('fetch',async()=>new Response('<ServiceException>NoMatch</ServiceException>',{headers:{'Content-Type':'text/xml'}}));
  await expect(refreshBasinSnow(basins,product)).rejects.toThrow();
  vi.stubGlobal('fetch',async()=>{throw new TypeError('Failed to fetch');});
  await expect(refreshBasinSnow(basins,product)).rejects.toThrow('Failed to fetch');
});
it('does not start network requests after the caller has aborted',async()=>{
  const controller=new AbortController();controller.abort();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(refreshBasinSnow(basins,product,controller.signal)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
});
it('uses the latest advertised analysis rather than an older array entry',async()=>{
  const requests:URL[]=[];
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{requests.push(new URL(String(input)));return new Response(floatTiff([0,0,0,0]),{headers:{'Content-Type':'image/tiff'}});});
  const snapshot=await refreshBasinSnow(basins,{...product,times:['2026-10-27T18:00:00Z','2026-10-27T12:00:00Z']});
  expect(requests.every(url=>url.searchParams.get('time')==='2026-10-27T18:00:00Z')).toBe(true);
  expect(snapshot.basins.every(basin=>Date.parse(basin.time!)===Date.parse('2026-10-27T18:00:00Z'))).toBe(true);
});
it('aborts stalled grid requests after the 30-second download limit',async()=>{
  vi.useFakeTimers();
  vi.stubGlobal('fetch',(_input:RequestInfo|URL,options:RequestInit)=>new Promise((_resolve,reject)=>{
    options.signal!.addEventListener('abort',()=>reject(options.signal!.reason),{once:true});
  }));
  const rejected=expect(refreshBasinSnow(basins,product)).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30000);await rejected;
});
