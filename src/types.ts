import type { FeatureCollection, LineString, Point } from 'geojson';

export type Metric = 'temperature' | 'rain' | 'wind';
export interface Subdivision {
  id: string; name: string; role: 'core' | 'branch'; color: string;
  extent: string; notes: string; chainIds: string[];
}
export interface Sample {
  id: string; subdivision: string; chainId: string; lat: number; lon: number;
  mp: number | null; positionKm: number;
}
export interface Network {
  metadata: { version: string; retrievedAt: string; sourceVintage: string; attribution: string; snapshotSha256: string };
  subdivisions: Subdivision[];
  tracks: FeatureCollection<LineString, { id: string; subdivision: string; color: string; role: string }>;
  assets: FeatureCollection<Point | LineString, { id: string; subdivision: string; kind: string; mp: number | null }>;
  samples: Sample[];
}
export interface ForecastPoint {
  sampleId: string; latitude: number; longitude: number; fetchedAt: string;
  current?: { time: string; temperature_2m: number | null; precipitation: number | null; weather_code: number | null; wind_speed_10m: number | null; wind_gusts_10m: number | null };
  hourly: {
    time: string[]; temperature_2m: (number | null)[]; precipitation: (number | null)[]; rain?: (number | null)[];showers?: (number|null)[];
    weather_code?: (number|null)[];wind_direction_10m?: (number|null)[];precipitation_probability?: (number|null)[];
    wind_speed_10m: (number | null)[]; wind_gusts_10m: (number | null)[];
    snow_depth: (number | null)[]; snowfall?: (number | null)[];
    soil_temperature_0cm?: (number | null)[]; soil_moisture_0_to_1cm?: (number | null)[];
  };
}
export interface WeatherSnapshot { fetchedAt: string; source: string; points: Record<string, ForecastPoint>; errors: string[] }
export interface WeatherSummary {
  rain24Mm: number | null; liquidRain24Mm: number | null; maxWindKmh: number | null; maxGustKmh: number | null;
  minTempC: number | null; maxTempC: number | null; snowDepthM: number | null;
  positiveDegreeDays: number | null; validHours: number; stale: boolean;
}
export interface Gauge {
  station: string; name: string; lat: number; lon: number;
  time: string | null; levelM: number | null; dischargeM3s: number | null;
  previousTime: string | null; previousLevelM: number | null; sourceUrl: string; error?: string;
}
export interface GaugeSnapshot { fetchedAt: string; gauges: Gauge[] }
export interface Observation {
  id: string; location: string; lat: number | null; lon: number | null;
  observedAt: string | null; publishedAt: string | null; sourceUrl: string;
  text: string; verification: 'unverified' | 'source-checked';
}
export interface ScenarioInput {
  areaKm2: number; rainMm: number; snowWaterEquivalentMm: number;
  positiveDegreeDays: number; meltFactor: number; runoffCoefficient: number;
}
export interface ScenarioResult { meltMm: number; waterInputMm: number; runoffMm: number; volumeM3: number; meanFlowM3s: number }
