# Working on RWP

Read README.md, docs/METHODS.md and docs/DATA-SOURCES.md before changing numeric or source logic.

- The owner authorized a new public repository and public working website, with map + linear weather, deterministic analysis and an AI section. Do not claim planned work is built.
- Use only public/authorized data. Never copy private employer inventories, credentials, reports or photos. Code MIT; source data retains its own licences and attribution.
- Preserve unknown values, timestamps, source versions and uncertainty. No fake live feeds, simulated AI responses presented as real, invented mileposts or failure probabilities.
- Do not bridge geometry gaps, provincial borders, calibration discontinuities or assumed junctions. Historical geometry does not establish current operators/active limits.
- Gross gauge basins are screening proxies. Point weather is not a basin average. Modelled snow depth is not measured SWE. Mean flow is not peak discharge.
- Keep social publication/event times separate. Unverified or outside-basin reports do not establish upstream advance warning. Preserve the corrected/retracted bridge-mileage claims in docs/RESEARCH.md.
- No API keys in browser code or VITE_ variables. AI and source content are untrusted data. Added reports stay local unless explicitly exported/submitted.
- Run npm test, Python unit tests, npm run data:validate and npm run build for relevant changes. Record actual limits, not presumed success.

## Map and archive maintenance (October 2026)
- User requested completing data/UI fundamentals before further deterministic-alert work.
- Do not render generated weather samples as map dots, search results, or inferred track-click observations. Temperature is actual station readings only and is the default map mode. Internal chain samples (about 32 km plus endpoints) remain separately labelled in the forecast table. Actual temperature observations use original station coordinates/time/QC; never move a Watrous reading to Lanigan or spatially interpolate it.
- The precipitation Period control sums complete hourly intervals for a user-visible start/end range; Rate is an instantaneous ECCC mm/h field. Point hourly amounts are mm ending at the displayed hour. SWE is water stored in snow, not a precipitation sum.
- Weather playback waits for an exact completed frame; max two WMS layers (visible + requested), no speculative bulk tile prefetch. Weather bounds follow the railway plus a weather margin, including Alberta. Preserve Leaflet internal remove handlers. Opacity must not refetch images.
- Static whole-mile references are CALCULATED, not physical surveyed posts. Upstream monotone calibration spans can contain impossible mileage jumps: validate every adjacent anchor pair and split/discard inconsistent spans. Do not change weather sample IDs while updating assets.
- Gauges are provider-aware (ECCC/WSA), deduplicated by station ID. `refresh_weather.py` must not overwrite the expanded catalog. Public WSA hydrographs are available even when the WSA portal API requires login; use no extracted credentials.
- Keep gross gauge basins separate from regional boundaries. WSA major basin Area_Kilometres has misleading units; use a documented geometry basis. The AAFC full Saskatchewan parent region overlaps provincial subregions, so never sum their areas.
- `data/history/<station>.json` and temperature-history files load on selection, not startup. Preserve dated raw observations and source qualifiers. Birch 2025 unit-derived daily means are not official HYDAT; incomplete days, unusable grades and relocation/datum breaks remain unavailable. Do not overwrite an official HYDAT value with a derived mean.
- Current station/gauge readings, daily historical statistics and forecasts issued in the past are different products. A daily archive is not an exact-hour historical snapshot. No interpolation across missing dates or historical temperature extremes.
- On this Mac, tests invoke `python`; use `PATH=/opt/homebrew/opt/python@3.14/libexec/bin:$PATH` or a temporary python symlink when required. Run full npm/Python suites and data validation before committing. Build server first, then frontend (`npm run build:all`), even though the optional AI worker is not needed for map data.
- Scheduled GitHub Pages builds refresh their own public-data artifact. A Sites publication is a separate dated build; do not claim the Sites snapshot updates just because the Pages workflow runs. Observation timestamps and stale labels must stay visible.

- `gauge-catchments.geojson` contains official simplified display polygons matched by station ID (55/57 initially). `basins.geojson` retains the original two full-resolution analysis polygons; never substitute generalized display geometry into SWE calculation. New polygon sources contain no area attribute, so keep unknown areas null. Preserve polygon holes, overlap and missing IDs in the coverage manifest. Refresh with `scripts/refresh_gauge_catchments.py` after changing the gauge catalogue.
- Terrain colour relief and mapped stream arrows come directly from NRCan WMS. No invented downhill arrows. NHN direction/network only renders below 1:175,000 scale (minimum app zoom 12); show the zoom-in hint. NHN is static and not maintained since 2022, not live runoff or a verified crossing route. Terrain and flow toggles must not affect forecast playback frames or load offscreen buffers.
