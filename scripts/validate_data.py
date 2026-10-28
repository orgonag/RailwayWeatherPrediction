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
gauge_ids={g['station'] for g in gauges['gauges']}
require(len(gauge_ids)==len(gauges['gauges']),'Duplicate gauge source identities')
coverage=json.loads((data/'water-coverage.json').read_text())
require(gauge_ids=={a['station'] for a in coverage['archives']},'Gauge/archive manifest mismatch')
for g in gauges['gauges']:
    require(g.get('historyPath')==f"data/history/{g['station']}.json",'Unexpected history download path')
    history=json.loads((data/'history'/f"{g['station']}.json").read_text())
    require(history['station']==g['station'],'Wrong history station')
    for key,date_key in [('observations','time'),('daily','date')]:
        rows=history[key];dates=[r[date_key] for r in rows]
        require(dates==sorted(set(dates)),f'Duplicate/unordered {key}: {g["station"]}')
        for row in rows:
            time(row[date_key])
            require(numeric(row.get('levelM')) and numeric(row.get('dischargeM3s')),f'Invalid history value: {g["station"]}')
            if row.get('sourceType')=='derived-unit-values':
                for metric,prefix in [('levelM','level'),('dischargeM3s','discharge')]:
                    if row.get(metric) is not None:
                        require('RWP-derived' in row.get(prefix+'Qualifier',''),'Unlabelled derived archive value')
                        require(not row.get(prefix+'Provenance',{}).get('excludedReasons'),'Excluded archive value became numeric')
major=json.loads((data/'major-basins.geojson').read_text())
require(len({f['properties']['id'] for f in major['features']})==len(major['features']),'Duplicate regional basin IDs')
require(all(f['properties']['kind']=='major-drainage-basin' and f['properties'].get('sourceUrl') for f in major['features']),'Missing regional basin provenance')
require({f['properties']['StationNum'] for f in basins['features']}=={'05MA011','05KB003'},'Wrong gauge basin polygons')
temperatures=json.loads((data/'temperature-observations.json').read_text())
require(len({s['id'] for s in temperatures['stations']})==len(temperatures['stations']),'Duplicate observed-temperature station IDs')
for station in temperatures['stations']:
    sid=station['id']
    require(numeric(station['temperatureC']) and numeric(station['lat']) and numeric(station['lon']),'Invalid actual station temperature or coordinate')
    require(-90 <= station['lat'] <= 90 and -180 <= station['lon'] <= 180,'Observed station outside coordinate bounds')
    require(station['distanceToRailKm'] <= 75 and station.get('sourceUrl') and station.get('quality'),'Observed station scope/provenance missing')
    if station['observedAt']:
        require(time(station['observedAt']).tzinfo is not None,'Observation time lacks timezone')
    else:
        require(station['temperatureC'] is None,'Undated temperature observation')
    if station.get('historyPath'):
        require(station['historyPath']==f'data/temperature-history/{sid}.json','Unexpected temperature archive path')
        history=json.loads((data/'temperature-history'/f'{sid}.json').read_text())
        require(history['stationId']==sid and history['resolution']=='daily','Temperature archive identity/resolution mismatch')
        dates=[row['date'] for row in history['observations']]
        require(dates==sorted(set(dates)),f'Duplicate/unordered temperature dates: {sid}')
        for row in history['observations']:
            require(history['requestedStart'] <= row['date'] <= history['requestedEnd'],'Temperature day outside requested archive window')
            for key in ['mean','min','max']:
                require(numeric(row[key+'TemperatureC']),'Nonfinite daily temperature')
                if row[key+'Flag']:
                    require(row[key+'TemperatureC'] is None,'Flagged historical temperature treated as observed')
print(f'Validated {len(subs)} subdivisions, {len(ids)} weather samples, {len(gauges["gauges"])} gauges with downloadable history, {len(major["features"])} regional basins, two gross gauge basins and {len(temperatures["stations"])} actual temperature stations with daily archives.')
