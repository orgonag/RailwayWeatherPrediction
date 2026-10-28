# RailwayWeatherPrediction · RWP

A map-first railway weather workspace for **Hardisty → Wilkie → Sutherland → Wynyard → Bredenbury** and connected branches.

**Live preview:** https://railway-weather-prediction.shokti.chatgpt.site

**GitHub Pages destination (pending owner activation):** https://orgonag.github.io/RailwayWeatherPrediction/

**Source:** https://github.com/orgonag/RailwayWeatherPrediction

## What works

- A full-screen map, slim top bar, desktop selection dashboard and expandable phone dashboard.
- Clear independent railway chains and calculated-milepost weather locations across 15 subdivisions.
- Real ECCC precipitation type, intensity and accumulated water maps; temperature, wind gusts and recent radar views.
- One hourly timeline through +72 hours. Selected-location weather and following-24h totals use the selected time.
- Independent stream-gauge, basin-boundary, snow-water and public-structure layers.
- Gauge line graphs for recent observations and compatible historical daily comparisons; separate level/flow and 7-day/30-day/season controls.
- Actual CaLDAS snow-water estimates clipped to the two established gauge basins, with source time, coverage and method.
- Configurable browser-local rain, snowfall, gust and air-temperature threshold alerts at the selected time and across the next72 hours. No thresholds are enabled by default.
- Search, along-the-line weather, local source-linked field reports, water scenarios and optional AI evidence assessments under More tools.

This supports weather awareness and inspection planning. It is not a validated washout predictor or railway movement authority.

## Data limits that remain visible

Only **Birch Creek / Elfros (05MA011)** and **Carrot River / Armley (05KB003)** have established gross basin polygons here. They are gauge basins, not verified catchments for individual railway crossings. Point weather is not a basin average.

The current public archives do not include2025 for these stations. Birch's gauge moved on2025-06-10, causing a documented level step change. Comparison lines remain unavailable where years, quality or continuity do not support them; the app does not invent averages. Armley currently has no real-time observations. Explicit archive views show dated historical records.

Basin snow-water estimates use an actual model analysis. Seasonal snow baselines and corresponding above-normal alerts are not yet available. Snow depth and snow water equivalent are separate fields.

Precipitation map totals are water equivalent **since the displayed forecast run**, not automatically a rolling24h amount. Location-dashboard totals are separately calculated for the next24h. Radar is recent observations; future weather uses forecast products. Forecast maps and point values come from different models/grids and identify their sources.

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

Precipitation **Rate** is mm/h at the model validity time. **Period** lets you choose a start and end time and sums complete hourly water-equivalent amounts at the railway forecast dots. The default is 24 hours. Forecast samples are spaced about 32 km along each continuous track chain; they are not observed weather stations.

Observed station temperatures are separately located and dated. Selecting a temperature station exposes its available daily history and public JSON download. Selecting a stream gauge loads that station's native/daily history, with an archive ending-date selector and public download. See [observed temperatures](docs/OBSERVED-TEMPERATURES.md), [water coverage](docs/WATER-COVERAGE.md), and [recovered unit history](docs/UNIT-HISTORY.md). Missing dates remain missing. Historical daily records do not recreate an entire radar/forecast map at an exact past hour.

`npm run build:all` builds the optional server worker before the frontend. Publishing the static Sites app does not deploy the optional AI worker. Run the full test suites and data validation before publication.
