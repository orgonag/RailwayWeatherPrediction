# RailwayWeatherPrediction · RWP

A map-first railway weather workspace for **Hardisty → Wilkie → Sutherland → Wynyard → Bredenbury** and connected branches.

**Live preview:** https://railway-weather-prediction.shokti.chatgpt.site

**GitHub Pages destination (pending owner activation):** https://orgonag.github.io/RailwayWeatherPrediction/

**Source:** https://github.com/orgonag/RailwayWeatherPrediction

## What works

- A full-screen map, slim top bar, desktop selection dashboard and expandable phone dashboard.
- Independent railway chains across 15 subdivisions and actual thermometer readings at observing stations; no generated weather dots.
- ECCC precipitation type/rate, wind gusts and recent radar maps; date-bounded precipitation forecasts in a separate table.
- One hourly timeline through +72 hours. Selected-location weather and following-24h totals use the selected time.
- Independent stream-gauge, basin-boundary, snow-water and public-structure layers.
- Gauge line graphs for recent observations and compatible historical daily comparisons; separate level/flow and 7-day/30-day/season controls.
- Actual CaLDAS snow-water estimates clipped to the two established gauge basins, with source time, coverage and method.
- Configurable browser-local rain, snowfall, gust and air-temperature threshold alerts at the selected time and across the next72 hours. No thresholds are enabled by default.
- Search, along-the-line weather, local source-linked field reports, water scenarios and optional AI evidence assessments under More tools.

This supports weather awareness and inspection planning. It is not a validated washout predictor or railway movement authority.

## Data limits that remain visible

**55 of 57 gauges** have published WSC catchment outlines, separate from seven regional drainage divisions. Original full-resolution Birch Creek / Elfros (05MA011) and Carrot River / Armley (05KB003) polygons remain the two SWE analysis basins. Gauge catchments are not verified railway-crossing catchments. Point weather is not a basin average.

Birch's gauge moved on2025-06-10, causing a documented level step change. Some 2025 history is recovered from unit records as explicitly derived daily means. Comparison lines remain unavailable where years, quality or continuity do not support them. Armley observations use its public WSA hydrograph with original timestamps.

Basin snow-water estimates use an actual model analysis. Seasonal snow baselines and corresponding above-normal alerts are not yet available. Snow depth and snow water equivalent are separate fields.

Precipitation Period amounts sum complete hourly intervals between the selected dates. They are presented in a forecast table and selection dashboard. Rate is an instantaneous mm/h field. Radar is recent observations; future precipitation and wind use forecast products.

## Run and check

Node24+ and Python3.12+:

~~~sh
npm ci
npm run dev
npm test
python -m unittest discover -s scripts/tests -v
npm run data:validate
npm run build
~~~

Refresh bundled public data:

~~~sh
python scripts/refresh_weather.py
python scripts/refresh_map_layers.py
python scripts/refresh_hydrology.py
~~~

Browser weather metadata, selected-route weather, selected-gauge observations and basin SWE can refresh independently. Every source retains its actual timestamp; failed refreshes retain clearly dated data.

## Hosting and AI

GitHub Pages is the intended repository-hosted site. The preview above was used because the connected GitHub integration cannot activate Pages (GitHub returns 403). In [Settings → Pages](https://github.com/orgonag/RailwayWeatherPrediction/settings/pages), choose **GitHub Actions** as the source. The workflow already builds with the correct repository URL prefix, checks Pages availability and publishes when enabled. No extra repository variable is required. Rerun **Build and publish GitHub Pages** after activation; later pushes and scheduled builds publish automatically. Scheduled GitHub builds do not republish the independent preview.

Optional AI uses a server-side gateway; keys stay out of the public frontend and repository. The gateway is deployed, but no provider key or real model response is configured or verified. See [secure model setup](docs/AI.md). The map and all public-data tools work without a model key.

## Sources and methods

- [Data sources](docs/DATA-SOURCES.md)
- [Map layers and basin snow](docs/MAP-LAYER-DATA.md)
- [Gauge records and comparison rules](docs/GAUGE-HISTORY.md)
- [Threshold and scenario methods](docs/METHODS.md)
- [Historical event research](docs/RESEARCH.md)
- [Optional statistical model extension](docs/MODEL-EXTENSIONS.md)

Code: MIT. Data retain their source licences. Contains information licensed under the Open Government Licence–Canada. Basemap ©OpenStreetMap contributors; point forecasts ©Open-Meteo. Open-Meteo free access is for non-commercial evaluation; commercial operation requires an appropriate access arrangement.

### Map data repairs and historical access

The map now has independently selectable calculated whole-mile references, crossings, bridges, culverts and station records. These are public historical inventories with explicit gaps, not a complete operational inventory. See [railway assets](docs/RAILWAY-ASSETS.md).

Precipitation **Rate** is mm/h at the model validity time. **Period** lets you choose a start and end time and sums complete hourly water-equivalent amounts in the forecast table (View period amounts). The default is 24 hours. Forecast samples are spaced about 32 km along each continuous track chain; they are not observed weather stations.

The default map shows actual, dated station temperatures. No temperature is interpolated between stations. Optional terrain colours show elevation and relief; mapped stream arrows appear at zoom 12+. These are static geographic layers, not live runoff. Selecting a temperature station exposes its available daily history and public JSON download. Selecting a stream gauge loads that station's native/daily history, with an archive ending-date selector and public download. See [observed temperatures](docs/OBSERVED-TEMPERATURES.md), [water coverage](docs/WATER-COVERAGE.md), and [recovered unit history](docs/UNIT-HISTORY.md). Missing dates remain missing. Historical daily records do not recreate an entire radar/forecast map at an exact past hour.

`npm run build:all` builds the optional server worker before the frontend. Publishing the static Sites app does not deploy the optional AI worker. Run the full test suites and data validation before publication.
