"""Extract the RWP public scope from a checksum-verified CANTRE snapshot (CNTS/1).

Format: https://github.com/orgonag/cantre-research/blob/main/pipeline/schema/snapshot.md
NRWN geometry stays under OGL-Canada. No gaps or provincial borders are joined.
"""
import bisect
import gzip
import hashlib
import json
import struct
from collections import Counter
from datetime import datetime, timezone
from itertools import accumulate
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://orgonag.github.io/cantre-research/data/'
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

def build():
    manifest_bytes = urlopen(BASE+'manifest.json',timeout=60).read()
    manifest = json.loads(manifest_bytes)
    blob = urlopen(BASE+manifest['snapshot']['path'],timeout=120).read()
    sha = hashlib.sha256(blob).hexdigest()
    if sha != manifest['snapshot']['sha256']: raise ValueError('Snapshot checksum mismatch')
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
    anchor_lookup = {(a[0],a[1]):a for a in records['anchors']}
    intervals = {}
    for _,cid,ids in records['intervals']:
        if cid not in chosen: continue
        anchors = sorted([anchor_lookup[(cid,i)] for i in ids],key=lambda a:a[2])
        # Exclude unverified anchors; never bridge their missing section.
        if any(a[5] not in ('posted','tc') for a in anchors): continue
        pairs = [(a[2],a[3]) for a in anchors]
        diffs = [b[1]-a[1] for a,b in zip(pairs,pairs[1:])]
        if len(pairs) >= 2 and (all(d > 0 for d in diffs) or all(d < 0 for d in diffs)):
            intervals.setdefault(cid,[]).append(pairs)
    palette=['#155e63','#236d75','#3a738a','#406a9c','#a2663d','#7b7560','#6d7c40','#7d668f']
    subdivisions=[];tracks=[];samples=[];assets=[]
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
    for a in records['assets']:
        if a[1] not in ('bridge','moveableBridge','culvert'): continue
        positions=[p for p in a[4] if p[0] in chosen]
        if not positions: continue
        coords=list(zip([x/1e6 for x in accumulate(a[6])],[x/1e6 for x in accumulate(a[5])]))
        p=positions[0]
        assets.append(dict(type='Feature',properties=dict(id=a[0],kind=a[1],subdivision=chosen[p[0]][2],mp=p[4]),geometry=dict(type='Point' if len(coords)==1 else 'LineString',coordinates=coords[0] if len(coords)==1 else coords)))
    now=datetime.now(timezone.utc).isoformat()
    result=dict(metadata=dict(version=meta['datasetVersion'],retrievedAt=now,sourceVintage='NRWN features mostly 2016 or earlier; retrieval date is not feature currency.',attribution='Contains information licensed under the Open Government Licence – Canada',snapshotSha256=sha),subdivisions=subdivisions,tracks=dict(type='FeatureCollection',features=tracks),assets=dict(type='FeatureCollection',features=assets),samples=samples)
    output=ROOT/'public/data';output.mkdir(parents=True,exist_ok=True)
    (output/'network.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
    source=ROOT/'data/sources';source.mkdir(parents=True,exist_ok=True)
    (source/'cantre-manifest.json').write_text(json.dumps(dict(sourceUrl=BASE+'manifest.json',retrievedAt=now,manifestSha256=hashlib.sha256(manifest_bytes).hexdigest(),manifest=manifest),indent=2)+'\n')
    coverage=ROOT/'research/north-line/public-data-coverage.csv'
    coverage.parent.mkdir(parents=True,exist_ok=True)
    import csv
    with coverage.open('w') as f:
        writer=csv.writer(f);writer.writerow(['subdivision_label','matching_chain_records','bridge_records','culvert_records','public_grade_crossing_records','note'])
        for sub in subdivisions:
            counts=Counter(a[1] for a in records['assets'] if any(p[0] in sub['chainIds'] for p in a[4]))
            writer.writerow([sub['name'],len(sub['chainIds']),counts['bridge']+counts['moveableBridge'],counts['culvert'],counts['crossing'],'Historical public feature records, not present physical asset counts.'])
    print(f'Extracted {len(subdivisions)} subdivisions, {len(tracks)} chains, {len(samples)} weather samples, {len(assets)} structure records.')

if __name__ == '__main__': build()
