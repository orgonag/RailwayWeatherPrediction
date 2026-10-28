---
name: map-data-foundation
description: Maintain RWP map assets, observed weather and hydrology archives without conflating forecasts and measurements.
---
Read project AGENTS.md, docs/METHODS.md and docs/DATA-SOURCES.md. Inspect live provenance before choosing sources. Use scripts/build_network.py for checksum-pinned rail assets, scripts/refresh_water_coverage.py for provider-aware gauges and basins, scripts/recover_unit_history.py if present for supplemental gauge archives, and scripts/refresh_temperature_observations.py for actual stations.

Keep weather sample IDs stable. Validate adjacent mileage anchors even inside a source-labelled monotone interval; impossible jumps occur. Calculated whole-mile references are not physical mileposts. Preserve source and calculated mileage separately.

Do not render generated forecast samples as map markers or primary search results. Default to actual thermometers, without a future timeline in observation mode. Keep selected-period precipitation amounts in the explicitly labelled forecast table. Never place a nearby town's observed temperature at a forecast dot. Use station coordinates, original observedAt, QC and missing values. History date lookup is exact. Daily mean/minimum/maximum must be labelled daily, not instantaneous.

Regional basins and gross gauge basins are different layers. Parent regional polygons overlap subregions. A gauge's distance to track is not a hydraulic link. WSA hydrograph data is provisional; no sign-in bypass is needed for public hydrograph HTML. HYDAT takes precedence over derived archives. Preserve datum/relocation breaks and partial-day exclusions.

Load station archives on demand. WMS only fetches displayed/requested frames for the rail extent; no broad speculative image cache. Test slow/error/timeout frames, exact time keys, opacity changes, asset selection and period accumulation.

Before any commit run all npm tests, all Python tests and data validation; build server before frontend. Verify map playback, date selectors, provenance and archive downloads in the browser. Sites and GitHub Pages are separate publication targets; report which is verified live and which data is a dated snapshot.

Catchment display uses `scripts/refresh_gauge_catchments.py` and `data/gauge-catchments.geojson`, with exact station joins and explicit missing IDs. Keep original `basins.geojson` for the established SWE analysis. Never infer areas from generalized outline metadata. NRCan terrain colours show elevation; NHN published stream arrows show static mapped direction at zoom 12+, not current runoff or culvert routing. Test toggles, zoom-gated requests, errors and cleanup separately from weather playback.
