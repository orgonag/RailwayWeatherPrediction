# Optional reasoning model implementation

1. Extend the existing gateway tests to prove an explicitly selected model receives high reasoning effort, a reasoning-inclusive budget and the versioned evidence package. Prove that incomplete responses and invalid configuration cannot appear as completed assessments. Run this first through the pull-request checks.
2. Add a small evidence contract and assessment-engine interface. Preserve missing values; export existing context with explicit absent baseline/statistical inputs.
3. Include available hourly forecasts for the selected subdivision, source/acquisition times and per-sample identity in the inspected context. Keep raw feeds and fixed prototype cues separate from AI interpretation.
4. Adapt the gateway and AI panel to configuration, longer requests, provenance metadata and complete-only provider output. Keep keys server-side and the connection optional.
5. Update setup/extension documentation. Run npm tests, Python tests, data validation and the production build through GitHub checks. Record that live provider verification requires a securely configured key.
6. Keep the changes on a separate branch while unpublished deterministic work remains in the unavailable local workspace. Do not overwrite those commits or claim that this branch is live.
