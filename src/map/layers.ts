import type { LayerCatalog, PrecipitationMode, WeatherLayerProduct, WeatherMode } from './contracts';

const WMS = 'https://geo.weather.gc.ca/geomet';
const CAPABILITIES = `${WMS}?service=WMS&version=1.3.0&request=GetCapabilities`;
// These are advertised GeoMet product/style pairs, not aliases inferred from field names.
const PRODUCTS:Record<string,{label:string;unit:string;layer:string;style:string}> = {
  precipitationType:{label:'RDPS · instantaneous precipitation type',unit:'type',layer:'RDPS_10km_PrecipType-Instant',style:'INSTPRECIPITATIONTYPE'},
  precipitationRate:{label:'RDPS · instantaneous precipitation rate',unit:'mm/h',layer:'RDPS_10km_PrecipRate',style:'PRECIPPRTMMH'},
  precipitationAccumulation:{label:'RDPS · water equivalent since forecast run',unit:'mm since run',layer:'RDPS_10km_Precip-Accum',style:'PRECIPMM'},
  temperature:{label:'RDPS · air temperature at 2 m',unit:'°C',layer:'RDPS_10km_AirTemp_2m',style:'TEMPERATURE-LINEAR'},
  wind:{label:'RDPS · wind gust estimate at 10 m',unit:'km/h',layer:'RDPS_10km_WindGust_10m',style:'GUST_MS2KMH'},
  snowpack:{label:'CaLDAS-NSRPS · snow water equivalent analysis',unit:'mm SWE',layer:'CaLDAS-NSRPS_2.5km_SnowWaterEquiv',style:'SNOWMASS'},
  radar:{label:'Radar · recent rain-rate observations',unit:'mm/h',layer:'RADAR_1KM_RRAI',style:'RADARURPPRECIPR14-LINEAR'},
};

function timestamp(value:string):number {
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  const time=Date.parse(value);
  if(!match || !Number.isFinite(time) || Number(match[2])<1 || Number(match[2])>12 || Number(match[3])<1 || Number(match[3])>new Date(Date.UTC(Number(match[1]),Number(match[2]),0)).getUTCDate() || Number(match[4])>23 || Number(match[5])>59 || Number(match[6]??0)>59) throw new Error('Invalid or timezone-less WMS timestamp');
  return time;
}

/** Expand advertised ISO8601 instants/ranges; never create frames between disjoint ranges. */
export function parseWmsTimes(value:string):string[] {
  const times=new Set<number>();
  if(!value.trim()) throw new Error('Missing WMS time dimension');
  for(const item of value.split(',')) {
    const parts=item.trim().split('/');
    if(parts.length===1) times.add(timestamp(parts[0]));
    else if(parts.length===3) {
      const start=timestamp(parts[0]),end=timestamp(parts[1]);
      // Month/year durations cannot be treated as a fixed number of hours.
      const duration=/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(parts[2]);
      if(!duration || !duration.slice(1).some(v=>v!==undefined)) throw new Error('Unsupported WMS duration');
      const step=((Number(duration[1]??0)*24+Number(duration[2]??0))*60*60+Number(duration[3]??0)*60+Number(duration[4]??0))*1000;
      if(!Number.isFinite(step) || (step>0 && step<1) || end<start || (step===0 && end!==start) || (step>0 && (end-start)/step>5000)) throw new Error('Invalid or excessive WMS time range');
      if(start===end) times.add(start);
      else for(let time=start;time<=end;time+=step) times.add(time);
    } else throw new Error('Malformed WMS time range');
    if(times.size>10000) throw new Error('Excessive WMS frames');
  }
  return [...times].sort((a,b)=>a-b).map(t=>new Date(t).toISOString());
}

export function productFor(catalog:LayerCatalog|null,weatherMode:WeatherMode,precipitationMode:PrecipitationMode):WeatherLayerProduct|null {
  const key=weatherMode==='precipitation'?{type:'precipitationType',rate:'precipitationRate',accumulation:'precipitationAccumulation'}[precipitationMode]:weatherMode;
  return weatherMode==='none'?null:catalog?.products[key]??null;
}

