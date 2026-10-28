import {expect,it} from 'vitest';
import {parseTemperatureObservation} from '../src/map/temperature-feed';
import type {TemperatureObservation} from '../src/types';
const station:TemperatureObservation={id:'4018642',name:'Watrous',lat:51.6,lon:-105.4,temperatureC:2,observedAt:'2026-10-27T00:00:00Z',source:'ECCC',sourceUrl:'https://weather.gc.ca',provider:'MSC',quality:'QA100',historyPath:'data/temperature-history/4018642.json'};
const feature=(p:Record<string,unknown>={})=>({features:[{geometry:{type:'Point',coordinates:[-105.398,51.667]},properties:{'msc_id-value':station.id,'stn_nam-value':'WATROUS EAST','date_tm-value':'2026-10-28T04:00:00Z','air_temp':-1.2,'air_temp-uom':'°C','air_temp-qa':100,...p}}]});
const now=Date.parse('2026-10-28T05:00:00Z');
it('keeps station coordinates, original observation time and daily history path',()=>{
 const value=parseTemperatureObservation(station,feature(),now);expect(value).toMatchObject({lat:51.667,lon:-105.398,temperatureC:-1.2,observedAt:'2026-10-28T04:00:00Z',historyPath:station.historyPath});
});
it('withholds flagged or wrong-unit values and leaves an empty result missing',()=>{
 for(const p of [{'air_temp-qa':900},{'air_temp-data_flag-value':2},{'air_temp-uom':'K'}])expect(parseTemperatureObservation(station,feature(p),now).temperatureC).toBeNull();
 expect(parseTemperatureObservation(station,{features:[]},now)).toMatchObject({temperatureC:null,observedAt:null});
});
it('rejects a different station, conflicting timestamps and future measurements',()=>{
 for(const p of [{'msc_id-value':'other'},{'obs_date_tm':'2026-10-28T03:00:00Z'},{'date_tm-value':'2026-11-01T00:00:00Z'}])expect(()=>parseTemperatureObservation(station,feature(p),now)).toThrow();
});
