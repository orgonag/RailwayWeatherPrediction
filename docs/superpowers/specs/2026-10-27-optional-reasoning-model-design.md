# Optional reasoning model for RWP

The owner wants to connect a high-reasoning API model now and leave historical statistical modelling open to future contributors. This supersedes treating fixed research cutoffs as the final interpretation method.

## Approach and decisions

Extend the existing server-side OpenAI Responses gateway, rather than put provider credentials in the browser or make training a prerequisite. OpenAI is the implementation default, pending any provider preference from the owner. A model name is explicitly configured on the server; reasoning effort defaults to high. Other providers can implement the same assessment interface later.

The map and linear weather remain usable without AI. A user explicitly sends the inspected evidence to generate an assessment. API credentials remain a backend secret. This change prepares the connection; it does not claim an account, provider key or deployed gateway exists.

## Evidence before interpretation

Export versioned, timestamped JSON containing route/sample identities, source versions, raw available route hourly forecasts, gauge readings and timestamps, scenarios, original report links and separate event/publication times. Missing baselines and statistical results remain explicit nulls. The current gauges contain only recent values, not multi-year histories.

The model considers individual signals, magnitude/rate/persistence only where the evidence allows them, and possible combinations such as snow reserves, sustained warming, rainfall and gauge response. It must distinguish measured SWE from modelled snow depth. Baselines, seasonal percentiles, watershed travel times and hydraulic connections cannot be invented. Social observations can arrive before or after gauge response and their actual timestamps matter. Reports and any imported model text are untrusted evidence, not instructions.

Return a concise assessment of changing conditions, spatial scope, possible sequences, contradictions, missing data and review priorities. Cite evidence IDs and original URLs. API model metadata, reasoning effort, evidence hash and generation time accompany the text. Do not expose hidden chain-of-thought. Do not turn an LLM assessment into an operational authority or a calibrated probability.

## Statistical extension

Define an engine interface consuming the same evidence snapshot and returning a separately attributed assessment. A future trained model can be used alone or supply outputs for AI interpretation without changing the weather acquisition or map.

Snapshots are inputs for dataset construction, not a labelled training dataset by themselves. Contributors must collect historical records and verified outcomes, calculate seasonal baselines per location/indicator and compare damaging and ordinary periods using time-separated validation. LLM-generated assessments are not ground-truth labels.

## Bounds and verification

Require a model and key, validate effort/token configuration, preserve existing origin/rate limits and cap payloads. Allocate a reasoning-inclusive token budget and a longer timeout; reject incomplete provider output rather than present it as a complete assessment. Never silently fall back to a smaller model. Provider errors must not expose raw bodies or credentials.

Verify payload configuration and provenance with mocked provider transport, rejection of incomplete/misconfigured calls, evidence export and the existing full GitHub checks. A real provider call is pending secure key configuration.
