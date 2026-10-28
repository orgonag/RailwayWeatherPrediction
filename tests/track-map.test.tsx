// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import L from 'leaflet';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TrackMap from '../src/components/TrackMap';
import type { MapProps, WeatherLayerProduct } from '../src/map/contracts';
import type { Network } from '../src/types';

const network:Network={
  metadata:{version:'test',retrievedAt:'2026-10-28',sourceVintage:'historical',attribution:'OGL',snapshotSha256:'test'},
  subdivisions:[{id:'Wynyard',name:'Wynyard',role:'core',color:'#155e63',extent:'Bredenbury–Wynyard',notes:'',chainIds:['one','two']}],
  tracks:{type:'FeatureCollection',features:[
    {type:'Feature',properties:{id:'one',subdivision:'Wynyard',color:'#155e63',role:'core'},geometry:{type:'LineString',coordinates:[[-104,51],[-103.9,51.1]]}},
    {type:'Feature',properties:{id:'two',subdivision:'Wynyard',color:'#155e63',role:'core'},geometry:{type:'LineString',coordinates:[[-103.8,51.2],[-103.7,51.3]]}},
  ]},
  assets:{type:'FeatureCollection',features:[]},
  samples:[{id:'s1',subdivision:'Wynyard',chainId:'one',lat:51,lon:-104,mp:10,positionKm:0},{id:'s2',subdivision:'Wynyard',chainId:'two',lat:51.2,lon:-103.8,mp:null,positionKm:0}],
};
const product:WeatherLayerProduct={id:'rain',label:'Forecast precipitation',unit:'mm/h',wmsLayer:'GDPS.ETA_PR',style:'precipitation',sourceUrl:'https://geo.weather.gc.ca/geomet',times:['2026-10-28T06:00:00Z','2026-10-28T07:00:00Z'],runTime:'2026-10-28T00:00:00Z',legendUrl:null,status:'available'};
const props:MapProps={network,weather:null,subdivision:'Wynyard',selected:'s1',metric:'rain',offset:0,now:new Date('2026-10-28T06:00:00Z'),basins:null,showBasins:false,showAssets:false,onSelect:()=>{},onSubdivision:()=>{},fitRequest:0};
let map:L.Map;

beforeEach(()=>{
  // jsdom has SVG elements but does not expose the createSVGRect feature probe.
  (L.Browser as {svg:boolean}).svg=true;
  vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){} unobserve(){}});
  vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(600);
  const create=L.map;
  vi.spyOn(L,'map').mockImplementation((...args)=>{map=create(...args);return map;});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

it('requests the exact WMS validity and removes weather when unavailable without changing the view',()=>{
  const {rerender}=render(<TrackMap {...props} weatherLayer={product} layerTime="2026-10-28T06:00:00Z"/>);
  const tiles=()=>[...document.querySelectorAll<HTMLImageElement>('.leaflet-weather-pane img')];
  expect(tiles().length).toBeGreaterThan(0);
  let query=new URL(tiles()[0].src).searchParams;
  expect(query.get('time')).toBe('2026-10-28T06:00:00Z');
  expect(query.get('styles')).toBe('precipitation');
  expect(query.get('DIM_REFERENCE_TIME')).toBe('2026-10-28T00:00:00Z');
  act(()=>{map.setView([51.1,-103.9],9,{animate:false});});
  const center=map.getCenter(),zoom=map.getZoom();
  rerender(<TrackMap {...props} weatherLayer={product} layerTime="2026-10-28T07:00:00Z"/>);
  query=new URL(tiles()[0].src).searchParams;
  expect(query.get('time')).toBe('2026-10-28T07:00:00Z');
  expect(map.getCenter()).toEqual(center);
  expect(map.getZoom()).toBe(zoom);
  rerender(<TrackMap {...props} weatherLayer={{...product,status:'unavailable'}} layerTime={null}/>);
  expect(tiles()).toHaveLength(0);
  expect(screen.getByRole('status').textContent).toMatch(/unavailable/i);
  expect(map.getCenter()).toEqual(center);
});

