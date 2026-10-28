import { useEffect, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import type { Gauge, Network, Sample, TemperatureObservation, WeatherSnapshot } from '../types';
import type { BasinSnowSnapshot, GaugeHistory, HydrologySnapshot, Selection } from '../map/contracts';
import type { ThresholdAlert } from '../map/alerts';
import { valueAt, conditionAt, compass, liquidRain, sumHours, forecastFresh } from '../map/weather';
import { fmt } from '../lib/presentation';
import GaugeChart from './GaugeChart';
import './selection-dashboard.css';

interface Props {
  selection:Selection;network:Network;weather:WeatherSnapshot|null;basins:FeatureCollection|null;
  majorBasins?:FeatureCollection|null;observations?:TemperatureObservation[];rangeHours?:number;
  gauges:Gauge[];hydrology:HydrologySnapshot|null;snowpack:BasinSnowSnapshot|null;selectedAt:Date;now:Date;
  alerts:ThresholdAlert[];activeRuleCount:number;incompleteRuleCount?:number;onClose:()=>void;onGauge:(station:string)=>void;
  onSample:(sample:Sample)=>void;onAlerts:()=>void;
}
const timestamp=(value:string|Date|null|undefined)=>{
  if(!value)return 'Unavailable';
  const date=value instanceof Date?value:new Date(value.endsWith('Z')||/[+-]\d\d:\d\d$/.test(value)?value:`${value}Z`);
  return Number.isFinite(date.getTime())?`${date.toLocaleString('en-CA',{timeZone:'America/Regina',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} CST`:'Unavailable';
};
const number=(value:number|null|undefined,unit:string,digits=1)=>value==null||!Number.isFinite(value)?'Unavailable':`${fmt(value,digits)} ${unit}`;
const position=(sample:Sample)=>sample.mp===null?'Milepost uncalibrated':`Calculated MP ${fmt(sample.mp)}`;
const safeUrl=(value:string|undefined)=>value&&/^https?:\/\//i.test(value)?value:undefined;

function TrackDetails({sample,props}:{sample:Sample;props:Props}){
  const point=props.weather?.points[sample.id],at=props.selectedAt;
  const temperature=valueAt(point,'temperature_2m',at),precipitation=valueAt(point,'precipitation',at);
  const speed=valueAt(point,'wind_speed_10m',at),gust=valueAt(point,'wind_gusts_10m',at),direction=valueAt(point,'wind_direction_10m',at);
  const hours=props.rangeHours??24;
  const rain=liquidRain(point,at,hours),snow=sumHours(point,'snowfall',at,hours),water=sumHours(point,'precipitation',at,hours);
  const depth=valueAt(point,'snow_depth',at),fresh=forecastFresh(point,props.now);
  return <>
    <div className="selection-time"><span>Forecast at</span><strong>{timestamp(at)}</strong></div>
    <div className="selection-weather-lead">
      <output aria-label="Temperature at selected time">{number(temperature,'°C')}</output>
      <p>{conditionAt(point,at)}</p>
    </div>
    <dl className="selection-readings">
      <div><dt>Preceding hour</dt><dd>{number(precipitation,'mm')}</dd></div>
      <div><dt>Wind</dt><dd>{number(speed,'km/h')}{speed!==null&&direction!==null?` ${compass(direction)}`:''}</dd></div>
      <div><dt>Wind gusts</dt><dd>{number(gust,'km/h')}</dd></div>
      {depth!==null&&depth>0&&<div><dt>Modelled snow depth</dt><dd>{number(depth*100,'cm')}</dd></div>}
    </dl>
    <section className="selection-section" aria-label={props.rangeHours?'Selected precipitation period':'Next 24 hours at selected location'}>
      <h3>{props.rangeHours?'Selected period':'Next 24 hours'}</h3>
      <p className="selection-context">From {timestamp(at)} to {timestamp(new Date(at.getTime()+hours*3600000))} · {hours} hours</p>
      <dl className="selection-totals">
        <div><dt>Liquid rain</dt><dd><output aria-label={props.rangeHours?'Selected period liquid rain':'Next24h liquid rain'}>{number(rain,'mm')}</output></dd></div>
        <div><dt>Snowfall</dt><dd>{number(snow,'cm')}</dd></div>
        <div><dt>Total water equivalent</dt><dd><output aria-label={props.rangeHours?'Selected period total water equivalent':'Next24h total water equivalent'}>{number(water,'mm')}</output></dd></div>
      </dl>
    </section>
    <section className="selection-section selection-alerts" aria-label="Selected location threshold alerts">
      <div className="selection-section-heading"><h3>Thresholds</h3><button type="button" onClick={props.onAlerts}>Settings</button></div>
      {props.alerts.length>0?<ul>{props.alerts.map(alert=><li key={alert.id}>
        <strong>{alert.label}: {number(alert.value,alert.unit)}</strong>
        <span>Threshold {number(alert.threshold,alert.unit)}</span>
        <span>{timestamp(alert.from)}{alert.from===alert.to?'':' – '+timestamp(alert.to)}</span>
      </li>)}</ul>:<p>{props.activeRuleCount===0?'No thresholds set':props.incompleteRuleCount?'Threshold checks unavailable':'No threshold crossed'}</p>}
      {props.alerts.length>0&&Boolean(props.incompleteRuleCount)&&<p className='selection-context'>Some other threshold checks are unavailable.</p>}
      {props.activeRuleCount>0&&!fresh&&<p className="selection-context">Forecast checks are incomplete while weather is unavailable or out of date.</p>}
    </section>
    <div className={`selection-source-line${point&&!fresh?' needs-refresh':''}`}>{point?`Retrieved ${timestamp(point.fetchedAt)}${fresh?'':' · needs refresh'}`:'Weather unavailable for this location'}</div>
    <details className="selection-details"><summary>Details and sources</summary>
      <p>Open-Meteo point forecast at this rail sample. Samples were selected approximately every 32 km along each continuous track chain, plus endpoints. It represents a model grid location, rather than a measurement beside the track or a basin average.</p>
      <p>Hourly precipitation covers the hour ending at the selected time. Period amounts sum the hourly intervals ending after the start and at or before the end; missing intervals remain unavailable. Liquid rain includes rain and showers. Total water equivalent includes rain and snow.</p>
      {depth!==null&&depth>0&&<p>Modelled snow depth is not snow water equivalent.</p>}
      <p>{position(sample)} is interpolated from public anchors where available; it is not surveyed or posted railway mileage. Historical rail geometry does not establish current operating limits.</p>
      <p>Location {sample.lat.toFixed(4)}, {sample.lon.toFixed(4)}. Forecast retrieval: {timestamp(point?.fetchedAt)}. No model issue time is supplied by this point forecast.</p>
      <p>Thresholds are uncalibrated research settings, separate from official warnings.</p>
      <a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">Open-Meteo forecast source</a>
    </details>
  </>;
}

function gaugeHistory(props:Props,station:string):GaugeHistory|null{
  const history=props.hydrology?.gauges.find(gauge=>gauge.station===station);
  const current=props.gauges.find(gauge=>gauge.station===station);
  if(history)return history;
  if(!current)return null;
  // Only original timestamped observations may stand in for the history feed.
  const observations:GaugeHistory['observations']=[];
  if(current.previousTime)observations.push({time:current.previousTime,levelM:current.previousLevelM,dischargeM3s:null});
  if(current.time)observations.push({time:current.time,levelM:current.levelM,dischargeM3s:current.dischargeM3s});
  return {station:current.station,name:current.name,lat:current.lat,lon:current.lon,sourceUrl:current.sourceUrl,datum:null,
    observations,daily:[],historyAvailableThrough:null,errors:[current.error??'Historical daily comparisons are unavailable.']};
}
function GaugeDetails({station,props}:{station:string;props:Props}){
  const history=gaugeHistory(props,station),gauge=props.gauges.find(item=>item.station===station);
  const latest=history?.observations.filter(item=>Number.isFinite(Date.parse(item.time))&&Date.parse(item.time)<=props.now.getTime()).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time))[0];
  const qualifiers=latest as (typeof latest & {levelQualifier?:string|null;dischargeQualifier?:string|null});
  const time=latest?.time??(gauge?.time&&Date.parse(gauge.time)<=props.now.getTime()?gauge.time:null);
  const level=latest?latest.levelM:time?gauge?.levelM:null,flow=latest?latest.dischargeM3s:time?gauge?.dischargeM3s:null;
  return <>
    <p className="selection-context selection-station">Station {station} · {gauge?.provider??history?.provider??'ECCC'}{gauge?.operator?' · '+gauge.operator:''}</p>
    <div className="selection-time"><span>Latest observation</span><strong>{timestamp(time)}</strong></div>
    {time&&props.now.getTime()-Date.parse(time)>6*3600000&&<p className="selection-source-line needs-refresh">Latest reading is over 6 hours old.</p>}
    <dl className="selection-readings">
      <div><dt>Water level</dt><dd>{number(level,'m',3)}</dd></div>
      <div><dt>Flow</dt><dd>{number(flow,'m³/s',2)}</dd></div>
    </dl>
    {(qualifiers?.levelQualifier||qualifiers?.dischargeQualifier)&&<p className="selection-context">{qualifiers.levelQualifier?`Level qualifier: ${qualifiers.levelQualifier}. `:''}{qualifiers.dischargeQualifier?`Flow qualifier: ${qualifiers.dischargeQualifier}.`:''}</p>}
    <p className="selection-context">Gauge readings stay at their observed times as the forecast hour changes.</p>
    {history?<GaugeChart gauge={history} now={props.now}/>:<p className="selection-empty">Gauge history unavailable.</p>}
  </>;
}
function BasinDetails({station,props}:{station:string;props:Props}){
  const feature=props.basins?.features.find(basin=>String(basin.properties?.StationNum)===station);
  const regional=props.majorBasins?.features.find(basin=>String(basin.properties?.id)===station);
  if(regional)return <><p className='selection-context'>Regional drainage basin</p><p>This boundary provides regional drainage context. It is not a verified catchment for a railway crossing, and has no basin snow estimate attached.</p><p>{String(regional.properties?.source??'')}</p>{safeUrl(regional.properties?.sourceUrl)&&<a href={safeUrl(regional.properties?.sourceUrl)} target='_blank' rel='noreferrer'>Boundary source and licence</a>}</>;
  const snow=props.snowpack?.basins.find(basin=>basin.station===station);
  const area=typeof feature?.properties?.Area_km2==='number'?feature.properties.Area_km2:null;
  const gauge=props.hydrology?.gauges.find(item=>item.station===station)??props.gauges.find(item=>item.station===station);
  const comparison=snow?.sweMm!=null&&snow?.seasonalMeanMm!=null&&snow.seasonalMeanMm>0?(snow.sweMm/snow.seasonalMeanMm-1)*100:null;
  return <>
    <p className="selection-context selection-station">Gross gauge basin · {station}</p>
    <div className="selection-time"><span>Snow analysis</span><strong>{timestamp(snow?.time)}</strong></div>
    <div className="selection-snow-lead"><span>Snow water equivalent</span><strong>{number(snow?.sweMm,'mm')}</strong></div>
    <p className="selection-context">Water held in the modelled basin snowpack.</p>
    <dl className="selection-readings">
      {snow?.snowDepthCm!=null&&<div><dt>Modelled snow depth</dt><dd>{number(snow.snowDepthCm,'cm')}</dd></div>}
      <div><dt>Gross basin area</dt><dd>{number(area,'km²',0)}</dd></div>
    </dl>
    <section className="selection-section"><h3>Seasonal comparison</h3>
      {comparison===null?<p>Seasonal comparison unavailable</p>:<p><strong>{fmt(Math.abs(comparison),0)}% {comparison>=0?'above':'below'} seasonal mean</strong><br/>{number(snow?.seasonalMeanMm,'mm')} mean SWE</p>}
    </section>
    {gauge&&<button type="button" className="selection-gauge-link" onClick={()=>props.onGauge(station)}>View gauge · {station}<span>{gauge.name}</span></button>}
    <p className="selection-source-line">{snow?`Analysis ${timestamp(snow.time)}`:'Snow water equivalent unavailable'}</p>
    <details className="selection-details"><summary>Details and sources</summary>
      <p>This is the gross drainage basin for gauge {station}. It does not establish the drainage area or a flow path to any railway crossing.</p>
      <p>{snow?.method??'Basin snow estimates are unavailable.'}</p>
      <p>Valid model coverage: {snow?.coverageFraction==null?'unavailable':`${fmt(snow.coverageFraction*100,0)}%`} · {snow?.sampleCount??0} grid samples. Analysis {timestamp(snow?.time)}. Retrieved {timestamp(props.snowpack?.fetchedAt)}.</p>
      <p>Snow water equivalent and snow depth are separate model fields. No fixed density conversion is applied. Seasonal comparisons require an actual historical baseline.</p>
      {snow?.error&&<p>{snow.error}</p>}
      {safeUrl(snow?.sourceUrl)&&<a href={safeUrl(snow?.sourceUrl)} target="_blank" rel="noreferrer">Basin snow source</a>}
      <a href="https://open.canada.ca/data/en/dataset/0c121878-ac23-46f5-95df-eb9960753375" target="_blank" rel="noreferrer">ECCC gross basin boundaries</a>
    </details>
  </>;
}

