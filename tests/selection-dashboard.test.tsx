// @vitest-environment jsdom
import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import SelectionDashboard from '../src/components/SelectionDashboard';
import type { Network } from '../src/types';
afterEach(cleanup);
const now=new Date('2026-10-28T03:00:00Z');
const network:Network={metadata:{version:'test',retrievedAt:now.toISOString(),sourceVintage:'historical',attribution:'test',snapshotSha256:'test'},subdivisions:[],tracks:{type:'FeatureCollection',features:[]},assets:{type:'FeatureCollection',features:[]},samples:[{id:'s',subdivision:'Wynyard',chainId:'a',mp:null,positionKm:0,lat:51,lon:-104}]};
it('shows unavailable threshold checks for a fresh forecast with missing rule inputs',()=>{
 const point={sampleId:'s',latitude:51,longitude:-104,fetchedAt:now.toISOString(),hourly:{time:[now.toISOString()],temperature_2m:[3],precipitation:[null],wind_speed_10m:[5],wind_gusts_10m:[8],snow_depth:[0]}};
 render(<SelectionDashboard selection={{kind:'track',id:'s'}} network={network} weather={{fetchedAt:now.toISOString(),source:'test',points:{s:point},errors:[]}} basins={null} gauges={[]} hydrology={null} snowpack={null} selectedAt={now} now={now} alerts={[]} activeRuleCount={1} incompleteRuleCount={1} onClose={()=>{}} onGauge={()=>{}} onSample={()=>{}} onAlerts={()=>{}}/>);
 expect(screen.getByText('Threshold checks unavailable')).toBeTruthy();
 expect(screen.queryByText('No threshold crossed')).toBeNull();
});
