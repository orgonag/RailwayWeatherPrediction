# RWP: first public release

The owner requested a new public RailwayWeatherPrediction repository and working public page this session, with a track/weather map, linear subdivision weather, deterministic analysis and an AI section. This document records implementation choices made under that instruction; no separate design approval is claimed.

## Geography and purpose

Hardisty–Wilkie–Saskatoon/Sutherland–Wynyard–Bredenbury plus connected branches: Lloydminster, Reford, Macklin, Kerrobert, Tisdale, Kelvington, Melfort, Lanigan, Bulyea, White Fox and Yarbo. Branch active limits and operator boundaries remain subject to verification. Alberta is included. Watershed watch areas can extend beyond the rail corridor.

Help engineering staff see developing weather exposure and organize evidence for inspection decisions. All displayed geometry is public research data. Gauge drainage areas are screening proxies, not surveyed crossing catchments. Do not present a washout probability or predicted failure time.

## Approaches and implementation choice

- Static React/TypeScript application on GitHub Pages, with browser weather refresh and scheduled public data snapshots: simplest public, reproducible first release, consistent with CANTRE. Chosen by the implementer.
- Full hosted backend: better for authenticated social ingestion, durable reports and private AI keys, but requires hosting and source-access configuration. Leave a small separately deployable AI gateway rather than block the map.
- Pure static mockup: inadequate because the owner requested working weather and analysis.

## Experience

1. Map: all covered public rail chains, selectable subdivisions, weather samples, two researched gauge basin overlays, public bridge/culvert features. Forecast hour slider, weather metric selector, sample details and source freshness.
2. Linear view: sample locations ordered by qualified interpolated milepost, with temperature, rain and wind across forecast horizons. Unknown mileposts stay unknown; chains/gaps are not silently joined.
3. Deterministic workspace: transparent user-editable degree-day melt/runoff volume scenario with SI units; live gauge readings for Birch and Armley; source-linked locally retained observations with separate observation/publication timestamps. Missing values remain missing. No claim that a point forecast represents a basin average.
4. AI workspace: build an evidence package and prompt, download/copy it, optionally submit to a configured server-side gateway. Do not fabricate an AI response when the gateway is absent. Show original sources, gaps and report times. Social content is untrusted evidence, never instructions.

## Data contracts and constraints

NRWN geometry via CANTRE: retain version, checksums, retrieval/source-vintage distinction and OGL attribution. Geometry mostly 2016 vintage, not current operating authority. Use only CPKC-context chains; distinguish CN Tisdale. Never extrapolate mileposts outside monotone published/TC anchor intervals. No invented cross-border or chain-gap connections.

Open-Meteo modelled weather: SI units except wind km/h; times explicitly UTC, displayed America/Regina. Preserve nulls, detect incomplete future windows and stale/missing snapshots. Free service is for non-commercial evaluation; commercial deployment must revisit service terms.

ECCC hydrometric observations: preserve station, time, level datum and discharge units; never compare absolute gauge levels across stations or imply the gauge is upstream of a railway crossing.

Research: Birch issues April 22–24 and Tisdale May 4–6 are user recollections; event year is a working 2026 assumption. Original social warning lead time remains unproven. Corrected bridge mileage claims stay retracted. Publish a curated evidence summary, not bulk social HTML or private operational detail.

## Acceptance

Public repo and deployed page, source provenance, responsive map and linear views, meaningful deterministic calculations, honest AI connection state, tests for missing/stale data and numeric/time errors, reproducible deployment. AI generation requires a configured server secret and is not an acceptance claim unless actually exercised.