function AssetDetails({id,props}:{id:string;props:Props}){
 const asset=props.network.assets.features.find(f=>f.properties.id===id);if(!asset)return <p>Asset unavailable.</p>;
 const p=asset.properties;
 return <><p className='selection-context'>{p.kind} · {p.subdivision}</p><dl className='selection-readings'><div><dt>Calculated mileage</dt><dd>{p.mp==null?'Unavailable':`MP ${fmt(p.mp)}${p.mpEnd!=null&&p.mpEnd!==p.mp?'–'+fmt(p.mpEnd):''}`}</dd></div>{p.postedMp!=null&&<div><dt>Source mileage ({p.postedMileageTier??'unverified'})</dt><dd>{p.postedMp}</dd></div>}</dl><p>{p.kind==='milepost'?'Calculated whole-mile reference along a calibrated chain. This does not confirm a physical milepost exists at this coordinate.':'Historical public asset record; current condition and inventory completeness are unknown.'}</p><details className='selection-details' open><summary>Source record</summary><p>{p.sourceLayer} · ID {p.id}</p>{Object.entries(p.sourceAttributes??{}).map(([key,value])=><p key={key}><strong>{key}: </strong>{String(value)}</p>)}{safeUrl(p.sourceUrl)&&<a href={safeUrl(p.sourceUrl)} target='_blank' rel='noreferrer'>Original asset source</a>}</details></>;
}
type TemperatureDay={date:string;meanTemperatureC:number|null;minTemperatureC:number|null;maxTemperatureC:number|null;meanFlag?:string;minFlag?:string;maxFlag?:string};
function ObservationDetails({id,props}:{id:string;props:Props}){
 const station=props.observations?.find(s=>s.id===id),[history,setHistory]=useState<TemperatureDay[]|null>(null),[date,setDate]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(!station?.historyPath)return;const abort=new AbortController();fetch(import.meta.env.BASE_URL+station.historyPath,{signal:abort.signal}).then(r=>{if(!r.ok)throw Error('Archive unavailable');return r.json();}).then(r=>setHistory(r.observations??[])).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[station?.historyPath]);
 if(!station)return <p>Observation unavailable.</p>;
 const day=history?.find(d=>d.date===date);
 return <><p className='selection-context'>{station.provider} · {station.id}</p><div className='selection-time'><span>Observed at station</span><strong>{timestamp(station.observedAt)}</strong></div><div className='selection-weather-lead'><output>{number(station.temperatureC,'°C')}</output></div>{station.observedAt&&props.now.getTime()-Date.parse(station.observedAt)>3*3600000&&<p className='selection-source-line needs-refresh'>Dated observation: over 3 hours old.</p>}<p>Station coordinates: {station.lat.toFixed(4)}, {station.lon.toFixed(4)}. No temperature is inferred between stations. Readings stay at their observation time as the forecast slider changes.</p><p>{station.quality}</p>{station.historyPath&&<section className='selection-section'><h3>Historical daily temperature</h3><label>Archive date <input aria-label='Temperature archive date' type='date' min={station.historyStart} max={station.historyEnd} value={date} onChange={e=>setDate(e.target.value)}/></label>{date&&(day?<dl className='selection-readings'><div><dt>Daily mean</dt><dd>{number(day.meanTemperatureC,'°C')} {day.meanFlag}</dd></div><div><dt>Minimum</dt><dd>{number(day.minTemperatureC,'°C')} {day.minFlag}</dd></div><div><dt>Maximum</dt><dd>{number(day.maxTemperatureC,'°C')} {day.maxFlag}</dd></div></dl>:<p>{history?'No daily record for this date.':'Loading archive…'}</p>)}<p>Daily station measurements; an exact-hour reading is not reconstructed. {station.historyStart}–{station.historyEnd}.</p><a href={import.meta.env.BASE_URL+station.historyPath} target='_blank' rel='noreferrer'>Download station archive (JSON)</a>{error&&<p>{error}</p>}</section>}{safeUrl(station.sourceUrl)&&<a href={safeUrl(station.sourceUrl)} target='_blank' rel='noreferrer'>{station.source}</a>}</>;
}

