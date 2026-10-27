# Data sources and provenance

## Railway geometry

Natural Resources Canada, National Railway Network (NRWN), via the public [CANTRE pipeline](https://github.com/orgonag/cantre-research).

- Catalogue: https://open.canada.ca/data/en/dataset/ac26807e-a1e8-49fa-87bf-451175a859b8
- Build manifest: https://orgonag.github.io/cantre-research/data/manifest.json
- Local acquisition metadata: `data/sources/cantre-manifest.json`; snapshot SHA-256 also appears in `public/data/network.json`.
- Extraction: `scripts/build_network.py`; preserve each chain independently. No gap joins. Sample at approximately 32 km intervals and chain endpoints; short chains remain on the map without redundant weather samples.
- Only scoped chains with the historical CPR operator code are selected. This distinguishes the CPKC-context Tisdale from the separate CN Tisdale. Source codes do not establish current operator ownership.
- Mileposts: linear interpolation within supplied monotone intervals containing only published/TC anchors. No extrapolation. Missing endpoints remain uncalibrated. Values are calculated positions, not surveyed railway-posted asset mileages.
- Geometry uses published NAD83(CSRS), treated as WGS84 for this research display. NRWN features are mostly 2016 or earlier. Source retrieval in October 2026 does not establish geometry currency.
- Licence: https://open.canada.ca/en/open-government-licence-canada

**Contains information licensed under the Open Government Licence – Canada**

Public bridge/culvert records are incomplete. Sixty extracted structure feature records are not a count of all current physical assets. No private employer source is used.

## Scope cross-checks

- Saskatchewan railway map, **April 2024**: https://publications.saskatchewan.ca/api/v1/products/82997/formats/95400/download
- Provincial geometry item (attribute vintage **2024_2025**): https://www.arcgis.com/home/item.html?id=1ee543a558bf4867b93966f95f7862fb
- TSB north-main-line description: https://bst-tsb.gc.ca/eng/rapports-reports/rail/2019/r19w0320/r19w0320.html
- Secondary subdivision tables, for context rather than current operating authority: https://justdavegray.ca/cpkc-hardisty-subdivision/ and corresponding subdivision pages listed in `research/north-line/coverage-inventory.csv`.

The provincial shapefile and secondary timetable pages are not bundled. Their own terms remain applicable. Railway diamonds are not assumed to be junctions.

## Weather

[Open-Meteo Forecast API](https://open-meteo.com/en/docs), https://api.open-meteo.com/v1/forecast

- Hourly total precipitation and **liquid rain separately** (mm), temperature (°C), snow depth (m), snowfall (cm), wind/gusts (km/h), shallow modelled soil temperature/moisture.
- All requested times use GMT and are interpreted as UTC. The interface displays America/Regina (CST, UTC−6). Alberta locations also use this common display timezone; this is labelled explicitly.
- Current conditions are modelled, not measured rail-side observations. API grid coordinates may differ from requested track samples. No model issue time is provided in this acquisition; `fetchedAt` is retrieval time.
- The 24-hour summary starts at the current clock hour. Totals include that hour's forecast interval. Forecast-hour slider affects the map; headline cards summarize the current point/current 24-hour window.
- Missing or incomplete 24-hour series do not become zero. Data older than six hours are flagged stale; three hours is the browser refresh threshold. These are display rules, not skill guarantees.
- Attribution and data licence: https://open-meteo.com/en/licence (CC BY 4.0). Free API access is for non-commercial use under https://open-meteo.com/en/terms . A commercial service needs the appropriate access arrangement.

## Hydrometric observations

Environment and Climate Change Canada / Water Survey of Canada, [GeoMet hydrometric real-time](https://api.weather.gc.ca/collections/hydrometric-realtime).

- Stations: **05MA011**, Birch Creek near Elfros; **05KB003**, Carrot River near Armley.
- Preserve observation time, level (m relative to the station's gauge datum) and discharge (m³/s). Levels at different gauges are not directly comparable.
- Fetch the latest 25 returned observations; the change shown is between the latest and oldest returned observation, with both times visible. No rate or warning threshold is inferred.
- A station can be active while its API query has no current observations. RWP shows unavailable rather than substituting historical data.
- Licence: Open Government Licence – Canada.

## Gauge basin polygons

ECCC National hydrometric network basin polygons, **June 2024**:

- Catalogue: https://open.canada.ca/data/en/dataset/0c121878-ac23-46f5-95df-eb9960753375
- Download: https://collaboration.cmc.ec.gc.ca/cmc/hydrometrics/www/HydrometricNetworkBasinPolygons/geojson/MDA_ADP_05.zip
- Birch gross basin: **1,137.33 km²**. Armley gross basin: **4,925.45 km²**.
- `public/data/basins.geojson` contains only those two original public polygon features, combined without altering geometry; licence OGL-Canada.

These are gross gauge drainage areas, not delineated catchments at the railway openings. A report inside a polygon is not proof of an active flow path to a particular crossing. No full-network watershed delineation has been completed.

## Community observations and basemap

No authenticated social API or automatic scraper is connected. Added reports stay in browser storage until the user exports them or explicitly sends an AI package. Original links, event/publication timestamps and verification state remain separate. Do not copy bulk social posts/media or restricted-group content into the repository.

Basemap: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), © [CARTO](https://carto.com/attributions). Tiles are requested by the visitor's browser. The application does not redistribute a downloaded OSM database.