/** No nearest-time fallback: a missing hour is unavailable, including beyond the run horizon. */
export function availableLayerTime(product:WeatherLayerProduct|null,target:Date):string|null {
  if(!product || product.status!=='available' || !Number.isFinite(target.getTime())) return null;
  return product.times.find(time=>Date.parse(time)===target.getTime())??null;
}

function unavailable(id:string,error:string):WeatherLayerProduct {
  const p=PRODUCTS[id];
  return {id,label:p.label,unit:p.unit,wmsLayer:p.layer,style:p.style,sourceUrl:WMS,times:[],runTime:null,legendUrl:null,status:'unavailable',error};
}

function children(node:Element,name:string):Element[] {
  return Array.from(node.children).filter(child=>child.localName===name);
}

/** Parse only the requested leaf layer, avoiding inherited/group metadata and service exceptions. */
export function productFromCapabilities(id:string,xml:string):WeatherLayerProduct {
  const p=PRODUCTS[id];
  if(!p) throw new Error(`Unknown map product ${id}`);
  try {
    const document=new DOMParser().parseFromString(xml,'application/xml');
    if(document.getElementsByTagName('parsererror').length) throw new Error('Invalid capabilities XML');
    const layer=Array.from(document.getElementsByTagNameNS('*','Layer')).find(element=>children(element,'Name')[0]?.textContent===p.layer);
    if(!layer) throw new Error('Requested layer absent from capabilities');
    const dimensions=children(layer,'Dimension');
    const times=parseWmsTimes(dimensions.find(element=>element.getAttribute('name')==='time')?.textContent??'');
    const reference=dimensions.find(element=>element.getAttribute('name')==='reference_time')?.getAttribute('default');
    if(id!=='radar' && !reference) throw new Error('Model reference time absent from capabilities');
    const style=children(layer,'Style').find(element=>children(element,'Name')[0]?.textContent===p.style);
    if(!style) throw new Error('Requested style absent from capabilities');
    const resource=style.getElementsByTagNameNS('*','OnlineResource')[0];
    const href=resource?.getAttributeNS('http://www.w3.org/1999/xlink','href')??null;
    return {id,label:p.label,unit:p.unit,wmsLayer:p.layer,style:p.style,sourceUrl:WMS,times,runTime:reference?new Date(timestamp(reference)).toISOString():null,legendUrl:href?.startsWith('https://')?href:null,status:'available'};
  } catch(error) {return unavailable(id,error instanceof Error?error.message:String(error));}
}

/** CORS-enabled filtered capabilities; three in-flight requests, one layer per provider request. */
export async function refreshLayerCatalog(signal?:AbortSignal):Promise<LayerCatalog> {
  const catalog:LayerCatalog={fetchedAt:new Date().toISOString(),sourceUrl:CAPABILITIES,products:{},errors:[]};
  const ids=Object.keys(PRODUCTS);
  let next=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(next<ids.length) {
      const id=ids[next++],controller=new AbortController();
      const abort=()=>controller.abort(signal?.reason);
      if(signal?.aborted) abort();
      signal?.addEventListener('abort',abort,{once:true});
      const timeout=setTimeout(()=>controller.abort(),20000);
      try {
        const response=await fetch(`${CAPABILITIES}&layers=${encodeURIComponent(PRODUCTS[id].layer)}`,{signal:controller.signal});
        if(!response.ok) throw new Error(`GeoMet HTTP ${response.status}`);
        catalog.products[id]=productFromCapabilities(id,await response.text());
      } catch(error) {catalog.products[id]=unavailable(id,error instanceof Error?error.message:String(error));}
      finally {clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
      if(catalog.products[id].status==='unavailable') catalog.errors.push(`${id}: ${catalog.products[id].error}`);
    }
  }));
  if(signal?.aborted) throw signal.reason??new DOMException('Aborted','AbortError');
  return catalog;
}
