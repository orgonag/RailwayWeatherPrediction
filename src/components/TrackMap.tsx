import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import type { Metric, Network, Sample, WeatherSnapshot } from '../types';
import { fmt, metricColor, metricValue } from '../lib/presentation';
import 'leaflet/dist/leaflet.css';

interface Props {network:Network;weather:WeatherSnapshot|null;subdivision:string;selected:string;metric:Metric;offset:number;now:Date;basins:FeatureCollection|null;showBasins:boolean;showAssets:boolean;onSelect:(sample:Sample)=>void;onSubdivision:(name:string)=>void;fitRequest:number}
export default function TrackMap(props: Props) {
  const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layers=useRef<L.LayerGroup|null>(null);
  const lastFit=useRef('');
  useEffect(()=>{
    if(!container.current) return;
    const m=L.map(container.current,{zoomControl:false,scrollWheelZoom:true}).setView([52,-106],7);map.current=m;
    L.control.zoom({position:'bottomleft'}).addTo(m);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(m);
    layers.current=L.layerGroup().addTo(m);
    const resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(container.current);
    return ()=>{resize.disconnect();m.remove();map.current=null;};
  },[]);
  useEffect(()=>{
    const m=map.current,group=layers.current;if(!m||!group)return;group.clearLayers();
    if(props.showBasins&&props.basins) L.geoJSON(props.basins,{style:{color:'#5483aa',weight:1.5,dashArray:'5 4',fillOpacity:.07},onEachFeature:(feature,layer)=>layer.bindTooltip(`${feature.properties?.NameNom} · ${feature.properties?.Area_km2} km² gross gauge basin; not a crossing catchment`)}).addTo(group);
    L.geoJSON(props.network.tracks,{style:f=>({color:f?.properties.subdivision===props.subdivision?'#155e63':'#869692',weight:f?.properties.subdivision===props.subdivision?4:2,opacity:f?.properties.subdivision===props.subdivision?1:.65}),onEachFeature:(f,layer)=>{layer.bindTooltip(`${f.properties.subdivision} · public historical track geometry`);layer.on('click',()=>props.onSubdivision(f.properties.subdivision));}}).addTo(group);
    if(props.showAssets) L.geoJSON(props.network.assets,{style:{color:'#88724b',weight:5},pointToLayer:(_f,latlng)=>L.circleMarker(latlng,{radius:3,color:'#88724b'}),onEachFeature:(f,layer)=>layer.bindTooltip(`${f.properties.kind} · ${f.properties.subdivision} · ${f.properties.mp==null?'milepost unconfirmed':`calculated MP ${fmt(f.properties.mp)}`}`)}).addTo(group);
    for(const s of props.network.samples) {
      const active=s.subdivision===props.subdivision,value=metricValue(props.weather?.points[s.id],props.metric,props.now,props.offset);
      const marker=L.circleMarker([s.lat,s.lon],{radius:s.id===props.selected?11:active?7:3,weight:s.id===props.selected?3:active?2:1,color:s.id===props.selected?'#102b2c':'#fff',fillColor:metricColor(value,props.metric),fillOpacity:active?1:.5});
      marker.bindTooltip(`${s.subdivision} · ${s.mp===null?'uncalibrated':`calculated MP ${fmt(s.mp)}`} · ${value===null?'weather unavailable':`${fmt(value)} ${props.metric==='temperature'?'°C':props.metric==='rain'?'mm/h':'km/h gusts'}`}`);
      marker.on('click',()=>props.onSelect(s));marker.addTo(group);
    }
    const fitKey=`${props.subdivision}:${props.fitRequest}`;
    if(lastFit.current!==fitKey){
      const selected=props.network.tracks.features.filter(f=>props.fitRequest<0||f.properties.subdivision===props.subdivision);
      const collection:FeatureCollection={type:'FeatureCollection',features:selected};
      const bounds=L.geoJSON(collection).getBounds();
      if(bounds.isValid())m.fitBounds(bounds,{padding:[45,45],maxZoom:11,animate:false});
      lastFit.current=fitKey;
    }
  },[props]);
  return <div ref={container} className="track-map" role="region" aria-label="Interactive railway track and forecast map"/>;
}