export default function SelectionDashboard(props:Props){
  const [expanded,setExpanded]=useState(false),selection=props.selection;
  if(!selection)return null;
  const sample=selection.kind==='track'?props.network.samples.find(item=>item.id===selection.id):undefined;
  const gauge=selection.kind==='gauge'?props.hydrology?.gauges.find(item=>item.station===selection.id)??props.gauges.find(item=>item.station===selection.id):undefined;
  const basin=selection.kind==='basin'?props.basins?.features.find(item=>String(item.properties?.StationNum)===selection.id):undefined;
  const snow=selection.kind==='basin'?props.snowpack?.basins.find(item=>item.station===selection.id):undefined;
  const asset=selection.kind==='asset'?props.network.assets.features.find(f=>f.properties.id===selection.id):undefined;
  const regional=selection.kind==='basin'?props.majorBasins?.features.find(f=>f.properties?.id===selection.id):undefined;
  const observation=selection.kind==='observation'?props.observations?.find(f=>f.id===selection.id):undefined;
  const title=asset?(asset.properties.name??asset.properties.kind):observation?observation.name:regional?String(regional.properties?.name):sample?sample.subdivision:gauge?.name??String(basin?.properties?.NameNom??snow?.name??selection.id);
  return <div className={`selection-content${expanded?' is-expanded':''}`}>
    <div className="selection-mobile-handle" aria-hidden="true"/>
    <header className="selection-header">
      <div><p className="selection-kicker">{selection.kind==='track'?'Track weather':selection.kind==='gauge'?'Stream gauge':selection.kind==='asset'?'Rail asset':selection.kind==='observation'?'Observed temperature':'Drainage basin'}</p><h2>{title}</h2>{sample&&<p className="selection-position">{position(sample)}</p>}</div>
      <button type="button" className="selection-close" aria-label="Close selection details" onClick={props.onClose}>×</button>
    </header>
    <button type="button" className="selection-expand" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Collapse details':'Expand details'}<span aria-hidden="true">{expanded?'⌄':'⌃'}</span></button>
    <div className="selection-scroll">
      {selection.kind==='track'?(sample?<TrackDetails sample={sample} props={props}/>:<p className="selection-empty">Weather sample unavailable.</p>):selection.kind==='gauge'?<GaugeDetails station={selection.id} props={props}/>:selection.kind==='asset'?<AssetDetails id={selection.id} props={props}/>:selection.kind==='observation'?<ObservationDetails id={selection.id} props={props}/>:<BasinDetails station={selection.id} props={props}/>}
    </div>
  </div>;
}
