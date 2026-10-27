import { useState } from 'react';
import type { Metric, Network, Sample, WeatherSnapshot } from '../types';
import { fmt, metricColor, metricValue } from '../lib/presentation';
import { summarizeWeather } from '../lib/weather';
export interface LinearProps { network: Network; subdivision: string; weather: WeatherSnapshot | null; now: Date; selected: string; onSelect: (sample: Sample) => void }
export default function LinearWeather({network,subdivision,weather,now,selected,onSelect}: LinearProps) {
  const [metric,setMetric]=useState<Metric>('temperature');
  const samples=network.samples.filter(s=>s.subdivision===subdivision).sort((a,b)=>(a.mp??Infinity)-(b.mp??Infinity));
  const unit=metric==='temperature'?'°C':metric==='rain'?'mm/h':'km/h gusts';
  const hours=[0,3,6,9,12,18,24,36,48];
  return <div className="linear-view">
    <div className="section-heading"><div><span className="eyebrow">ALONG THE SUBDIVISION</span><h2>{subdivision} <span className="muted">/ linear weather</span></h2></div><select aria-label="Linear weather metric" value={metric} onChange={e=>setMetric(e.target.value as Metric)}><option value="temperature">Temperature · °C</option><option value="rain">Precipitation · mm/h</option><option value="wind">Wind gusts · km/h</option></select></div>
    <p className="note">Read down the calculated mileposts and across the forecast. Samples are about 32 km apart; each cell is a model grid forecast. Chain gaps and uncalibrated positions remain separate.</p>
    <div className="table-scroll"><table className="weather-table"><thead><tr><th>Calculated position</th>{hours.map(h=><th key={h}>{h===0?'This hour':`+${h}h`}</th>)}<th>Next 24h</th></tr></thead><tbody>{samples.map(s=>{
      const p=weather?.points[s.id],summary=summarizeWeather(p,now);
      return <tr key={s.id} className={selected===s.id?'selected':''}><th><button onClick={()=>onSelect(s)} aria-pressed={selected===s.id}><span className="track-dot"/>{s.mp===null?'Uncalibrated':`MP ${fmt(s.mp,1)}`}<small>{s.chainId.slice(-5)} · {fmt(s.positionKm,0)} km on chain</small></button></th>{hours.map(h=>{const v=metricValue(p,metric,now,h);return <td key={h} style={{background: v===null?'#f1f3ef':`${metricColor(v,metric)}24`}} title={`${unit}${summary.stale?' · stale source':''}`}>{v===null?<span className="unavailable">Unavailable</span>:fmt(v,metric==='rain'?1:0)}</td>})}<td className="rain-total">{summary.rain24Mm===null?'Unavailable':`${fmt(summary.rain24Mm)} mm`}{summary.stale&&<small>stale source</small>}</td></tr>
    })}</tbody></table></div>
    <div className="legend"><span className="dot" style={{background:'#70a5c5'}}/>Cooler / lower <span className="dot" style={{background:'#c79b49'}}/>Warmer / higher <span className="muted">{unit} · times relative to the current hour · Regina display time</span></div>
  </div>;
}
