#!/usr/bin/env python3
"""Acquire actual station temperatures near rail and optional daily archives.

No town-labelled forecast, spatial interpolation, or nearest-time replacement.
Current values use bounded ECCC SWOB queries. Archives use annual official CSV
downloads and stay in separate files that the browser can load on demand.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import re
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

from refresh_water_coverage import atomic_json, distance_km, rail_segments

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'
CATALOGUE = 'https://api.weather.gc.ca/collections/swob-stations/items'
OBSERVATIONS = 'https://api.weather.gc.ca/collections/swob-realtime/items'
CLIMATE_STATIONS = 'https://api.weather.gc.ca/collections/climate-stations/items'
BULK_DAILY = 'https://climate.weather.gc.ca/climate_data/bulk_data_e.html'
LICENCE = 'https://eccc-msc.github.io/open-data/licence/readme_en/'
RADIUS_KM = 75
MAX_STATIONS = 100
QA_LABELS = {-10: 'Suppressed', -1: 'Missing', 0: 'Error', 10: 'Doubtful',
             15: 'Suspect/Warning', 20: 'Inconsistent', 100: 'Acceptable/Passed'}
DATA_FLAGS = {1: 'derived', 2: 'estimate', 3: 'adjusted', 4: 'incomplete', 5: 'trace', 6: 'multiple'}


def query(endpoint, **params):
    return endpoint + '?' + urllib.parse.urlencode(params)


def fetch(url, max_bytes=2_000_000):
    req = urllib.request.Request(url, headers={'User-Agent': 'RWP public railway station observations/0.4'})
    with urllib.request.urlopen(req, timeout=35) as response:
        content = response.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise ValueError('Source response exceeds bounded acquisition limit')
        provenance = {'url': url, 'sha256': hashlib.sha256(content).hexdigest(),
                      'retrievedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                      'lastModified': response.headers.get('Last-Modified')}
        return content, provenance


def fetch_json(url, allow_next=False):
    content, provenance = fetch(url)
    data = json.loads(content)
    if 'features' not in data or data.get('error'):
        raise ValueError('Provider did not return observation features')
    if not allow_next and any(link.get('rel') == 'next' for link in data.get('links', [])):
        raise ValueError('Station catalogue exceeds acquisition bound')
    return data, provenance


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def coordinates(feature):
    geometry = feature.get('geometry', {})
    point = geometry.get('coordinates', [])
    if geometry.get('type') != 'Point' or len(point) < 2:
        raise ValueError('Actual station point is missing')
    lon, lat = point[:2]
    if not finite(lon) or not finite(lat) or not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise ValueError('Invalid actual station coordinate')
    return lon, lat


def scope_bbox(segments):
    points = [p for pair in segments for p in pair]
    if not points:
        raise ValueError('Rail geometry is unavailable')
    south, north = min(p[1] for p in points), max(p[1] for p in points)
    latitude_margin = RADIUS_KM / 111.195
    longitude_margin = RADIUS_KM / (111.195 * math.cos(math.radians(north + latitude_margin)))
    return ','.join(str(round(v, 5)) for v in (
        min(p[0] for p in points) - longitude_margin, south - latitude_margin,
        max(p[0] for p in points) + longitude_margin, north + latitude_margin))


def select_stations(catalogue, segments):
    stations = {}
    for feature in catalogue['features']:
        p = feature['properties']
        station_id = str(p.get('msc_id', ''))
        if not re.fullmatch(r'[A-Za-z0-9]{5,12}', station_id) or not p.get('name'):
            raise ValueError('Station identity is missing or invalid')
        lon, lat = coordinates(feature)
        distance = distance_km([lon, lat], segments)
        if distance > RADIUS_KM:
            continue
        candidate = {'id': station_id, 'name': p['name'], 'lat': lat, 'lon': lon,
                     'temperatureC': None, 'observedAt': None,
                     'source': 'ECCC Surface Weather Observations (SWOB)',
                     'sourceUrl': query(CATALOGUE + '/' + station_id, f='html'),
                     'quality': 'Observation not yet acquired',
                     'provider': p.get('data_provider') or 'Provider not supplied',
                     'stationCode': p.get('iata_id'), 'network': p.get('dataset_network'),
                     'distanceToRailKm': round(distance, 2), 'licenceUrl': LICENCE}
        if station_id in stations and stations[station_id] != candidate:
            raise ValueError(f'Conflicting catalogue entries for station {station_id}')
        stations[station_id] = candidate
    if len(stations) > MAX_STATIONS:
        raise ValueError('Station selection exceeds the 100-station acquisition bound')
    return sorted(stations.values(), key=lambda s: s['id'])


def zoned_time(value):
    if not isinstance(value, str):
        raise ValueError('Observation timestamp is missing')
    value = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if value.tzinfo is None:
        raise ValueError('Observation timestamp lacks a timezone')
    return value.astimezone(dt.timezone.utc)


def parse_observation(station, payload, now):
    features = payload.get('features', [])
    if not features:
        return {**station, 'quality': 'No current observation returned; no substituted forecast'}
    if len(features) != 1:
        raise ValueError('Expected exactly one latest observation')
    feature = features[0]
    p = feature['properties']
    if str(p.get('msc_id-value')) != station['id']:
        raise ValueError('Observation station identifier does not match the request')
    lon, lat = coordinates(feature)
    observed = zoned_time(p.get('date_tm-value'))
    if p.get('obs_date_tm') and zoned_time(p['obs_date_tm']) != observed:
        raise ValueError('Conflicting source observation times')
    if observed > now + dt.timedelta(minutes=1):
        raise ValueError('Observation time is in the future')
    if not p.get('stn_nam-value'):
        raise ValueError('Observed station name missing')
    qa = p.get('air_temp-qa')
    flag = p.get('air_temp-data_flag-value')
    value = p.get('air_temp')
    quality = f'QA {qa}: {QA_LABELS.get(qa, "unrecognised code")}' if qa is not None else 'QA not supplied; no pass claimed'
    if flag is not None:
        quality += f'; data flag {flag}: {DATA_FLAGS.get(flag, "unrecognised code")}'
    # Explicit non-passing QA and estimated/incomplete/unknown data flags are
    # withheld. Do not republish a provider-suppressed numeric reading.
    if qa not in (None, 100) or flag not in (None, 1, 3):
        value = None
        quality += '; value withheld'
    if p.get('air_temp-uom') != '°C':
        value = None
        quality += '; Celsius unit not confirmed'
    if not finite(value):
        value = None
        quality += '; temperature unavailable'
    return {**station, 'name': p['stn_nam-value'], 'lat': lat, 'lon': lon,
            'temperatureC': value, 'observedAt': observed.isoformat(),
            'quality': quality + '; provisional station observation',
            'sourceQualityCode': qa, 'sourceDataFlag': flag,
            'observationId': feature.get('id'), 'climateId': p.get('clim_id-value'),
            'provider': p.get('data_pvdr-value') or station['provider']}


def daily_value(value, flag):
    if value is None or not str(value).strip():
        return None
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError('Nonfinite historical temperature')
    # E=estimated and any unexpected flag are kept as flags, but not used as
    # observed temperatures. Blank flags are ordinary published daily values.
    return parsed if not flag else None


def parse_daily_csv(content, climate_id, start, end):
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    required = {'Climate ID', 'Station Name', 'Date/Time', 'Longitude (x)', 'Latitude (y)',
                'Mean Temp (°C)', 'Mean Temp Flag', 'Min Temp (°C)', 'Min Temp Flag',
                'Max Temp (°C)', 'Max Temp Flag'}
    if not required <= set(reader.fieldnames or []):
        raise ValueError('Daily archive columns or Celsius units do not match')
    rows = {}
    for row in reader:
        if row['Climate ID'] != climate_id:
            raise ValueError('Daily archive station does not match requested climate ID')
        date = dt.date.fromisoformat(row['Date/Time'])
        if not start <= date <= end:
            continue
        key = date.isoformat()
        if key in rows:
            raise ValueError('Duplicate daily archive date')
        lat, lon = float(row['Latitude (y)']), float(row['Longitude (x)'])
        if not finite(lat) or not finite(lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError('Daily archive coordinates invalid')
        flags = {k: (row[f'{k.title()} Temp Flag'].strip() or None) for k in ['mean', 'min', 'max']}
        rows[key] = dict(date=key, lat=lat, lon=lon,
                         meanTemperatureC=daily_value(row['Mean Temp (°C)'], flags['mean']),
                         minTemperatureC=daily_value(row['Min Temp (°C)'], flags['min']),
                         maxTemperatureC=daily_value(row['Max Temp (°C)'], flags['max']),
                         meanFlag=flags['mean'], minFlag=flags['min'], maxFlag=flags['max'],
                         dataQuality=row.get('Data Quality') or None)
    return [rows[key] for key in sorted(rows)]


def archive_window(now):
    # User-facing corridor calendar; dates remain the source station's local
    # daily dates. The current incomplete day is excluded.
    today = now.astimezone(ZoneInfo('America/Regina')).date()
    end = today - dt.timedelta(days=1)
    try:
        start = today.replace(year=today.year - 3)
    except ValueError:  # February 29
        start = today.replace(year=today.year - 3, day=28)
    return start, end


def refresh_history(station, now, force=False):
    path = DATA / 'temperature-history' / (station['id'] + '.json')
    start, end = archive_window(now)
    old = json.loads(path.read_text()) if path.exists() else None
    if old is not None and not force:
        if old.get('requestedEnd') == end.isoformat() and not old.get('errors'):
            return old
    climate_id = str(station.get('climateId') or station['id'])
    meta_url = query(CLIMATE_STATIONS, f='json', CLIMATE_IDENTIFIER=climate_id, limit=5)
    metadata, provenance = fetch_json(meta_url)
    features = metadata['features']
    if len(features) != 1 or features[0]['properties'].get('CLIMATE_IDENTIFIER') != climate_id:
        raise ValueError('No unique official climate archive station match')
    p = features[0]['properties']
    station_id = p['STN_ID']
    if not isinstance(station_id, int):
        raise ValueError('Invalid climate archive station number')
    cache = ROOT / '.cache/temperature-history'
    cache.mkdir(parents=True, exist_ok=True)
    rows, errors, sources = [], [], [provenance]
    for year in range(start.year, end.year + 1):
        url = query(BULK_DAILY, format='csv', stationID=station_id, Year=year,
                    Month=1, Day=1, timeframe=2, submit='Download Data')
        cached = cache / f'{station_id}-{year}.csv'
        sidecar = cached.with_suffix('.source.json')
        try:
            old_source = next((s for s in (old or {}).get('sources', []) if s.get('url') == url), None)
            if old_source and year < end.year and not force:
                # Completed-year published rows are already in the repository.
                # Scheduled builds need only the current year's small export.
                rows.extend(r for r in old['observations']
                            if r['date'].startswith(f'{year}-') and start.isoformat() <= r['date'] <= end.isoformat())
                sources.append(old_source)
                continue
            if cached.exists() and sidecar.exists() and year < end.year and not force:
                content = cached.read_bytes()
                source = json.loads(sidecar.read_text())
                if hashlib.sha256(content).hexdigest() != source['sha256']:
                    raise ValueError('Cached archive checksum mismatch')
            else:
                content, source = fetch(url)
                # Validate before admitting any downloaded HTML/error as a CSV.
                parse_daily_csv(content, climate_id, start, end)
                cached.write_bytes(content)
                atomic_json(sidecar, source)
            rows.extend(parse_daily_csv(content, climate_id, start, end))
            sources.append(source)
        except Exception as exc:
            errors.append(f'{year}: {exc}')
    if len({r['date'] for r in rows}) != len(rows):
        raise ValueError('Conflicting daily archive rows across downloaded files')
    rows.sort(key=lambda r: r['date'])
    if not rows:
        raise ValueError('No daily temperature archive records acquired; ' + '; '.join(errors))
    available = [r['date'] for r in rows if any(r[k] is not None for k in
                                             ('meanTemperatureC', 'minTemperatureC', 'maxTemperatureC'))]
    result = dict(stationId=station['id'], climateId=climate_id, name=p['STATION_NAME'],
                  source='ECCC Historical Climate Data annual daily CSV exports',
                  sourceUrl=f'https://climate.weather.gc.ca/climate_data/daily_data_e.html?StationID={station_id}',
                  fetchedAt=now.isoformat(), requestedStart=start.isoformat(), requestedEnd=end.isoformat(),
                  firstDate=available[0] if available else None, lastDate=available[-1] if available else None,
                  resolution='daily', timezone=p.get('TIMEZONE'), observations=rows, errors=errors,
                  sources=sources, licenceUrl=LICENCE,
                  hourlyAvailability=dict(first=p.get('HLY_FIRST_DATE'), last=p.get('HLY_LAST_DATE'),
                                          downloaded=False, note='Catalogue availability only; no hourly observations bundled.'),
                  method='Published daily means, minima and maxima at the source station; flagged estimates withheld, missing dates and values unfilled. Not an exact-hour snapshot.')
    atomic_json(path, result)
    return result


def attach_history(station):
    path = DATA / 'temperature-history' / (station['id'] + '.json')
    if not path.exists():
        return {**station, 'historyPath': None, 'historyStart': None, 'historyEnd': None,
                'historyResolution': None}
    history = json.loads(path.read_text())
    return {**station, 'historyPath': f"data/temperature-history/{station['id']}.json",
            'historyStart': history['firstDate'], 'historyEnd': history['lastDate'],
            'historyResolution': 'daily'}


def retain_previous(station, previous, error):
    if previous is not None and previous.get('observedAt'):
        return {**previous, 'quality': previous['quality'] + f'; retained dated observation after refresh failure: {error}'}
    return {**station, 'quality': f'Observation unavailable: {error}'}


def refresh(with_history=False, force_history=False):
    network = json.loads((DATA / 'network.json').read_text())
    segments = rail_segments(network)
    now = dt.datetime.now(dt.timezone.utc)
    catalogue_url = query(CATALOGUE, f='json', bbox=scope_bbox(segments), limit=1000)
    catalogue, catalogue_source = fetch_json(catalogue_url)
    stations = select_stations(catalogue, segments)
    old_path = DATA / 'temperature-observations.json'
    previous = {s['id']: s for s in json.loads(old_path.read_text())['stations']} if old_path.exists() else {}
    errors, source_files = [], [catalogue_source]

    def acquire(station):
        url = query(OBSERVATIONS, f='json', **{'msc_id-value': station['id'],
                                           'limit': 1, 'sortby': '-date_tm-value'})
        try:
            payload, source = fetch_json(url, allow_next=True)
            result = parse_observation(station, payload, dt.datetime.now(dt.timezone.utc))
            result['sourceUrl'] = url
            distance = distance_km([result['lon'], result['lat']], segments)
            if distance > RADIUS_KM:
                raise ValueError('Reported station position is outside the rail corridor filter')
            result['distanceToRailKm'] = round(distance, 2)
            return result, source, None
        except Exception as exc:
            return retain_previous(station, previous.get(station['id']), str(exc)), None, f"{station['id']}: {exc}"

    with ThreadPoolExecutor(max_workers=3) as pool:
        acquired = list(pool.map(acquire, stations))
    stations = []
    for station, source, error in acquired:
        stations.append(station)
        if source:
            source_files.append(source)
        if error:
            errors.append(error)
    if with_history:
        # Separate bounded annual station exports; never part of browser load.
        def archive(station):
            try:
                result = refresh_history(station, now, force=force_history)
                return [f"{station['id']} archive: {e}" for e in result['errors']]
            except Exception as exc:
                return [f"{station['id']} archive: {exc}"]
        with ThreadPoolExecutor(max_workers=2) as pool:
            for station_errors in pool.map(archive, stations):
                errors.extend(station_errors)
    result = dict(fetchedAt=now.isoformat(), stations=[attach_history(s) for s in stations], errors=errors,
                  source='Environment and Climate Change Canada and the named station data providers',
                  sourceUrl=OBSERVATIONS, licenceUrl=LICENCE, radiusKm=RADIUS_KM,
                  method='Actual station observations within 75 km of independent scoped rail segments. Temperatures remain at source station coordinates and times. No spatial interpolation, extrapolation or town forecast substitution.',
                  communityCoverage='No credential-free community-station feed with verified station identity and reuse terms has been integrated. These stations are official SWOB observations, not claimed as crowdsourced coverage.',
                  sources=source_files)
    atomic_json(DATA / 'temperature-observations.json', result)
    print(f"Acquired {len(stations)} actual station records; {sum(s['temperatureC'] is not None for s in stations)} temperatures; {sum(s['historyPath'] is not None for s in result['stations'])} daily archives; {len(errors)} reported retrieval gaps.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--history', action='store_true', help='Acquire bounded rolling-three-year station daily CSV exports (cached).')
    parser.add_argument('--force-history', action='store_true', help='Redownload cached historical annual files, e.g. to incorporate provider revisions.')
    args = parser.parse_args()
    refresh(with_history=args.history or args.force_history, force_history=args.force_history)
