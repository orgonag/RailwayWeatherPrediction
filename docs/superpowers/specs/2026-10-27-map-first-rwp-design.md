# RWP map-first design

Build authorization: the owner approved the planning direction and asked whether we are ready to build. This implements that direction; the earlier fixed-cutoff warning-first dashboard remains unpublished in its separate branch.

## Agreed experience

- One large map below a slim top bar, usable on phone and desktop. A selection opens details on the left on desktop and a compact expandable bottom sheet on phones. Plain labels, clear track, recognisable locations, and readable values.
- Independently controlled layers: precipitation, stream gauges, drainage basin outlines and basin snowpack water content. Optional public structures. Track remains above weather shading.
- Shared forecast timeline from now to +72 hours. Temperature and all other forecast dashboard values follow the selected hour. Map product validity must be explicit; unavailable times are not filled with invented imagery or fake smooth interpolation.
- Precipitation views: type, intensity, accumulated water equivalent, with clear units/periods and transparency. Use actual ECCC gridded products rather than fabricated interpolation of track samples. Forecast maps and point forecasts disclose their sources.
- Track selection shows local weather/type/hourly precipitation, next-24h rain/snow/total water equivalent, wind, source time and applicable rule alerts. Basin and gauge selections show their own data rather than a generic calculator.
- Gauge graph: actual observations, the previous year's daily means aligned by calendar date, and mean daily values for the previous three years. Controls: 7 days, 30 days, season; level/flow separately. Missing and ice/quality-affected records remain explicit. Do not stitch across data gaps, mix datums or silently count absent years as zero. No invented future gauge readings.
- Basin dashboard: snow water equivalent and optional depth, normal comparison if actual historical statistics exist, precipitation context, station identity and gross basin qualification. A gross gauge basin is not a verified catchment for each crossing. No proximity-based rail water warning.
- Deterministic alerts are a separate inspectable panel and optional markers. Each shows where, what, when, measured/forecast amount and the configured threshold. Defaults remain uncalibrated research settings; above-normal rules stay unavailable without historical baselines. Official warnings must never be simulated by local rules.
- Keep optional AI, manual reports and previous scenarios accessible under secondary tools; they must not dominate the landing view. The keyless map remains fully usable.

## Implementation choices

React/TypeScript, Leaflet and SVG gauge charts; no large chart package. Extend current forecast requests to five calendar days to support +72h selections plus next-24h summaries at the far end. Preserve interval-ending precipitation semantics and liquid rain = rain + showers. ECCC catalog comes from live capabilities with saved fallback metadata and exact product timing. Radar remains distinctly recent observations, not a 72h prediction.

Only the two existing public gross basin polygons are established initially. Discover and acquire actual historical gauge data and basin SWE; if upstream archives lag, show the comparison controls with truthful coverage gaps. Never claim absent baselines are built. Current basin snow estimates may be sampled model products with method/coverage disclosed; snow depth is not SWE and must not be converted by an invented fixed ratio.

## Validation

Test +72h clock alignment, preceding-hour precipitation sums, no missing-to-zero conversion, rule boundary/freshness behavior, gauge calendar alignment and gaps, map layer interactions and selection UI. Verify responsive desktop/mobile rendering and real provider requests when environment permits. Publish the reviewed source/build to the existing public Site, preserving its audience, then report remaining source gaps.