it('reports failed weather tiles as missing data',()=>{
  render(<TrackMap {...props} weatherLayer={product} layerTime="2026-10-28T06:00:00Z"/>);
  const tile=document.querySelector('.leaflet-weather-pane img');
  expect(tile).not.toBeNull();
  fireEvent.error(tile!);
  expect(screen.getByRole('status').textContent).toMatch(/missing|unavailable/i);
});

it('serializes canonical UTC instants at provider-supported seconds precision without changing metadata',()=>{
  const canonical:WeatherLayerProduct={...product,times:['2026-10-31T06:00:00.000Z'],runTime:'2026-10-28T06:00:00.000Z'};
  render(<TrackMap {...props} weatherLayer={canonical} layerTime="2026-10-31T06:00:00.000Z"/>);
  const tile=document.querySelector<HTMLImageElement>('.leaflet-weather-pane img');
  expect(tile).not.toBeNull();
  const query=new URL(tile!.src).searchParams;
  expect(query.get('time')).toBe('2026-10-31T06:00:00Z');
  expect(query.get('DIM_REFERENCE_TIME')).toBe('2026-10-28T06:00:00Z');
  expect(canonical.times).toEqual(['2026-10-31T06:00:00.000Z']);
  expect(canonical.runTime).toBe('2026-10-28T06:00:00.000Z');
});

it('can zoom after replacing or removing weather without detached grid event handlers',()=>{
  const {rerender}=render(<TrackMap {...props} weatherLayer={product} layerTime="2026-10-28T06:00:00Z"/>);
  rerender(<TrackMap {...props} weatherLayer={product} layerTime="2026-10-28T07:00:00Z"/>);
  expect(()=>act(()=>{map.setView([51.15,-103.85],8,{animate:false});})).not.toThrow();
  rerender(<TrackMap {...props} weatherLayer={null} layerTime={null}/>);
  expect(()=>act(()=>{map.setView([51.1,-103.9],9,{animate:false});})).not.toThrow();
  expect(screen.getByRole('region',{name:'Interactive railway track and forecast map'})).toBeTruthy();
});

it('fits all independent chains when returning to an empty subdivision filter',()=>{
  const all:Network={...network,tracks:{type:'FeatureCollection',features:[...network.tracks.features,
    {type:'Feature',properties:{id:'far',subdivision:'Hardisty',color:'#155e63',role:'core'},geometry:{type:'LineString',coordinates:[[-113,54],[-112.8,54.1]]}},
  ]}};
  const {rerender}=render(<TrackMap {...props} network={all}/>);
  expect(map.getBounds().contains([54,-113])).toBe(false);
  rerender(<TrackMap {...props} network={all} subdivision="" fitRequest={1}/>);
  expect(map.getBounds().contains([54,-113])).toBe(true);
  expect(map.getBounds().contains([51,-104])).toBe(true);
});

it('respects an explicit cleared selection and keeps overview labels sparse',()=>{
  render(<TrackMap {...props} selection={null}/>);
  expect(document.querySelectorAll('.rwp-sample-marker.is-selected')).toHaveLength(0);
  act(()=>{map.setZoom(6,{animate:false});});
  expect(document.querySelectorAll('.rwp-value-tooltip')).toHaveLength(0);
  expect(screen.getAllByRole('button',{name:/Wynyard.*milepost|Wynyard.*MP/})).toHaveLength(2);
});

