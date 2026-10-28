# Map layers and basin snow

The map uses public Environment and Climate Change Canada (ECCC) MSC GeoMet grids. Open-Meteo supplies the independent track-point forecasts; these two model products may disagree. No weather surface is interpolated from track forecast samples. The Period view shows exact sums at forecast samples only.

Refresh metadata and basin estimates with Python 3.12+ and the standard library:

```sh
python scripts/refresh_map_layers.py
```

`--skip-snow` refreshes only the catalog. Downloads use the configured HTTP(S) proxy, have a 35-second request timeout and bounded response size, and use at most three simultaneous metadata requests or two basin extractions. Failures are recorded as unavailable/null with an error; earlier values are not assigned a new acquisition time. This command must be run again to update the saved static basin analysis. Browser catalog refresh updates WMS metadata only.

## Actual products

The [live WMS capabilities](https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetCapabilities) advertise these exact identifiers. Filtered capabilities accept one `layers` value per request; a comma-separated list returns a service exception. The application refreshes the seven products separately with bounded concurrency and validates the advertised product, style, valid times and model reference time. The last acquired catalog is saved in `public/data/map-layers.json`.

| Catalog key | WMS layer | Selected style | Display meaning |
| --- | --- | --- | --- |
| precipitationType | `RDPS_10km_PrecipType-Instant` | `INSTPRECIPITATIONTYPE` | Instantaneous model precipitation category |
| precipitationRate | `RDPS_10km_PrecipRate` | `PRECIPPRTMMH` | Instantaneous water-equivalent intensity, mm/h; the style converts the native kg/(m² s) field |
| precipitationAccumulation | `RDPS_10km_Precip-Accum` | `PRECIPMM` | Total water equivalent since the selected model run, mm; **not** the next 24 hours |
| temperature | `RDPS_10km_AirTemp_2m` | `TEMPERATURE-LINEAR` | Air temperature 2 m above ground, °C |
| wind | `RDPS_10km_WindGust_10m` | `GUST_MS2KMH` | Gust estimate 10 m above ground, km/h; the style converts native m/s |
| snowpack | `CaLDAS-NSRPS_2.5km_SnowWaterEquiv` | `SNOWMASS` | Latest available land-surface SWE analysis, mm |
| radar | `RADAR_1KM_RRAI` | `RADARURPPRECIPR14-LINEAR` | Recent radar rain-rate observations, mm/h; no future radar frames |

The RDPS is a roughly 10 km deterministic North American product with an 84-hour forecast and four model runs per day. The October 28, 2026 acquisition advertises run **2026-10-27 18:00 UTC**, hourly frames through **2026-10-31 06:00 UTC**. Precipitation rate/accumulation begin at run +1 h; type, temperature and gusts include the run hour. Actual `time` dimensions are retained, so a future catalog with a shorter horizon or gaps will expose those gaps. HRDPS stops at 48 hours and is not used for the 72-hour weather map. A fresh run is not guaranteed to cover every requested time indefinitely.

The selected clock hour must equal an advertised frame exactly. `availableLayerTime` does not round, snap, extrapolate, repeat the last frame or fill gaps. WMS requests must specify both `TIME` and `DIM_REFERENCE_TIME` from the product, so an old catalog cannot silently display a newer run. If that reference run expires at the provider, image loading can fail and the application must show that failure. Legend URLs are copied from the selected advertised style. The browser capabilities endpoint returned `Access-Control-Allow-Origin: *` in the acquisition checks.

Snowpack is a dated analysis; it does not follow the forecast clock as a predicted basin snowpack. Radar has its own six-minute recent-observation timeline. Neither represents a 72-hour forecast.

## Basin SWE acquisition

CaLDAS-NSRPS provides a 2.5 km land-surface analysis that assimilates observations. The source catalog advertises three-hour analyses. The acquired analysis is **2026-10-27 18:00 UTC**. It is a model estimate, not a direct basin snow survey. Only the two established public June 2024 gross gauge basin polygons are used.

