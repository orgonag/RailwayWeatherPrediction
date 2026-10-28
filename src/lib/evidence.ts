/** Stable input shared by API reasoning and optional future statistical engines. */
export interface EvidenceSnapshot {
  schemaVersion:'rwp-evidence/v1';
  asOf:string|null;
  context:Record<string,unknown>;
  seasonalBaselines:unknown|null;
  statisticalAssessment:unknown|null;
}
export interface AssessmentMetadata {
  engineKind:'reasoning'|'statistical';
  model:string;
  reasoningEffort?:string;
  generatedAt:string;
  evidenceAsOf:string|null;
  evidenceSha256:string;
  responseId?:string|null;
}
export interface ModelAssessment { text:string; metadata:AssessmentMetadata }
export interface AssessmentEngine {
  id:string;
  kind:'reasoning'|'statistical';
  assess(evidence:EvidenceSnapshot):Promise<ModelAssessment>;
}
export function createEvidenceSnapshot(context:Record<string,unknown>):EvidenceSnapshot {
  const timestamp=context.generatedAt;
  return {
    schemaVersion:'rwp-evidence/v1',
    asOf:typeof timestamp==='string'&&Number.isFinite(Date.parse(timestamp))?timestamp:null,
    context,
    seasonalBaselines:context.seasonalBaselines??null,
    statisticalAssessment:context.statisticalAssessment??null
  };
}
export async function hashEvidence(snapshot:EvidenceSnapshot):Promise<string> {
  const bytes=new TextEncoder().encode(JSON.stringify(snapshot));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
