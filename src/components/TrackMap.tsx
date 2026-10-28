import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import type { Sample } from '../types';
import type { MapProps } from '../map/contracts';
import { fmt, metricColor, metricValue } from '../lib/presentation';
import 'leaflet/dist/leaflet.css';
import './track-map.css';

type Groups = Record<'rail'|'labels'|'samples'|'gauges'|'basins'|'snow'|'assets',L.LayerGroup>;
const textNode=(text:string,className='')=>{
  const element=document.createElement('span');
  element.textContent=text;
  if(className)element.className=className;
  return element;
};
const samplePosition=(sample:Sample)=>sample.mp===null?'milepost uncalibrated':`calculated MP ${fmt(sample.mp)}`;
const metricUnit=(metric:MapProps['metric'])=>metric==='temperature'?'°C':metric==='rain'?'mm/h':'km/h gusts';
function accessible(layer:L.Marker|L.Path,label:string,select:()=>void){
  const element=layer.getElement();
  if(!element)return;
  element.setAttribute('role','button');
  element.setAttribute('tabindex','0');
  element.setAttribute('aria-label',label);
  element.addEventListener('keydown',event=>{
    const key=(event as KeyboardEvent).key;
    if(key==='Enter'||key===' '){event.preventDefault();event.stopPropagation();select();}
  });
}
function iconMarker(latlng:L.LatLngExpression,className:string,content:HTMLElement,pane:string,size:number){
  return L.marker(latlng,{pane,keyboard:true,riseOnHover:true,icon:L.divIcon({className,html:content,iconSize:[size,size],iconAnchor:[size/2,size/2]})});
}
function wmsEndpoint(source:string){
  const url=new URL(source);
  // The source may be the advertised capabilities URL; GetMap owns these parameters.
  for(const key of [...url.searchParams.keys()])if(['service','request','version','layer','layers','style','styles','time','dim_reference_time'].includes(key.toLowerCase()))url.searchParams.delete(key);
  return url.toString();
}