Raw values are acquired through [GeoMet WCS](https://geo.weather.gc.ca/geomet?service=WCS&version=2.0.1&request=DescribeCoverage&coverageid=CaLDAS-NSRPS_2.5km_SnowWaterEquiv), using `GetCoverage`, `format=image/tiff`, explicit `time` and `dim_reference_time`, latitude/longitude bounding subsets and `interpolation=nearest`. The response attachment name must confirm the requested analysis time. Each saved basin's `sourceUrl` is the complete reproducible SWE request. Optional depth uses a separate request for `CaLDAS-NSRPS_2.5km_SnowDepth` at the same analysis time; metres are converted to centimetres. No depth-to-SWE conversion is performed.

The WCS output is an uncompressed, single-band, float32 EPSG:4326 GeoTIFF. Its geographic extraction is a resampled output grid, not a claim that each output pixel is an independent native model cell. The reader checks the actual encoding, georeference and strips and rejects unsupported TIFF formats. A WMS `GetFeatureInfo` query can return no result for transparent zero-valued snow classes; this is why empty feature queries are **not** interpreted as zero. WCS contains the actual numeric zeros. Nonfinite, negative, explicit nodata and provider missing sentinel values of magnitude ≥1e20 are excluded from the valid samples.

Output pixel centers are clipped to the original polygon, including holes. Values are averaged with cos(latitude) area weights. This approximates the basin average at the output-grid resolution; edge cells are assigned by center, rather than by exact polygon-area intersection. `coverageFraction` is the fraction of the **weighted included sample area** with valid values, not a measurement-coverage claim or a geometric boundary-accuracy score. `sampleCount` counts valid SWE output pixels. The method string retains output dimensions, spacing, sample counts and these limitations.

| Gross basin | Valid SWE samples | Valid sampled coverage | SWE mean | Independent depth mean |
| --- | ---: | ---: | ---: | ---: |
| Carrot River near Armley, 05KB003 | 434 of 434 | 100% | 0.001146 mm | 0.001219 cm |
| Birch Creek near Elfros, 05MA011 | 100 of 100 | 100% | 0 mm | 0 cm |

The tiny nonzero Armley result is an area average of mostly zero pixels, not precision of a measured snow survey. Normal display rounding can show 0.0 mm. These numbers are specific to the saved analysis time; they do not establish present ground conditions at a crossing. Seasonal means remain `null`: no historical CaLDAS normal was acquired or invented. Gross gauge basins are screening proxies and do not prove drainage connectivity to railway assets.

## Verification and licence

Acquisition returned all seven advertised product/style pairs and both basin estimates with no provider errors. Actual `GetMap` requests pinned to the saved run at **2026-10-31 02:00 UTC** returned PNG images for all five forecast modes. Clear/zero-precipitation images may legitimately be transparent. Unit tests cover interval expansion, exact-time gaps and horizon rejection, missing reference metadata, service exceptions, numeric zero versus nodata, polygon holes and weighted missing coverage. The full application validation remains part of release verification.

References: [MSC GeoMet open-data guide](https://eccc-msc.github.io/open-data/msc-geomet/readme_en/), the linked live WMS/WCS metadata, and the request URLs saved with the snapshots. Contains information licensed under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada). ECCC source data retains its own attribution and licence.

## Period amounts and buffered playback

The UI replaces the ambiguous Total control with **Period**. The user chooses start/end timestamps in CST. Each point amount sums the complete source hourly precipitation intervals ending after the start and at or before the end. A missing/negative/nonconsecutive interval makes the period unavailable. The default window is 24 hours. The selection panel separates liquid rain (rain plus showers), snowfall depth (cm) and total water equivalent (mm). These point amounts are not the ECCC run-accumulation raster, which remains documented in the source catalog above but is not displayed as a chosen-period surface.

**Rate** is the instantaneous ECCC model mm/h field. The separate forecast table shows Open-Meteo amounts in the preceding hour (mm); no generated forecast dots are drawn on the map. Forecast sample positions are about 32 km apart on independent rail chains, with endpoints, not observed weather station locations.

The map holds one completed weather image while one exact requested frame loads, and labels the previous image time during the wait. Playback advances only after completion; errors or a 25-second timeout pause it. Opacity updates do not recreate the layer. WMS tile bounds follow the selected railway extent with approximately 75 km latitude margin and a conservative longitude margin; Alberta track is retained. Grid offscreen buffering is zero and max native tile zoom is 8. This is sequential interactive retrieval, not a bulk or speculative WMS download.

Radar has its own advertised observation-frame slider, separate from future forecast hours. The view limits radar to the recent two hours so the oldest three-hour provider frames are not selected just as they expire. No radar value is projected into future time. A failed frame can be retried with Play; no failed or missing image is silently called a completed frame.

Zero basin SWE has transparent fill. Nonzero fills are latest dated CaLDAS analysis only, independent of the forecast clock. Regional basin outlines do not acquire SWE values merely by being toggled on.

## Observed thermometers, gauge catchments and terrain

The map defaults to actual station temperature readings at their source coordinates, with observation time and source on selection. It has no generated model-temperature dots, no forecast-temperature raster and no synthetic point selected by a railway click. The observation view has no future timeline. The separately labelled Along the line forecast table remains available; Period's **View period amounts** opens the exact selected-range sum in its final column.

`data/gauge-catchments.geojson` subsets the [WSC simplified map polygons](https://wateroffice.ec.gc.ca/data/map/geojson/basin_05_simplified.json) by exact station ID. It covers 55 of the 57 existing gauges. Missing source matches are 05HG022 and 05HG023; no geometry is inferred. Original polygon holes and coordinates are retained. Source bytes and SHA256 are recorded. The additional 53 features supply no area value, so areas remain null. Original `data/basins.geojson` remains unchanged for the two full-resolution numerical SWE calculations; generalized display polygons never replace it.

A **gauge catchment** describes the mapped gross upstream drainage area to a specific gauge. A **regional drainage division** is a broader grouping of river systems. Gauge catchments can nest and overlap. Neither layer establishes flow connectivity to a railway crossing. The [WSC methods](https://collaboration.cmc.ec.gc.ca/cmc/hydrometrics/www/HydrometricNetworkBasinPolygons/Read_me.pdf) explain gross drainage areas, Prairie noncontributing holes and differences from published station areas.

Terrain elevation uses [NRCan elevation WMS](https://maps.geogratis.gc.ca/wms/elevation_en?service=WMS&request=GetCapabilities), `cdem.color-shaded-relief`, with the provider's colour scale. Colours indicate elevation; shading indicates relief. The mapped stream layer uses [NRCan National Hydro Network WMS](https://maps.geogratis.gc.ca/wms/hydro_network_en?service=WMS&request=GetCapabilities), layers `nhn:nhn:network:networklinearflow_1` and `nhn:nhn:network:flowdirection_1`. They render below 1:175,000; the app requests them from zoom 12 and provides a zoom-in hint. Both use WMS 1.1.1, provider styles, only visible tiles, and zero offscreen buffer. Missing imagery is reported.

NHN is a static product no longer maintained since 2022. Its arrows show mapped network direction, not present discharge, overland runoff, pond spill, ditch routing or verified culvert connectivity. No arrows are generated from a colour gradient. Contains information licensed under the Open Government Licence–Canada.
