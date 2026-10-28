import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import type { MapProps, WeatherFrameState } from '../map/contracts';
import { fmt } from '../lib/presentation';
import { TERRAIN_WMS, TERRAIN_LAYER, FLOW_WMS, FLOW_LAYERS, FLOW_MIN_ZOOM } from '../map/terrain';
import 'leaflet/dist/leaflet.css';
import './track-map.css';

type Groups = Record<'rail'|'labels'|'gauges'|'basins'|'snow'|'assets'|'regional'|'observations',L.LayerGroup>;
const textNode=(text:string,className='')=>{
  const element=document.createElement('span');
  element.textContent=text;
  if(className)element.className=className;
  return element;
};
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
function iconMarker(latlng:L.LatLngExpression,className:string,content:HTMLElement,pane:string,size:number,height=size){
  return L.marker(latlng,{pane,keyboard:true,riseOnHover:true,icon:L.divIcon({className,html:content,iconSize:[size,height],iconAnchor:[size/2,height/2]})});
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
  const displayed=useRef<{tile:L.TileLayer.WMS;time:string;product:string}|null>(null);
  const [terrainError,setTerrainError]=useState(false),[flowError,setFlowError]=useState(false),[flowZoomed,setFlowZoomed]=useState(false);
  const [weatherStatus,setWeatherStatus]=useState<string|null>(null);

  useEffect(()=>{
    if(!container.current)return;
    const m=L.map(container.current,{zoomControl:false,scrollWheelZoom:true}).setView([52,-106],7);
    map.current=m;
    const panes:{name:string;z:number;interactive?:boolean}[]=[
      {name:'terrain',z:210,interactive:false},{name:'drainage',z:360,interactive:false},
      {name:'weather',z:230,interactive:false},{name:'basin-snow',z:310},{name:'basin-outline',z:330},
      {name:'railHalo',z:390,interactive:false},{name:'rail',z:420},{name:'structures',z:430},
      {name:'railLabels',z:450,interactive:false},{name:'gaugeMarkers',z:630},
    ];
    for(const pane of panes){const node=m.createPane(pane.name);node.style.zIndex=String(pane.z);if(pane.interactive===false)node.style.pointerEvents='none';}
    L.control.zoom({position:'bottomright'}).addTo(m);
    L.control.scale({position:'bottomright',imperial:false}).addTo(m);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19,
      keepBuffer:0,updateWhenIdle:true,
    }).addTo(m);
    groups.current={rail:L.layerGroup().addTo(m),labels:L.layerGroup().addTo(m),gauges:L.layerGroup().addTo(m),basins:L.layerGroup().addTo(m),snow:L.layerGroup().addTo(m),assets:L.layerGroup().addTo(m),regional:L.layerGroup().addTo(m),observations:L.layerGroup().addTo(m)};
    const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>m.invalidateSize({pan:false}));
    resize?.observe(container.current);
    return ()=>{resize?.disconnect();m.remove();map.current=null;groups.current=null;};
  },[]);

  useEffect(()=>{
    const m=map.current;setTerrainError(false);if(!m||!props.showTerrain)return;
    const layer=L.tileLayer.wms(TERRAIN_WMS,{pane:'terrain',layers:TERRAIN_LAYER,styles:'default',format:'image/png',transparent:true,version:'1.1.1',opacity:.7,keepBuffer:0,updateWhenIdle:true,maxNativeZoom:13,attribution:'Elevation © Natural Resources Canada'});
    layer.on('tileerror',()=>setTerrainError(true));layer.addTo(m);
    return()=>{layer.off('tileerror');layer.remove();};
  },[props.showTerrain]);

  useEffect(()=>{
    const m=map.current;setFlowError(false);if(!m||!props.showFlow)return;
    const zoom=()=>setFlowZoomed(m.getZoom()>=FLOW_MIN_ZOOM);zoom();m.on('zoomend',zoom);
    const layer=L.tileLayer.wms(FLOW_WMS,{pane:'drainage',layers:FLOW_LAYERS,styles:'default,default',format:'image/png',transparent:true,version:'1.1.1',opacity:.9,keepBuffer:0,updateWhenIdle:true,minZoom:FLOW_MIN_ZOOM,maxNativeZoom:16,attribution:'National Hydro Network © Natural Resources Canada (static mapping)'});
    layer.on('tileerror',()=>setFlowError(true));layer.addTo(m);
    return()=>{m.off('zoomend',zoom);layer.off('tileerror');layer.remove();};
  },[props.showFlow]);

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
      const details=isSnow?` · ${estimate?.sweMm==null?'SWE unavailable':`${fmt(estimate.sweMm)} mm SWE`} · ${estimate?.time??'time unavailable'}`:` · ${fmt(feature.properties?.Area_km2)} km² gross gauge catchment`;
      const label=`${name} · ${station}${details} · screening basin, not a verified rail crossing catchment`;
      const select=()=>current.current.onBasin?.(station);
      layer.bindTooltip(textNode(label),{className:'rwp-map-tooltip',sticky:true});
      if(station){layer.on('click',select);layer.on('add',()=>accessible(layer as L.Path,label,select));}
    };
    if(props.showSnowpack)L.geoJSON(props.basins,{
      pane:'basin-snow',style:feature=>{
        const station=String(feature?.properties?.StationNum??''),swe=props.snowpack?.basins.find(b=>b.station===station)?.sweMm;
        const color=swe==null?'#a4adb4':swe<25?'#a7d3e5':swe<75?'#559fca':swe<150?'#326baf':'#564491';
        return {color,weight:0,fillColor:color,fillOpacity:swe===0?0:swe==null?.12:.38};
      },onEachFeature:(feature,layer)=>bind(feature,layer,true),
    }).addTo(snow);
    if(props.showBasins)L.geoJSON(props.basins,{
      pane:'basin-outline',style:feature=>({color:props.selection?.kind==='basin'&&props.selection.id===String(feature?.properties?.StationNum)?'#18649c':'#4a79a0',weight:props.selection?.kind==='basin'&&props.selection.id===String(feature?.properties?.StationNum)?3:1.8,dashArray:'7 5',fill:false}),
      onEachFeature:(feature,layer)=>bind(feature,layer,false),
    }).addTo(outline);
  },[props.basins,props.showBasins,props.showSnowpack,props.snowpack,props.selection]);

  useEffect(()=>{
    const m=map.current,group=groups.current?.assets;if(!m||!group)return;
    const draw=()=>{
      group.clearLayers();const visibility=props.assetVisibility;
      const enabled=(kind:string)=>kind==='milepost'?visibility?.mileposts:kind==='crossing'?visibility?.crossings:kind==='station'?visibility?.stations:kind==='culvert'?visibility?.culverts:props.showAssets;
      const features=props.network.assets.features.filter(f=>enabled(f.properties.kind)&&(!props.subdivision||f.properties.subdivision===props.subdivision));
      L.geoJSON({type:'FeatureCollection',features} as FeatureCollection,{
        pane:'structures',style:{color:'#985a19',weight:5},
        pointToLayer:(feature,latlng)=>feature.properties.kind==='milepost'?iconMarker(latlng,'rwp-milepost-marker',textNode(String(feature.properties.mp)),'structures',24):L.circleMarker(latlng,{pane:'structures',radius:feature.properties.kind==='station'?6:4,color:'#fff',weight:1.5,fillColor:feature.properties.kind==='crossing'?'#654e9e':'#985a19',fillOpacity:1}),
        filter:feature=>feature.properties.kind!=='milepost'||m.getZoom()>=9||props.selection?.id===feature.properties.id,
        onEachFeature:(feature,layer)=>{
          const p=feature.properties,label=`${p.name||p.kind} · ${p.subdivision} · ${p.mp==null?'milepost unconfirmed':`calculated MP ${fmt(p.mp)}`}`;
          const select=()=>current.current.onAsset?.(p.id);
          layer.bindTooltip(textNode(label),{className:'rwp-map-tooltip'}).on('click',select).on('add',()=>accessible(layer as L.Path,label,select));
        },
      }).addTo(group);
    };draw();m.on('zoomend',draw);return()=>{m.off('zoomend',draw);group.clearLayers();};
  },[props.network,props.showAssets,props.assetVisibility,props.subdivision,props.selection]);

  useEffect(()=>{
    const group=groups.current?.regional;if(!group)return;group.clearLayers();
    if(!props.showMajorBasins||!props.majorBasins)return;
    L.geoJSON(props.majorBasins,{pane:'basin-outline',style:{color:'#8e668c',weight:2,dashArray:'3 7',fillOpacity:.025},onEachFeature:(f,layer)=>{
      const label=`${f.properties.name} · regional drainage division`,select=()=>current.current.onBasin?.(f.properties.id);
      layer.bindTooltip(textNode(label),{className:'rwp-map-tooltip',sticky:true}).on('click',select).on('add',()=>accessible(layer as L.Path,label,select));
    }}).addTo(group);
  },[props.majorBasins,props.showMajorBasins]);

  useEffect(()=>{
    const group=groups.current?.observations;if(!group)return;group.clearLayers();if(!props.showObservations)return;
    for(const station of props.observations??[]){
      const label=`${station.name} · observed ${station.temperatureC==null?'temperature unavailable':station.temperatureC+' °C'} · ${station.observedAt??'time unavailable'}`;
      const marker=iconMarker([station.lat,station.lon],'rwp-temperature-marker',textNode('🌡 '+(station.temperatureC==null?'—':station.temperatureC.toFixed(1)+'°C')),'gaugeMarkers',54,28).addTo(group),select=()=>current.current.onObservation?.(station.id);
      marker.bindTooltip(textNode(label),{className:'rwp-map-tooltip'}).on('click',select);accessible(marker,label,select);
    }
  },[props.observations,props.showObservations]);

  useEffect(()=>{
    const m=map.current;if(!m)return;
    const product=props.weatherLayer,time=props.layerTime;
    const key=`${product?.id??''}:${product?.runTime??''}:${time??''}`;
    const report=(status:WeatherFrameState['status'])=>current.current.onWeatherFrame?.({key,status,displayedTime:displayed.current?.time??null});
    const clear=()=>{displayed.current?.tile.remove();displayed.current=null;};
    if(!product){clear();setWeatherStatus(null);report('idle');return;}
    if(product.status!=='available'||!time||!product.times.includes(time)){
      clear();setWeatherStatus(`${product.label}: imagery unavailable for the selected hour.`);report('unavailable');return;
    }
    if(displayed.current?.product!==product.id+product.runTime)clear();
    // Limit WMS requests to track extents plus 75 km of surrounding weather. Do not cut the Alberta track at a provincial border.
    const coords=props.network.tracks.features.filter(f=>!props.subdivision||f.properties.subdivision===props.subdivision).flatMap(f=>f.geometry.coordinates);
    const extent=L.latLngBounds(coords.map(c=>L.latLng(c[1],c[0])));
    const bounds=extent.isValid()?L.latLngBounds([extent.getSouth()-.68,extent.getWest()-1.15],[extent.getNorth()+.68,extent.getEast()+1.15]):undefined;
    let tile:L.TileLayer.WMS;
    try{
      tile=L.tileLayer.wms(wmsEndpoint(product.sourceUrl),{
        pane:'weather',layers:product.wmsLayer,styles:product.style??'',format:'image/png',transparent:true,version:'1.3.0',
        opacity:0,attribution:'Weather imagery © Environment and Climate Change Canada',keepBuffer:0,updateWhenIdle:true,bounds,maxNativeZoom:8,
        ...{time:time.replace(/\.000Z$/,'Z')},...(product.runTime?{DIM_REFERENCE_TIME:product.runTime.replace(/\.000Z$/,'Z')}:{}),
      });
    }catch{clear();setWeatherStatus(`${product.label}: imagery source unavailable.`);report('error');return;}
    let active=true,failed=false,loaded=false;
    const previous=()=>displayed.current?` Showing previous image: ${new Date(displayed.current.time).toLocaleString('en-CA',{timeZone:'America/Regina'})} CST.`:'';
    const loading=()=>{if(active&&!failed){setWeatherStatus('Loading weather imagery…'+previous());report('loading');}};
    const error=()=>{if(!active)return;failed=true;tile.setOpacity(0);setWeatherStatus('Weather imagery unavailable in this view. Playback paused.'+previous());report('error');};
    const load=()=>{
      if(!active||failed)return;loaded=true;clearTimeout(timeout);
      if(displayed.current?.tile!==tile)clear();
      displayed.current={tile,time,product:product.id+product.runTime};tile.setOpacity(current.current.weatherOpacity??.55);
      setWeatherStatus(null);report('ready');
    };
    const timeout=setTimeout(error,25000);
    loading();tile.on('tileerror',error).on('load',load).on('loading',loading).addTo(m);
    // A pan beyond the corridor has no eligible tiles, so Leaflet will not emit load.
    if(bounds&&!m.getBounds().intersects(bounds)){clearTimeout(timeout);setWeatherStatus('Outside the railway weather coverage. Return to the railway to load imagery.');report('unavailable');}
    return()=>{
      active=false;clearTimeout(timeout);tile.off('tileerror',error).off('load',load).off('loading',loading);
      if(!loaded)tile.remove();
    };
  },[props.weatherLayer,props.layerTime,props.network,props.subdivision,props.weatherRequest]);
  useEffect(()=>{displayed.current?.tile.setOpacity(props.weatherOpacity??.55);},[props.weatherOpacity]);

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
      const feature=[...(props.basins?.features??[]),...(props.majorBasins?.features??[])].find(f=>String(f.properties?.StationNum??f.properties?.id)===selection.id);
      if(feature){const bounds=L.geoJSON(feature).getBounds();if(bounds.isValid())point=bounds.getCenter();}
    }
    if(selection.kind==='asset'){const asset=props.network.assets.features.find(f=>f.properties.id===selection.id);if(asset){const bounds=L.geoJSON(asset).getBounds();if(bounds.isValid())point=bounds.getCenter();}}
    if(selection.kind==='observation'){const station=props.observations?.find(f=>f.id===selection.id);if(station)point=L.latLng(station.lat,station.lon);}
    if(point&&!m.getBounds().pad(-.12).contains(point))m.panTo(point,{animate:false});
  },[props.selection,props.selected,props.network,props.gauges,props.basins,props.majorBasins,props.observations]);

  return <div className="track-map-shell">
    <div ref={container} className="track-map" role="region" aria-label="Interactive railway track and forecast map"/>
    {(terrainError||flowError||(props.showFlow&&!flowZoomed))&&<div className='rwp-terrain-status' role='status'>{terrainError?'Terrain imagery unavailable. ':''}{flowError?'Stream-direction imagery unavailable. ':''}{props.showFlow&&!flowZoomed?'Zoom in to level 12+ to see mapped stream arrows.':''}</div>}{weatherStatus&&<div className="rwp-map-status" role="status">{weatherStatus}</div>}
  </div>;
}
