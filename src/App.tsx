import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronLeft, ChevronRight, CloudRain, ExternalLink, Layers, List, MapPin, Maximize2, MoreHorizontal, Pause, Play, RefreshCw, Route, Search, SlidersHorizontal, X } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import type { GaugeSnapshot, Network, Observation, TemperatureObservation, Sample, ScenarioInput, ScenarioResult, WeatherSnapshot } from './types';
import type { BasinSnowSnapshot, GaugeHistory, WeatherFrameState, HydrologySnapshot, LayerCatalog, LayerVisibility, PrecipitationMode, Selection, WeatherMode } from './map/contracts';
import { availableLayerTime, productFor, refreshLayerCatalog } from './map/layers';
import { EMPTY_RULES, evaluateThresholds, futureThresholds, readRules, RULE_INFO, type ThresholdAlert, type ThresholdRules } from './map/alerts';
import { forecastFresh, hourDate, HOUR } from './map/weather';
import { refreshTemperatureObservation } from './map/temperature-feed';
import { refreshGaugeObservations } from './map/gauge-feed';
import { refreshBasinSnow } from './map/snow-feed';
import { mergeWeather, newerSnapshot } from './map/feed-state';
import { fmt, timeLabel } from './lib/presentation';
import { summarizeWeather } from './lib/weather';
import { refreshForecast } from './lib/feeds';
import TrackMap from './components/TrackMap';
import { TERRAIN_LEGEND, TERRAIN_WMS, FLOW_WMS } from './map/terrain';
import SelectionDashboard from './components/SelectionDashboard';
import AlertsPanel from './components/AlertsPanel';
import LinearWeather from './components/LinearWeather';
import Analysis from './components/Analysis';
import Observations from './components/Observations';
import AIBrief from './components/AIBrief';

