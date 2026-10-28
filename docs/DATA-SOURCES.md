# Data sources and provenance

## Railway geometry

Natural Resources Canada, National Railway Network (NRWN), via the public [CANTRE pipeline](https://github.com/orgonag/cantre-research).

- Catalogue: https://open.canada.ca/data/en/dataset/ac26807e-a1e8-49fa-87bf-451175a859b8
- Build manifest: https://orgonag.github.io/cantre-research/data/manifest.json
- Local acquisition metadata: `data/sources/cantre-manifest.json`; snapshot SHA-256 also appears in `public/data/network.json`.
- Extraction: `scripts/build_network.py`; preserve each chain independently. No gap joins. Sample at approximately 32 km intervals and chain endpoints; short chains remain on the map without redundant weather samples.
- Only scoped chains with the historical CPR operator code are selected. This distinguishes the CPKC-context Tisdale from the separate CN Tisdale. Source codes do not establish current operator ownership.
- Mileposts: linear interpolation within supplied monotone intervals containing only published/TC anchors. Every adjacent pair is checked against geometry distance (15% tolerance plus a 0.01-mile posting-resolution allowance), including short spans that the upstream check omits. Inconsistent pairs are split and recorded in `data/sources/railway-assets.json`. No extrapolation. Missing endpoints remain uncalibrated. Values are calculated positions, not surveyed railway-posted asset mileages.
- Geometry uses published NAD83(CSRS), treated as WGS84 for this research display. NRWN features are mostly 2016 or earlier. Source retrieval in October 2026 does not establish geometry currency.
- Licence: https://open.canada.ca/en/open-government-licence-canada

**Contains information licensed under the Open Government Licence – Canada**

The static asset layer contains **1,256 crossing records, 59 bridges, one culvert, one station (Sutherland), and 1,090 calculated whole-mile references** from the pinned snapshot. Crossing records include public, private and unknown-access crossings; “public source” does not mean public access. There are no scoped physical markerpost anchors in this snapshot. Whole-mile references are calculated only within accepted calibration, and never assert that a physical post exists. Published asset mileages retain their own posted/Transport Canada/unverified labels separately from calculated mileages.

Public bridge, culvert and station records are incomplete. Sixty extracted structure feature records are not a count of all current physical assets, and a station feature is not a complete railway operating-point inventory. No private employer source is used. See [railway asset coverage and method](RAILWAY-ASSETS.md).

## Scope cross-checks

- Saskatchewan railway map, **April 2024**: https://publications.saskatchewan.ca/api/v1/products/82997/formats/95400/download
- Provincial geometry item (attribute vintage **2024_2025**): https://www.arcgis.com/home/item.html?id=1ee543a558bf4867b93966f95f7862fb
- TSB north-main-line description: https://bst-tsb.gc.ca/eng/rapports-reports/rail/2019/r19w0320/r19w0320.html
- Secondary subdivision tables, for context rather than current operating authority: https://justdavegray.ca/cpkc-hardisty-subdivision/ and corresponding subdivision pages listed in `research/north-line/coverage-inventory.csv`.

The provincial shapefile and secondary timetable pages are not bundled. Their own terms remain applicable. Railway diamonds are not assumed to be junctions.

## Weather

[Open-Meteo Forecast API](https://open-meteo.com/en/docs), https://api.open-meteo.com/v1/forecast

- Hourly total precipitation and **liquid rain + showers separately** (mm), temperature (°C), snow depth (m), snowfall (cm), wind/gusts (km/h), shallow modelled soil temperature/moisture.
- All requested times use GMT and are interpreted as UTC. The interface displays America/Regina (CST, UTC−6). Alberta locations also use this common display timezone; this is labelled explicitly.
- Current conditions are modelled, not measured rail-side observations. API grid coordinates may differ from requested track samples. No model issue time is provided in this acquisition; `fetchedAt` is retrieval time.
- The selected forecast hour drives map and dashboard values through +72h. Following24h accumulation windows use interval-ending labels t+1 through t+24; the interval before the selected time is excluded.
- Missing or incomplete 24-hour series do not become zero. Data older than six hours are flagged stale; three hours is the browser refresh threshold. These are display rules, not skill guarantees.
- Attribution and data licence: https://open-meteo.com/en/licence (CC BY 4.0). Free API access is for non-commercial use under https://open-meteo.com/en/terms . A commercial service needs the appropriate access arrangement.

## Observed station temperatures

The independent observed-temperature layer uses actual [ECCC SWOB station observations](https://eccc-msc.github.io/open-data/msc-data/obs_station/readme_obs_insitu_en/) within 75 km of the rail geometry. The initial import contains 35 station locations. Each value stays at its actual station coordinate and observation time; there is no spatial interpolation or town forecast substitution. No Lanigan observation station or community-station feed is asserted. The layer includes Watrous East at Watrous.

Three years of official daily temperature CSV exports are bundled as separate station downloads, preserving daily mean/minimum/maximum, dates, coordinates and flags. Daily history is not an exact-hour replay. See [observed temperature sources and limitations](OBSERVED-TEMPERATURES.md). Sources retain the [ECCC Data Server End-use Licence](https://eccc-msc.github.io/open-data/licence/readme_en/), named-provider attribution and acquisition provenance.

## Hydrometric observations

Environment and Climate Change Canada / Water Survey of Canada, [GeoMet hydrometric real-time](https://api.weather.gc.ca/collections/hydrometric-realtime).

- Coverage is now the57-station corridor catalogue in `public/data/gauges.json`:34 ECCC-provider records and23 WSA-provider records. Operator and observation provider are separate. The original stations are05MA011, Birch Creek near Elfros, and05KB003, Carrot River near Armley. See [water coverage and downloads](WATER-COVERAGE.md).
- Preserve observation time, level (m relative to the station's gauge datum) and discharge (m³/s). Levels at different gauges are not directly comparable.
- Native recent observations and compatible historical daily means feed the gauge chart. Historical source coverage, quality symbols and relocation limits are documented in GAUGE-HISTORY.md; no gauge warning threshold is inferred.
- A station can be active while its ECCC API query has no observations. WSA-operated stations also use the official public hydrograph JSON, with provisional status and actual timestamps preserved. A source gap remains unavailable; historical data are never relabelled as current.
- Licence: Open Government Licence – Canada.

## Gauge basin polygons

ECCC National hydrometric network basin polygons, **June 2024**:

- Catalogue: https://open.canada.ca/data/en/dataset/0c121878-ac23-46f5-95df-eb9960753375
- Download: https://collaboration.cmc.ec.gc.ca/cmc/hydrometrics/www/HydrometricNetworkBasinPolygons/geojson/MDA_ADP_05.zip
- Birch gross basin: **1,137.33 km²**. Armley gross basin: **4,925.45 km²**.
- `public/data/basins.geojson` contains only those two original public polygon features, combined without altering geometry; licence OGL-Canada.

These are gross gauge drainage areas, not delineated catchments at the railway openings. A report inside a polygon is not proof of an active flow path to a particular crossing. No full-network watershed delineation has been completed. A separate regional layer now includes six WSA Saskatchewan major drainage basins and the unchanged AAFC2013 Saskatchewan River parent region covering the Alberta end; these regional features are not gauge catchments or verified railway-opening catchments. See [water coverage](WATER-COVERAGE.md) for source licences and geometry methods.

## Community observations and basemap

No authenticated social API or automatic scraper is connected. Added reports stay in browser storage until the user exports them or explicitly sends an AI package. Original links, event/publication timestamps and verification state remain separate. Do not copy bulk social posts/media or restricted-group content into the repository.

Basemap: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), served by `tile.openstreetmap.org`. Tiles are requested by the visitor's browser; no bulk download, prefetch or offline cache is performed. See the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/); a larger production deployment should arrange a suitable tile service. The application does not redistribute a downloaded OSM database. The first CARTO test returned API-key-required watermark tiles and was replaced before release handoff.

## Map-first layer and history extensions

See [MAP-LAYER-DATA.md](MAP-LAYER-DATA.md) for ECCC RDPS, radar and CaLDAS WMS/WCS products, pinned times, actual basin sampling and browser refresh. See [GAUGE-HISTORY.md](GAUGE-HISTORY.md) for dated ECCC/HYDAT archives and station continuity. Browser point acquisition requests five calendar days, including precipitation type, showers, probability and wind direction.
