# Statistical models remain optional

The shared contracts are in `src/lib/evidence.ts`. The first implementation path is API reasoning. Contributors can separately train a statistical model without replacing the map, linear weather or public feed acquisition.

## Input contract

`EvidenceSnapshot` uses schema version `rwp-evidence/v1`:

- `asOf`: the context generation time, or null if unknown. This is an assessment timestamp, not proof that every included record was historically available then.
- `context`: source-linked route/sample identities, available raw hourly forecasts, summary/cue values, gauge observations, manual assumptions, reports and source gaps.
- `seasonalBaselines`: null until actual historical statistics are supplied.
- `statisticalAssessment`: null until a separately produced model result is supplied.

The UI downloads the versioned snapshot. Future tools can populate the two optional context fields; the snapshot builder exposes them in the envelope. They are treated as untrusted evidence by the reasoning prompt. There is currently no upload UI, trained model or automatic statistical execution. The TypeScript `AssessmentEngine` interface is an extension boundary, not a working plugin registry.

## Output contract

An engine exposes `id`, `kind` (reasoning or statistical) and `assess(snapshot)`. It returns assessment text plus metadata identifying the model/version, generation time, evidence-as-of time and evidence hash. Statistical adapters should use `engineKind: 'statistical'` and a model/version identifier; omit reasoning effort. Keep numeric scores, their targets, units and validation context explicit if adding them to a later schema version. Do not relabel an LLM narrative as a trained risk probability.

An independently implemented engine can run against exported snapshots. A future application integration can select that engine or pass its attributed result alongside source evidence to the LLM. It should not require an OpenAI key.

## Building a defensible training dataset

1. Acquire multi-year station/basin weather, actual SWE where available, hydrometric history and verified event/inspection outcomes. Current public snapshots alone cannot establish seasonal normality or train a useful predictor.
2. Define location- and season-specific baselines for each indicator. Record the historical period, sample size, measurement/model provenance, units, quality flags and baseline method. Preserve extreme magnitude, rate and persistence as separate features.
3. Treat spring melt, rain-on-snow and summer rainfall as potentially different patterns. Learn/validate time lags by basin; the gauge peak can follow a rail impact and social observations can precede gauge response.
4. Keep event, publication, acquisition and forecast-issue times separate. Historic replay must exclude information unavailable at the replay time, even if its event timestamp is earlier. Reanalysis is not an archived forecast.
5. Keep labels separate from input snapshots. Use independently verified incidents, times and locations plus ordinary runoff/quiet periods. Do not use model-generated assessments as ground truth.
6. Split validation chronologically and, where appropriate, by basin/event to limit leakage. Report false alarms, missed events, lead time and performance with/without social evidence. Calibrate probability outputs against a clearly defined target before calling them probabilities.

The Birch/Elfros and Tisdale/Armley recollections are research cases. Their exact event year/times, affected asset identities and claimed original social lead time still need verification. Two recollections are not a training/validation dataset.