const base=import.meta.env.BASE_URL;
const repository='https://github.com/orgonag/RailwayWeatherPrediction';
type Tool='linear'|'ai'|'scenario'|'reports'|'about'|null;
type Drawer='layers'|'alerts'|null;
async function readData<T,>(file:string,signal?:AbortSignal):Promise<T>{
 const response=await fetch(base+'data/'+file,{signal});if(!response.ok)throw new Error(file+' could not load');return response.json();
}
function basinName(name:unknown){return typeof name==='string'?name.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()):'Drainage basin';}
export default function App(){
 const [network,setNetwork]=useState<Network|null>(null),[weather,setWeather]=useState<WeatherSnapshot|null>(null),[gauges,setGauges]=useState<GaugeSnapshot|null>(null);
 const [basins,setBasins]=useState<FeatureCollection|null>(null),[catalog,setCatalog]=useState<LayerCatalog|null>(null),[hydrology,setHydrology]=useState<HydrologySnapshot|null>(null),[snowpack,setSnowpack]=useState<BasinSnowSnapshot|null>(null);
 const [catchments,setCatchments]=useState<FeatureCollection|null>(null);
 const [majorBasins,setMajorBasins]=useState<FeatureCollection|null>(null),[observations,setObservations]=useState<TemperatureObservation[]>([]);
 const [weatherRequest,setWeatherRequest]=useState(0);
 const [frame,setFrame]=useState<WeatherFrameState|null>(null),[radarIndex,setRadarIndex]=useState<number|null>(null),[rangeHours,setRangeHours]=useState(24);
 const [now,setNow]=useState(()=>new Date()),[offset,setOffset]=useState(0),[playing,setPlaying]=useState(false),[subdivision,setSubdivision]=useState(()=>typeof matchMedia!=='undefined'&&matchMedia('(max-width:700px)').matches?'Wynyard':'');
 const [selection,setSelection]=useState<Selection>(null),[mode,setMode]=useState<WeatherMode|'radar'>('temperature'),[precipitationMode,setPrecipitationMode]=useState<PrecipitationMode>('type');
 const [visible,setVisible]=useState<LayerVisibility>({gauges:true,basins:false,snowpack:false,assets:false,mileposts:false,crossings:false,stations:false,culverts:false,majorBasins:false,observations:true,terrain:false,flow:false}),[opacity,setOpacity]=useState(.55),[fit,setFit]=useState(0);
 const [drawer,setDrawer]=useState<Drawer>(null),[tool,setTool]=useState<Tool>(null),[more,setMore]=useState(false),[search,setSearch]=useState(''),[searchOpen,setSearchOpen]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[loadError,setLoadError]=useState('');
 const [rules,setRules]=useState<ThresholdRules>(()=>{try{return readRules(JSON.parse(localStorage.getItem('rwp-alert-rules-v1')||'null'));}catch{return {...EMPTY_RULES};}});
 const [reports,setReports]=useState<Observation[]>(()=>{try{const v=JSON.parse(localStorage.getItem('rwp-reports-v1')||'[]');return Array.isArray(v)?v.filter(o=>o&&typeof o.id==='string'&&typeof o.text==='string'&&/^https?:\/\//i.test(o.sourceUrl)).slice(0,100):[];}catch{return [];}});
 const [scenario,setScenario]=useState<{input:ScenarioInput;result:ScenarioResult|null}|null>(null);
 const attemptedRoute=useRef('');
 const onScenario=useCallback((input:ScenarioInput,result:ScenarioResult|null)=>setScenario({input,result}),[]);
 useEffect(()=>{
   const abort=new AbortController();let active=true;
   readData<Network>('network.json',abort.signal).then(value=>{if(active)setNetwork(value);}).catch(e=>{if(active)setLoadError(e.message);});
   void Promise.allSettled([
     readData<WeatherSnapshot>('weather.json',abort.signal).then(value=>{if(active)setWeather(previous=>mergeWeather(previous,value));}),
     readData<GaugeSnapshot>('gauges.json',abort.signal).then(value=>{if(active)setGauges(previous=>newerSnapshot(previous,value));}),
     readData<FeatureCollection>('gauge-catchments.geojson',abort.signal).then(value=>{if(value.type!=='FeatureCollection'||!Array.isArray(value.features))throw Error('Invalid catchment dataset');if(active)setCatchments(value);}).catch(e=>{if(active)setError('Expanded catchment layer unavailable; original two boundaries retained. '+e.message);}),
     readData<FeatureCollection>('basins.geojson',abort.signal).then(value=>{if(active)setBasins(value);}),
     readData<LayerCatalog>('map-layers.json',abort.signal).then(value=>{if(active)setCatalog(previous=>newerSnapshot(previous,value));}),
     readData<{stations:TemperatureObservation[]}>('temperature-observations.json',abort.signal).then(value=>{if(active)setObservations(value.stations??[]);}),
     readData<BasinSnowSnapshot>('basin-snow.json',abort.signal).then(value=>{if(active)setSnowpack(previous=>newerSnapshot(previous,value));})
   ]);
   const timer=setInterval(()=>setNow(new Date()),60000);
   return()=>{active=false;abort.abort();clearInterval(timer);};
 },[]);
 useEffect(()=>{
   // Public metadata refreshes independently of the cached map/data download.
   const abort=new AbortController();
   refreshLayerCatalog(abort.signal).then(next=>{
     if(Object.values(next.products).some(p=>p.status==='available'))setCatalog(previous=>newerSnapshot(previous,next));
   }).catch(()=>{});return()=>abort.abort();
 },[]);
 useEffect(()=>{try{localStorage.setItem('rwp-alert-rules-v1',JSON.stringify(rules));}catch{setError('Alert settings could not be saved in this browser.');}},[rules]);
 useEffect(()=>{try{localStorage.setItem('rwp-reports-v1',JSON.stringify(reports));}catch{setError('Reports could not be saved. Export them before closing.');}},[reports]);
 useEffect(()=>{
   if(selection?.kind!=='gauge')return;
   const station=gauges?.gauges.find(g=>g.station===selection.id);if(!station)return;
   const abort=new AbortController();
   const update=(gauge:GaugeHistory)=>setHydrology(previous=>({fetchedAt:new Date().toISOString(),errors:previous?.errors??[],gauges:[...(previous?.gauges.filter(g=>g.station!==gauge.station)??[]),gauge]}));
   async function load(){
     let gauge:GaugeHistory|undefined;
     if(station!.historyPath)gauge=await readData<GaugeHistory>(station!.historyPath.replace(/^data\//,''),abort.signal);
     else gauge=(await readData<HydrologySnapshot>('hydrology.json',abort.signal)).gauges.find(g=>g.station===station!.station);
     if(!gauge||abort.signal.aborted)return;update(gauge);
     if(station!.realtimeProvider==='ECCC'||(!station!.provider)){
       const next=await refreshGaugeObservations(gauge,abort.signal);if(!abort.signal.aborted)update(next);
     }
   }
   void load().catch(e=>{if(!abort.signal.aborted)setError('Gauge history/update unavailable; dated readings are retained. '+(e as Error).message);});
   return()=>abort.abort();
 },[selection?.kind,selection?.id,gauges]);
 useEffect(()=>{
   if(!visible.majorBasins||majorBasins)return;const abort=new AbortController();
   void readData<FeatureCollection>('major-basins.geojson',abort.signal).then(setMajorBasins).catch(e=>{if(!abort.signal.aborted)setError('Regional basin layer could not load: '+e.message);});
   return()=>abort.abort();
 },[visible.majorBasins,majorBasins]);
 useEffect(()=>{
   if(selection?.kind!=='observation')return;
   const station=observations.find(s=>s.id===selection.id);if(!station)return;const abort=new AbortController();
   refreshTemperatureObservation(station,abort.signal).then(next=>{if(!abort.signal.aborted)setObservations(previous=>previous.map(s=>s.id===next.id?next:s));}).catch(e=>{if(!abort.signal.aborted)setError('Station refresh unavailable; dated observation retained. '+e.message);});
   return()=>abort.abort();
 },[selection?.kind,selection?.id,Boolean(observations.length)]);
 const mapBasins=catchments??basins;
 const missingCatchments=gauges?.gauges.filter(g=>!mapBasins?.features.some(f=>f.properties?.StationNum===g.station))??[];
 const latestSnowTime=catalog?.products.snowpack?.times.at(-1);
 useEffect(()=>{
   const product=catalog?.products.snowpack;
   if((!visible.snowpack&&selection?.kind!=='basin')||!basins?.features.length||!product||product.status!=='available')return;
   if(snowpack?.basins.length&&snowpack.basins.every(b=>b.time&&Date.parse(b.time)===Date.parse(latestSnowTime??'')))return;
   const abort=new AbortController();
   refreshBasinSnow(basins,product,abort.signal).then(next=>{if(!abort.signal.aborted)setSnowpack(next);}).catch(e=>{if(!abort.signal.aborted)setError('Snowpack update unavailable; the dated analysis is retained. '+(e as Error).message);});
   return()=>abort.abort();
 },[visible.snowpack,selection?.kind,basins,latestSnowTime]);
 useEffect(()=>{
   function escape(event:KeyboardEvent){if(event.key==='Escape'){setDrawer(null);setTool(null);setMore(false);setSearchOpen(false);setPlaying(false);}}
   window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
 },[]);
 const anchor=useMemo(()=>hourDate(now),[Math.floor(now.getTime()/HOUR)]);
 const selectedAt=useMemo(()=>new Date(anchor.getTime()+offset*HOUR),[anchor,offset]);
 const samples=useMemo(()=>network?.samples.filter(s=>!subdivision||s.subdivision===subdivision)??[],[network,subdivision]);
 const selectedSample=selection?.kind==='track'?network?.samples.find(s=>s.id===selection.id):undefined;
 const selectedPoint=selectedSample?weather?.points[selectedSample.id]:undefined;
 const selectedSummary={...summarizeWeather(selectedPoint,selectedAt),stale:!forecastFresh(selectedPoint,now)};
 const activeRules=RULE_INFO.filter(rule=>rules[rule.key]!==null).length;
 const currentChecks=useMemo(()=>evaluateThresholds(samples,weather,rules,selectedAt,now),[samples,weather,rules,selectedAt.getTime(),now.getTime()]);
 const selectedChecks=useMemo(()=>evaluateThresholds(selectedSample?[selectedSample]:[],weather,rules,selectedAt,now),[selectedSample,weather,rules,selectedAt,now]);
 const alertSampleIds=useMemo(()=>currentChecks.alerts.map(alert=>alert.sampleId),[currentChecks]);
 const future=useMemo(()=>futureThresholds(samples,weather,rules,now),[samples,weather,rules,now.getTime()]);
 const observationMode=mode==='temperature';
 const product=observationMode?null:mode==='radar'?catalog?.products.radar??null:productFor(catalog,mode,precipitationMode);
 const radarTimes=(product?.times??[]).filter(time=>Date.parse(time)>=now.getTime()-2*HOUR),radarPosition=radarIndex===null?Math.max(0,radarTimes.length-1):Math.min(radarIndex,Math.max(0,radarTimes.length-1));
 const periodMode=mode==='precipitation'&&precipitationMode==='accumulation';
 const layerTime=mode==='radar'?radarTimes[radarPosition]??null:availableLayerTime(product,selectedAt);
 const frameKey=`${product?.id??''}:${product?.runTime??''}:${layerTime??''}`;
 const onWeatherFrame=useCallback((next:WeatherFrameState)=>{setFrame(next);if(next.status==='error'||next.status==='unavailable')setPlaying(false);},[]);
 useEffect(()=>{
   if(!playing||observationMode)return;
   if(mode!=='none'&&!periodMode&&(frame?.key!==frameKey||frame.status!=='ready'))return;
   const timer=setTimeout(()=>{
     if(mode==='radar'){if(radarPosition>=radarTimes.length-1)setPlaying(false);else setRadarIndex(radarPosition+1);}
     else if(offset>=72)setPlaying(false);else setOffset(Math.min(72,offset+3));
   },1500);return()=>clearTimeout(timer);
 },[playing,frame,frameKey,mode,periodMode,offset,radarPosition,radarTimes.length]);
 const chooseAsset=(id:string)=>{const asset=network?.assets.features.find(f=>f.properties.id===id);if(asset){setSubdivision(asset.properties.subdivision);const kind=asset.properties.kind,key=kind==='milepost'?'mileposts':kind==='crossing'?'crossings':kind==='station'?'stations':kind==='culvert'?'culverts':'assets';setVisible(p=>({...p,[key]:true}));}setSelection({kind:'asset',id});setSearchOpen(false);setSearch('');setDrawer(null);};
 const chooseObservation=(id:string)=>{setSelection({kind:'observation',id});setSearchOpen(false);setSearch('');setDrawer(null);setVisible(p=>({...p,observations:true}));};
 const localInput=(date:Date)=>new Date(date.getTime()-6*HOUR).toISOString().slice(0,16);
 const periodEnd=new Date(selectedAt.getTime()+rangeHours*HOUR);

 const chooseSample=useCallback((sample:Sample)=>{setMode('precipitation');setSelection({kind:'track',id:sample.id});setSubdivision(sample.subdivision);setSearchOpen(false);setSearch('');setTool(null);setDrawer(null);},[]);
 const chooseGauge=(station:string)=>{setSelection({kind:'gauge',id:station});setSearchOpen(false);setSearch('');setDrawer(null);setTool(null);setVisible(p=>({...p,gauges:true}));};
 const chooseBasin=(station:string)=>{setSelection({kind:'basin',id:station});setSearchOpen(false);setSearch('');setDrawer(null);setVisible(p=>({...p,...(majorBasins?.features.some(f=>f.properties?.id===station)?{majorBasins:true}:{basins:true})}));};
 const changeOffset=(value:number)=>{setOffset(value);if(value>0&&mode==='radar'){setMode('precipitation');setPrecipitationMode('rate');}};
 const chooseAlert=(alert:ThresholdAlert)=>{const sample=network?.samples.find(s=>s.id===alert.sampleId);if(sample){chooseSample(sample);changeOffset(Math.max(0,Math.min(72,Math.round((Date.parse(alert.from)-anchor.getTime())/HOUR))));setPlaying(false);}};
 const refresh=useCallback(async()=>{
   if(!network||busy)return;setBusy(true);setError('');
   try{
     if(observationMode){
       let failures=0;
       for(let i=0;i<observations.length;i+=4){
         const results=await Promise.allSettled(observations.slice(i,i+4).map(s=>refreshTemperatureObservation(s)));
         const updated=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);failures+=results.filter(r=>r.status==='rejected').length;
         setObservations(previous=>previous.map(s=>updated.find(n=>n.id===s.id)??s));
       }
       if(failures)setError(`${failures} station refreshes unavailable; their dated readings are retained.`);
       setNow(new Date());return;
     }
     const selected=network.samples.filter(s=>!subdivision||s.subdivision===subdivision);
     for(let i=0;i<selected.length;i+=15){const next=await refreshForecast(selected.slice(i,i+15));setWeather(previous=>mergeWeather(previous,next));}
     const next=await refreshLayerCatalog();if(Object.values(next.products).some(p=>p.status==='available'))setCatalog(previous=>newerSnapshot(previous,next));
     if(selection?.kind==='gauge'){
       const gauge=hydrology?.gauges.find(g=>g.station===selection.id);
       if(gauge&&gauge.provider!=='WSA'){const updated=await refreshGaugeObservations(gauge);setHydrology(previous=>previous?{...previous,gauges:previous.gauges.map(g=>g.station===updated.station?updated:g)}:previous);}
     }
     if((visible.snowpack||selection?.kind==='basin')&&basins&&next.products.snowpack?.status==='available')setSnowpack(await refreshBasinSnow(basins,next.products.snowpack));
     setNow(new Date());
   }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 },[network,subdivision,busy,selection,hydrology,basins,visible.snowpack,observationMode,observations]);
 useEffect(()=>{
   if(observationMode||!network||!subdivision||busy)return;const point=weather?.points[network.samples.find(s=>s.subdivision===subdivision)?.id??''];
   if(point&&Date.now()-Date.parse(point.fetchedAt)<3*HOUR)return;
   const attempt=subdivision+':'+(point?.fetchedAt??'missing');if(attemptedRoute.current===attempt)return;attemptedRoute.current=attempt;
   void refresh();
   // Selection of a different route triggers at most one automatic refresh.
 },[network,subdivision,busy,weather?.fetchedAt,observationMode]);
 const searchItems=useMemo(()=>{
   const needle=search.trim().toLowerCase(),matches=(name:string)=>!needle||name.toLowerCase().includes(needle);
   return [
     ...(network?.assets.features.filter(f=>matches((f.properties.name??f.properties.kind)+' '+f.properties.subdivision+' '+f.properties.mp)).map(f=>({key:'a'+f.properties.id,title:(f.properties.name??f.properties.kind)+' · '+f.properties.subdivision,subtitle:f.properties.mp===null?'Mileage unavailable':'Calculated MP '+fmt(f.properties.mp),select:()=>chooseAsset(f.properties.id)}))??[]),
     ...observations.filter(g=>matches(g.name)).map(g=>({key:'o'+g.id,title:g.name,subtitle:'Observed temperature · '+g.provider,select:()=>chooseObservation(g.id)})),
     ...(gauges?.gauges.filter(g=>matches(g.name+' '+g.station)).map(g=>({key:'g'+g.station,title:g.name,subtitle:'Stream gauge · '+g.station,select:()=>chooseGauge(g.station)}))??[]),
     ...(majorBasins?.features.filter(f=>matches(String(f.properties?.name))).map(f=>({key:'r'+f.properties?.id,title:String(f.properties?.name),subtitle:'Regional drainage division',select:()=>chooseBasin(String(f.properties?.id))}))??[]),
     ...(mapBasins?.features.filter(f=>matches(String(f.properties?.NameNom))).map(f=>({key:'b'+f.properties?.StationNum,title:basinName(f.properties?.NameNom),subtitle:'Gauge catchment',select:()=>chooseBasin(String(f.properties?.StationNum))}))??[])
   ].slice(0,30);
 },[network,gauges,mapBasins,majorBasins,observations,search]);
 const context:Record<string,unknown>={
   generatedAt:now.toISOString(),selectedForecastTime:selectedAt.toISOString(),
   scope:network?.subdivisions.find(s=>s.id===subdivision)??{name:'North line and connected branches'},railSource:network?.metadata,
   selectedSample,routeForecasts:samples.map(sample=>({sample,forecast:weather?.points[sample.id]??null})),
   forecastTimezone:'UTC',displayTimezone:'America/Regina',forecastIssueTime:null,
   forecastUnits:{temperature_2m:'C',precipitation:'mm water equivalent',rain:'mm',showers:'mm',snow_depth:'m',snowfall:'cm',wind_speed_10m:'km/h',wind_gusts_10m:'km/h'},
   forecastSemantics:'Hourly accumulations and gust maxima refer to the preceding hour; temperature/depth instantaneous. Source acquisition is not forecast issue time.',
   pointForecastSource:'https://open-meteo.com/en/docs',pointForecastFetchedAt:selectedPoint?.fetchedAt??null,
   next24h:selectedSummary,gauges:gauges?.gauges??[],gaugeSnapshotFetchedAt:gauges?.fetchedAt??null,
   basinReferences:basins?.features.map(f=>({properties:f.properties}))??[],basinSnow:snowpack,
   seasonalBaselines:null,statisticalAssessment:null,thresholdRules:rules,forecastThresholdAlerts:currentChecks.alerts,manualScenario:scenario,observations:reports,
   gaps:['Gross gauge basins are not individual crossing catchments or proof of flow connection.','Historical gauge comparisons require compatible datum and calendar-year coverage.','No trained failure model, routed hydrograph or automatic social feed.','Point forecasts and gridded ECCC map products have different model/grid support.','Seasonal snowpack baseline unavailable.']
 };
 const metric=mode==='temperature'?'temperature':mode==='wind'?'wind':'rain';
 const currentLabel=mode==='temperature'?'Temperature readings':mode==='wind'?'Forecast wind gusts':mode==='radar'?'Recent radar':precipitationMode==='type'?'Precipitation type':precipitationMode==='rate'?'Precipitation intensity':'Precipitation over selected period';
 return <div className={'rwp-app'+(selection?' has-selection':'')}>
  <header className='map-topbar'>
   <a className='app-brand' href='#' onClick={event=>{event.preventDefault();setSelection(null);setSubdivision('');setFit(v=>v+1);}} aria-label='RWP home'><span><Route size={22}/></span><strong>RWP<small>Railway weather</small></strong></a>
   <div className='location-search'><Search size={17}/><input aria-label='Find a location' placeholder='Find a subdivision, milepost or gauge' value={search} onFocus={()=>setSearchOpen(true)} onChange={e=>{setSearch(e.target.value);setSearchOpen(true);}} onKeyDown={e=>{if(e.key==='Enter'&&searchItems[0])searchItems[0].select();}}/>
    {searchOpen&&<div className='search-results'><div className='search-result-heading'>Locations <button onClick={()=>setSearchOpen(false)} aria-label='Close location search'><X size={15}/></button></div>{searchItems.length?searchItems.map(item=><button key={item.key} onClick={item.select}><MapPin size={16}/><span><strong>{item.title}</strong><small>{item.subtitle}</small></span></button>):<p>No matching location. Try a subdivision name or milepost.</p>}</div>}
   </div>
   <label className='subdivision-select'><Route size={15}/><select aria-label='Subdivision' value={subdivision} onChange={e=>{setSubdivision(e.target.value);setSelection(null);setFit(v=>v+1);}}><option value=''>All subdivisions</option>{network?.subdivisions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <div className='header-actions'>
    <button className={drawer==='layers'?'tool-button active':'tool-button'} onClick={()=>{setDrawer(drawer==='layers'?null:'layers');setMore(false);}} aria-expanded={drawer==='layers'}><Layers size={18}/><span>Layers</span></button>
    <button className={drawer==='alerts'?'tool-button active':'tool-button'} onClick={()=>{setDrawer(drawer==='alerts'?null:'alerts');setMore(false);}} aria-expanded={drawer==='alerts'}><Bell size={18}/><span>Alerts</span>{currentChecks.alerts.length>0&&<b>{currentChecks.alerts.length}</b>}</button>
    <div className='more-menu-wrap'><button className='tool-button icon-only' aria-label='More tools' aria-expanded={more} onClick={()=>setMore(!more)}><MoreHorizontal size={21}/></button>{more&&<nav className='more-menu' aria-label='More tools'><button onClick={()=>{setTool('linear');setMore(false);}}><List size={16}/>Along the line</button><button onClick={()=>{setTool('reports');setMore(false);}}>Field reports</button><button onClick={()=>{setTool('ai');setMore(false);}}>AI briefing</button><button onClick={()=>{setTool('scenario');setMore(false);}}>Water scenario</button><button onClick={()=>{setTool('about');setMore(false);}}>Sources & information</button><a href={repository} target='_blank' rel='noreferrer'>GitHub <ExternalLink size={14}/></a></nav>}</div>
   </div>
  </header>
  <main className='map-workspace-main'>
   {network?<div className='map-canvas'><TrackMap network={network} weather={weather} subdivision={subdivision} selected={selectedSample?.id??''} metric={metric} offset={offset} now={anchor} basins={mapBasins} showBasins={visible.basins} showTerrain={visible.terrain} showFlow={visible.flow} showAssets={visible.assets} onSelect={chooseSample} onSubdivision={name=>{setSubdivision(name);setSelection(null);}} fitRequest={fit} selection={selection} gauges={gauges?.gauges??[]} showGauges={visible.gauges} snowpack={snowpack} showSnowpack={visible.snowpack} weatherLayer={mode==='none'||observationMode||periodMode?null:product} onWeatherFrame={onWeatherFrame} weatherRequest={weatherRequest} precipitationHours={periodMode?rangeHours:undefined} assetVisibility={visible} onAsset={chooseAsset} majorBasins={majorBasins} showMajorBasins={visible.majorBasins} observations={observations} showObservations={visible.observations} onObservation={chooseObservation} layerTime={layerTime} weatherOpacity={opacity} onGauge={chooseGauge} onBasin={chooseBasin} alertSampleIds={alertSampleIds}/></div>:<div className='map-loading' role='status'><Route size={32}/><strong>{loadError||'Loading the railway…'}</strong>{loadError&&<button onClick={()=>location.reload()}>Retry</button>}</div>}
   <div className='map-weather-toolbar'><label><CloudRain size={17}/><select aria-label='Weather layer' value={mode} onChange={e=>{setPlaying(false);setMode(e.target.value as WeatherMode|'radar');if(e.target.value==='temperature')setVisible(p=>({...p,observations:true}));if(e.target.value==='radar'){setOffset(0);setPlaying(false);}}}><option value='precipitation'>Precipitation</option><option value='temperature'>Temperature readings</option><option value='wind'>Forecast wind gusts</option><option value='radar'>Recent radar</option><option value='none'>Track only</option></select></label>
    {mode==='precipitation'&&<div className='weather-submodes' role='group' aria-label='Precipitation display'>{([['type','Type'],['rate','Rate'],['accumulation','Period']] as const).map(([value,text])=><button key={value} aria-pressed={precipitationMode===value} className={precipitationMode===value?'active':''} onClick={()=>setPrecipitationMode(value)}>{text}</button>)}</div>}
   </div>
   {periodMode&&<div className='map-accumulation-period period-picker'><strong>Water equivalent · mm · CST</strong><label>From<input type='datetime-local' aria-label='Precipitation period start' step='3600' value={localInput(selectedAt)} min={localInput(anchor)} max={localInput(new Date(anchor.getTime()+72*HOUR))} onChange={e=>{const next=Math.round((Date.parse(e.target.value+'-06:00')-anchor.getTime())/HOUR);if(Number.isFinite(next)&&next>=0&&next<=72){setOffset(next);setPlaying(false);}}}/></label><label>To<input type='datetime-local' aria-label='Precipitation period end' step='3600' value={localInput(periodEnd)} min={localInput(new Date(selectedAt.getTime()+HOUR))} max={localInput(new Date(anchor.getTime()+120*HOUR))} onChange={e=>{const hours=Math.round((Date.parse(e.target.value+'-06:00')-selectedAt.getTime())/HOUR);if(Number.isFinite(hours)&&hours>0&&hours<=120){setRangeHours(hours);setPlaying(false);}}}/></label><small>Forecast table · {rangeHours} hours. Missing hours stay unavailable.</small><button onClick={()=>setTool('linear')}>View period amounts</button></div>}
   <div className='map-quick-actions'><button aria-label='Fit railway network' title='Fit railway network' onClick={()=>{setSubdivision('');setFit(v=>v+1);}}><Maximize2 size={18}/></button><button aria-label='Refresh weather' title='Refresh weather' disabled={busy} onClick={()=>void refresh()}><RefreshCw size={18} className={busy?'spin':''}/></button></div>
   {!selection&&!drawer&&!searchOpen&&<div className='map-instruction'><MapPin size={17}/><span>Select a thermometer, gauge, asset or basin.</span></div>}
   {selection&&network&&<aside className='selection-panel' aria-label='Selected location dashboard'><SelectionDashboard key={selection.kind+':'+selection.id} selection={selection} network={network} weather={weather} basins={mapBasins} majorBasins={majorBasins} observations={observations} rangeHours={periodMode?rangeHours:undefined} gauges={gauges?.gauges??[]} hydrology={hydrology} snowpack={snowpack} selectedAt={selectedAt} now={now} alerts={currentChecks.alerts.filter(a=>selection.kind==='track'&&a.sampleId===selection.id)} activeRuleCount={activeRules} incompleteRuleCount={selectedChecks.unavailable} onClose={()=>setSelection(null)} onGauge={chooseGauge} onBasin={chooseBasin} onSample={chooseSample} onAlerts={()=>setDrawer('alerts')}/></aside>}
   {drawer&&<aside className='map-drawer' aria-label={drawer==='layers'?'Map layers':'Weather alerts'}><div className='drawer-heading'><h2>{drawer==='layers'?'Map layers':'Alerts'}</h2><button aria-label='Close panel' onClick={()=>setDrawer(null)}><X size={20}/></button></div>
    {drawer==='layers'?<div className='layer-panel-content'><p className='muted'>Choose what the map shows.</p>
     {([{key:'gauges',title:'Stream gauges',description:'Water readings and history',icon:'gauge'},{key:'basins',title:'Gauge catchments',description:'Area draining toward a particular stream gauge',icon:'basin'},{key:'snowpack',title:'Basin snowpack',description:'Water stored in the snow · mm',icon:'snow'},{key:'majorBasins',title:'Regional drainage divisions',description:'Broad regions containing many streams and catchments',icon:'basin'},{key:'terrain',title:'Terrain elevation',description:'Elevation colours and shaded relief · NRCan',icon:'basin'},{key:'flow',title:'Mapped stream direction',description:'Published stream arrows · zoom in to level 12+',icon:'basin'},{key:'observations',title:'Observed temperatures',description:'Actual station location and reading time',icon:'gauge'},{key:'mileposts',title:'Mile references',description:'Calculated whole miles · labels at zoom 9+',icon:'asset'},{key:'crossings',title:'Rail crossings',description:'Public, private and unknown access',icon:'asset'},{key:'assets',title:'Bridges',description:'Public historical records',icon:'asset'},{key:'culverts',title:'Culverts',description:'Sparse public inventory',icon:'asset'},{key:'stations',title:'Rail stations',description:'Sparse public inventory',icon:'asset'}] as const).map(item=><label className='layer-toggle' key={item.key}><span className={'layer-symbol '+item.icon}/><span><strong>{item.title}</strong><small>{item.description}</small></span><input type='checkbox' checked={Boolean(visible[item.key])} onChange={e=>setVisible(previous=>({...previous,[item.key]:e.target.checked}))}/></label>)}
     <p className='data-note'>{mapBasins?.features.length??0} of {gauges?.gauges.length??0} gauges have a published catchment in this build. {missingCatchments.length>0&&<>No matching boundary: {missingCatchments.map(g=>g.name+' ('+g.station+')').join('; ')}.</>}</p>
     {(visible.terrain||visible.flow)&&<div className='layer-explanation'><strong>Reading the terrain</strong><p>Elevation colours show higher and lower ground. Shading shows relief, not water movement. Stream arrows are the published network direction; zoom in to see them. Flat ground, ponds, ditches and culverts need more detailed drainage information.</p>{visible.terrain&&<><img className='terrain-scale' src={TERRAIN_LEGEND} alt='NRCan elevation colour scale in metres'/><a href={TERRAIN_WMS+'?service=WMS&request=GetCapabilities'} target='_blank' rel='noreferrer'>NRCan elevation source</a></>}{visible.flow&&<><p>National Hydro Network is a static mapping product, no longer maintained since 2022. Arrows do not represent current flow or a verified route to a railway crossing.</p><a href={FLOW_WMS+'?service=WMS&request=GetCapabilities'} target='_blank' rel='noreferrer'>NRCan hydrography source</a></>}</div>}
     <label className='opacity-control'>Weather transparency <span>{Math.round(opacity*100)}%</span><input aria-label='Weather overlay opacity' type='range' min='.15' max='.85' step='.05' value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label>
     {visible.snowpack&&<div className='layer-explanation'><strong>Snowpack water equivalent</strong><p>Colour shows estimated water stored in each basin's snow. This is the latest analysis, separate from the weather forecast.</p><p>Analysis: {timeLabel(snowpack?.basins[0]?.time)} CST</p><div className='snow-scale'/><span>0 <small>mm water</small> 150+</span></div>}
     <p className='data-note'>Snow water estimates currently cover the Birch Creek and Carrot River gauge basins. Regional outlines do not imply a snow estimate or a connection to a crossing.</p><details className='panel-details'><summary>Temperature readings</summary><p>Thermometers use actual observing stations, their measured temperatures and original observation times. There are no generated weather dots or inferred temperatures between stations. Point forecasts remain separately labelled in Along the line.</p></details>
     <details className='panel-details'><summary>Layer sources</summary><p>Weather maps: Environment and Climate Change Canada. Point weather: Open-Meteo. Gauge outlines: ECCC/WSC simplified map polygons. Regional divisions: WSA/AAFC. Snowpack: CaLDAS analysis. Gauge history: ECCC/WSC. Each selection shows its source times.</p><a href={base+'docs/MAP-LAYER-DATA.md'} target='_blank' rel='noreferrer'>Read layer methods ↗</a></details>
    </div>:<AlertsPanel current={currentChecks.alerts} future={future} rules={rules} onRules={setRules} onSelect={chooseAlert} unavailable={currentChecks.unavailable}/>}
   </aside>}
   {mode!=='none'&&!observationMode&&<details className='weather-legend'><summary><span className='legend-weather-dot'/>{currentLabel}<span className='legend-unit'>Key ▾</span></summary>
    {periodMode?<p>Sum of the {rangeHours} hourly precipitation amounts between the selected dates, in the forecast table. Rain and snowfall are expressed as mm of water. No interpolated rainfall surface.</p>:product?.status==='available'&&layerTime?<><span className='legend-time'>{mode==='radar'?'Observed ':'Forecast '}{timeLabel(layerTime)} CST</span>{product.legendUrl&&<img src={product.legendUrl} alt={currentLabel+' colour scale'}/>}<small>{mode==='precipitation'&&precipitationMode==='rate'?'Instantaneous model precipitation rate · mm/h.':'Environment Canada'}</small></>:<p className='legend-unavailable'>No layer image available for this time.</p>}
   </details>}
   {error&&<div className='map-error' role='alert'>{error}<button onClick={()=>setError('')} aria-label='Dismiss message'><X size={15}/></button></div>}
  </main>
  {observationMode?<footer className='forecast-control observation-footer'><strong>🌡 Actual station temperatures</strong><span>Each reading keeps its own observation time. Select a thermometer for time, source and history.</span></footer>:<footer className='forecast-control'>
   <button className='play-control' disabled={mode!=='none'&&!periodMode&&(!product||!layerTime)} onClick={()=>{if(!playing&&(frame?.status==='error'||frame?.status==='unavailable'))setWeatherRequest(v=>v+1);if(mode==='radar'){if(radarPosition===radarTimes.length-1)setRadarIndex(0);}else if(offset===72)setOffset(0);setPlaying(!playing);}} aria-label={playing?'Pause weather animation':'Play weather animation'}>{playing?<Pause size={18}/>:<Play size={18}/>}</button>
   <div className='forecast-date'><strong>{mode==='radar'?'Observed radar':offset===0?'Now':'+'+offset+' hours'}</strong><span>{timeLabel(mode==='radar'?layerTime:selectedAt.toISOString())} CST</span></div>
   {mode==='radar'?<div className='timeline-main'><div className='timeline-labels'><span>{timeLabel(radarTimes[0])} CST</span><button onClick={()=>{setRadarIndex(null);setPlaying(false);}}>Latest</button></div><input aria-label='Radar observation frame' type='range' min='0' max={Math.max(0,radarTimes.length-1)} step='1' value={radarPosition} onChange={e=>{setRadarIndex(Number(e.target.value));setPlaying(false);}}/></div>:<div className='timeline-main'><div className='timeline-labels'><button onClick={()=>{changeOffset(0);setPlaying(false);}}>Now</button>{[24,48,72].map(h=><button key={h} onClick={()=>{changeOffset(h);setPlaying(false);}}>+{h}h</button>)}</div><input aria-label='Forecast hour offset' type='range' min='0' max='72' step='1' value={offset} onChange={e=>{changeOffset(Number(e.target.value));setPlaying(false);}}/></div>}
   <div className='time-step-buttons'><button aria-label='Previous weather frame' disabled={mode==='radar'?radarPosition===0:offset===0} onClick={()=>{if(mode==='radar')setRadarIndex(radarPosition-1);else changeOffset(offset-1);setPlaying(false);}}><ChevronLeft size={18}/></button><button aria-label='Next weather frame' disabled={mode==='radar'?radarPosition===radarTimes.length-1:offset===72} onClick={()=>{if(mode==='radar')setRadarIndex(radarPosition+1);else changeOffset(offset+1);setPlaying(false);}}><ChevronRight size={18}/></button></div>
  </footer>}
  {tool&&<div className='tool-modal-backdrop' onClick={()=>setTool(null)}><section className='tool-modal' role='dialog' aria-modal='true' aria-label={tool==='linear'?'Along the line':tool==='ai'?'AI briefing':tool==='scenario'?'Water scenario':tool==='reports'?'Field reports':'Sources and information'} onClick={e=>e.stopPropagation()}><div className='tool-modal-heading'><strong>{tool==='linear'?'Along the line':tool==='ai'?'AI briefing':tool==='scenario'?'Water scenario':tool==='reports'?'Field reports':'Sources & information'}</strong><button aria-label='Close tool' onClick={()=>setTool(null)}><X size={22}/></button></div><div className='secondary-tools'>
   {tool==='linear'&&network&&<LinearWeather network={network} subdivision={subdivision||'Wynyard'} weather={weather} now={anchor} periodStart={periodMode?selectedAt:undefined} periodHours={periodMode?rangeHours:undefined} selected={selectedSample?.id??''} onSelect={chooseSample}/>}
   {tool==='ai'&&<AIBrief context={context}/>}
   {tool==='scenario'&&<Analysis summary={selectedSummary} gauges={gauges} initialInput={scenario?.input} onScenario={onScenario}/>}
   {tool==='reports'&&<Observations observations={reports} onChange={setReports}/>}
   {tool==='about'&&<div className='about-content'><h2>Weather, along the railway.</h2><p>RWP brings together the north line, its connected branches, weather, stream gauges and watershed information.</p><p>Forecasts and custom alerts support awareness and inspection planning. They do not establish safe track conditions or replace railway instructions.</p><h3>Coverage</h3><p>{network?.subdivisions.map(s=>s.name).join(' · ')}</p><h3>Public historical data</h3><p>Select a gauge, then View latest archive and choose a period-ending date. Select an observed temperature station to choose an exact archive date. Temperature archives contain daily mean, minimum and maximum; they do not recreate an exact-hour weather map. Missing dates remain unavailable.</p><a href={base+'data/water-coverage.json'} target='_blank' rel='noreferrer'>Gauge archive coverage and downloads</a><a href={base+'data/temperature-observations.json'} target='_blank' rel='noreferrer'>Temperature station directory and archive paths</a><h3>Read the sources</h3>{['DATA-SOURCES','METHODS','MAP-LAYER-DATA','GAUGE-HISTORY','RESEARCH','AI','MODEL-EXTENSIONS','RAILWAY-ASSETS','OBSERVED-TEMPERATURES','WATER-COVERAGE'].map(name=><a key={name} href={base+'docs/'+name+'.md'} target='_blank' rel='noreferrer'>{name.replaceAll('-',' ').toLowerCase()} <ExternalLink size={14}/></a>)}<p>{network?.metadata.attribution} Historical geometry and calculated mileposts require confirmation.</p><a href={repository} target='_blank' rel='noreferrer'>Project on GitHub <ExternalLink size={14}/></a></div>}
  </div></section></div>}
 </div>;
}
