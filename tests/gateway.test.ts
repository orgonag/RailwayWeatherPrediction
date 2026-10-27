import { expect, it } from 'vitest';
import gateway, { type Env } from '../worker/ai-gateway';
const env:Env={OPENAI_API_KEY:'',ALLOWED_ORIGIN:'https://orgonag.github.io',AI_RATE_LIMITER:{limit:async()=>({success:true})}};
it('refuses calls from a disallowed website before invoking AI',async()=>{
 const r=await gateway.fetch(new Request('https://gateway.example',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:'{}'}),env);
 expect(r.status).toBe(403);
});
it('reports an unconfigured gateway without fabricating a briefing',async()=>{
 const r=await gateway.fetch(new Request('https://gateway.example',{method:'POST',headers:{Origin:env.ALLOWED_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({context:{}})}),env);
 expect(r.status).toBe(503);
 expect(await r.text()).toMatch(/not configured/i);
});
it('enforces request rate limits before provider work',async()=>{
 const r=await gateway.fetch(new Request('https://gateway.example',{method:'POST',headers:{Origin:env.ALLOWED_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({context:{}})}),{...env,OPENAI_API_KEY:'test-key',AI_RATE_LIMITER:{limit:async()=>({success:false})}});
 expect(r.status).toBe(429);
});