export default function TrackMap(props:MapProps){
  const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),groups=useRef<Groups|null>(null);
  const current=useRef(props);current.current=props;
  const lastFit=useRef(''),lastSelection=useRef<string|null>(null);
  const [weatherStatus,setWeatherStatus]=useState<string|null>(null);

  useEffect(()=>{
    if(!container.current)return;
    const m=L.map(container.current,{zoomControl:false,scrollWheelZoom:true}).setView([52,-106],7);
    map.current=m;
    const panes:{name:string;z:number;interactive?:boolean}[]=[
      {name:'weather',z:230,interactive:false},{name:'basin-snow',z:310},{name:'basin-outline',z:330},
      {name:'railHalo',z:390,interactive:false},{name:'rail',z:420},{name:'structures',z:430},
      {name:'railLabels',z:450,interactive:false},{name:'sampleMarkers',z:600},{name:'gaugeMarkers',z:630},
    ];
    for(const pane of panes){const node=m.createPane(pane.name);node.style.zIndex=String(pane.z);if(pane.interactive===false)node.style.pointerEvents='none';}
    L.control.zoom({position:'bottomright'}).addTo(m);
    L.control.scale({position:'bottomright',imperial:false}).addTo(m);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19,
      keepBuffer:0,updateWhenIdle:true,
    }).addTo(m);
    groups.current={rail:L.layerGroup().addTo(m),labels:L.layerGroup().addTo(m),samples:L.layerGroup().addTo(m),gauges:L.layerGroup().addTo(m),basins:L.layerGroup().addTo(m),snow:L.layerGroup().addTo(m),assets:L.layerGroup().addTo(m)};
    const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>m.invalidateSize({pan:false}));
    resize?.observe(container.current);
    return ()=>{resize?.disconnect();m.remove();map.current=null;groups.current=null;};
  },[]);

  useEffect(()=>{
    const m=map.current,group=groups.current?.rail;if(!m||!group)return;
    group.clearLayers();
    // Render each supplied feature independently. No connecting samples or disconnected chains.
    L.geoJSON(props.network.tracks,{pane:'railHalo',interactive:false,style:{color:'#fff',weight:9,opacity:.96,lineCap:'round',lineJoin:'round'}}).addTo(group);
    L.geoJSON(props.network.tracks,{
      pane:'rail',style:feature=>{
        const active=feature?.properties.subdivision===props.subdivision;
        return {color:active?'#087e8b':'#283d48',weight:active?4.5:3,opacity:1,lineCap:'round',lineJoin:'round'};
      },
      onEachFeature:(feature,layer)=>{
        const name=String(feature.properties.subdivision??'Unnamed subdivision');
        const select=()=>current.current.onSubdivision(name);
        layer.bindTooltip(textNode(`${name} subdivision · public historical rail geometry`),{className:'rwp-map-tooltip',sticky:true});
        layer.on('click',(event:L.LeafletMouseEvent)=>{
          const click=current.current.onTrackClick;
          if(click&&event.latlng)click(feature.properties.id,event.latlng.lat,event.latlng.lng);
          else select();
        });
        layer.on('add',()=>accessible(layer as L.Path,`${name} subdivision`,select));
      },
    }).addTo(group);
  },[props.network,props.subdivision]);

  useEffect(()=>{
    const m=map.current,group=groups.current?.labels;if(!m||!group)return;
    const draw=()=>{
      group.clearLayers();
      const occupied:{x:number;y:number;w:number;h:number}[]=[];
      const features=[...props.network.tracks.features].sort((a,b)=>b.geometry.coordinates.length-a.geometry.coordinates.length);
      const labelled=new Set<string>();
      features.sort((a,b)=>Number(b.properties.subdivision===props.subdivision)-Number(a.properties.subdivision===props.subdivision));
      for(const feature of features){
        const name=feature.properties.subdivision,active=name===props.subdivision;
        if(labelled.has(name)||(!active&&m.getZoom()<7&&feature.properties.role!=='core'))continue;
        const coordinate=feature.geometry.coordinates[Math.floor(feature.geometry.coordinates.length/2)];
        if(!coordinate)continue;
        const latlng=L.latLng(coordinate[1],coordinate[0]),point=m.latLngToContainerPoint(latlng),size=m.getSize();
        const box={x:point.x,y:point.y-17,w:name.length*7+36,h:25};
        if(point.x<10||point.y<30||point.x>size.x-10||point.y>size.y-35)continue;
        if(occupied.some(other=>Math.abs(box.x-other.x)<(box.w+other.w)/2&&Math.abs(box.y-other.y)<28))continue;
        occupied.push(box);labelled.add(name);
        const label=textNode(`${name} Sub`,active?'rwp-subdivision-label is-active':'rwp-subdivision-label');
        L.marker(latlng,{pane:'railLabels',interactive:false,keyboard:false,icon:L.divIcon({className:'rwp-label-anchor',html:label,iconSize:[0,0]})}).addTo(group);
      }
    };
    draw();m.on('zoomend moveend',draw);
    return ()=>{m.off('zoomend moveend',draw);group.clearLayers();};
  },[props.network,props.subdivision]);

  useEffect(()=>{
    const m=map.current,group=groups.current?.samples;if(!m||!group)return;
    group.clearLayers();
    const labelCandidates:{marker:L.Marker;sample:Sample;value:number|null;selected:boolean}[]=[];
    const selectedId=props.selection===undefined?props.selected:props.selection?.kind==='track'?props.selection.id:null;
    for(const sample of props.network.samples){
      const active=sample.subdivision===props.subdivision,selected=sample.id===selectedId,alert=props.alertSampleIds?.includes(sample.id)??false;
      const value=metricValue(props.weather?.points[sample.id],props.metric,props.now,props.offset);
      const dot=textNode('','rwp-sample-dot');dot.style.backgroundColor=metricColor(value,props.metric);
      if(alert)dot.append(textNode('!','rwp-alert-mark'));
      const className=`rwp-sample-marker${active?' is-route':''}${selected?' is-selected':''}${alert?' has-alert':''}`;
      const marker=iconMarker([sample.lat,sample.lon],className,dot,'sampleMarkers',selected?22:active?16:10).addTo(group);
      const valueText=value===null?'weather unavailable':`${fmt(value)} ${metricUnit(props.metric)}`;
      const label=`${sample.subdivision} · ${samplePosition(sample)} · ${valueText}${alert?' · review alert':''}`;
      marker.bindTooltip(textNode(label),{className:'rwp-map-tooltip',direction:'top',offset:[0,-6]});
      const select=()=>current.current.onSelect(sample);
      marker.on('click',select);accessible(marker,label,select);
      if(active||selected)labelCandidates.push({marker,sample,value,selected});
    }
    const drawLabels=()=>{
      const occupied:{x:number;y:number}[]=[];
      const candidates=[...labelCandidates].sort((a,b)=>Number(b.selected)-Number(a.selected));
      for(const {marker,sample,value,selected} of candidates){
        marker.unbindTooltip();
        const point=m.latLngToContainerPoint(marker.getLatLng()),size=m.getSize();
        const visible=point.x>10&&point.x<size.x-10&&point.y>25&&point.y<size.y-20;
        const enoughRoom=!occupied.some(p=>Math.abs(p.x-point.x)<150&&Math.abs(p.y-point.y)<55);
        const permanent=visible&&(selected||(m.getZoom()>=8&&enoughRoom));
        if(permanent)occupied.push(point);
        const content=document.createElement('span');content.className='rwp-sample-label';
        const position=sample.mp===null?'MP uncalibrated':`calc. MP ${fmt(sample.mp)}`;
        content.append(textNode(position,'rwp-sample-position'),textNode(value===null?'Weather unavailable':`${fmt(value)} ${metricUnit(props.metric)}`,'rwp-sample-value'));
        marker.bindTooltip(permanent?content:textNode(`${sample.subdivision} · ${samplePosition(sample)} · ${value===null?'weather unavailable':`${fmt(value)} ${metricUnit(props.metric)}`}`),{permanent,direction:'right',offset:[10,0],className:permanent?'rwp-map-tooltip rwp-value-tooltip':'rwp-map-tooltip'});
      }
    };
    drawLabels();m.on('zoomend moveend',drawLabels);
    return ()=>{m.off('zoomend moveend',drawLabels);group.clearLayers();};
  },[props.network,props.weather,props.subdivision,props.selected,props.selection,props.metric,props.now,props.offset,props.alertSampleIds]);

  useEffect(()=>{
    const group=groups.current?.gauges;if(!group)return;group.clearLayers();
    if(!props.showGauges)return;
    for(const gauge of props.gauges??[]){
      const selected=props.selection?.kind==='gauge'&&props.selection.id===gauge.station;
      const marker=iconMarker([gauge.lat,gauge.lon],`rwp-gauge-marker${selected?' is-selected':''}`,textNode('G'),'gaugeMarkers',26).addTo(group);
      const label=`Gauge ${gauge.station} · ${gauge.name} · ${gauge.levelM===null?'level unavailable':`${fmt(gauge.levelM,3)} m`} · ${gauge.dischargeM3s===null?'flow unavailable':`${fmt(gauge.dischargeM3s,2)} m³/s`}`;
      marker.bindTooltip(textNode(label),{className:'rwp-map-tooltip',direction:'top',offset:[0,-12]});
      const select=()=>current.current.onGauge?.(gauge.station);
      marker.on('click',select);accessible(marker,label,select);
    }
  },[props.gauges,props.showGauges,props.selection]);

  useEffect(()=>{
    const outline=groups.current?.basins,snow=groups.current?.snow;if(!outline||!snow)return;
    outline.clearLayers();snow.clearLayers();
    if(!props.basins)return;
    const bind=(feature:GeoJSON.Feature,layer:L.Layer,isSnow:boolean)=>{
      const station=String(feature.properties?.StationNum??''),name=String(feature.properties?.NameNom??station);
      const estimate=props.snowpack?.basins.find(b=>b.station===station);
      const details=isSnow?` · ${estimate?.sweMm==null?'SWE unavailable':`${fmt(estimate.sweMm)} mm SWE`} · ${estimate?.time??'time unavailable'}`:` · ${fmt(feature.properties?.Area_km2)} km² gross gauge basin`;
      const label=`${name} · ${station}${details} · screening basin, not a verified rail crossing catchment`;
      const select=()=>current.current.onBasin?.(station);
      layer.bindTooltip(textNode(label),{className:'rwp-map-tooltip',sticky:true});
      if(station){layer.on('click',select);layer.on('add',()=>accessible(layer as L.Path,label,select));}
    };
    if(props.showSnowpack)L.geoJSON(props.basins,{
      pane:'basin-snow',style:feature=>{
        const station=String(feature?.properties?.StationNum??''),swe=props.snowpack?.basins.find(b=>b.station===station)?.sweMm;
        const color=swe==null?'#a4adb4':swe<25?'#a7d3e5':swe<75?'#559fca':swe<150?'#326baf':'#564491';
        return {color,weight:0,fillColor:color,fillOpacity:swe==null?.12:.38};
      },onEachFeature:(feature,layer)=>bind(feature,layer,true),
    }).addTo(snow);
    if(props.showBasins)L.geoJSON(props.basins,{
      pane:'basin-outline',style:feature=>({color:props.selection?.kind==='basin'&&props.selection.id===String(feature?.properties?.StationNum)?'#18649c':'#4a79a0',weight:props.selection?.kind==='basin'&&props.selection.id===String(feature?.properties?.StationNum)?3:1.8,dashArray:'7 5',fill:false}),
      onEachFeature:(feature,layer)=>bind(feature,layer,false),
    }).addTo(outline);
  },[props.basins,props.showBasins,props.showSnowpack,props.snowpack,props.selection]);

  useEffect(()=>{
    const group=groups.current?.assets;if(!group)return;group.clearLayers();
    if(!props.showAssets)return;
    L.geoJSON(props.network.assets,{
      pane:'structures',style:{color:'#985a19',weight:5},
      pointToLayer:(_feature,latlng)=>L.circleMarker(latlng,{pane:'structures',radius:4,color:'#fff',weight:1.5,fillColor:'#985a19',fillOpacity:1}),
      onEachFeature:(feature,layer)=>layer.bindTooltip(textNode(`${feature.properties.kind} · ${feature.properties.subdivision} · ${feature.properties.mp==null?'milepost unconfirmed':`calculated MP ${fmt(feature.properties.mp)}`}`),{className:'rwp-map-tooltip'}),
    }).addTo(group);
  },[props.network,props.showAssets]);

  useEffect(()=>{
    const m=map.current;if(!m)return;
    const product=props.weatherLayer,time=props.layerTime;
    if(!product){setWeatherStatus(null);return;}
    if(product.status!=='available'||!time||!product.times.includes(time)){
      setWeatherStatus(`${product.label}: imagery unavailable for the selected hour.`);return;
    }
    let tile:L.TileLayer.WMS;
    try{
      const opacity=Math.min(1,Math.max(0,props.weatherOpacity??.55));
      tile=L.tileLayer.wms(wmsEndpoint(product.sourceUrl),{
        pane:'weather',layers:product.wmsLayer,styles:product.style??'',format:'image/png',transparent:true,version:'1.3.0',
        opacity,attribution:'Weather imagery © Environment and Climate Change Canada',keepBuffer:0,updateWhenIdle:true,
        // GeoMet accepts seconds precision, while the browser catalog keeps canonical ISO milliseconds.
        ...{time:time.replace(/\.000Z$/,'Z')},...(product.runTime?{DIM_REFERENCE_TIME:product.runTime.replace(/\.000Z$/,'Z')}:{}),
      });
    }catch{
      setWeatherStatus(`${product.label}: imagery source unavailable.`);return;
    }
    let active=true,failed=false;
    setWeatherStatus('Loading weather imagery…');
    const error=()=>{failed=true;if(active)setWeatherStatus('Weather imagery missing in part of the view. Blank areas are unavailable.');};
    const load=()=>{if(active&&!failed)setWeatherStatus(null);};
    const loading=()=>{if(active&&!failed)setWeatherStatus('Loading weather imagery…');};
    tile.on('tileerror',error).on('load',load).on('loading',loading).addTo(m);
    return ()=>{
      active=false;
      // Keep Leaflet's internal remove listener so it unregisters the grid from map events.
      tile.off('tileerror',error).off('load',load).off('loading',loading);
      tile.remove();
    };
  },[props.weatherLayer,props.layerTime,props.weatherOpacity]);

  useEffect(()=>{
    const m=map.current;if(!m)return;
    const key=`${props.subdivision}:${props.fitRequest}`;
    if(lastFit.current===key)return;
    const collection:FeatureCollection={type:'FeatureCollection',features:props.network.tracks.features.filter(feature=>!props.subdivision||props.fitRequest<0||feature.properties.subdivision===props.subdivision)};
    const bounds=L.geoJSON(collection).getBounds();
    if(bounds.isValid())m.fitBounds(bounds,{padding:[55,60],maxZoom:11,animate:false});
    lastFit.current=key;
  },[props.network,props.subdivision,props.fitRequest]);

  useEffect(()=>{
    const m=map.current;if(!m)return;
    const selection=props.selection===undefined?{kind:'track' as const,id:props.selected}:props.selection,key=selection?`${selection.kind}:${selection.id}`:'';
    const previous=lastSelection.current;lastSelection.current=key;
    if(previous===null||previous===key||!selection)return;
    let point:L.LatLng|null=null;
    if(selection.kind==='track'){const sample=props.network.samples.find(s=>s.id===selection.id);if(sample)point=L.latLng(sample.lat,sample.lon);}
    if(selection.kind==='gauge'){const gauge=props.gauges?.find(g=>g.station===selection.id);if(gauge)point=L.latLng(gauge.lat,gauge.lon);}
    if(selection.kind==='basin'){
      const feature=props.basins?.features.find(f=>String(f.properties?.StationNum)===selection.id);
      if(feature){const bounds=L.geoJSON(feature).getBounds();if(bounds.isValid())point=bounds.getCenter();}
    }
    if(point&&!m.getBounds().pad(-.12).contains(point))m.panTo(point,{animate:false});
  },[props.selection,props.selected,props.network,props.gauges,props.basins]);

  return <div className="track-map-shell">
    <div ref={container} className="track-map" role="region" aria-label="Interactive railway track and forecast map"/>
    {weatherStatus&&<div className="rwp-map-status" role="status">{weatherStatus}</div>}
  </div>;
}
