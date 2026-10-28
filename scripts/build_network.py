"""Extract the RWP public scope from a checksum-verified CANTRE snapshot (CNTS/1).

Format: https://github.com/orgonag/cantre-research/blob/main/pipeline/schema/snapshot.md
NRWN geometry stays under OGL-Canada. No gaps or provincial borders are joined.
"""
import bisect
import argparse
import gzip
import hashlib
import json
import math
import struct
from collections import Counter
from datetime import datetime, timezone
from itertools import accumulate
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://orgonag.github.io/cantre-research/data/'
NRWN_URL = 'https://open.canada.ca/data/en/dataset/ac26807e-a1e8-49fa-87bf-451175a859b8'
TC_URL = 'https://open.canada.ca/data/en/dataset/d0f54727-6c0b-4e5a-aa04-ea1463cf9f4c'
ASSET_KINDS = {'crossing', 'station', 'bridge', 'moveableBridge', 'culvert'}
METRES_PER_MILE = 1609.344
CALIBRATION_SLOPE_TOLERANCE = 0.15
POSTING_RESOLUTION_MILES = 0.01
EXTENTS = {
    'Hardisty': ('core','Wilkie–Hardisty (Alberta)','Provincial boundary geometry remains separate.'),
    'Wilkie': ('core','Saskatoon–Wilkie','Industrial spur inventory remains incomplete.'),
    'Sutherland': ('core','Wynyard–Saskatoon','Public historical geometry; verify active limits.'),
    'Wynyard': ('core','Bredenbury–Wynyard','Birch Creek research case near Elfros.'),
    'Tisdale': ('branch','Goudie–Nipawin','CPKC-context Tisdale, distinct from CN Tisdale.'),
    'Kelvington': ('branch','Berth–Kelvington','Branch off Tisdale.'),
    'Melfort': ('branch','Lanigan–Spalding / terminal continuation','Current terminal ownership and limits require verification.'),
    'Lanigan': ('branch','Lanigan–Regina','Stop at next major interchange; no automatic southern main-line inclusion.'),
    'Bulyea': ('branch','Connection from Lanigan','Current active limits require verification.'),
    'White Fox': ('branch','Nipawin toward Choiceland','Historical CPR label; separate Torch River Rail operating limits.'),
    'Yarbo': ('branch','Bredenbury connection','Current active limits require verification.'),
    'Lloydminster': ('branch','Wilkie–Lloydminster','Alberta/Saskatchewan geometry remains separate.'),
    'Reford': ('branch','Wilkie–Rural','Connects with Macklin.'),
    'Macklin': ('branch','Kerrobert–Macklin','Rural junction connects Reford.'),
    'Kerrobert': ('branch','Kerrobert toward Dodsland / Milden','Historical extent only; current active limits and operator boundaries unverified.'),
}

