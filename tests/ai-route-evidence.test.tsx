// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
vi.mock('../src/components/TrackMap',()=>({default:()=>null}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('supplies UTC interpretation and route identity with otherwise offsetless raw forecast times',async()=>{
  vi.stubEnv('VITE_AI_ENDPOINT','https://gateway.example');
  const fetchedAt=new Date().toISOString();
  const rawTime=fetchedAt.slice(0,13)+':00';
  const sample={id:'wynyard-1',subdivision:'Wynyard',chainId:'chain-1',lat:51.7,lon:-103.8,mp:null,positionKm:0};
  const network={metadata:{version:'test',retrievedAt:fetchedAt,sourceVintage:'historical',attribution:'test',snapshotSha256:'a'.repeat(64)},subdivisions:[{id:'Wynyard',name:'Wynyard',role:'core',color:'#000',extent:'test',notes:'test',chainIds:['chain-1']}],samples:[sample],tracks:{type:'FeatureCollection',features:[]},assets:{type:'FeatureCollection',features:[]}};
  const forecast={sampleId:sample.id,latitude:sample.lat,longitude:sample.lon,fetchedAt,hourly:{time:[rawTime],temperature_2m:[4],precipitation:[0],rain:[0],wind_speed_10m:[5],wind_gusts_10m:[10],snow_depth:[0.1]}};
  let sentContext:Record<string,unknown>|undefined;
  vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
    if(String(url)==='https://gateway.example'){
      sentContext=JSON.parse(String(init?.body)).context;
      return Response.json({text:'Review wynyard-1.',metadata:{engineKind:'reasoning',model:'model-snapshot',reasoningEffort:'high',generatedAt:fetchedAt,evidenceAsOf:fetchedAt,evidenceSha256:'a'.repeat(64)}});
    }
    if(String(url).endsWith('network.json'))return Response.json(network);
    if(String(url).endsWith('weather.json'))return Response.json({fetchedAt,source:'Open-Meteo',points:{[sample.id]:forecast},errors:[]});
    if(String(url).endsWith('gauges.json'))return Response.json({fetchedAt,gauges:[]});
    if(String(url).endsWith('basins.geojson'))return Response.json({type:'FeatureCollection',features:[]});
    throw new Error('Unexpected fetch');
  });
  render(<App/>);
  await screen.findByLabelText('Subdivision');
  fireEvent.click(screen.getByRole('button',{name:'More tools'}));
  fireEvent.click(screen.getByRole('button',{name:'AI briefing'}));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Generate AI assessment'}));
  await screen.findByText('Review wynyard-1.');
  expect(sentContext?.forecastTimezone).toBe('UTC');
  expect(sentContext?.displayTimezone).toBe('America/Regina');
  const routes=sentContext?.routeForecasts as {sample:{id:string};forecast:{hourly:{time:string[]}}}[];
  expect(routes[0].sample.id).toBe('wynyard-1');
  expect(routes[0].forecast.hourly.time).toEqual([rawTime]);
});
