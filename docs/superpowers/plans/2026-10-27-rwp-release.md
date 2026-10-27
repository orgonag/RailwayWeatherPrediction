# RWP Public Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Publish the first RWP track, weather, deterministic analysis and AI evidence workspace.

**Architecture:** Static React application; versioned public rail extract and cached weather/gauges. Browser refresh requests public APIs. An optional server-side AI gateway owns its secret and does not belong in the browser bundle.

**Tech Stack:** React, TypeScript, Vite, Leaflet, Vitest, Python standard library, GitHub Pages/Actions.

**Spec:** ../specs/2026-10-27-rwp-design.md

## Global Constraints

- Missing values remain missing. SI units and explicit timestamps.
- No washout probability, hydraulic routing or operational authority claim.
- No private employer data, client API keys or raw scraped social HTML.
- Full accepted western corridor and branch inventory; no cross-chain geometry joins.

## Review Focus

- Stale/malformed/unavailable weather: show unavailable, retain dated cache, never zero-fill.
- Milepost gaps/reversed anchors: use monotone intervals only, never extrapolate.
- Negative/nonfinite scenario inputs and melt exceeding snow storage: reject or cap physically.
- Future/undated social claims: retain separate timestamps and explicit verification state.
- Public AI endpoint abuse and prompt injection: secret only on server; bounds, same-site origin, rate limit and untrusted evidence framing.

### Task 1: Data and numeric contracts

Files: src/types.ts, src/lib/analysis.ts, src/lib/weather.ts, tests/analysis.test.ts, tests/weather.test.ts, scripts/build_network.py, scripts/refresh_weather.py, scripts/validate_data.py.

Produces: Network, WeatherSnapshot, GaugeSnapshot; summarizeWeather(hours, now), runoffScenario(inputs), screenWeather(summary), buildEvidence(context). Geometry samples have explicit optional calculated mileposts.

- [ ] Write failing hand-calculated runoff and missing/stale weather tests; run npm test, expect failures before implementation.
- [ ] Implement pure numeric/time logic, public geometry extract, public feeds and validation.
- [ ] Run npm test and npm run data:validate; expect all pass. Commit data foundation.

### Task 2: Map, subdivision strip and deterministic UI

Files: src/App.tsx, src/components/TrackMap.tsx, LinearWeather.tsx, Analysis.tsx, Observations.tsx, src/style.css.

Consumes Task 1 contracts. Produces interactive selected subdivision/sample/hour state and analysis context shared with AI section.

- [ ] Add user-facing interaction checks before components, including changing subdivision and stale/unavailable rendering.
- [ ] Implement map and linear view, scenario form, gauge links and locally stored report entry/export.
- [ ] Run full tests, build, data validation and browser checks where available. Commit interface.

### Task 3: AI evidence and public delivery

Files: src/components/AIBrief.tsx, worker/ai-gateway.ts, worker/wrangler.example.jsonc, docs/AI.md, .github/workflows/pages.yml, refresh-weather.yml, README.md, docs/DATA-SOURCES.md, docs/RESEARCH.md.

Consumes analysis context. Produces exportable evidence prompt and optional constrained AI request, public repo and Pages site.

- [ ] Write evidence tests that catch unverifiable social claims and data gaps being omitted; test gateway rejects absent key/disallowed origin.
- [ ] Implement evidence package, optional gateway, source documentation and CI/deploy workflows.
- [ ] Run complete test suite and production build, inspect bundle for secrets, publish only authorized public material.
- [ ] Verify GitHub visibility and deployed URL/asset responses; record actual blocks, if any.
