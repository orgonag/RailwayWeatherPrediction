"""Refresh public modelled weather and ECCC gauges without private credentials."""
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen, Request

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'public/data'
HOURLY='temperature_2m,precipitation,rain,showers,snow_depth,snowfall,weather_code,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m,soil_temperature_0cm,soil_moisture_0_to_1cm'

def get_json(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url,headers={'User-Agent':'RWP/0.1 public research dashboard'}),timeout=55) as response: return json.load(response)
        except Exception:
            if attempt == 2: raise
            time.sleep(attempt+1)

def main():
    network=json.loads((DATA/'network.json').read_text())
    now=datetime.now(timezone.utc).isoformat()
    points={};errors=[]
    def batch(samples):
        query=urlencode(dict(latitude=','.join(str(s['lat']) for s in samples),longitude=','.join(str(s['lon']) for s in samples),hourly=HOURLY,current='temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',past_days=1,forecast_days=5,timezone='GMT',wind_speed_unit='kmh'))
        result=get_json('https://api.open-meteo.com/v1/forecast?'+query)
        result=result if isinstance(result,list) else [result]
        if len(result) != len(samples): raise ValueError('Weather response count mismatch')
        return {s['id']:dict(sampleId=s['id'],fetchedAt=now,latitude=r['latitude'],longitude=r['longitude'],current=r.get('current'),hourly=r['hourly']) for s,r in zip(samples,result)}
    samples=network['samples']
    with ThreadPoolExecutor(max_workers=3) as pool:
        jobs=[pool.submit(batch,samples[i:i+15]) for i in range(0,len(samples),15)]
        for job in as_completed(jobs):
            try: points.update(job.result())
            except Exception as exc: errors.append(str(exc))
    if not points: raise RuntimeError('No weather fetched; previous snapshot preserved: '+'; '.join(errors))
    # Preserve older per-point timestamps when an individual batch failed.
    if (DATA/'weather.json').exists():
        previous=json.loads((DATA/'weather.json').read_text())
        points={**previous.get('points',{}),**points}
    (DATA/'weather.json').write_text(json.dumps(dict(fetchedAt=now,source='Open-Meteo Forecast API; modelled conditions and forecasts, not station observations',points=points,errors=errors),separators=(',',':'))+'\n')
    stations=[('05MA011','Birch Creek near Elfros',51.747,-103.87364),('05KB003','Carrot River near Armley',53.136391,-104.020828)]
    gauges=[]
    for station,name,lat,lon in stations:
        url='https://api.weather.gc.ca/collections/hydrometric-realtime/items?'+urlencode(dict(STATION_NUMBER=station,limit=25,sortby='-DATETIME'))
        g=dict(station=station,name=name,lat=lat,lon=lon,time=None,levelM=None,dischargeM3s=None,previousTime=None,previousLevelM=None,sourceUrl=url)
        try:
            data=get_json(url)['features']
            if not data: raise ValueError('No current gauge observations')
            latest=data[0]['properties'];g['lat']=data[0]['geometry']['coordinates'][1];g['lon']=data[0]['geometry']['coordinates'][0]
            g.update(time=latest['DATETIME'],levelM=latest.get('LEVEL'),dischargeM3s=latest.get('DISCHARGE'))
            if len(data)>1:
                old=data[-1]['properties'];g.update(previousTime=old['DATETIME'],previousLevelM=old.get('LEVEL'))
        except Exception as exc: g['error']=str(exc)
        gauges.append(g)
    (DATA/'gauges.json').write_text(json.dumps(dict(fetchedAt=now,gauges=gauges),indent=2)+'\n')
    print(f'Weather: {len(points)}/{len(samples)} samples; {len(errors)} batch errors. Gauges: {sum(g["time"] is not None for g in gauges)}/2.')
    if errors: raise RuntimeError('Partial weather refresh; errors retained in snapshot')

if __name__=='__main__':main()
