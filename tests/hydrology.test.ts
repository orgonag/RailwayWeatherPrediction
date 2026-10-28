import { describe, expect, it } from 'vitest';
import { buildGaugeSeries } from '../src/map/hydrology';
import type { GaugeHistory } from '../src/map/contracts';
import { execFileSync } from 'node:child_process';

const gauge = (patch: Partial<GaugeHistory> = {}): GaugeHistory => ({
  station: 'TEST', name: 'Test creek', lat: 51, lon: -104, sourceUrl: 'https://example.org',
  datum: 'Test datum', observations: [], daily: [], historyAvailableThrough: null, errors: [], ...patch,
});
const now = new Date('2026-03-03T18:00:00Z');

describe('gauge history comparisons', () => {
  it('preserves native readings, zero, null gaps, and never extends observations into the future', () => {
    const result = buildGaugeSeries(gauge({ observations: [
      { time: '2026-03-03T17:00:00Z', levelM: 4, dischargeM3s: 0 },
      { time: '2026-03-03T17:05:00Z', levelM: null, dischargeM3s: null },
      { time: '2026-03-03T17:10:00Z', levelM: 5, dischargeM3s: 1 },
      { time: '2026-03-03T19:00:00Z', levelM: 99, dischargeM3s: 99 },
    ] }), now, '7d', 'flow');
    expect(result.unit).toBe('m³/s');
    expect(result.actual.points.map(p => p.value)).toEqual([0, null, 1]);
    expect(result.actual.segments).toHaveLength(2);
    expect(result.actual.points[0].sourceTimes).toEqual(['2026-03-03T17:00:00Z']);
  });

  it('aligns daily means by calendar date and requires all three years for the mean', () => {
    const result = buildGaugeSeries(gauge({ daily: [
      { date: '2025-03-01', levelM: 4, dischargeM3s: 0 },
      { date: '2024-03-01', levelM: 5, dischargeM3s: 3 },
      { date: '2023-03-01', levelM: 6, dischargeM3s: 6 },
      { date: '2025-03-02', levelM: 4, dischargeM3s: 9 },
    ] }), now, '7d', 'flow');
    const march1 = result.priorThreeYears.points.find(p => p.time.startsWith('2026-03-01'))!;
    expect(march1.value).toBe(3);
    expect(march1.sampleCount).toBe(3);
    expect(march1.sourceTimes).toEqual(['2025-03-01', '2024-03-01', '2023-03-01']);
    const march2 = result.priorThreeYears.points.find(p => p.time.startsWith('2026-03-02'))!;
    expect(march2.value).toBeNull();
    expect(march2.sampleCount).toBe(1);
    expect(result.previousYear.points.find(p => p.time.startsWith('2026-03-02'))?.value).toBe(9);
    expect(result.priorThreeYears.coverage.completeDays).toBe(1);
    expect(result.priorThreeYears.coverage.expectedYears).toBe(3);
  });

  it('does not roll February 29 onto March 1 of a non-leap year', () => {
    const result = buildGaugeSeries(gauge({ daily: [
      { date: '2023-03-01', levelM: 10, dischargeM3s: 10 },
      { date: '2022-03-01', levelM: 20, dischargeM3s: 20 },
      { date: '2021-03-01', levelM: 30, dischargeM3s: 30 },
    ] }), new Date('2024-03-01T18:00:00Z'), '7d', 'flow');
    expect(result.previousYear.points.find(p => p.time.startsWith('2024-02-29'))?.value).toBeNull();
    expect(result.previousYear.points.find(p => p.time.startsWith('2024-03-01'))?.value).toBe(10);
    expect(result.priorThreeYears.points.find(p => p.time.startsWith('2024-02-29'))?.sampleCount).toBe(0);
  });

  it('keeps a year boundary aligned and never substitutes the archive maximum for last year', () => {
    const result = buildGaugeSeries(gauge({ daily: [
      { date: '2024-12-31', levelM: 1, dischargeM3s: 11 },
      { date: '2025-01-01', levelM: 1, dischargeM3s: 12 },
      { date: '2023-01-02', levelM: 1, dischargeM3s: 99 },
    ], historyAvailableThrough: '2024-12-31' }), new Date('2026-01-02T18:00:00Z'), '7d', 'flow');
    expect(result.previousYear.points.find(p => p.time.startsWith('2025-12-31'))?.value).toBe(11);
    expect(result.previousYear.points.find(p => p.time.startsWith('2026-01-01'))?.value).toBe(12);
    expect(result.previousYear.points.find(p => p.time.startsWith('2026-01-02'))?.value).toBeNull();
    expect(result.actual.points).toHaveLength(0);
  });

  it('breaks long native-frequency gaps instead of connecting them', () => {
    const result = buildGaugeSeries(gauge({ observations: [
      { time: '2026-03-01T12:00:00Z', levelM: 1, dischargeM3s: 1 },
      { time: '2026-03-01T12:05:00Z', levelM: 2, dischargeM3s: 2 },
      { time: '2026-03-03T12:00:00Z', levelM: 3, dischargeM3s: 3 },
    ] }), now, '7d', 'level');
    expect(result.unit).toBe('m');
    expect(result.actual.segments).toHaveLength(2);
    expect(result.datum).toBe('Test datum');
  });

  it('does not bridge a missing five-minute reading or compare levels with an unknown datum', () => {
    const history = gauge({ datum: null, observations: [
      { time: '2026-03-03T17:00:00Z', levelM: 1, dischargeM3s: 1 },
      { time: '2026-03-03T17:05:00Z', levelM: 2, dischargeM3s: 2 },
      { time: '2026-03-03T17:15:00Z', levelM: 3, dischargeM3s: 3 },
    ], daily: [{date:'2025-03-01',levelM:100,dischargeM3s:5}] });
    const result = buildGaugeSeries(history, now, '7d', 'level');
    expect(result.actual.segments).toHaveLength(2);
    expect(result.previousYear.points.find(p => p.time.startsWith('2026-03-01'))?.value).toBeNull();
  });

  it('withholds incompatible historical levels and ice-qualified discharge', () => {
    const qualified = gauge({ daily: [
      { date: '2025-03-01', levelM: 100, dischargeM3s: 0, dischargeQualifier: 'Ice Conditions' } as GaugeHistory['daily'][number],
    ] });
    Object.assign(qualified, { sourceMetadata: { historicalLevelDatumVerified: false } });
    expect(buildGaugeSeries(qualified, now, '7d', 'level').previousYear.segments).toHaveLength(0);
    const flow = buildGaugeSeries(qualified, now, '7d', 'flow');
    expect(flow.previousYear.points.find(p => p.time.startsWith('2026-03-01'))?.value).toBeNull();
    expect(flow.warnings.join(' ')).toMatch(/ice/i);
  });

  it('withholds level comparisons across a documented station relocation but permits the earlier archive', () => {
    const history = gauge({ daily: [
      { date: '2023-03-01', levelM: 540, dischargeM3s: 2 },
      { date: '2022-03-01', levelM: 541, dischargeM3s: 3 },
    ] });
    Object.assign(history, { sourceMetadata: { historicalLevelDatumVerified: true, levelContinuityBreaks: ['2025-06-10'] } });
    const recent = buildGaugeSeries(history, now, '7d', 'level');
    expect(recent.priorThreeYears.points.find(p => p.time.startsWith('2026-03-01'))?.sampleCount).toBe(0);
    expect(recent.warnings.join(' ')).toMatch(/relocation|continuity/i);
    const archive = buildGaugeSeries(history, new Date('2023-03-03T18:00:00Z'), '7d', 'level');
    expect(archive.actual.points[0].value).toBe(540);
    expect(archive.previousYear.points.find(p => p.time.startsWith('2023-03-01'))?.value).toBe(541);
  });

  it('breaks a native level line at a documented relocation and excludes partial daily means from completeness', () => {
    const history = gauge({ observations: [
      { time: '2025-06-10T05:55:00Z', levelM: 540, dischargeM3s: 1 },
      { time: '2025-06-10T06:00:00Z', levelM: 539, dischargeM3s: 1 },
    ], daily: [{ date: '2024-06-10', levelM: 540, dischargeM3s: 2, dischargeQualifier: 'Partial Day' } as GaugeHistory['daily'][number]] });
    Object.assign(history, { sourceMetadata: { historicalLevelDatumVerified: true, levelContinuityBreaks: ['2025-06-10'] } });
    const clock = new Date('2025-06-10T18:00:00Z');
    expect(buildGaugeSeries(history, clock, '7d', 'level').actual.segments).toHaveLength(2);
    expect(buildGaugeSeries(history, clock, '7d', 'flow').actual.segments).toHaveLength(1);
    const flow = buildGaugeSeries(history, clock, '7d', 'flow');
    expect(flow.previousYear.points.find(p => p.time.startsWith('2025-06-10'))?.value).toBeNull();
    expect(flow.warnings.join(' ')).toMatch(/partial.day/i);
  });

  it('shows daily archive readings only when the selected clock actually covers those dates', () => {
    const history = gauge({ daily: [{ date: '2023-12-31', levelM: 1, dischargeM3s: 0 }], historyAvailableThrough: '2023-12-31' });
    expect(buildGaugeSeries(history, now, '30d', 'flow').actual.points).toHaveLength(0);
    const archive = buildGaugeSeries(history, new Date('2024-01-01T05:59:59Z'), '30d', 'flow');
    expect(archive.actual.kind).toBe('daily');
    expect(archive.actual.points[0].value).toBe(0);
    expect(archive.actual.label).toMatch(/archive daily/i);
  });
});

it('the refresh parser preserves zero and source qualifiers without coercing missing readings', () => {
  const output = execFileSync('python', ['-c', `
import importlib.util,json
spec=importlib.util.spec_from_file_location('refresh','scripts/refresh_hydrology.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
features=[{'properties':{'DATETIME':'2026-03-03T17:00:00Z','LEVEL':None,'DISCHARGE':0,'DISCHARGE_SYMBOL_EN':'Ice Conditions'}}, {'properties':{'DATETIME':'2026-03-03T17:05:00Z','LEVEL':float('nan'),'DISCHARGE':None}}]
print(json.dumps(module.parse_rows(features, daily=False),allow_nan=False))
`], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(output)).toEqual([
    { time: '2026-03-03T17:00:00Z', levelM: null, dischargeM3s: 0, dischargeQualifier: 'Ice Conditions' },
    { time: '2026-03-03T17:05:00Z', levelM: null, dischargeM3s: null },
  ]);
});
