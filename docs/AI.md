# Optional AI gateway

The public site can assemble, inspect, copy and download an AI prompt/evidence package now. **No AI provider was connected in the initial session. Generated briefings are unavailable until the gateway is configured and exercised.**

`worker/ai-gateway.ts` is a small Cloudflare Worker using the OpenAI Responses API. Secrets stay on the server. The public browser calls only the gateway URL. Reports are untrusted evidence; the server prompt directs the model to preserve uncertainty, cite source IDs and avoid inventing hydraulic connectivity or failure predictions.

## Configure in your own Cloudflare account

1. Copy `worker/wrangler.example.jsonc` to a local ignored config and set `ALLOWED_ORIGIN` to the actual site origin. For Pages this is `https://orgonag.github.io`; for the independent public site it is `https://railway-weather-prediction.shokti.chatgpt.site`.
2. Configure the native `AI_RATE_LIMITER` binding (5 requests per minute per visitor IP in the example). CORS is an origin restriction, not authentication; a broader service needs authenticated users, account-level quota/budget controls and abuse monitoring.
3. Use your normal authenticated Wrangler setup. Store the key with `wrangler secret put OPENAI_API_KEY`; never paste it in chat, repository files or a Vite environment variable. `OPENAI_MODEL` defaults to `gpt-4.1-mini` and can be changed server-side.
4. Deploy with your chosen Wrangler config. Run one real end-to-end generation and verify rate limiting, data provenance and costs before representing the gateway as connected.
5. Set build variable `VITE_AI_ENDPOINT` to the deployed Worker URL and rebuild/redeploy the frontend. The Pages workflow reads this from a repository **variable**; it is a public URL, not a secret.

No provider account, billing setup, secret creation or AI backend deployment is performed automatically. These require an account/configuration not present in this environment.

The browser displays what will be included and requires consent before sending added reports. Copying/downloading also exposes the included evidence to its destination. The gateway limits requests to 100 KB, applies rate limiting before provider calls, caps output tokens, sets a provider timeout, requests `store:false` and returns no raw provider error body. Provider data handling still follows its own terms.

Tests exercise rejection of an unconfigured gateway, a disallowed origin and exhausted rate limit. They do not establish model quality or end-to-end provider availability.
