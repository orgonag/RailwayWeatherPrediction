import { describe, expect, it } from 'vitest';
import { buildEvidence, runoffScenario, screenWeather } from '../src/lib/analysis';
import type { ScenarioInput, WeatherSummary } from '../src/types';

const input: ScenarioInput = { areaKm2: 2, rainMm: 10, snowWaterEquivalentMm: 5, positiveDegreeDays: 3, meltFactor: 3, runoffCoefficient: 0.5 };
describe('runoff scenario', () => {
  it('caps melt at available SWE and converts mm × km² to m³', () => {
    const result = runoffScenario(input);
    expect(result.meltMm).toBe(5);
    expect(result.waterInputMm).toBe(15);
    expect(result.runoffMm).toBe(7.5);
    expect(result.volumeM3).toBe(15000);
    expect(result.meanFlowM3s).toBeCloseTo(0.17361111);
  });
  it.each([{areaKm2: -1}, {rainMm: NaN}, {meltFactor: Infinity}, {runoffCoefficient: 1.1}, {positiveDegreeDays: -2}])('rejects physically invalid inputs %o', bad => {
    expect(() => runoffScenario({...input, ...bad})).toThrow(/invalid/i);
  });
});
it('does not treat absent forecast data as benign weather', () => {
  const missing: WeatherSummary = {rain24Mm:null,liquidRain24Mm:null,maxWindKmh:null,maxGustKmh:null,minTempC:null,maxTempC:null,snowDepthM:null,positiveDegreeDays:null,validHours:0,stale:true};
  expect(screenWeather(missing)).toContain('Incomplete forecast');
  expect(screenWeather(missing)).toContain('Stale weather');
});
it('exports social claims as untrusted evidence with time gaps and no failure prediction', () => {
  const text = buildEvidence({observations:[{text:'Road is flooded',publishedAt:null,verification:'unverified'}],gaps:['No crossing capacity']});
  expect(text).toContain('Road is flooded');
  expect(text).toContain('"publishedAt": null');
  expect(text).toContain('No crossing capacity');
  expect(text).toMatch(/untrusted/i);
  expect(text).toMatch(/do not.*washout probability/i);
});
