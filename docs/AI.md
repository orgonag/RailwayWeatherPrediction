# Optional high-reasoning model connection

RWP assembles and exports evidence without an AI key. A configured server-side gateway can send it to a reasoning model for an assessment. **The provider connection is prepared in source; no real key, deployed AI gateway or end-to-end provider result is claimed.**

## Where the API key goes

The key is a **secret on the backend Cloudflare Worker**, named `OPENAI_API_KEY`. It never goes into GitHub source, a public settings field, a browser bundle or a `VITE_` variable. Do not paste it into chat.

1. Copy `worker/wrangler.example.jsonc` to an ignored local config in `worker/`. Keep its entry point relative to that directory.
2. Set `ALLOWED_ORIGIN` to the frontend origin. The public Sites origin is `https://railway-weather-prediction.shokti.chatgpt.site`. A GitHub Pages origin would be `https://orgonag.github.io`.
3. Choose `OPENAI_MODEL` explicitly. The example uses `gpt-6-astra`; replace it with a reasoning-capable model available to your API project. There is no silent fallback to a smaller model. `OPENAI_REASONING_EFFORT` defaults to `high`; accepted settings are low, medium, high and xhigh, subject to model support.
4. Keep the native `AI_RATE_LIMITER` binding. The example permits 5 requests/minute per visitor IP. CORS is not authentication; add authenticated access and account-level budget controls before broadly sharing a funded endpoint.
5. With Wrangler authenticated in your own account, run `npx wrangler secret put OPENAI_API_KEY --config worker/wrangler.local.jsonc`, then `npx wrangler deploy --config worker/wrangler.local.jsonc`. Alternatively, add that secret in the deployed Worker's Cloudflare dashboard under Settings → Variables and Secrets.
6. Configure the frontend build variable `VITE_AI_ENDPOINT` with the deployed Worker URL, then rebuild and publish. This URL is public and is not the key. The Pages workflow reads it from a repository variable; the independently hosted Sites build must also be updated separately.
7. Exercise one real generation and confirm the returned model, reasoning effort, evidence time and hash. The UI says endpoint configured, not provider verified, until a real response is received.

No API key is required to use the map, linear weather, scenarios or exports. Automatic/scheduled AI calls are not introduced by this change.

## What the model reasons about

Raw hourly timestamps are explicitly labelled UTC; America/Regina is only the display timezone. Hourly accumulation/gust intervals are distinguished from current-provider intervals.

The inspected package includes available hourly forecasts for the selected subdivision, sample identities, gauge readings and acquisition/observation times, explicit scenarios and original report links with separate event/publication timestamps. It considers individual changes and plausible combinations, including snow reserves → warming/rain → runoff/gauge response, with social observations at their actual place in the timeline.

There is no automatic social feed or model web-browsing tool. The model sees only supplied evidence. Multi-year seasonal baselines, measured basin-wide SWE and a trained statistical model are currently absent. It must say so instead of inventing normal values, anomaly percentiles, hydraulic connectivity or fixed travel times. It gives evidence-supported review priorities and labelled hypotheses, not a calibrated failure probability.

## Reasoning budget and provenance

`OPENAI_MAX_OUTPUT_TOKENS` defaults to 25,000 (allowed integer range 4,000–64,000). This includes reasoning as well as visible output. Actual charges depend on the selected model and usage; a cap is not a cost estimate or an account spending limit. The provider timeout is 180 seconds and the browser timeout is 200 seconds. Large/high-effort assessments can exceed those limits; no automatic retry spends more credits.

The gateway requests `store:false`, caps evidence and response bodies at 1 MB, applies origin and rate checks and returns no raw provider error body. Provider data handling still follows its terms. Interrupted/incomplete output is rejected, even if it contains partial text. Hidden reasoning is not exported.

Successful output includes the provider-reported model, requested effort, generation time, evidence-as-of time, response ID and SHA-256 of `JSON.stringify(evidenceSnapshot)` encoded as UTF-8. The downloadable assessment preserves the exact snapshot that was sent. A changed selection/evidence package is visibly distinguished from an older assessment.

## Verification

Tests intercept only the external provider transport and verify the real gateway's request, versioned evidence, output provenance and failure handling. They do not establish model quality, authorization for a particular model or live provider availability. Historical/statistical extension: [MODEL-EXTENSIONS.md](MODEL-EXTENSIONS.md).

Primary references: [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning), [model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