it('keeps disconnected rail chains independent and provides safe keyboard sample and gauge selection',()=>{
  const onSelect=vi.fn(),onGauge=vi.fn();
  render(<TrackMap {...props} onSelect={onSelect} showGauges onGauge={onGauge} gauges={[{station:'05MA011',name:'<img src=x onerror=alert(1)>',lat:51.05,lon:-103.95,time:null,levelM:null,dischargeM3s:null,previousTime:null,previousLevelM:null,sourceUrl:'https://wateroffice.ec.gc.ca'}]}/>);
  const railLines:L.Polyline[]=[];
  map.eachLayer(layer=>{if(layer instanceof L.Polyline&&layer.options.pane==='rail')railLines.push(layer);});
  expect(railLines).toHaveLength(2);
  expect(railLines.map(line=>(line.getLatLngs() as L.LatLng[]).length)).toEqual([2,2]);
  fireEvent.keyDown(screen.getByRole('button',{name:/Wynyard.*calculated MP 10.0/i}),{key:'Enter',keyCode:13,charCode:13});
  expect(onSelect.mock.calls[0][0].id).toBe('s1');
  const gauge=screen.getByRole('button',{name:/Gauge 05MA011/});
  fireEvent.keyDown(gauge,{key:'Enter',keyCode:13,charCode:13});
  expect(onGauge).toHaveBeenCalledWith('05MA011');
  expect(document.querySelector('img[onerror]')).toBeNull();
});

it('passes the clicked independent chain and map location to the track selection handler',()=>{
  const onTrackClick=vi.fn(),onSubdivision=vi.fn();
  render(<TrackMap {...props} onTrackClick={onTrackClick} onSubdivision={onSubdivision}/>);
  let clicked:L.Polyline|undefined;
  map.eachLayer(layer=>{if(layer instanceof L.Polyline&&layer.options.pane==='rail'&&layer.feature?.properties.id==='two')clicked=layer;});
  expect(clicked).toBeDefined();
  act(()=>{clicked!.fire('click',{latlng:L.latLng(51.25,-103.75)});});
  expect(onTrackClick).toHaveBeenCalledWith('two',51.25,-103.75);
  expect(onSubdivision).not.toHaveBeenCalled();
});

it('allows snow water fill independently from basin outlines and selects by public station identity',()=>{
  const onBasin=vi.fn();
  const basins:MapProps['basins']={type:'FeatureCollection',features:[{type:'Feature',properties:{StationNum:'05MA011',NameNom:'Birch Creek',Area_km2:1137.33},geometry:{type:'Polygon',coordinates:[[[-104.2,50.9],[-103.6,50.9],[-103.6,51.4],[-104.2,50.9]]]}}]};
  const snowpack:MapProps['snowpack']={fetchedAt:'2026-10-28T06:00:00Z',errors:[],basins:[{station:'05MA011',name:'Birch Creek',time:'2026-10-28T06:00:00Z',sweMm:32,snowDepthCm:null,seasonalMeanMm:null,coverageFraction:1,sampleCount:4,method:'Model grid samples',sourceUrl:'https://example.org'}]};
  const {rerender}=render(<TrackMap {...props} basins={basins} snowpack={snowpack} showSnowpack showBasins={false} onBasin={onBasin}/>);
  expect(document.querySelectorAll('.leaflet-basin-snow-pane path')).toHaveLength(1);
  expect(document.querySelectorAll('.leaflet-basin-outline-pane path')).toHaveLength(0);
  fireEvent.click(document.querySelector('.leaflet-basin-snow-pane path')!);
  expect(onBasin).toHaveBeenCalledWith('05MA011');
  rerender(<TrackMap {...props} basins={basins} snowpack={snowpack} showSnowpack={false} showBasins onBasin={onBasin}/>);
  expect(document.querySelectorAll('.leaflet-basin-snow-pane path')).toHaveLength(0);
  expect(document.querySelectorAll('.leaflet-basin-outline-pane path')).toHaveLength(1);
});

