# RWP handoff for Astra

The owner accepts the map-centred v0.3 interface and wants to continue alert development with Astra. This session is wrapping up hosting and source handoff; do not redesign the accepted layout or infer that new alert policies were approved.

## Accepted interface

Large desktop/phone map, slim top bar, left selection dashboard on desktop, expandable bottom panel on phone. Separate precipitation, stream gauges, drainage basins and basin snowpack layers. Forecast maps and point dashboards share a timeline through +72 h. Keep language plain and details secondary.

## Existing code

- `src/map/alerts.ts`: browser-local configurable thresholds for liquid rain over 6/24 hours, snowfall over 24 hours, hourly gusts and instantaneous air temperature. No rule is enabled by default. `AlertsPanel.tsx` edits these research limits; future scans show the earliest hit per location/rule. These are not official weather warnings or validated railway action limits.
- `src/map/contracts.ts`: shared layer, basin, gauge and selection data contracts.
- `src/map/layers.ts` and `snow-feed.ts`: actual hourly ECCC weather maps and current CaLDAS basin SWE. Exact valid/model-run times are pinned; provider requests require seconds precision.
- `src/map/hydrology.ts`, `gauge-feed.ts` and `GaugeChart.tsx`: actual observations and calendar-aligned comparisons, with missing/quality/relocation exclusions.
- `docs/superpowers/specs/2026-10-27-map-first-rwp-design.md`: agreed UI/data requirements.

## Alert work to plan with the owner

Per-location/per-season baselines; unusually high snow-water content by basin; short-duration heavy precipitation; gauge level and rate-of-rise limits; persistence and time-lagged combinations. Distinguish magnitude, rate and persistence, show the evidence/value/threshold/time/place, and spatially scope each finding. The owner wants layers to carry most of the information and relevant deterministic alerts to appear in the selected dashboard.

Independent gauge and basin layers exist, but a gross gauge basin is not a verified catchment for each railway crossing. Do not infer hydraulic connectivity from proximity alone. Establish mappings and baseline coverage before producing crossing-specific water warnings. Optional AI reasoning and future trained statistical models remain separate extensions; no trained failure probability exists.

## Current source limits

- Established basin polygons: Birch Creek/Elfros 05MA011 and Carrot River/Armley 05KB003 only.
- No 2025 daily archives were available in the queried GeoMet/HYDAT sources. Birch's station relocation on 2025-06-10 caused a level step change; incompatible level comparisons remain unavailable. Armley has no current realtime observations.
- Basin SWE is a dated model analysis with sample/coverage metadata. Seasonal normal is null; no normal or above-normal finding is fabricated. Snow depth is not SWE.
- Original social advance-warning lead times and event years for the two researched events remain unresolved. Confirm the dates before claiming measured lead times.
- Gauge observation/SWE analysis times stay independent from the future weather slider. No future gauge values are invented.

Source methods: `docs/MAP-LAYER-DATA.md`, `docs/GAUGE-HISTORY.md`, `docs/METHODS.md` and `docs/RESEARCH.md`. The merged map build passed 96 application tests, 8 Python tests, independent Astra review and real desktop/phone browser checks. Future changes should preserve those behaviors.

## Hosting

Public repository: https://github.com/orgonag/RailwayWeatherPrediction . Intended Pages URL: https://orgonag.github.io/RailwayWeatherPrediction/ . Owner activation of Settings → Pages → Source → GitHub Actions is required because the integration lacks Pages administration permission. The existing ChatGPT-hosted preview remains available meanwhile. Optional model keys belong in backend secrets, never GitHub source or Vite variables.
