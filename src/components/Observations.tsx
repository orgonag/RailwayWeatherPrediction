import { useState } from 'react';
import { Download, ExternalLink, MessageSquare, Plus, Trash2 } from 'lucide-react';
import type { Observation } from '../types';
import { timeLabel } from '../lib/presentation';

export function download(name:string,text:string,type='application/json') {
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function Observations({observations,onChange}:{observations:Observation[];onChange:(v:Observation[])=>void}) {
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  function add(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();const form=e.currentTarget,f=new FormData(form),get=(key:string)=>String(f.get(key)||'').trim();
    const sourceUrl=get('sourceUrl');
    if(!/^https?:\/\//i.test(sourceUrl)){setError('Use an http or https original-source link.');return;}
    const observedAt=get('observedAt')?`${get('observedAt')}:00Z`:null,publishedAt=get('publishedAt')?`${get('publishedAt')}:00Z`:null;
    if([observedAt,publishedAt].some(t=>t&&(!Number.isFinite(Date.parse(t))||Date.parse(t)>Date.now()))){setError('Report timestamps must be valid past times in UTC. Leave unknown times blank.');return;}
    const lat=get('lat')?Number(get('lat')):null,lon=get('lon')?Number(get('lon')):null;
    if((lat===null)!==(lon===null)||(lat!==null&&(!Number.isFinite(lat)||Math.abs(lat)>90))||(lon!==null&&(!Number.isFinite(lon)||Math.abs(lon)>180))){setError('Enter both valid coordinates, or leave both blank.');return;}
    const item:Observation={id:crypto.randomUUID(),location:get('location'),lat,lon,observedAt,publishedAt,sourceUrl,text:get('text'),verification:get('checked')?'source-checked':'unverified'};
    onChange([...observations,item]);form.reset();setOpen(false);setError('');
  }
  return <section className="observations panel"><div className="panel-title"><div><span className="eyebrow">PEOPLE SEE WATER FIRST</span><h3><MessageSquare size={18}/> Field & community evidence</h3></div><div className="button-row">{observations.length>0&&<button className="icon-button" title="Export observations" aria-label="Export observations" onClick={()=>download('rwp-observations.json',JSON.stringify(observations,null,2))}><Download size={16}/></button>}<button className="button secondary" onClick={()=>setOpen(!open)}><Plus size={15}/>{open?'Close form':'Add report'}</button></div></div>
    <p className="note">Add original public posts or field observations. Saved in this browser only. Reports are included if you export evidence or send an AI briefing. No social scraper is connected.</p>
    {open&&<form onSubmit={add} className="report-form"><div className="form-grid"><label>Location / landmark<input name="location" required maxLength={160} placeholder="e.g. road crossing upstream of Elfros"/></label><label>Original source URL<input name="sourceUrl" type="url" required maxLength={600} placeholder="https://…"/></label><label>Observed time · UTC, if known<input name="observedAt" type="datetime-local"/></label><label>Publication time · UTC, if verified<input name="publishedAt" type="datetime-local"/></label><label>Latitude · optional<input name="lat" type="number" step="any" min="-90" max="90"/></label><label>Longitude · optional<input name="lon" type="number" step="any" min="-180" max="180"/></label></div><label>What was observed?<textarea name="text" required maxLength={1500} rows={3} placeholder="Record what the original source actually says. Keep inference separate."/></label><label className="check-label"><input name="checked" type="checkbox"/>I checked the original source (does not establish hydraulic connectivity)</label>{error&&<p className="error" role="alert">{error}</p>}<button className="button" type="submit">Save report in this browser</button></form>}
    {observations.length===0?<div className="empty-evidence"><MessageSquare size={25}/><div><strong>No reports added yet</strong><p>Undated posts and unverified locations stay unresolved. The historical research has not established an upstream social warning lead time.</p></div></div>:<div className="report-list">{observations.map(o=><article key={o.id}><div className="panel-title"><strong>{o.location}</strong><button className="icon-button" aria-label={`Remove report ${o.location}`} onClick={()=>onChange(observations.filter(v=>v.id!==o.id))}><Trash2 size={14}/></button></div><p>{o.text}</p><p className="note">{o.verification} · observed {timeLabel(o.observedAt)} · published {timeLabel(o.publishedAt)} CST · coordinates {o.lat===null?'unresolved':`${o.lat}, ${o.lon}`} · basin/flow path unverified</p><a className="source-link" href={o.sourceUrl} target="_blank" rel="noreferrer">Original source <ExternalLink size={12}/></a></article>)}</div>}
  </section>;
}
