# Map-first RWP Implementation Plan

> **For agentic workers:** use superpowers:subagent-driven-development and bounded independent tasks. Track progress in `.superpowers/map-first-progress.md`.

**Goal:** Replace the rejected dashboard with a map-first, responsive weather and watershed workspace covering a 72-hour forecast.

**Architecture:** Root owns shared contracts and application/selection/alerts/forecast integration. Independent workers own GeoMet discovery and basin SWE, hydrometric history/chart, and Leaflet map rendering. They use `src/map/contracts.ts`, never edit each other's files, and return verification evidence. Root integrates and obtains independent whole-change review.

**Tech stack:** React, TypeScript, Vite, Leaflet, SVG, Python standard library.

**Spec:** `docs/superpowers/specs/2026-10-27-map-first-rwp-design.md`.

## Global constraints

- Keep historic geometry, milepost gaps, source timestamps, unknown values and public-data attribution intact.
- No provider secrets in browser/source; no simulated history, normals, gauge forecasts or official warnings.
- Existing isolated worktree `/workspace/rwp-ai-release`, feature branch `feature/map-first-rwp`; preserve unpublished deterministic branch.
- Desktop map + left dashboard; phone map + bottom dashboard. Forecast hour must update every forecast reading.
- Do not infer rail hydraulic connectivity from gauge proximity or gross basin membership.

## Review focus

1. Missing or stale feed values should not look safe or become zero.
2. A +72h selection must have matching values/timestamps and correct following-24h windows.
3. A changed layer must not leave obsolete imagery, legend or layer time on screen.
4. Historical gauge gaps, missing years, leap days and datum changes must not create false baselines.
5. Mobile controls and selected details must remain usable without obscuring the whole map.

## Tasks

### 1. Public weather layers and basin snow
- [ ] Discover valid ECCC layer IDs, units, styles, run/valid times and full forecast coverage. Save `public/data/map-layers.json` and implement bounded refresh under `scripts/refresh_map_layers.py`.
- [ ] Acquire actual basin SWE where public data permit; save method, sample count, time and coverage in `public/data/basin-snow.json`. Missing normals remain null.
- [ ] Add tested product selection/time helpers in `src/map/layers.ts`. Reject unavailable products/times without pretending that no weather is present.

### 2. Hydrometric history and graph
- [ ] Acquire available real-time and historical records into `public/data/hydrology.json` using `scripts/refresh_hydrology.py`, recording archive coverage.
- [ ] Implement `src/map/hydrology.ts` calendar-aligned comparisons and gap-safe SVG `src/components/GaugeChart.tsx` with level/flow and period controls. Test independent fixtures before implementation.

### 3. Map renderer and location readability
- [ ] Update `src/components/TrackMap.tsx` against MapProps: strong track halo, selected route, readable labels, weather WMS below track, separate gauges/basins/snow/structure layers and selection callbacks.
- [ ] Preserve independent chains and map pan/zoom during time changes. Handle weather image load failures explicitly. Verify layer interactions and avoid unsafe HTML from source labels.

### 4. Application, weather and alerts
- [ ] Write regressions for forecast slider/dashboard alignment and +72h totals; adapt source semantics and fetch five calendar days with type/showers/wind direction.
- [ ] Build focused map shell, layer controls, selection panels, synchronized timeline, simple linear view and secondary tools. Implement local editable threshold alerts with provenance and freshness checks; no basin/gauge alerts without configured baselines/bindings.
- [ ] Verify actual mobile/desktop application interactions and fix material issues.

### 5. Review and release
- [ ] Run complete npm/Python tests, validation and production build; obtain independent review and resolve Important findings.
- [ ] Commit/push reviewed source, integrate public repository, publish matching archive to existing Site. Preserve audience and verify terminal deployment.
- [ ] Report built behavior, source coverage and remaining limitations without implying missing baselines exist.
