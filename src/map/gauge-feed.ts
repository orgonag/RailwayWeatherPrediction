import type { GaugeHistory, GaugeReading } from './contracts';

const ENDPOINT = 'https://api.weather.gc.ca/collections/hydrometric-realtime/items';
const MAX_PAGES = 3;
const PAGE_LIMIT = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;
type QualifiedReading = GaugeReading & { levelQualifier?: string; dischargeQualifier?: string };
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const numeric = (value: unknown) => finite(value) ? value : null;

function observationTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  const calendar = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  const time = Date.parse(value);
  return Number.isFinite(calendar) && new Date(calendar).toISOString().slice(0, 10) === value.slice(0, 10) && Number.isFinite(time) ? time : null;
}

async function requestPage(url: string, signal?: AbortSignal): Promise<ObjectValue> {
  const controller = new AbortController();
  if (signal?.aborted) throw signal.reason ?? new DOMException('Gauge refresh aborted', 'AbortError');
  const abort = () => controller.abort(signal?.reason ?? new DOMException('Gauge refresh aborted', 'AbortError'));
  signal?.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(() => controller.abort(new Error('Gauge provider request timed out after 20 seconds.')), REQUEST_TIMEOUT_MS);
  try {
    // A simple CORS GET: no credentials or custom headers requiring a preflight.
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Gauge provider returned ${response.status}; dated observations retained.`);
    const payload: unknown = await response.json();
    if (!object(payload) || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features) || payload.features.length > PAGE_LIMIT) {
      throw new Error('Gauge provider returned an invalid feature collection.');
    }
    if (payload.numberReturned !== undefined && payload.numberReturned !== payload.features.length) throw new Error('Gauge provider returned an incomplete page.');
    return payload;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', abort);
  }
}

/**
 * Replace the preceding 30 days of native observations with actual GeoMet records.
 * Historical daily records, station datum, source page and additive sourceMetadata are
 * preserved. Retrieval failure throws, allowing the caller to retain its dated snapshot;
 * a valid empty result explicitly clears observations. One captured real clock bounds
 * the request and accepted records independently of any weather forecast selection.
 */
export async function refreshGaugeObservations(gauge: GaugeHistory, signal?: AbortSignal): Promise<GaugeHistory> {
  if (!/^\d{2}[A-Z]{2}\d{3}$/.test(gauge.station)) throw new Error('Invalid hydrometric station identifier.');
  const end = Date.now(); const start = end - 30 * 86_400_000;
  const fetchedAt = new Date(end).toISOString();
  const query = new URLSearchParams({ STATION_NUMBER: gauge.station, f: 'json', datetime: `${new Date(start).toISOString()}/${fetchedAt}`, limit: String(PAGE_LIMIT), sortby: 'DATETIME' });
  const sourceUrl = `${ENDPOINT}?${query}`;
  let current = sourceUrl; let returned = 0; let discarded = 0;
  const visited = new Set<string>();
  const readings = new Map<number, QualifiedReading>();
  let location: { lat: number; lon: number; time: number } | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (visited.has(current)) throw new Error('Gauge provider returned a repeated pagination URL.');
    visited.add(current);
    const payload = await requestPage(current, signal);
    const features = payload.features as unknown[];
    returned += features.length;
    for (const feature of features) {
      if (!object(feature) || !object(feature.properties)) { discarded++; continue; }
      const p = feature.properties;
      const time = observationTime(p.DATETIME);
      const identifier = `${gauge.station}.${String(p.DATETIME)}`;
      if (p.STATION_NUMBER !== gauge.station || (p.IDENTIFIER !== undefined && p.IDENTIFIER !== identifier) ||
        (feature.id !== undefined && feature.id !== identifier) || time === null || time < start || time > end) {
        discarded++; continue;
      }
      const reading: QualifiedReading = { time: p.DATETIME as string, levelM: numeric(p.LEVEL), dischargeM3s: numeric(p.DISCHARGE) };
      if (typeof p.LEVEL_SYMBOL_EN === 'string' && p.LEVEL_SYMBOL_EN) reading.levelQualifier = p.LEVEL_SYMBOL_EN;
      if (typeof p.DISCHARGE_SYMBOL_EN === 'string' && p.DISCHARGE_SYMBOL_EN) reading.dischargeQualifier = p.DISCHARGE_SYMBOL_EN;
      readings.set(time, reading);
      const geometry = feature.geometry;
      if (object(geometry) && geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
        const [lon, lat] = geometry.coordinates;
        if (finite(lat) && finite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && (!location || time >= location.time)) location = { lat, lon, time };
      }
    }
    const links = payload.links;
    if (links !== undefined && !Array.isArray(links)) throw new Error('Gauge provider returned invalid pagination metadata.');
    const next = Array.isArray(links) ? links.find(link => object(link) && link.rel === 'next') : undefined;
    if (next) {
      if (!object(next) || typeof next.href !== 'string') throw new Error('Gauge provider returned invalid pagination metadata.');
      const url = new URL(next.href, current);
      if (url.origin + url.pathname !== ENDPOINT || url.username || url.password || url.searchParams.get('STATION_NUMBER') !== gauge.station) throw new Error('Gauge provider returned an unexpected pagination URL.');
      current = url.toString();
      continue;
    }
    if (finite(payload.numberMatched) && payload.numberMatched > returned) throw new Error('Gauge provider returned a truncated observation series.');
    const observations = [...readings].sort(([a], [b]) => a - b).map(([, reading]) => reading);
    const errors = gauge.errors.filter(error => !/^(?:No current station observations|Real-time readings are provisional|realtime retrieval failed:|Real-time refresh:)/.test(error));
    errors.push(observations.length ? `Real-time refresh: ${observations.length} provisional native readings retrieved ${fetchedAt}; latest ${observations.at(-1)!.time}. Only the preceding 30 days were requested.` : 'No current station observations were returned in the preceding 30 days. Historical records do not establish current conditions.');
    if (discarded) errors.push(`Real-time refresh: discarded ${discarded} invalid, wrong-station or out-of-window records.`);
    return { ...gauge, ...(location ? { lat: location.lat, lon: location.lon } : {}), observations, errors,
      // Additive retrieval provenance leaves archive/source metadata unchanged.
      ...{ observationsFetchedAt: fetchedAt, observationSourceUrl: sourceUrl },
    };
  }
  throw new Error('Gauge refresh exceeded the bounded three-page observation budget; no partial graph returned.');
}
