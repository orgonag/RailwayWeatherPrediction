#!/usr/bin/env python3
"""Refresh public hydrometric readings and daily means; no inference or backfilling.

urllib honours the configured HTTPS proxy. Two stations run concurrently; each query is
limited to three 10,000-record pages, 40-second requests and two attempts. HYDAT metadata
facts below were verified against the cited official July 2026 SQLite release. They are
source-versioned facts, not newly retrieved metadata or assumed station continuity.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request

BASE = 'https://api.weather.gc.ca/collections/'
HYDAT = 'https://collaboration.cmc.ec.gc.ca/cmc/hydrometrics/www/Hydat_sqlite3_20260717.zip'
HYDAT_SHA256 = 'b05eb121a547ca4a179a27aa47c354089fd902e93e5dc1e4a5416fc4641eb298'
STATIONS = [
    {'station': '05MA011', 'name': 'Birch Creek near Elfros', 'lat': 51.747, 'lon': -103.87364,
     'historicalDatum': 'CANADIAN GEODETIC VERTICAL DATUM 2013:EPOCH2010',
     'levelContinuityBreaks': ['2025-06-10'],
     'remarks': ['HYDAT STN_REMARKS: Station relocated 2025-06-10, resulting in step change to water level data.',
                 'HYDAT 2024: water level unavailable all year; discharge unavailable 2024-03-28–04-06 and 2024-04-16–08-14.']},
    {'station': '05KB003', 'name': 'Carrot River near Armley', 'lat': 53.136391, 'lon': -104.020828,
     'historicalDatum': 'ASSUMED DATUM', 'levelContinuityBreaks': [], 'remarks': []},
]


def fetch_json(url: str) -> dict:
    last_error = None
    for _attempt in range(2):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'RWP-research/0.1 (public hydrometric data)', 'Accept': 'application/geo+json, application/json'})
            with urllib.request.urlopen(request, timeout=40) as response:
                return json.load(response)
        except (OSError, ValueError) as error:
            last_error = error
    raise RuntimeError(f'{type(last_error).__name__}: {last_error}')


def query_url(collection: str, station: str, **query) -> str:
    return f'{BASE}{collection}/items?' + urllib.parse.urlencode({'STATION_NUMBER': station, 'f': 'json', **query})


def fetch_records(url: str) -> tuple[list, dict]:
    """Keep provenance and refuse to silently return a truncated multi-page response."""
    features = []
    current = url
    for _page in range(3):
        payload = fetch_json(current)
        features.extend(payload.get('features', []))
        following = next((link['href'] for link in payload.get('links', []) if link.get('rel') == 'next'), None)
        if not following:
            return features, {'url': url, 'numberMatched': payload.get('numberMatched'), 'numberReturned': len(features), 'responseTime': payload.get('timeStamp')}
        parsed = urllib.parse.urlparse(following)
        if parsed.scheme != 'https' or parsed.netloc != 'api.weather.gc.ca':
            raise RuntimeError('Refused unexpected provider pagination URL')
        current = following
    raise RuntimeError('Query exceeded bounded 30,000-record budget; no partial records accepted')


def numeric(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None


def parse_rows(features: list, daily: bool) -> list:
    rows = {}
    for feature in features:
        source = feature.get('properties', {})
        time = source.get('DATE' if daily else 'DATETIME')
        if not isinstance(time, str):
            continue
        try:
            if daily:
                dt.date.fromisoformat(time)
            else:
                parsed = dt.datetime.fromisoformat(time.replace('Z', '+00:00'))
                if parsed.tzinfo is None:
                    continue
        except ValueError:
            continue
        row = {'date' if daily else 'time': time, 'levelM': numeric(source.get('LEVEL')), 'dischargeM3s': numeric(source.get('DISCHARGE'))}
        for raw, key in [('LEVEL_SYMBOL_EN', 'levelQualifier'), ('DISCHARGE_SYMBOL_EN', 'dischargeQualifier')]:
            if source.get(raw):
                row[key] = str(source[raw])
        rows[time] = row
    return [rows[key] for key in sorted(rows)]


def refresh_station(station: dict, now: dt.datetime) -> dict:
    station_id = station['station']
    errors = []
    today = now.date()
    start = (now - dt.timedelta(days=30)).isoformat().replace('+00:00', 'Z')
    end = now.isoformat().replace('+00:00', 'Z')
    realtime_url = query_url('hydrometric-realtime', station_id, datetime=f'{start}/{end}', limit=10000, sortby='DATETIME')
    daily_url = query_url('hydrometric-daily-mean', station_id, datetime=f'{today.year - 6}-01-01/{today.isoformat()}', limit=10000, sortby='DATE')
    station_url = query_url('hydrometric-stations', station_id)
    metadata = {'historicalMetadataSource': HYDAT, 'historicalMetadataVersion': '2026-07-17',
                'historicalDatum': station['historicalDatum'], 'levelContinuityBreaks': station['levelContinuityBreaks'],
                'historicalLevelDatumVerified': False, 'stationRemarks': station['remarks']}
    observations, daily = [], []
    datum = None
    try:
        response = fetch_json(station_url)
        datum = response['features'][0]['properties'].get('VERTICAL_DATUM')
        metadata['stationMetadataUrl'] = station_url
        metadata['stationMetadataResponseTime'] = response.get('timeStamp')
        metadata['historicalLevelDatumVerified'] = datum == station['historicalDatum']
    except (RuntimeError, KeyError, IndexError) as error:
        errors.append(f'Station metadata unavailable: {error}')
    for key, url, is_daily in [('realtime', realtime_url, False), ('daily', daily_url, True)]:
        try:
            features, provenance = fetch_records(url)
            metadata[key] = provenance
            records = parse_rows(features, is_daily)
            if is_daily:
                daily = records
            else:
                observations = records
        except RuntimeError as error:
            metadata[key] = {'url': url, 'error': str(error)}
            errors.append(f'{key} retrieval failed: {error}')
    archive_max = max((row['date'] for row in daily), default=None)
    metadata['latestObservation'] = max((row['time'] for row in observations), default=None)
    metadata['dailyLevelAvailableThrough'] = max((row['date'] for row in daily if row['levelM'] is not None), default=None)
    metadata['dailyFlowAvailableThrough'] = max((row['date'] for row in daily if row['dischargeM3s'] is not None), default=None)
    metadata['qualityCounts'] = {key: {} for key in ['levelQualifier', 'dischargeQualifier']}
    for row in observations + daily:
        for key in metadata['qualityCounts']:
            if row.get(key):
                counts = metadata['qualityCounts'][key]
                counts[row[key]] = counts.get(row[key], 0) + 1
    if not observations:
        errors.append('No current station observations were returned in the preceding 30 days. Historical records do not establish current conditions.')
    else:
        errors.append('Real-time readings are provisional; only the preceding 30 days were requested. Older season readings may be absent.')
    if archive_max is None:
        errors.append('No historical daily means returned; comparisons are unavailable.')
    elif archive_max < f'{today.year - 1}-12-31':
        errors.append(f'Daily archive ends {archive_max}; a complete {today.year - 1} comparison and complete prior-three-year baseline are unavailable.')
    errors.extend(station['remarks'])
    return {key: station[key] for key in ['station', 'name', 'lat', 'lon']} | {
        'sourceUrl': f'https://wateroffice.ec.gc.ca/report/real_time_e.html?stn={station_id}',
        'datum': datum, 'observations': observations, 'daily': daily, 'historyAvailableThrough': archive_max,
        'sourceMetadata': metadata, 'errors': errors,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public/data/hydrology.json')
    parser.add_argument('--at', help='UTC retrieval clock, ISO format; normally omitted')
    args = parser.parse_args()
    now = dt.datetime.fromisoformat(args.at.replace('Z', '+00:00')) if args.at else dt.datetime.now(dt.timezone.utc)
    if now.tzinfo is None:
        parser.error('--at must include a timezone')
    now = now.astimezone(dt.timezone.utc)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        gauges = list(executor.map(lambda station: refresh_station(station, now), STATIONS))
    snapshot = {'fetchedAt': now.isoformat().replace('+00:00', 'Z'), 'gauges': gauges, 'errors': [],
                'licence': 'Contains information licensed under the Open Government Licence – Canada',
                'archiveVerification': {'url': HYDAT, 'version': '2026-07-17', 'sha256': HYDAT_SHA256,
                    'method': 'HYDAT SQLite DLY_FLOWS, DLY_LEVELS, STATIONS and STN_REMARKS were inspected for both stations; no 2025 data were present.'}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n')
    temporary.replace(args.output)
    for gauge in gauges:
        print(f"{gauge['station']}: {len(gauge['observations'])} native observations; {len(gauge['daily'])} daily means through {gauge['historyAvailableThrough']}; latest observation {gauge['sourceMetadata']['latestObservation']}")


if __name__ == '__main__':
    main()