it('holds the completed image while a slow next frame loads, then swaps only on load',()=>{
  const onWeatherFrame=vi.fn();
  const {rerender}=render(<TrackMap {...props} onWeatherFrame={onWeatherFrame} weatherLayer={product} layerTime={product.times[0]}/>);
  const layers=()=>{const found:L.TileLayer.WMS[]=[];map.eachLayer(l=>{if(l instanceof L.TileLayer.WMS)found.push(l);});return found;};
  const first=layers()[0];act(()=>{first.fire('load');});
  expect(onWeatherFrame.mock.lastCall?.[0].status).toBe('ready');
  rerender(<TrackMap {...props} onWeatherFrame={onWeatherFrame} weatherLayer={product} layerTime={product.times[1]}/>);
  expect(layers()).toHaveLength(2);
  expect(onWeatherFrame.mock.lastCall?.[0]).toMatchObject({status:'loading',displayedTime:product.times[0]});
  expect(screen.getByRole('status').textContent).toContain('Showing previous image');
  act(()=>{layers().find(l=>l!==first)!.fire('load');});
  expect(layers()).toHaveLength(1);
  expect(onWeatherFrame.mock.lastCall?.[0]).toMatchObject({status:'ready',displayedTime:product.times[1]});
});

it('changes opacity without requesting another frame and bounds weather requests to the rail region',()=>{
 const {rerender}=render(<TrackMap {...props} weatherLayer={product} layerTime={product.times[0]}/>);
 let layer:L.TileLayer.WMS|undefined;map.eachLayer(l=>{if(l instanceof L.TileLayer.WMS)layer=l;});
 act(()=>{layer!.fire('load');});
 const tiles=[...document.querySelectorAll('.leaflet-weather-pane img')];
 rerender(<TrackMap {...props} weatherLayer={product} layerTime={product.times[0]} weatherOpacity={.3}/>);
 expect([...document.querySelectorAll('.leaflet-weather-pane img')]).toEqual(tiles);
 expect(layer!.options.opacity).toBe(.3);
 expect((layer!.options.bounds as L.LatLngBounds).contains([51,-104])).toBe(true);
 expect((layer!.options.bounds as L.LatLngBounds).contains([49,-123])).toBe(false);
 expect(layer!.options.maxNativeZoom).toBe(8);
});

it('times out slow imagery with an explicit paused/error state',()=>{
 vi.useFakeTimers();const onWeatherFrame=vi.fn();
 render(<TrackMap {...props} onWeatherFrame={onWeatherFrame} weatherLayer={product} layerTime={product.times[0]}/>);
 act(()=>{vi.advanceTimersByTime(25000);});
 expect(onWeatherFrame.mock.lastCall?.[0].status).toBe('error');
 expect(screen.getByRole('status').textContent).toContain('Playback paused');
 vi.useRealTimers();
});

it('exposes an independently selectable calculated mile reference and regional basin',()=>{
 const onAsset=vi.fn(),onBasin=vi.fn();
 const withAsset:Network={...network,assets:{type:'FeatureCollection',features:[{type:'Feature',properties:{id:'mile-10',kind:'milepost',name:'Mile 10 · calculated',subdivision:'Wynyard',mp:10},geometry:{type:'Point',coordinates:[-104,51]}}]}};
 render(<TrackMap {...props} network={withAsset} selection={{kind:'asset',id:'mile-10'}} assetVisibility={{gauges:false,basins:false,assets:false,snowpack:false,mileposts:true}} onAsset={onAsset} showMajorBasins onBasin={onBasin} majorBasins={{type:'FeatureCollection',features:[{type:'Feature',properties:{id:'regional-one',name:'Regional One'},geometry:{type:'Polygon',coordinates:[[[-104.2,50.9],[-103.6,50.9],[-103.6,51.4],[-104.2,50.9]]]}}]}}/>);
 fireEvent.click(screen.getByRole('button',{name:/Mile 10 · calculated/}));expect(onAsset).toHaveBeenCalledWith('mile-10');
 fireEvent.click(screen.getByRole('button',{name:/Regional One · regional/}));expect(onBasin).toHaveBeenCalledWith('regional-one');
});
