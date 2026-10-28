"""Subset published WSC map catchments by exact gauge ID; never infer missing basins."""
import argparse
import datetime as dt
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'
SOURCE = 'https://wateroffice.ec.gc.ca/data/map/geojson/basin_05_simplified.json'
CATALOGUE = 'https://open.canada.ca/data/en/dataset/0c121878-ac23-46f5-95df-eb9960753375'


def select_catchments(source, gauges, established):
    wanted = {g['station']: g for g in gauges}
    known = {f['properties']['StationNum']: f['properties'] for f in established['features']}
    selected = {}
    for feature in source['features']:
        station = feature.get('properties', {}).get('StationNum')
        if station not in wanted:
            continue
        if station in selected:
            raise ValueError(f'Duplicate published catchment: {station}')
        if feature.get('geometry', {}).get('type') not in {'Polygon', 'MultiPolygon'}:
            raise ValueError(f'Invalid published catchment: {station}')
        properties = {'StationNum': station, 'NameNom': wanted[station]['name'],
                      'Area_km2': known.get(station, {}).get('Area_km2'),
                      'sourceUrl': SOURCE, 'catalogueUrl': CATALOGUE,
                      'licence': 'https://open.canada.ca/en/open-government-licence-canada',
                      'geometryMethod': 'Official WSC simplified map polygon, unchanged; for display, not numerical basin analysis.'}
        selected[station] = {'type': 'Feature', 'properties': properties, 'geometry': feature['geometry']}
    return {'type': 'FeatureCollection', 'features': [selected[s] for s in sorted(selected)],
            'requestedGaugeCount': len(wanted), 'missingStations': sorted(set(wanted) - set(selected)),
            'missingReason': 'No exact station-ID match in the published WSC simplified map source. No boundary inferred.',
            'scope': 'Gauge catchments may overlap or nest. Do not sum areas. These are not verified railway crossing catchments.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Use a saved copy of the official MDA05 map source')
    args = parser.parse_args()
    gauges = json.loads((DATA / 'gauges.json').read_text())['gauges']
    if any(not g['station'].startswith('05') for g in gauges):
        raise ValueError('This scoped acquisition supports MDA05 only; add the required official region first.')
    if args.source:
        raw = args.source.read_bytes()
    else:
        with urllib.request.urlopen(SOURCE, timeout=90) as response:
            raw = response.read(40_000_001)
    if len(raw) > 40_000_000:
        raise ValueError('Catchment source exceeds the 40 MB acquisition budget')
    result = select_catchments(json.loads(raw), gauges, json.loads((DATA / 'basins.geojson').read_text()))
    result['provenance'] = {'sourceUrl': SOURCE, 'sha256': hashlib.sha256(raw).hexdigest(),
                            'preparedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'sourceBytes': len(raw)}
    path = DATA / 'gauge-catchments.geojson'
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    temp.replace(path)
    print(f"Published catchments: {len(result['features'])}/{len(gauges)}; missing {', '.join(result['missingStations'])}")


if __name__ == '__main__':
    main()
