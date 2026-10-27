"""Validate public data contracts; fail on missing locations/units/time arrays."""
import json
import math
from datetime import datetime
from pathlib import Path

root=Path(__file__).resolve().parents[1]
data=root/'public/data'
network=json.loads((data/'network.json').read_text())
weather=json.loads((data/'weather.json').read_text())
gauges=json.loads((data/'gauges.json').read_text())
basins=json.loads((data/'basins.geojson').read_text())
def require(condition,message):
    if not condition: raise ValueError(message)
def numeric(v):return v is None or (isinstance(v,(int,float)) and math.isfinite(v))
def time(v):return datetime.fromisoformat(v.replace('Z','+00:00'))
subs={s['id'] for s in network['subdivisions']}
require({'Hardisty','Wilkie','Sutherland','Wynyard','Tisdale'} <= subs,'Core scope missing')
ids={s['id'] for s in network['samples']}
require(len(ids)==len(network['samples']),'Duplicate sample IDs')
for s in network['samples']:
    require(41.5 <= s['lat'] <= 83.5 and -141.5 <= s['lon'] <= -52,'Invalid sample coordinate')
    require(s['subdivision'] in subs and numeric(s['mp']),'Invalid sample metadata')
require(ids <= weather['points'].keys(),'Weather snapshot missing sample records')
for sample in ids:
    point=weather['points'][sample];time(point['fetchedAt']);hours=point['hourly'];times=hours['time']
    require(len(times)>0 and times==sorted(set(times)),f'Unordered weather times: {sample}')
    parsed=[time(t) for t in times]
    require(all((b-a).total_seconds()==3600 for a,b in zip(parsed,parsed[1:])),f'Non-hourly weather timeline: {sample}')
    for key in ['temperature_2m','precipitation','rain','snow_depth','wind_speed_10m','wind_gusts_10m']:
        require(len(hours[key])==len(times),f'Weather array length mismatch: {sample}/{key}')
        require(all(numeric(v) for v in hours[key]),f'Nonfinite weather value: {sample}/{key}')
    for key in ['precipitation','rain','snow_depth','wind_speed_10m','wind_gusts_10m']:
        require(all(v is None or v >= 0 for v in hours[key]),f'Negative weather quantity: {key}')
for g in gauges['gauges']:
    require(numeric(g['levelM']) and numeric(g['dischargeM3s']),'Invalid gauge quantity')
    if g['time']:time(g['time'])
    else:require(g['levelM'] is None and g['dischargeM3s'] is None,'Undated gauge values')
require({f['properties']['StationNum'] for f in basins['features']}=={'05MA011','05KB003'},'Wrong gauge basin polygons')
print(f'Validated {len(subs)} subdivisions, {len(ids)} weather samples, {len(gauges["gauges"])} gauge records and two gross basins.')
