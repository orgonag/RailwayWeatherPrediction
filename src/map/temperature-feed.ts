import type { TemperatureObservation } from '../types';
const endpoint='https://api.weather.gc.ca/collections/swob-realtime/items';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function parseTemperatureObservation(station:TemperatureObservation,payload:unknown,now=Date.now()):TemperatureObservation {
 if(!object(payload)||!Array.isArray(payload.features)||payload.features.length>1)throw Error('Invalid station response');
 if(!payload.features.length)return {...station,temperatureC:null,observedAt:null,quality:'No current observation returned; no substituted forecast'};
 const f=payload.features[0];if(!object(f)||!object(f.properties)||!object(f.geometry))throw Error('Invalid station feature');
 const p=f.properties,g=f.geometry,coords=g.coordinates;
 if(p['msc_id-value']!==station.id||g.type!=='Point'||!Array.isArray(coords)||!finite(coords[0])||!finite(coords[1])||Math.abs(coords[0])>180||Math.abs(coords[1])>90)throw Error('Station identity/location mismatch');
 const observed=p['date_tm-value'];
 if(typeof observed!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(observed)||!Number.isFinite(Date.parse(observed))||Date.parse(observed)>now+60000||new Date(observed.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==observed.slice(0,10))throw Error('Invalid observation time');
 if(p.obs_date_tm!==undefined&&Date.parse(String(p.obs_date_tm))!==Date.parse(observed))throw Error('Conflicting observation times');
 if(typeof p['stn_nam-value']!=='string'||!p['stn_nam-value'])throw Error('Station name missing');
 const qa=p['air_temp-qa'],flag=p['air_temp-data_flag-value'];
 const allowed=(qa==null||qa===100)&&(flag==null||flag===1||flag===3)&&p['air_temp-uom']==='°C';
 const temperatureC=allowed&&finite(p.air_temp)?p.air_temp:null;
 const quality=(qa===100?'QA 100: Acceptable/Passed':qa==null?'QA not supplied; no pass claimed':`QA ${qa}: value withheld`)+(flag==null?'':`; source data flag ${flag}`)+(temperatureC===null?'; temperature unavailable':'')+'; provisional station observation';
 return {...station,name:p['stn_nam-value'],lon:coords[0],lat:coords[1],temperatureC,observedAt:observed,quality,provider:typeof p['data_pvdr-value']==='string'?p['data_pvdr-value']:station.provider};
}
/** One station on selection, never a mass spatial interpolation or replacement of its daily archive. */
export async function refreshTemperatureObservation(station:TemperatureObservation,signal?:AbortSignal):Promise<TemperatureObservation>{
 if(!/^[A-Za-z0-9]{5,12}$/.test(station.id))throw Error('Invalid weather station ID');
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal?.aborted)controller.abort();signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,20000);
 try{
  const query=new URLSearchParams({'msc_id-value':station.id,f:'json',limit:'1',sortby:'-date_tm-value'});
  const response=await fetch(endpoint+'?'+query,{signal:controller.signal});if(!response.ok)throw Error(`Station provider HTTP ${response.status}`);
  return parseTemperatureObservation(station,await response.json());
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