def read_varint(data, pos):
    value = 0
    for i in range(8):
        if pos >= len(data): raise ValueError('Truncated varint')
        b = data[pos]; pos += 1
        value += (b & 127) << (7*i)
        if b < 128:
            if (i > 0 and b == 0) or value >= 2**53: raise ValueError('Invalid varint')
            return (value//2 if value % 2 == 0 else -(value+1)//2), pos
    raise ValueError('Oversized varint')

def milepost_at(s_mm, intervals):
    for anchors in intervals:
        if not anchors or not anchors[0][0] <= s_mm <= anchors[-1][0]: continue
        for (s0,mp0),(s1,mp1) in zip(anchors,anchors[1:]):
            if s0 <= s_mm <= s1 and s1 > s0:
                return mp0 + (mp1-mp0)*(s_mm-s0)/(s1-s0)
    return None

def coordinate_at(s_mm, coords):
    """A calculated point on one chain, never beyond either end."""
    if not coords or not coords[0][2] <= s_mm <= coords[-1][2]:
        raise ValueError('Position outside chain geometry')
    distances = [p[2] for p in coords]
    j = bisect.bisect_left(distances, s_mm)
    if j == 0 or distances[j] == s_mm:
        return [coords[j][1] / 1e6, coords[j][0] / 1e6]
    a, b = coords[j - 1], coords[j]
    fraction = (s_mm - a[2]) / (b[2] - a[2])
    return [round((a[1] + fraction * (b[1] - a[1])) / 1e6, 6),
            round((a[0] + fraction * (b[0] - a[0])) / 1e6, 6)]


def qualified_intervals(records, chosen, exclusions=None):
    """Keep a source interval whole only when every anchor is qualified.

    Dropping an unverified anchor and joining its neighbours would silently
    bridge a section whose calibration RWP has not accepted.
    """
    anchor_lookup = {(a[0], a[1]): a for a in records['anchors']}
    intervals = {}
    for _, cid, ids in records['intervals']:
        if cid not in chosen:
            continue
        anchors = sorted([anchor_lookup[(cid, i)] for i in ids], key=lambda a: a[2])
        if any(a[5] not in ('posted', 'tc') for a in anchors):
            continue
        pairs = [(a[2], a[3]) for a in anchors]
        diffs = [b[1] - a[1] for a, b in zip(pairs, pairs[1:])]
        if not (len(pairs) >= 2 and all(b[0] > a[0] for a, b in zip(pairs, pairs[1:]))
                and (all(d > 0 for d in diffs) or all(d < 0 for d in diffs))):
            continue
        # Upstream's 15% slope check skips spans shorter than 800 m. A bad
        # short-span source mile can therefore survive monotonicity (e.g.
        # Tisdale 113.27 -> 28.51 in 358 m). Check every pair here, with one
        # 0.01-mile source posting step of rounding allowance, and split.
        current = [pairs[0]]
        for a, b in zip(pairs, pairs[1:]):
            distance_m = (b[0] - a[0]) / 1000
            implied_m = abs(b[1] - a[1]) * METRES_PER_MILE
            tolerance_m = distance_m * CALIBRATION_SLOPE_TOLERANCE + POSTING_RESOLUTION_MILES * METRES_PER_MILE
            if abs(implied_m - distance_m) > tolerance_m:
                if len(current) >= 2:
                    intervals.setdefault(cid, []).append(current)
                current = [b]
                if exclusions is not None:
                    exclusions.append(dict(chainId=cid, subdivision=chosen[cid][2],
                                           startPositionKm=a[0] / 1e6, endPositionKm=b[0] / 1e6,
                                           startMp=a[1], endMp=b[1],
                                           geometryDistanceM=round(distance_m, 3),
                                           mileageDistanceM=round(implied_m, 3),
                                           reason='Mileage spacing inconsistent with chain geometry'))
            else:
                current.append(b)
        if len(current) >= 2:
            intervals.setdefault(cid, []).append(current)
    return intervals


def whole_mile_assets(chosen, geometries, intervals):
    """Invert qualified calibration, segment by segment, for integer miles.

    These are reference points, not observed/posted physical assets. A repeated
    mileage on another chain (or after an interval discontinuity) is distinct.
    """
    features = []
    seen = set()
    for cid, chain in chosen.items():
        for interval_index, anchors in enumerate(intervals.get(cid, [])):
            for (s0, mp0), (s1, mp1) in zip(anchors, anchors[1:]):
                for mile in range(math.ceil(min(mp0, mp1)), math.floor(max(mp0, mp1)) + 1):
                    s_mm = s0 + (mile - mp0) * (s1 - s0) / (mp1 - mp0)
                    # Shared anchors occur in both adjacent segments. Keep one
                    # point per actual chain position, not one per mile label.
                    key = (cid, round(s_mm), mile)
                    if key in seen:
                        continue
                    seen.add(key)
                    features.append(dict(type='Feature', properties=dict(
                        id=f'milepost:{cid}:{round(s_mm)}:{mile}', kind='milepost',
                        name=f'Mile {mile} · calculated', subdivision=chain[2],
                        chainId=cid, mp=mile, mpEnd=mile, mileageType='calculated',
                        postedMp=None, postedMileageTier=None,
                        sourceLayer='CALCULATED_REFERENCE', sourceId=cid,
                        sourceUrl=NRWN_URL, sourceAttributes={},
                        calibration=dict(intervalIndex=interval_index,
                                         startPositionKm=s0 / 1e6, endPositionKm=s1 / 1e6,
                                         startMp=mp0, endMp=mp1),
                        positions=[dict(chainId=cid, subdivision=chain[2],
                                        positionKm=round(s_mm / 1e6, 6),
                                        endPositionKm=round(s_mm / 1e6, 6),
                                        mp=mile, mpEnd=mile, residualM=None)]),
                        geometry=dict(type='Point', coordinates=coordinate_at(s_mm, geometries[cid]))))
    return features


def source_assets(records, chosen, intervals, details):
    """Preserve published asset geometry and separate published/calculated MPs."""
    features = []
    for asset in records['assets']:
        if asset[1] not in ASSET_KINDS:
            continue
        scoped_positions = [p for p in asset[4] if p[0] in chosen]
        if not scoped_positions:
            continue
        detail = details.get(asset[0])
        if not isinstance(detail, dict) or not isinstance(detail.get('attrs'), dict):
            raise ValueError(f'Missing source details for {asset[0]}')
        positions = []
        for p in scoped_positions:
            # Upstream derived MP may use an unverified interval. Recalculate
            # against the same qualified intervals as RWP weather locations.
            start_mp = milepost_at(p[1], intervals.get(p[0], []))
            end_mp = milepost_at(p[2], intervals.get(p[0], []))
            positions.append(dict(chainId=p[0], subdivision=chosen[p[0]][2],
                                  positionKm=p[1] / 1e6, endPositionKm=p[2] / 1e6,
                                  residualM=p[3] / 1000,
                                  mp=round(start_mp, 3) if start_mp is not None else None,
                                  mpEnd=round(end_mp, 3) if end_mp is not None else None))
        primary = positions[0]
        posted = asset[3]
        # A posted mileage belongs to its published subdivision, not every
        # chain near an asset. An unverified source value stays labelled so.
        posted_matches = posted is not None and posted[1] == chosen[primary['chainId']][1]
        coords = list(zip([x / 1e6 for x in accumulate(asset[6])],
                          [x / 1e6 for x in accumulate(asset[5])]))
        features.append(dict(type='Feature', properties=dict(
            id=asset[0], kind=asset[1], name=asset[2],
            subdivision=primary['subdivision'], chainId=primary['chainId'],
            mp=primary['mp'], mpEnd=primary['mpEnd'],
            mileageType='calculated' if primary['mp'] is not None else 'unavailable',
            postedMp=posted[0] if posted_matches else None,
            postedMileageTier=posted[2] if posted_matches else None,
            sourceLayer=detail['layer'], sourceId=asset[0], sourceUrl=NRWN_URL,
            sourceAttributes=detail['attrs'], positions=positions,
            mileageSourceUrl=TC_URL if posted_matches and posted[2] == 'tc' else NRWN_URL),
            geometry=dict(type='Point' if len(coords) == 1 else 'LineString',
                          coordinates=coords[0] if len(coords) == 1 else coords)))
    return features


def verified_source(manifest, key, cache_dir):
    """Cache versioned source files; never accept unchecked cached bytes."""
    source = manifest[key]
    path = Path(source['path'])
    if path.is_absolute() or '..' in path.parts:
        raise ValueError('Source path must stay under the public data directory')
    cached = cache_dir / path
    if cached.exists():
        blob = cached.read_bytes()
    else:
        blob = urlopen(BASE + path.as_posix(), timeout=120).read()
    if hashlib.sha256(blob).hexdigest() != source['sha256']:
        raise ValueError(f'{key} checksum mismatch')
    if len(blob) != source['gzipBytes']:
        raise ValueError(f'{key} size mismatch')
    if not cached.exists():
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(blob)
    return blob


def build(manifest_path=None, cache_dir=None):
    if manifest_path is None:
        manifest_bytes = urlopen(BASE + 'manifest.json', timeout=60).read()
        manifest = json.loads(manifest_bytes)
    else:
        manifest_bytes = Path(manifest_path).read_bytes()
        manifest = json.loads(manifest_bytes)
        # Accept the existing provenance wrapper for reproducible pinned builds.
        manifest = manifest.get('manifest', manifest)
    cache_dir = Path(cache_dir or ROOT / '.cache/cantre')
    blob = verified_source(manifest, 'snapshot', cache_dir)
    sha = hashlib.sha256(blob).hexdigest()
    detail_blob = verified_source(manifest, 'assetDetails', cache_dir)
    details = json.loads(gzip.decompress(detail_blob))
    data = gzip.decompress(blob)
    if data[:5] != b'CNTS\x01': raise ValueError('Unsupported snapshot')
    pos = 5
    def section():
        nonlocal pos
        n = struct.unpack_from('<I',data,pos)[0];pos += 4
        result = json.loads(data[pos:pos+n]);pos += n
        return result
    meta, records = section(), section()
    if meta['datasetVersion'] != manifest['datasetVersion']: raise ValueError('Version mismatch')
    geometries = {}
    for kind,dimensions in [('chains',3),('segments',2)]:
        for record in records[kind]:
            count,pos = read_varint(data,pos)
            if count < 1 or count > (len(data)-pos)//dimensions: raise ValueError('Invalid geometry count')
            values = [0]*dimensions;vertices=[]
            for _ in range(count):
                for axis in range(dimensions):
                    delta,pos = read_varint(data,pos)
                    if axis == 2 and delta < 0: raise ValueError('Negative chain distance')
                    values[axis] += delta
                if not (41.5e6 <= values[0] <= 83.5e6 and -141.5e6 <= values[1] <= -52e6):
                    raise ValueError('Coordinate outside Canada envelope')
                vertices.append(tuple(values))
            if kind == 'chains': geometries[record[0]] = vertices
    if pos != len(data): raise ValueError('Unconsumed geometry bytes')
    chosen = {c[0]:c for c in records['chains'] if c[2] in EXTENTS and 'CPR' in c[3]}
    calibration_exclusions = []
    intervals = qualified_intervals(records, chosen, calibration_exclusions)
    palette=['#155e63','#236d75','#3a738a','#406a9c','#a2663d','#7b7560','#6d7c40','#7d668f']
    subdivisions=[];tracks=[];samples=[]
    for n,(name,(role,extent,notes)) in enumerate(EXTENTS.items()):
        ids=[cid for cid,c in chosen.items() if c[2] == name]
        color=palette[n%len(palette)]
        subdivisions.append(dict(id=name,name=name,role=role,extent=extent,notes=notes,chainIds=ids))
        for cid in ids:
            coords=geometries[cid]
            tracks.append(dict(type='Feature',properties=dict(id=cid,subdivision=name,color=color,role=role),geometry=dict(type='LineString',coordinates=[[lo/1e6,la/1e6] for la,lo,_ in coords])))
            length=coords[-1][2]
            if length < 3e6: continue  # Short chains still display on map, not redundant weather samples.
            distances=[p[2] for p in coords]
            positions=sorted(set([*range(0,length,32_000_000),length]))
            for i,s in enumerate(positions):
                j=min(max(1,bisect.bisect_left(distances,s)),len(coords)-1)
                a,b=coords[j-1],coords[j];f=(s-a[2])/(b[2]-a[2]) if b[2] != a[2] else 0
                mp=milepost_at(s,intervals.get(cid,[]))
                samples.append(dict(id=f'{cid}-{i}',subdivision=name,chainId=cid,lat=round((a[0]+f*(b[0]-a[0]))/1e6,6),lon=round((a[1]+f*(b[1]-a[1]))/1e6,6),mp=round(mp,3) if mp is not None else None,positionKm=round(s/1e6,3)))
    assets = source_assets(records, chosen, intervals, details)
    references = whole_mile_assets(chosen, geometries, intervals)
    assets.extend(references)
    asset_counts = dict(sorted(Counter(a['properties']['kind'] for a in assets).items()))
    now=datetime.now(timezone.utc).isoformat()
    result=dict(metadata=dict(version=meta['datasetVersion'],retrievedAt=now,sourceVintage='NRWN features mostly 2016 or earlier; retrieval date is not feature currency.',attribution='Contains information licensed under the Open Government Licence – Canada',snapshotSha256=sha,
        assetDetailsSha256=manifest['assetDetails']['sha256'], assetCounts=asset_counts,
        weatherSampling='Model forecasts at independent chain endpoints and approximately 32 km spacing. Chains shorter than 3 km have no automatic weather sample. These are not weather stations.',
        milepostMethod='Calculated whole-mile reference points interpolated only inside monotone intervals containing published or Transport Canada anchors. Inconsistent mileage spacing is split using a 15% distance tolerance plus one 0.01-mile source posting step. No extrapolation or joining gaps. These are not surveyed or observed physical mileposts.',
        assetLimitations='Incomplete historical public inventory; missing records do not mean an asset is absent. Only assets positioned on the scoped historical CPR chains are included. Station records are not a complete list of railway operating points.'),subdivisions=subdivisions,tracks=dict(type='FeatureCollection',features=tracks),assets=dict(type='FeatureCollection',features=assets),samples=samples)
    output=ROOT/'public/data';output.mkdir(parents=True,exist_ok=True)
    (output/'network.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
    source=ROOT/'data/sources';source.mkdir(parents=True,exist_ok=True)
    if manifest_path is None:
        (source/'cantre-manifest.json').write_text(json.dumps(dict(sourceUrl=BASE+'manifest.json',retrievedAt=now,manifestSha256=hashlib.sha256(manifest_bytes).hexdigest(),manifest=manifest),indent=2)+'\n')
    (source/'railway-assets.json').write_text(json.dumps(dict(
        retrievedAt=now, datasetVersion=meta['datasetVersion'],
        snapshot=dict(url=BASE + manifest['snapshot']['path'], sha256=sha),
        assetDetails=dict(url=BASE + manifest['assetDetails']['path'], sha256=manifest['assetDetails']['sha256']),
        counts=asset_counts, sourceUrl=NRWN_URL,
        scopedMarkerpostAnchorCount=sum(a[0] in chosen and a[4] == 'markerpost' for a in records['anchors']),
        calibrationExclusions=calibration_exclusions,
        calculatedReferenceMethod=result['metadata']['milepostMethod'],
        limitations=result['metadata']['assetLimitations']), indent=2)+'\n')
    coverage=ROOT/'research/north-line/public-data-coverage.csv'
    coverage.parent.mkdir(parents=True,exist_ok=True)
    import csv
    with coverage.open('w') as f:
        writer=csv.writer(f, lineterminator='\n');writer.writerow(['subdivision_label','matching_chain_records','bridge_records','culvert_records','crossing_records','station_records','calculated_whole_mile_references','note'])
        for sub in subdivisions:
            counts=Counter(a[1] for a in records['assets'] if any(p[0] in sub['chainIds'] for p in a[4]))
            reference_count = sum(a['properties']['subdivision'] == sub['name'] for a in references)
            writer.writerow([sub['name'],len(sub['chainIds']),counts['bridge']+counts['moveableBridge'],counts['culvert'],counts['crossing'],counts['station'],reference_count,'Historical public feature records, not present physical asset counts. Whole-mile references are calculated, not surveyed posts.'])
    print(f'Extracted {len(subdivisions)} subdivisions, {len(tracks)} chains, {len(samples)} weather samples. Assets by kind: {asset_counts}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, help='Pinned manifest or existing provenance wrapper; omitted means acquire the latest manifest.')
    parser.add_argument('--cache-dir', type=Path, help='Checksum-verified source cache (default: .cache/cantre).')
    args = parser.parse_args()
    build(args.manifest, args.cache_dir)
