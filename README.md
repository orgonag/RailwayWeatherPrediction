# RailwayWeatherPrediction · RWP

A map-first railway weather workspace for **Hardisty → Wilkie → Sutherland → Wynyard → Bredenbury** and connected branches.

**Live site:** https://railway-weather-prediction.shokti.chatgpt.site
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

The live Site above is independent of GitHub Pages. The repository workflow always checks/builds the project; optional Pages publication requires Pages activation and repository variable RWP_PAGES_ENABLED=true. Scheduled GitHub builds do not republish the independent Site.

Optional AI uses a server-side gateway; keys stay out of the public frontend and repository. The gateway is deployed, but no provider key or real model response is configured or verified. See [secure model setup](docs/AI.md). The map and all public-data tools work without a model key.

## Sources and methods

- [Data sources](docs/DATA-SOURCES.md)
- [Map layers and basin snow](docs/MAP-LAYER-DATA.md)
- [Gauge records and comparison rules](docs/GAUGE-HISTORY.md)
- [Threshold and scenario methods](docs/METHODS.md)
- [Historical event research](docs/RESEARCH.md)
- [Optional statistical model extension](docs/MODEL-EXTENSIONS.md)

Code: MIT. Data retain their source licences. Contains information licensed under the Open Government Licence–Canada. Basemap ©OpenStreetMap contributors; point forecasts ©Open-Meteo. Open-Meteo free access is for non-commercial evaluation; commercial operation requires an appropriate access arrangement.
