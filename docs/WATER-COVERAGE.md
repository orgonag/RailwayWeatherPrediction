# Corridor water coverage and downloadable history

The water catalogue is selected from the **actual independent rail chains**, not a provincial rectangle. Active ECCC hydrometric stations and WSA's provincial station catalogue are included within **25 km** of a rail segment. Birch and Armley remain explicitly included. The distance is a display filter; it does not establish an upstream/downstream connection to a bridge or culvert.

## Verified acquisition, October 28, 2026 UTC

- **57 distinct stations**: 34 shown with ECCC as the observation provider and 23 with WSA; 52 in Saskatchewan and 5 in Alberta. ECCC also distributes some provincial-operated stations. Provider and operator are separate fields.
- **48 stations have dated observations** in the fetched public feeds; this is not a claim that every last observation is recent. Actual timestamps determine freshness in the interface.
- **56 stations have at least one daily historical value** from 2020 onward. Coverage differs by station, metric and year; gaps remain gaps.
- All **23 WSA public hydrographs** yielded recognizable, dated numeric series. Armley has real provincial discharge observations even though its ECCC real-time query returns no readings.
- Seven regional features are bundled: six WSA provincial drainage basins (Assiniboine, Lake Winnipegosis, North Saskatchewan, South Saskatchewan, Saskatchewan and Qu'Appelle), plus the full AAFC Saskatchewan River drainage region which includes the Alberta end of the railway. The parent AAFC region intentionally overlaps the more detailed provincial regions. The original two ECCC **gross gauge basins** remain a separate dataset.

`public/data/water-coverage.json` is the coverage and download manifest. Its `archives` entries give actual observation and daily coverage dates, available years, row counts, source URLs and each `historyPath`. Dates describe available records, not a promise of continuous coverage. The files can be downloaded from the repository or the same relative path on the deployed site.

## Historical snapshots

Each `public/data/history/<station>.json` contains one `GaugeHistory`: original dates/times, level in metres, discharge in m³/s, source qualifiers, and source metadata. Files load only when a station is selected. The full collection is not an initial application download. The small `gauges.json` catalogue contains the latest available dated reading and links to history files; `hydrology.json` retains the two original stations for compatibility.

The last three calendar years are **requested, not invented**. Daily queries start in 2020 and end at acquisition. Available 2023, 2024, 2025 and current-year dates can be selected when the source actually has data. Some stations still lack 2025 in approved HYDAT; some have discontinued/seasonal series or no recent observations. Zero is a reading. `null` means no usable value. An unavailable past date must display unavailable.

Birch's missing 2025 HYDAT rows were recovered from ECCC's separate static unit-value archives: **287 usable flow days and 193 usable level days**, with exact compressed native source subsets retained. These daily values are clearly marked **RWP-derived daily means**, with source approval/grade information; they are not official HYDAT daily means. Official daily rows always take precedence. Incomplete days, unusable data and the documented relocation day are excluded. See [unit history](UNIT-HISTORY.md). Armley is absent from the inspected unit archives; its public WSA hydrograph covers 2026, not 2025.

A historical gauge view describes recorded water conditions. It does not recreate the weather forecast issued on that day, historical radar, a measured basin snowpack, or a historic railway alert. No weather, basin-snow or asset values are backfilled from today's dataset.

## Public sources and refresh

`python scripts/refresh_water_coverage.py` refreshes the catalogue, regional geometry and each station's recent and daily series with three workers. Failures preserve clearly dated previous station records where available. It does not supply credentials to WSA's Data Portal API, which returned HTTP 401. Instead it reads the public hydrograph's embedded JSON as data: station title, recognised metric/unit, explicit UTC timestamps and exact numeric columns are validated. No chart pixels are digitized and no JavaScript is executed. Individual quality flags and level datums are not supplied by these graphs; that limitation remains explicit.

- [ECCC station catalogue](https://api.weather.gc.ca/collections/hydrometric-stations), [daily means](https://api.weather.gc.ca/collections/hydrometric-daily-mean) and [recent observations](https://api.weather.gc.ca/collections/hydrometric-realtime): Open Government Licence–Canada.
- [WSA station catalogue](https://www.arcgis.com/home/item.html?id=299bd613c1064ae39fc4f0791535e590) and [major drainage basins](https://www.arcgis.com/home/item.html?id=839fb4ce33c64181b3a31465df66fa01): Government of Saskatchewan Standard Unrestricted Use Data Licence, linked in the source item. WSA basins are derived from AAFC boundaries. Regional geometry is generalized by the source service at 0.001 degree for map display.
- [WSA Stream Flows and Lake Levels](https://wsask.ca/recreation-environment/lakes-and-rivers-overview/stream-flows-and-lake-levels/): public near-real-time hydrographs are provisional and subject to revision. Links to the actual station graphs are retained.
- [AAFC Major Basins, Watershed Project 2013](https://open.canada.ca/data/en/dataset/27c70cf8-2ad2-4c69-a529-90f91561b741): Open Government Licence–Canada. The complete source Saskatchewan River polygon is retained unchanged. The source vintage is 2013, not the acquisition date.

Do not use WSA's `Area_Kilometres` field as a square-kilometre area: its values do not agree with the projected geometry field's unit conversion. The display's WSA `areaKm2` is explicitly `Shape__Area / 1,000,000` for the provincial feature. AAFC's area is left unreported here because its original area field is not verified for a meaningful geodesic area.

No new gauge-level cross-year comparison is enabled merely because datum names match. The original documented Birch relocation remains enforced; newly added sites keep historical datum/continuity unverified. Gross basin membership, regional boundaries and gauge proximity are context, not validated hydraulic links.
