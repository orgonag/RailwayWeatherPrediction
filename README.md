# RailwayWeatherPrediction · RWP

Railway weather visibility for **Hardisty → Wilkie → Sutherland → Wynyard → Bredenbury** and connected branches.

RWP brings track geometry, forecast weather, stream gauges and source-linked community observations into one engineering research workspace.

**Public site:** https://railway-weather-prediction.shokti.chatgpt.site

**Source repository:** https://github.com/orgonag/RailwayWeatherPrediction

## What works in v0.1

- Interactive public track map: 15 subdivisions, 20 separate historical rail chains, 84 weather samples, optional gross gauge basin and public structure layers.
- Linear weather view: calculated milepost rows × forecast horizons, with temperature, precipitation and gusts. Unknown mileposts and missing data stay explicit.
- Current modelled weather and 72-hour forecast files from Open-Meteo, browser refresh and 48-hour map slider. Initial cache is dated; selected-route refresh can retrieve current data.
- Transparent degree-day snowmelt/runoff scenario: editable area, liquid rain, SWE, positive degree-days, melt factor and runoff coefficient; runoff volume and 24-hour mean flow.
- ECCC hydrometric readings where available. Birch Creek returned a recent observation in the initial acquisition; Armley returned none and is shown unavailable.
- Browser-local community/field reports with source URL, separate observed/publication times and verification state.
- AI evidence package and prompt export; optional server-side AI gateway. **Generated AI briefings require a configured provider.** No AI output is simulated.

This is a research preview for awareness and inspection prioritization. It is not a validated washout prediction system or an operational movement authority. There is no routed hydrograph or culvert-capacity calculation.

## Run locally

Node **22.12+** and Python **3.12+**:

```sh
npm ci
npm run dev
```

```sh
npm test
python -m unittest discover -s scripts/tests -v
npm run data:validate
npm run build
```

Refresh public feeds with `npm run data:weather`. Rebuild the rail extract with `python scripts/build_network.py` (downloads the checksum-verified CANTRE national snapshot). No keys are needed for the public data feeds. Open-Meteo's free endpoint is for non-commercial evaluation; revisit its service terms before commercial operation.

## Deploy

GitHub Pages workflow: `.github/workflows/pages.yml`. In repository **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. Push to `main` or run **Build and publish RWP** from the Actions tab to deploy. The repository and complete source are public; the separate public site above is already available. Pages activation is an account setting and must be completed before its workflow can publish.

The Pages workflow refreshes weather/gauges on deployment and every three hours, then builds and deploys. Scheduled Actions can be delayed and may be disabled by GitHub after inactivity. The site always shows source timestamps and can refresh a selected subdivision in the browser. The separate Sites publication uses the same static build; scheduled GitHub deployments do not update that independent host automatically.

AI setup: [docs/AI.md](docs/AI.md). Never place an API key in a `VITE_` variable, commit, issue or browser bundle.

## Project map

| Path | Purpose |
| --- | --- |
| `src/components/TrackMap.tsx` | Map and weather samples |
| `src/components/LinearWeather.tsx` | Forecast along a subdivision |
| `src/lib/analysis.ts` | Explicit scenario math and evidence prompt |
| `src/components/Observations.tsx` | Local source-linked reports |
| `worker/` | Optional server-side AI gateway |
| `scripts/` | Public-data preparation and validation |
| `research/` | Curated Birch/Tisdale evidence and geographic scope |
| `docs/` | Sources, methods, design, plan and next steps |

## Coverage and next steps

Core: Hardisty, Wilkie, Sutherland, Wynyard. Branch inventory: Lloydminster, Reford, Macklin, Kerrobert, Tisdale, Kelvington, Melfort, Lanigan, Bulyea, White Fox and Yarbo. Industrial spurs remain in the inventory sweep. Historical geometry does not establish current operators or active limits.

Next: verify asset identifiers and active branch limits; delineate asset catchments; add catchment-averaged weather/SWE, historical replay, permitted original social feeds and connected AI. See [the roadmap](docs/ROADMAP.md), [data sources](docs/DATA-SOURCES.md), [methods](docs/METHODS.md) and [research findings](docs/RESEARCH.md).

Code: MIT. Each dataset remains under its source licence. **Contains information licensed under the Open Government Licence – Canada.**
