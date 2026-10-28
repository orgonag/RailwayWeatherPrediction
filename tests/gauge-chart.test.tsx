// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import GaugeChart from '../src/components/GaugeChart';
import type { GaugeHistory } from '../src/map/contracts';
afterEach(cleanup);
const gauge: GaugeHistory = { station: '05TEST', name: 'Test creek', lat: 51, lon: -104, datum: 'CGVD2013', sourceUrl: 'https://example.org/source', observations: [{time:'2026-03-03T17:00:00Z',levelM:540,dischargeM3s:0}], daily: [], historyAvailableThrough:'2023-12-31', errors:[] };

it('switches metric units without mixing axes and keeps comparison coverage explicit', () => {
  render(<GaugeChart gauge={gauge} now={new Date('2026-03-03T18:00:00Z')}/>);
  expect(screen.getByRole('img', {name:/level.*m\b/i})).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name:'Flow'}));
  expect(screen.getByRole('img', {name:/flow.*m³\/s/i})).toBeTruthy();
  expect(screen.getByText(/0 of 7 daily means/)).toBeTruthy();
  expect(screen.getByText(/0 of 7 complete daily means/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name:'30 days'}));
  expect(screen.getByText(/0 of 30 complete daily means/)).toBeTruthy();
  expect(screen.queryByText(/live/i)).toBeNull();
});

it('lets a missing-current station display its explicitly dated archive without calling it last year', () => {
  render(<GaugeChart gauge={{...gauge, observations:[],daily:[{date:'2023-12-31',levelM:1,dischargeM3s:0}]}} now={new Date('2026-03-03T18:00:00Z')}/>);
  expect(screen.getByText(/No readings in this period/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name:/view latest archive/i}));
  expect(screen.getByText(/Archive view.*2023/)).toBeTruthy();
  expect(screen.getAllByText(/Archive daily means/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Archive view.*Dec 31 2023/)).toBeTruthy();
  expect(screen.getByText(/Comparisons use the displayed archive year/)).toBeTruthy();
});

it('exposes a keyboard-selected reading with its actual time and station datum', () => {
  render(<GaugeChart gauge={gauge} now={new Date('2026-03-03T18:00:00Z')}/>);
  const slider = screen.getByRole('slider', {name:/inspect gauge readings/i});
  fireEvent.change(slider, {target:{value:'0'}});
  expect(screen.getByText(/540\.000 m/)).toBeTruthy();
  expect(screen.getByText(/2026-03-03T17:00:00Z/)).toBeTruthy();
  expect(screen.getByText(/CGVD2013/)).toBeTruthy();
});
