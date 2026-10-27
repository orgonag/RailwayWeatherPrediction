// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import LinearWeather from '../src/components/LinearWeather';
import type { Network } from '../src/types';
afterEach(cleanup);
const network: Network={metadata:{version:'test',retrievedAt:'2026-10-27',sourceVintage:'historical',attribution:'OGL',snapshotSha256:'test'},subdivisions:[],tracks:{type:'FeatureCollection',features:[]},assets:{type:'FeatureCollection',features:[]},samples:[{id:'w1',subdivision:'Wynyard',chainId:'one',lat:51,lon:-104,mp:10,positionKm:1},{id:'w2',subdivision:'Wynyard',chainId:'one',lat:52,lon:-104,mp:null,positionKm:5},{id:'h1',subdivision:'Hardisty',chainId:'two',lat:53,lon:-110,mp:15,positionKm:1}]};
it('shows only the selected subdivision and keeps missing weather explicit',()=>{
 render(<LinearWeather network={network} subdivision="Wynyard" weather={null} now={new Date()} selected="w1" onSelect={()=>{}}/>);
 expect(screen.getByText(/MP 10.0/)).toBeTruthy();
 expect(screen.getByText(/Uncalibrated/)).toBeTruthy();
 expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
 expect(screen.queryByText(/MP 15.0/)).toBeNull();
});
it('selects the actual point represented by a linear row',()=>{
 const select=vi.fn();
 render(<LinearWeather network={network} subdivision="Wynyard" weather={null} now={new Date()} selected="w1" onSelect={select}/>);
 fireEvent.click(screen.getByRole('button',{name:/MP 10.0/}));
 expect(select.mock.calls[0][0].id).toBe('w1');
});
