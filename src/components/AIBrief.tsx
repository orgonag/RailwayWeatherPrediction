import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, Copy, Download, Sparkles } from 'lucide-react';
import { buildEvidence } from '../lib/analysis';
import { download } from './Observations';

export default function AIBrief({context}:{context:Record<string,unknown>}) {
  const prompt=useMemo(()=>buildEvidence(context),[context]);
  const [copied,setCopied]=useState(false),[result,setResult]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false);
  const endpoint=import.meta.env.VITE_AI_ENDPOINT as string|undefined;
  async function copy(){try{await navigator.clipboard.writeText(prompt);setCopied(true);setTimeout(()=>setCopied(false),2500);}catch{download('rwp-ai-prompt.txt',prompt,'text/plain');}}
  async function generate(){
    if(!endpoint||!consent)return;setBusy(true);setError('');setResult('');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
    try{
      const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context}),signal:controller.signal});
      const data=await r.json();if(!r.ok)throw new Error(data.error||`AI gateway returned ${r.status}`);
      if(typeof data.text!=='string'||!data.text.trim())throw new Error('AI gateway returned an empty briefing.');
      setResult(data.text);
    }catch(e){setError((e as Error).name==='AbortError'?'AI request timed out. Your evidence is still available to export.':(e as Error).message);}finally{clearTimeout(timer);setBusy(false);}
  }
  return <div className="ai-view"><div className="section-heading"><div><span className="eyebrow">03 / AI INTERPRETATION</span><h2>Bring the evidence together.</h2><p className="muted">A reviewable briefing, grounded in the same data you can inspect.</p></div><span className={`pill ${endpoint?'':'amber'}`}>{endpoint?'AI gateway configured':'AI provider not connected'}</span></div>
    <div className="ai-intro"><div className="ai-mark"><Sparkles size={27}/></div><div><h3>Context first. Interpretation second.</h3><p>The briefing package combines the selected subdivision and weather sample, forecast freshness, gauge observations, your runoff scenario and any reports you added. An AI response must preserve uncertainty and cite the evidence.</p></div></div>
    <div className="ai-grid"><section className="panel"><span className="eyebrow">EVIDENCE PACKAGE</span><h3>What the model receives</h3><div className="evidence-checks">{['Selected track & forecast location','24-hour forecast and source timestamp','Gauge readings, units & observation times','Deterministic scenario inputs and outputs','Original report links, timestamps & verification','Missing data and known limits'].map(t=><div key={t}><Check size={16}/>{t}</div>)}</div><div className="button-row"><button className="button" onClick={copy}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Copied':'Copy AI prompt'}</button><button className="button secondary" onClick={()=>download('rwp-evidence.json',JSON.stringify(context,null,2))}><Download size={16}/>Download evidence</button></div><details><summary>Inspect the full prompt and evidence</summary><pre className="evidence-json">{prompt}</pre></details></section>
      <section className="panel ai-output"><span className="eyebrow">AI BRIEFING</span><h3>{endpoint?'Generate an evidence briefing':'Ready for a secure model connection'}</h3><p>{endpoint?'Send this evidence to the configured server-side AI gateway. The response is AI-generated and needs engineering review.':'The evidence package works now. Connect the included server-side gateway to enable generated briefings. No API key is placed in the public site, and no response is simulated.'}</p>{endpoint&&<label className="check-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Send the inspected evidence, including my added reports, to the configured AI service.</label>}<button className="button" disabled={!endpoint||!consent||busy} onClick={generate}><Sparkles size={16}/>{busy?'Preparing briefing…':'Generate AI briefing'}<ArrowUpRight size={15}/></button>{!endpoint&&<a href={`${import.meta.env.BASE_URL}docs/AI.md`} className="source-link" target="_blank" rel="noreferrer">Gateway setup instructions <ArrowUpRight size={13}/></a>}{error&&<p className="error" role="alert">{error}</p>}{result&&<div className="generated-brief"><span className="pill amber">AI-generated · verify against sources</span><div>{result}</div><button className="text-button" onClick={()=>download('rwp-ai-briefing.txt',result,'text/plain')}>Download briefing</button></div>}</section></div>
    <div className="callout"><strong>AI reads evidence; it does not establish the hydraulics.</strong><p>A post near the track may drain elsewhere. A post inside a gross gauge basin may still have no active flow connection to the railway. Publication time, location and original content must be checked before claiming an advance warning.</p></div>
  </div>;
}
