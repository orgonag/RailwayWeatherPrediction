#!/usr/bin/env python3
"""Build a bounded public corridor gauge catalogue and regional basin layer.

Gauge proximity is a display filter, never evidence of a hydraulic connection.
Official WSA hydrographs supply public provincial observations without credentials.
Historical station files are downloaded only when a visitor selects a gauge.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import re
import urllib.parse
import urllib.request
import zipfile

from refresh_hydrology import STATIONS, refresh_station

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'
ECCC_STATIONS = 'https://api.weather.gc.ca/collections/hydrometric-stations/items'
WSA_STATIONS = 'https://services1.arcgis.com/7MBdlVpjqbfBhQer/arcgis/rest/services/Hydrometric_Gauging_Stations_V2/FeatureServer/0'
WSA_BASINS = 'https://services1.arcgis.com/7MBdlVpjqbfBhQer/arcgis/rest/services/WSA_Major_Drainage_Basins/FeatureServer/28'
WSA_LICENCE = 'https://gisappl.saskatchewan.ca/Html5Ext/Resources/GOS_Standard_Unrestricted_Use_Data_Licence_v2.0.pdf'
AAFC_BASINS = 'https://agriculture.canada.ca/atlas/data_donnees/watersheds2013/data_donnees/geojson/HYD_AAFC_MAJOR_BASIN.zip'
AAFC_CATALOGUE = 'https://open.canada.ca/data/en/dataset/27c70cf8-2ad2-4c69-a529-90f91561b741'
RADIUS_KM = 25


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'RWP public hydrometric research/0.4'})
    with urllib.request.urlopen(request, timeout=45) as response:
        content = response.read(12_000_001)
        if len(content) > 12_000_000:
            raise ValueError('Response exceeds bounded 12 MB acquisition budget')
        return content, {'url': url, 'sha256': hashlib.sha256(content).hexdigest(),
                         'lastModified': response.headers.get('Last-Modified')}


def fetch_json(url):
    content, provenance = fetch(url)
    result = json.loads(content)
    if result.get('error') or result.get('exceededTransferLimit'):
        raise ValueError('Provider error or truncated catalogue response')
    if any(link.get('rel') == 'next' for link in result.get('links', [])):
        raise ValueError('Catalogue pagination exceeds configured bound')
    return result, provenance


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n')
    tmp.replace(path)


def rail_segments(network):
    # Never connect separate chains, including across the provincial boundary.
    return [(a, b) for f in network['tracks']['features']
            for a, b in zip(f['geometry']['coordinates'], f['geometry']['coordinates'][1:])]


def distance_km(point, segments):
    """Local equirectangular distance to independent line segments; screening only."""
    lon, lat = point
    sx, sy = 111.195 * math.cos(math.radians(lat)), 111.195
    best = math.inf
    for a, b in segments:
        ax, ay = (a[0]-lon)*sx, (a[1]-lat)*sy
        bx, by = (b[0]-lon)*sx, (b[1]-lat)*sy
        dx, dy = bx-ax, by-ay
        t = max(0, min(1, -(ax*dx+ay*dy)/(dx*dx+dy*dy))) if dx or dy else 0
        best = min(best, math.hypot(ax+t*dx, ay+t*dy))
    return best


def point_in_ring(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside


def point_in_geometry(point, geometry):
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    return any(point_in_ring(point, polygon[0]) and not any(point_in_ring(point, hole) for hole in polygon[1:])
               for polygon in polygons)


def select_catalogue(federal, provincial, segments):
    by_id = {}
    for feature in federal['features']:
        p = feature['properties']
        if p.get('STATUS_EN') != 'Active':
            continue
        station = p['STATION_NUMBER']
        lon, lat = feature['geometry']['coordinates']
        by_id[station] = {'station': station, 'name': p['STATION_NAME'].title(), 'lon': lon, 'lat': lat,
                         'provider': 'ECCC', 'operator': p.get('CONTRIBUTOR_EN'), 'province': p.get('PROV_TERR_STATE_LOC'),
                         'status': p['STATUS_EN'], 'datum': p.get('VERTICAL_DATUM'),
                         'realtimeProvider': 'ECCC' if p.get('REAL_TIME') else None,
                         'sourceUrls': [f'{ECCC_STATIONS}?STATION_NUMBER={station}&f=json'],
                         'sourceUrl': f'https://wateroffice.ec.gc.ca/report/real_time_e.html?stn={station}'}
    for feature in provincial['features']:
        p = feature['properties']; station = p['Station_Number']
        lon, lat = feature['geometry']['coordinates']
        old = by_id.get(station, {})
        is_wsa = p.get('Operated_By') == 'WSA'
        by_id[station] = {**old, 'station': station, 'name': p['Station_Name'].title(),
                         'lon': old.get('lon', lon), 'lat': old.get('lat', lat),
                         'provider': 'WSA' if is_wsa else old.get('provider', 'ECCC'),
                         'operator': 'Water Security Agency' if is_wsa else 'Water Survey of Canada',
                         'province': p.get('Province'), 'majorBasin': p.get('Major_Basin'),
                         'stationClass': p.get('Station_Class'), 'status': old.get('status', p.get('Station_Class')),
                         'provincialSourceUrl': p.get('HyperLink_Graph'),
                         'sourceUrl': p.get('HyperLink_Graph') if is_wsa else old.get('sourceUrl', p.get('HyperLink_Graph')),
                         'sourceUrls': old.get('sourceUrls', []) + [WSA_STATIONS, p.get('HyperLink_Graph')],
                         'catalogueLicence': WSA_LICENCE}
    selected = []
    for station in by_id.values():
        distance = distance_km([station['lon'], station['lat']], segments)
        if distance <= RADIUS_KM or station['station'] in {'05MA011', '05KB003'}:
            selected.append({**station, 'distanceToRailKm': round(distance, 2),
                             'selectionMethod': 'Within 25 km of independent scoped rail geometry; not a hydraulic link',
                             'historyPath': f"data/history/{station['station']}.json"})
    return sorted(selected, key=lambda station: station['station'])


def parse_wsa_hydrograph(html, station, now):
    """Only parse numeric dated data in the public JSON widget, never execute JS."""
    rows = {}; metadata = []
    for text in re.findall(r'<script[^>]*type=[\"\']application/json[\"\'][^>]*>(.*?)</script>', html, re.S):
        widget = json.loads(text).get('x', {})
        attrs = widget.get('attrs', {})
        if station not in attrs.get('title', ''):
            continue
        labels = attrs.get('labels', [])
        columns = widget.get('data', [])
        if len(labels) != 2 or len(columns) != 2 or len(columns[0]) != len(columns[1]):
            continue
        label = labels[1].lower()
        ylabel = attrs.get('ylabel', '').lower()
        if label == 'discharge' and ('cms' in ylabel or 'm3/s' in ylabel or 'm³/s' in ylabel):
            key, qualifier = 'dischargeM3s', 'dischargeQualifier'
        elif label in {'level', 'water level', 'stage', 'elevation'} and re.search(r'\(m\)', ylabel):
            key, qualifier = 'levelM', 'levelQualifier'
        else:
            continue
        for stamp, value in zip(*columns):
            if not isinstance(stamp, str) or not stamp.endswith('Z'):
                raise ValueError('WSA hydrograph timestamp lacks explicit UTC zone')
            at = dt.datetime.fromisoformat(stamp.replace('Z', '+00:00'))
            if at > now or not (value is None or isinstance(value, (int, float)) and not isinstance(value, bool)):
                continue
            if value is not None and not math.isfinite(value):
                continue
            row = rows.setdefault(stamp, {'time': stamp, 'levelM': None, 'dischargeM3s': None})
            row[key] = value
            row[qualifier] = 'Provisional WSA public hydrograph; individual quality flags not supplied'
        metadata.append({'title': attrs.get('title'), 'unitLabel': attrs.get('ylabel'), 'sourceScale': widget.get('scale'),
                         'method': 'Exact time and numeric values from public JSON widget; no chart digitization or daily aggregation'})
    if not rows:
        raise ValueError('No recognized dated numeric WSA hydrograph series')
    return [rows[time] for time in sorted(rows)], metadata


def merge_unit_archive(history, archive):
    """Use recovered dates only where HYDAT has no row; never override official quality."""
    original = {row['date']: row for row in history['daily']}
    for row in archive.get('daily', []):
        if row['date'] not in original:
            original[row['date']] = row
    history['daily'] = [original[date] for date in sorted(original)]
    history['sourceMetadata']['unitArchive'] = {key: value for key, value in archive.items() if key != 'daily'}
    if archive.get('daily'):
        history['errors'].append('Some missing archive dates were recovered from ECCC unit-value files as explicitly labelled RWP-derived daily means; these are not official HYDAT daily values. Partial days remain null.')
    return history


def archive_manifest(history):
    observations = [r for r in history['observations'] if r.get('levelM') is not None or r.get('dischargeM3s') is not None]
    daily = [r for r in history['daily'] if r.get('levelM') is not None or r.get('dischargeM3s') is not None]
    return {'station':history['station'], 'name':history['name'], 'provider':history.get('provider'),
            'historyPath':history['historyPath'], 'fetchedAt':history['fetchedAt'],
            'observationFrom':min((r['time'] for r in observations),default=None),
            'observationThrough':max((r['time'] for r in observations),default=None),
            'dailyFrom':min((r['date'] for r in daily),default=None),
            'dailyThrough':max((r['date'] for r in daily),default=None),
            'dailyYears':sorted({int(r['date'][:4]) for r in daily}),
            'observationCount':len(observations), 'dailyCount':len(daily),
            'derivedDailyCount':sum(r.get('sourceType')=='derived-unit-values' for r in daily),
            'sourceUrls':history.get('sourceUrls',[])}


def acquire_station(station, now):
    known = next((s for s in STATIONS if s['station'] == station['station']), {})
    definition = {**station, 'historicalDatum': known.get('historicalDatum'),
                  'levelContinuityBreaks': known.get('levelContinuityBreaks', []), 'remarks': known.get('remarks', [])}
    history = refresh_station(definition, now)
    history.update({key: value for key, value in station.items() if key not in {'datum'}})
    history['fetchedAt'] = now.isoformat().replace('+00:00', 'Z')
    if station.get('provider') == 'WSA' and station.get('provincialSourceUrl'):
        try:
            raw, provenance = fetch(station['provincialSourceUrl'])
            observations, parsed = parse_wsa_hydrograph(raw.decode(), station['station'], now)
            history['observations'] = observations
            history['sourceMetadata']['provincialHydrograph'] = {**provenance, 'series': parsed, 'fetchedAt': history['fetchedAt']}
            history['sourceMetadata']['latestObservation'] = max((r['time'] for r in observations if r['levelM'] is not None or r['dischargeM3s'] is not None), default=None)
            history['realtimeProvider'] = 'WSA'
            history['errors'] = [e for e in history['errors'] if not e.startswith('No current station observations')]
            history['errors'].append('WSA public hydrograph observations are provisional; individual quality flags and level datum are not supplied by this graph. Native published times retained.')
        except (OSError, ValueError) as error:
            history['errors'].append(f'WSA public hydrograph unavailable: {error}')
    previous_path = DATA / 'history' / f"{station['station']}.json"
    if previous_path.exists():
        previous = json.loads(previous_path.read_text())
        # Failed calls may retain dated observations, never relabelled as newly observed.
        if not history['observations'] and previous.get('observations'):
            history['observations'] = previous['observations']
            history['sourceMetadata']['retainedObservationsFetchedAt'] = previous.get('fetchedAt')
        if not history['daily'] and previous.get('daily'):
            history['daily'] = previous['daily']
            history['sourceMetadata']['retainedDailyFetchedAt'] = previous.get('fetchedAt')
    for archive_path in sorted((DATA/'unit-history').glob(f"{station['station']}-*.json")):
        merge_unit_archive(history, json.loads(archive_path.read_text()))
    history['historyAvailableThrough'] = max((r['date'] for r in history['daily'] if r.get('levelM') is not None or r.get('dischargeM3s') is not None), default=None)
    for field, label in [('levelM','dailyLevelAvailableThrough'),('dischargeM3s','dailyFlowAvailableThrough')]:
        history['sourceMetadata'][label] = max((r['date'] for r in history['daily'] if r.get(field) is not None),default=None)
    atomic_json(previous_path, history)
    actual = [r for r in history['observations'] if r['levelM'] is not None or r['dischargeM3s'] is not None]
    latest, old = (actual[-1], actual[-2] if len(actual) > 1 else {}) if actual else ({}, {})
    gauge = {**station, 'realtimeProvider': history.get('realtimeProvider'), 'time': latest.get('time'),
             'levelM': latest.get('levelM'), 'dischargeM3s': latest.get('dischargeM3s'),
             'previousTime': old.get('time'), 'previousLevelM': old.get('levelM'),
             'historyAvailableThrough': history['historyAvailableThrough'],
             'historyYears': sorted({int(r['date'][:4]) for r in history['daily']}),
             'levelQualifier': latest.get('levelQualifier'), 'dischargeQualifier': latest.get('dischargeQualifier')}
    if not actual:
        gauge['error'] = 'No dated public observations available; historical data and official source remain separately accessible.'
    print(f"{station['station']}: {station['provider']}; {len(actual)} observations; {len(history['daily'])} daily rows", flush=True)
    return gauge, history


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalogue-only', action='store_true')
    parser.add_argument('--reuse-catalogue', action='store_true')
    args = parser.parse_args()
    now = dt.datetime.now(dt.timezone.utc); stamp = now.isoformat().replace('+00:00', 'Z')
    if args.reuse_catalogue:
        catalogue = json.loads((DATA/'water-coverage.json').read_text())
        stations = json.loads((DATA/'gauges.json').read_text())['gauges']
    else:
        network = json.loads((DATA/'network.json').read_text()); segments = rail_segments(network)
        vertices = [p for f in network['tracks']['features'] for p in f['geometry']['coordinates']]
        bbox = [min(p[0] for p in vertices)-0.5, min(p[1] for p in vertices)-0.3,
                max(p[0] for p in vertices)+0.5, max(p[1] for p in vertices)+0.3]
        federal, fp = fetch_json(ECCC_STATIONS+'?'+urllib.parse.urlencode({'bbox': ','.join(map(str,bbox)), 'limit': 10000, 'f':'json'}))
        provincial, pp = fetch_json(WSA_STATIONS+'/query?'+urllib.parse.urlencode({'where':'1=1','outFields':'*','outSR':4326,'f':'geojson'}))
        stations = select_catalogue(federal, provincial, segments)
        basins, bp = fetch_json(WSA_BASINS+'/query?'+urllib.parse.urlencode({'where':'1=1','outFields':'*','outSR':4326,'f':'geojson','maxAllowableOffset':0.001}))
        selected_basins = []
        for feature in basins['features']:
            if not any(point_in_geometry(point, feature['geometry']) for point in vertices):
                continue
            source = feature['properties']
            feature['properties'] = {'id': 'WSA-MAJOR-'+str(source['OBJECTID']), 'name': source['Basin_Name'],
                                     'kind': 'major-drainage-basin', 'source': 'Water Security Agency', 'sourceUrl': WSA_BASINS,
                                     'licence': WSA_LICENCE, 'areaKm2': source['Shape__Area']/1_000_000,
                                     'areaMethod': 'Published projected Shape__Area divided by 1000000; provincial portion, not full upstream basin',
                                     'geometryMethod': 'Provider generalization 0.001 degree for regional display; complete provincial feature retained',
                                     'province': 'SK', 'sourceProperties': source}
            selected_basins.append(feature)
        # The licensed AAFC full Saskatchewan River region supplies the Alberta end.
        # Keep it separate from WSA provincial subdivisions; overlap reflects hierarchy.
        aafc_raw, ap = fetch(AAFC_BASINS)
        with zipfile.ZipFile(io.BytesIO(aafc_raw)) as archive:
            if archive.getinfo('HYD_AAFC_MAJOR_BASIN.geojson').file_size > 80_000_000:
                raise ValueError('AAFC decompressed source exceeds80 MB budget')
            aafc = json.loads(archive.read('HYD_AAFC_MAJOR_BASIN.geojson'))
        alberta_vertices = [p for p in vertices if p[0] < -110]
        # Only the Saskatchewan River parent drainage region covers this scoped Alberta rail.
        for feature in aafc['features']:
            if feature['properties'].get('MAJOR_BASIN_NAME') != 'Saskatchewan River':
                continue
            if not any(point_in_geometry(p, feature['geometry']) for p in alberta_vertices):
                continue
            source = feature['properties']
            feature['properties'] = {'id':'AAFC-MAJOR-'+str(source['OBJECTID']),
                                     'name':'Saskatchewan River — full drainage region', 'kind':'major-drainage-basin',
                                     'source':'Agriculture and Agri-Food Canada', 'sourceUrl':AAFC_CATALOGUE,
                                     'licence':'https://open.canada.ca/en/open-government-licence-canada',
                                     'sourceVersion':'AAFC Watershed Project2013', 'province':'AB / SK / MB',
                                     'geometryMethod':'Complete source polygon retained; parent region overlaps the more detailed WSA provincial basins',
                                     'sourceProperties':source}
            selected_basins.append(feature)
        atomic_json(DATA/'major-basins.geojson', {'type':'FeatureCollection','features':selected_basins,'fetchedAt':stamp,'provenance':bp})
        catalogue = {'fetchedAt': stamp, 'gaugeRadiusKm': RADIUS_KM, 'selection': 'Active ECCC catalogue and WSA provincial catalogue; within25km of independent railway chains',
                     'gaugeCount':len(stations), 'majorBasinCount':len(selected_basins), 'sources':[fp,pp,bp,ap],
                     'gaps': ['Proximity and regional basin membership do not establish hydraulic connection to an individual railway crossing.',
                              'WSA Data Portal API returned401 without credentials; public hydrograph data used where available.',
                              'AAFC parent drainage region overlaps the more detailed WSA provincial boundaries; these different scales are not individual railway catchments.',
                              'New station historical level datum/relocation continuity is unverified; cross-year level comparisons must remain disabled.',
                              'Archived daily data are2020 onward; missing dates and source quality flags are retained.']}
        atomic_json(DATA/'water-coverage.json',catalogue)
        old = {g['station']:g for g in json.loads((DATA/'gauges.json').read_text())['gauges']}
        stations = [{**old.get(s['station'],{}),**s, **({} if s['station'] in old else {'time':None,'levelM':None,'dischargeM3s':None,'previousTime':None,'previousLevelM':None})} for s in stations]
        atomic_json(DATA/'gauges.json',{'fetchedAt':stamp,'gauges':stations})
        print(f"Selected{len(stations)} gauges and{len(selected_basins)} regional basins",flush=True)
    if args.catalogue_only:
        return
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda station: acquire_station(station,now),stations))
    gauges = [g for g,_ in results]
    atomic_json(DATA/'gauges.json', {'fetchedAt':stamp,'gauges':gauges})
    # Compatibility snapshot: the original two; the rest remain per-station lazy files.
    old_snapshot = json.loads((DATA/'hydrology.json').read_text())
    old_snapshot.update(fetchedAt=stamp,gauges=[h for _,h in results if h['station'] in {'05MA011','05KB003'}])
    atomic_json(DATA/'hydrology.json',old_snapshot)
    catalogue.update(historyFetchedAt=stamp, stationsWithObservations=sum(g['time'] is not None for g in gauges),
                     stationsWithDailyHistory=sum(g.get('historyAvailableThrough') is not None for g in gauges),
                     archives=[archive_manifest(h) for _,h in results])
    atomic_json(DATA/'water-coverage.json',catalogue)


if __name__ == '__main__':
    main()
