// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
vi.mock('../src/components/TrackMap',()=>({default:({network,onSelect}:{network:{samples:unknown[]};onSelect:(s:unknown)=>void})=><button onClick={()=>onSelect(network.samples[0])}>Select test location</button>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('updates the selected-location temperature at +72h and retains a following24h forecast window',async()=>{
  const start=Date.parse('2026-10-28T03:00:00Z');
  vi.setSystemTime(new Date(start+15*60000));
  const fetchedAt=new Date(start).toISOString();
  const sample={id:'w1',subdivision:'Wynyard',chainId:'one',lat:51.7,lon:-103.8,mp:10,positionKm:0};
  const network={metadata:{version:'test',retrievedAt:fetchedAt,sourceVintage:'historical',attribution:'test',snapshotSha256:'x'},subdivisions:[{id:'Wynyard',name:'Wynyard',role:'core',extent:'Test',notes:'',chainIds:['one']}],samples:[sample],tracks:{type:'FeatureCollection',features:[]},assets:{type:'FeatureCollection',features:[]}};
  const h={time:Array.from({length:120},(_,i)=>new Date(start+i*3600000).toISOString()),temperature_2m:Array.from({length:120},(_,i)=>i),precipitation:Array(120).fill(1),rain:Array(120).fill(0.5),showers:Array(120).fill(0.25),snowfall:Array(120).fill(0),snow_depth:Array(120).fill(0),weather_code:Array(120).fill(61),wind_speed_10m:Array(120).fill(10),wind_gusts_10m:Array(120).fill(20)};
  const point={sampleId:sample.id,latitude:sample.lat,longitude:sample.lon,fetchedAt,hourly:h};
  vi.stubGlobal('fetch',async(url:string)=>{
    if(String(url).endsWith('network.json'))return Response.json(network);
    if(String(url).endsWith('weather.json'))return Response.json({fetchedAt,source:'Open-Meteo',points:{w1:point},errors:[]});
    if(String(url).endsWith('gauges.json'))return Response.json({fetchedAt,gauges:[]});
    if(String(url).endsWith('basins.geojson'))return Response.json({type:'FeatureCollection',features:[]});
    return Response.json({fetchedAt,products:{},basins:[],gauges:[],errors:[]});
  });
  render(<App/>);
  fireEvent.click(await screen.findByRole('button',{name:'Select test location'}));
  expect(screen.getByLabelText('Temperature at selected time').textContent).toContain('0');
  fireEvent.change(screen.getByLabelText('Forecast hour offset'),{target:{value:'72'}});
  expect(screen.getByLabelText('Temperature at selected time').textContent).toContain('72');
  expect(screen.getByLabelText('Next24h total water equivalent').textContent).toContain('24');
  expect(screen.getByLabelText('Next24h liquid rain').textContent).toContain('18');
});
