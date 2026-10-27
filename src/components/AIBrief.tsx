import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, Copy, Download, Sparkles } from 'lucide-react';
import { buildEvidence } from '../lib/analysis';
import { createEvidenceSnapshot, type EvidenceSnapshot, type ModelAssessment } from '../lib/evidence';
import { download } from './Observations';

type SavedAssessment=ModelAssessment&{evidence:EvidenceSnapshot};
export default function AIBrief({context}:{context:Record<string,unknown>}) {
  const evidence=useMemo(()=>createEvidenceSnapshot(context),[context]);
  const evidenceJson=JSON.stringify(evidence);
  const prompt=useMemo(()=>buildEvidence(context),[context]);
  const [copied,setCopied]=useState(false),[result,setResult]=useState<SavedAssessment|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false);
  const endpoint=import.meta.env.VITE_AI_ENDPOINT as string|undefined;
  useEffect(()=>setConsent(false),[evidenceJson]);
  const resultIsCurrent=!result||JSON.stringify(result.evidence)===evidenceJson;
  async function copy() {
    try{await navigator.clipboard.writeText(prompt);setCopied(true);setTimeout(()=>setCopied(false),2500);}
    catch{download('rwp-ai-prompt.txt',prompt,'text/plain');}
  }
  async function generate() {
    if(!endpoint||!consent)return;
    const sentEvidence=evidence;
    setBusy(true);setError('');setResult(null);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),200000);
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context:sentEvidence.context}),signal:controller.signal});
      const data=await response.json();
      if(!response.ok)throw new Error(typeof data.error==='string'?data.error:`AI gateway returned ${response.status}`);
      if(typeof data.text!=='string'||!data.text.trim()||
        typeof data.metadata?.model!=='string'||typeof data.metadata?.generatedAt!=='string'||
        typeof data.metadata?.evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(data.metadata.evidenceSha256))throw new Error('AI gateway returned an invalid assessment or provenance.');
      setResult({text:data.text,metadata:data.metadata,evidence:sentEvidence});
    } catch(e) {
      setError((e as Error).name==='AbortError'?'AI request timed out. The evidence is still available to export.':(e as Error).message);
    } finally{clearTimeout(timer);setBusy(false);}
  }
  return <div className="ai-view">
    <div className="section-heading"><div><span className="eyebrow">03 / OPTIONAL AI REASONING</span><h2>Reason across the signals.</h2><p className="muted">Review changing conditions, possible combinations and the evidence behind them.</p></div><span className={`pill ${endpoint?'':'amber'}`}>{endpoint?'AI endpoint configured':'AI provider not connected'}</span></div>
    <div className="ai-intro"><div className="ai-mark"><Sparkles size={27}/></div><div><h3>One evidence package. Optional models.</h3><p>A configured reasoning model can examine weather over time along the selected subdivision, gauges and original reports. Historical seasonal baselines and a trained statistical model can be added later; their absence stays visible.</p></div></div>
    <div className="ai-grid">
      <section className="panel"><span className="eyebrow">EVIDENCE PACKAGE</span><h3>What the model receives</h3>
        <div className="evidence-checks">{['Selected subdivision and sample identities','Available route hourly forecasts and acquisition times','Gauge values, datums and observation times where supplied','Explicit scenario assumptions and prototype cues','Original report links, event/publication times and verification','Missing baselines, source gaps and known limits'].map(t=><div key={t}><Check size={16}/>{t}</div>)}</div>
        <div className="button-row"><button className="button" onClick={copy}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Copied':'Copy AI prompt'}</button><button className="button secondary" onClick={()=>download('rwp-evidence.json',JSON.stringify(evidence,null,2))}><Download size={16}/>Download evidence</button></div>
        <details><summary>Inspect the full prompt and evidence</summary><pre className="evidence-json">{prompt}</pre></details>
      </section>
      <section className="panel ai-output"><span className="eyebrow">MODEL ASSESSMENT</span><h3>{endpoint?'Generate an evidence assessment':'Connect a reasoning model'}</h3>
        <p>{endpoint?'The server selects the model and reasoning effort. High reasoning can take several minutes and uses provider API credits.':'The included backend supports a configurable reasoning model. The site owner stores the API key as a server secret and configures the model; the public site receives only the gateway URL.'}</p>
        <a href={`${import.meta.env.BASE_URL}docs/AI.md`} className="source-link" target="_blank" rel="noreferrer">Model connection and secure key setup <ArrowUpRight size={13}/></a>
        {endpoint&&<label className="check-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Send this inspected evidence, including my added reports, to the configured AI service.</label>}
        <button className="button" disabled={!endpoint||!consent||busy} onClick={generate}><Sparkles size={16}/>{busy?'Assessing the evidence…':'Generate AI assessment'}<ArrowUpRight size={15}/></button>
        {error&&<p className="error" role="alert">{error}</p>}
        {result&&<div className="generated-brief"><span className="pill amber">AI-generated · review the cited evidence</span><p className="note">Model: {result.metadata.model} · reasoning: {result.metadata.reasoningEffort??'not supplied'}<br/>Evidence as of: {result.metadata.evidenceAsOf??'unknown'}<br/>Generated: {result.metadata.generatedAt}</p>{!resultIsCurrent&&<p className="error" role="status">This assessment used an earlier or different evidence package. Generate again for the current selection.</p>}<div>{result.text}</div><details><summary>Assessment provenance</summary><pre className="evidence-json">{JSON.stringify(result.metadata,null,2)}</pre></details><button className="text-button" onClick={()=>download('rwp-ai-assessment.json',JSON.stringify(result,null,2))}>Download assessment and its evidence</button></div>}
      </section>
    </div>
    <div className="callout"><strong>Keep the statistical modelling path open.</strong><p>The versioned JSON can support future seasonal-baseline research and a separately trained model through the shared assessment interface. No statistical model is connected now. Training requires historical records and verified outcomes; an AI assessment is not a ground-truth label.</p><a href={`${import.meta.env.BASE_URL}docs/MODEL-EXTENSIONS.md`} className="source-link" target="_blank" rel="noreferrer">Statistical model extension guide <ArrowUpRight size={13}/></a></div>
  </div>;
}
