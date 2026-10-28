import { useState } from 'react';
import { ArrowRight, Bell, Settings2 } from 'lucide-react';
import { fmt,timeLabel } from '../lib/presentation';
import { EMPTY_RULES,RULE_INFO,type ThresholdAlert,type ThresholdRules } from '../map/alerts';
export default function AlertsPanel({current,future,rules,onRules,onSelect,unavailable}:{current:ThresholdAlert[];future:ThresholdAlert[];rules:ThresholdRules;onRules:(rules:ThresholdRules)=>void;onSelect:(alert:ThresholdAlert)=>void;unavailable:number}) {
 const [tab,setTab]=useState<'current'|'future'>('current'),[settings,setSettings]=useState(false),[error,setError]=useState('');
 const items=tab==='current'?current:future,active=RULE_INFO.filter(r=>rules[r.key]!==null).length;
 function save(event:React.FormEvent<HTMLFormElement>){
   event.preventDefault();const data=new FormData(event.currentTarget),next={...EMPTY_RULES};
   for(const rule of RULE_INFO){const text=String(data.get(rule.key)??'').trim();if(!text)continue;const value=Number(text);
     if(!Number.isFinite(value)||rule.min!==undefined&&value<=rule.min){setError('Enter a positive value for rain, snow and wind. Temperature can be negative.');return;}next[rule.key]=value;}
   if(next.temperatureHighC!==null&&next.temperatureLowC!==null&&next.temperatureHighC<=next.temperatureLowC){setError('The high temperature must be above the low temperature.');return;}
   setError('');onRules(next);setSettings(false);
 }
 return <div className="alerts-body"><div className="alert-intro"><Bell size={20}/><div><h3>Your threshold alerts</h3><p>Forecast conditions that meet limits you choose.</p></div></div>
   <button className="wide-button" onClick={()=>setSettings(!settings)}><Settings2 size={16}/>{active?`${active} active rules · edit thresholds`:'Set alert thresholds'}<ArrowRight size={16}/></button>
   {settings&&<form className="threshold-form" onSubmit={save}><p>Leave a field blank to turn that rule off. Settings are saved in this browser.</p>{RULE_INFO.map(rule=><label key={rule.key}>{rule.label}<span><input name={rule.key} type="number" step="any" min={rule.min===0?'0.01':undefined} defaultValue={rules[rule.key]??''} placeholder="Not set"/>{rule.unit}</span></label>)}{error&&<p className="error" role="alert">{error}</p>}<button type="submit" className="primary-action">Save thresholds</button><button type="button" className="text-action" onClick={()=>{onRules({...EMPTY_RULES});setSettings(false);}}>Turn all rules off</button></form>}
   <div className="segmented"><button className={tab==='current'?'selected':''} onClick={()=>setTab('current')}>Selected time <span>{current.length}</span></button><button className={tab==='future'?'selected':''} onClick={()=>setTab('future')}>Next 72h <span>{future.length}</span></button></div>
   {!active?<div className="empty-card"><h4>No thresholds set yet</h4><p>Choose your rain, snow, wind and temperature limits above. Basin and gauge thresholds can be added once their baselines are established.</p></div>:!items.length?<div className="empty-card"><h4>{tab==='current'&&unavailable>0?'Some checks are unavailable':'No alert found in available forecasts'}</h4><p>This describes completed forecast checks, not the condition of the track.</p></div>:<ul className="alert-list">{items.map(item=><li key={item.id}><button onClick={()=>onSelect(item)}><span className="alert-rule">{item.label}</span><strong>{item.subdivision}{item.mp===null?'':` · MP ${fmt(item.mp)}`}</strong><span className="alert-measure">{fmt(item.value)} {item.unit} <small>limit {fmt(item.threshold)} {item.unit}</small></span><span className="alert-time">{timeLabel(item.from)}{item.from!==item.to?` – ${timeLabel(item.to)}`:''} CST</span><span className="text-action">Show on map <ArrowRight size={14}/></span></button></li>)}</ul>}
   {active>0&&unavailable>0&&<p className="data-note">{unavailable} rule checks have missing or old forecast data at the selected time.</p>}
   <details className="panel-details"><summary>About these alerts</summary><p>These are RWP forecast threshold alerts, separate from official weather warnings or railway operating instructions. Rain includes both large-scale rain and showers. Source updates can change future alerts. No thresholds are enabled by default.</p><p>Seasonal snowpack comparisons and gauge limits are not inferred from proximity to the railway.</p><a href="https://weather.gc.ca/" target="_blank" rel="noreferrer">Official Environment Canada warnings ↗</a></details>
 </div>;
}
