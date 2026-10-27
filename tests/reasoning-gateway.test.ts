import { afterEach, expect, it, vi } from 'vitest';
import gateway from '../worker/ai-gateway';

const configured = {
  OPENAI_API_KEY:'test-only-secret',
  OPENAI_MODEL:'gpt-6-astra',
  OPENAI_REASONING_EFFORT:'high',
  OPENAI_MAX_OUTPUT_TOKENS:'25000',
  ALLOWED_ORIGIN:'https://railway-weather-prediction.shokti.chatgpt.site',
  AI_RATE_LIMITER:{limit:async()=>({success:true})}
};
const context = {
  generatedAt:'2026-04-22T12:00:00Z',
  selectedSample:{id:'birch',mp:null},
  routeForecasts:[{sample:{id:'birch'},forecast:{fetchedAt:'2026-04-22T11:30:00Z',hourly:{time:['2026-04-22T13:00'],temperature_2m:[4]}}}],
  observations:[{id:'report-1',text:'Water rising',observedAt:null,publishedAt:'2026-04-22T10:00:00Z',sourceUrl:'https://example.org/original'}]
};
function request() {
  return new Request('https://gateway.example',{method:'POST',headers:{Origin:configured.ALLOWED_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({context})});
}
afterEach(()=>vi.unstubAllGlobals());

it('sends the selected model a high-reasoning request and preserves evidence provenance',async()=>{
  let sent:Record<string,unknown>|undefined;
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-only-secret');
    sent=JSON.parse(String(init.body));
    return Response.json({id:'resp_test',model:'model-snapshot',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Review birch; report-1 is unverified.',annotations:[]}]}],usage:{input_tokens:100,output_tokens:500,total_tokens:600,output_tokens_details:{reasoning_tokens:350}}});
  });
  const response=await gateway.fetch(request(),configured);
  expect(response.status).toBe(200);
  expect(sent?.model).toBe('gpt-6-astra');
  expect(sent?.reasoning).toEqual({effort:'high'});
  expect(sent?.max_output_tokens).toBe(25000);
  expect(sent?.store).toBe(false);
  const input=String(sent?.input);
  const evidence=JSON.parse(input.split('EVIDENCE (JSON):\n')[1]);
  expect(evidence.schemaVersion).toBe('rwp-evidence/v1');
  expect(evidence.asOf).toBe('2026-04-22T12:00:00Z');
  expect(evidence.context.routeForecasts[0].forecast.hourly.temperature_2m).toEqual([4]);
  expect(evidence.context.selectedSample.mp).toBeNull();
  expect(evidence.context.observations[0].observedAt).toBeNull();
  expect(evidence.seasonalBaselines).toBeNull();
  expect(evidence.statisticalAssessment).toBeNull();
  const result=await response.json();
  expect(result.text).toContain('report-1');
  expect(result.metadata.model).toBe('model-snapshot');
  expect(result.metadata.reasoningEffort).toBe('high');
  expect(result.metadata.evidenceAsOf).toBe('2026-04-22T12:00:00Z');
  expect(result.metadata.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(result)).not.toContain('test-only-secret');
});

it('rejects a token-exhausted response even when the provider includes partial text',async()=>{
  vi.stubGlobal('fetch',async()=>Response.json({id:'resp_partial',status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{type:'message',content:[{type:'output_text',text:'An unfinished assessment'}]}]}));
  const response=await gateway.fetch(request(),configured);
  expect(response.status).toBe(502);
  const result=await response.json();
  expect(result.error).toMatch(/incomplete/i);
  expect(result.text).toBeUndefined();
});

it('requires an explicitly selected model instead of silently choosing a small one',async()=>{
  let called=false;
  vi.stubGlobal('fetch',async()=>{called=true;return Response.json({output:[]});});
  const response=await gateway.fetch(request(),{...configured,OPENAI_MODEL:undefined});
  expect(response.status).toBe(503);
  expect(called).toBe(false);
});

it('rejects unsupported reasoning settings before spending provider tokens',async()=>{
  let called=false;
  vi.stubGlobal('fetch',async()=>{called=true;return Response.json({output:[]});});
  const response=await gateway.fetch(request(),{...configured,OPENAI_REASONING_EFFORT:'turbo'});
  expect(response.status).toBe(503);
  expect(called).toBe(false);
});

it('rejects an invalid reasoning token budget before spending provider tokens',async()=>{
  let called=false;
  vi.stubGlobal('fetch',async()=>{called=true;return Response.json({output:[]});});
  const response=await gateway.fetch(request(),{...configured,OPENAI_MAX_OUTPUT_TOKENS:'not-a-number'});
  expect(response.status).toBe(503);
  expect(called).toBe(false);
});
