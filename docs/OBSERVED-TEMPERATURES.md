# Actual station temperatures and daily history

The observed-temperature layer places each reading at its **actual station coordinate** with its original observation time. It does not interpolate between stations, extrapolate to the railway, or replace observations with a town-labelled forecast.

## Current observations

The initial snapshot contains **35 stations within 75 km of the scoped rail geometry**. Distance is measured to the independent rail segments, so provincial boundaries and disconnected chains are not joined to make a false corridor. Stations just outside a province can qualify when they are genuinely near the railway; this is a distance filter, not a province-wide download.

The source is [ECCC Surface Weather Observations (SWOB)](https://eccc-msc.github.io/open-data/msc-data/obs_station/readme_obs_insitu_en/), using the public [station catalogue](https://api.weather.gc.ca/collections/swob-stations?f=html) and [real-time collection](https://api.weather.gc.ca/collections/swob-realtime?f=html). The importer requests the latest record for each selected MSC station ID. It preserves the actual source station name, coordinates, observation identifier, provider, Celsius value, timestamp and quality labels. Different station IDs at the same airport are not merged merely because their names resemble each other.

For example, the official catalogue identifies:

| Station | MSC ID | Latitude | Longitude |
| --- | --- | ---: | ---: |
| Watrous East | 4018642 | 51.667115 | -105.398394 |
| Wynyard (AUT) | 40190LN | 51.765816 | -104.192420 |

The inspected corridor catalogue has no Lanigan station. The [official Lanigan weather page](https://weather.gc.ca/en/location/index.html?coords=51.850%2C-105.033) identifies Watrous as an observation location; the town heading does not move that reading to Lanigan. ECCC explains that [current conditions belong to the selected observing site](https://www.canada.ca/en/environment-climate-change/services/weather-general-tools-resources/how-we-use-observation-site/understanding-current-conditions-on-website.html). The map therefore shows Watrous at Watrous and leaves the local coverage gap visible.

`public/data/temperature-observations.json` is a small initial snapshot. Selecting a station makes one bounded public SWOB request for its latest actual observation; failure retains the dated snapshot. The other map stations retain their snapshot times until selected or the snapshot is republished. Its `fetchedAt` is acquisition time; each station's `observedAt` is measurement time. An old measurement stays dated. Failed station refreshes retain a previous dated record with an explicit failure note. A station without a usable observation remains missing, never zero. Selecting a future forecast hour does not make an observed temperature a future value.

### Quality handling

The [SWOB guide v8.17, pages 36–38](https://dd.weather.gc.ca/today/observations/doc/SWOB-ML_Product_User_Guide_v8.17_e.pdf) defines the source quality assessment codes. RWP preserves these codes and labels. QA100 means the provider's applicable checks passed; it is not railway validation. If no QA code is supplied, the app makes no pass claim.

Explicit suppressed, missing, error, doubtful, suspect, inconsistent or unrecognised QA codes are withheld from the numeric temperature. Source data flags marked estimated, incomplete or unrecognised are also withheld. Suppressed numeric readings are not republished. Only the `air_temp` field with the source's Celsius unit is used; missing instantaneous temperature is not silently replaced by an hourly mean. Source sensor-derived/adjusted values retain their labels and are not spatial estimates to another location.

## Three years of downloadable daily history

The initial recovery downloaded annual official CSV exports for **2023–2026**, clipped to **October 27, 2023 through October 26, 2026**: three years ending before the current corridor calendar day when acquired. There are **35 separate station files and 38,360 published date rows**. Not every row has a usable temperature: **35,469 daily means** are present, with missing/flagged values left null. The initial Watrous East and Wynyard files both cover the requested date span.

**33 stations have usable daily history.** The Lloydminster A (3013958) and Moose Jaw A (4015320) exports contain only missing temperatures in this window, so their available start/end dates remain null. They are not silently combined with another nearby station. Kindersley A (4043899) starts on October 28, 2023; the missing initial day stays unavailable. Even stations reaching both window endpoints can have missing values inside the period.

Files live under `public/data/temperature-history/<MSC_ID>.json` and are intended for loading only when that station's historical view is opened. Together they are about **7.1 MB uncompressed / 0.45 MB gzip**; a single file is roughly 0.2 MB before compression. The small current snapshot contains only each history file's path and available date bounds.

Source: [ECCC Historical Climate Data](https://climate.weather.gc.ca/), through its annual **daily CSV download**. The [official FAQ](https://climate.weather.gc.ca/FAQ_e.html) describes CSV download and explains that blank values are unavailable. Source URLs, content hashes, download times, climate ID, original archive coordinates, source flags and station timezone are retained. Completed years can be reused from the saved archive; refreshes need only the current year's export unless a forced recovery is requested. The importer does not build a large archive through GeoMet point queries.

These records contain the provider's published **daily mean, minimum and maximum**. They are observations/statistics for the source station's labelled daily period. They do not reconstruct an exact hour or minute, and a daily mean must not be presented as the temperature at noon. Source daily periods are preserved rather than assumed to have a universal midnight boundary. Rows carrying temperature flags, including estimates, remain flagged and are withheld numerically. No missing dates are filled, no values are copied from the nearest date, and no station is moved onto a town or railway sample.

The climate catalogue's hourly start/end dates are included as **availability metadata only**. Hourly records have not been downloaded into this feature. For Watrous, the inspected catalogue reported hourly coverage from 1994 through October 2026; that establishes a source to investigate for an exact-hour viewer, not a completed exact-hour archive.

## Community stations

No community/personal-station feed has been integrated in this release. The official stations above must not be advertised as crowdsourced coverage.

The [Weather Underground contributor API](https://www.wunderground.com/pws-api) and its [official download instructions](https://support.weather.com/s/article/How-to-Get-a-Copy-of-Your-Personal-Weather-Station-PWS-Data) use account API keys. [WeatherLink's official API](https://weatherlink.github.io/v2-api/) requires station access through ownership, sharing or qualifying paid access, plus API credentials. A visible town forecast or website marker does not establish a reusable public station feed. No credential-free, identity-verified Lanigan community source with confirmed reuse terms was found in this bounded review. An authorized station feed can be added later without changing the rule that readings remain at their true locations and times.

## Refresh and attribution

```sh
python3 scripts/refresh_temperature_observations.py
python3 scripts/refresh_temperature_observations.py --history
```

The first command refreshes current observations. The second also updates the bounded daily archives; `--force-history` reacquires completed annual exports when source revisions need incorporation. Sources are fetched with low concurrency, explicit response limits and a descriptive user agent. No forecast provider, user credential or private station inventory is used.

Data source: Environment and Climate Change Canada and the named station data providers. Contains information licenced under the [Data Server End-use Licence of Environment and Climate Change Canada](https://eccc-msc.github.io/open-data/licence/readme_en/). Daily data were extracted from the Environment and Climate Change Canada Historical Climate Data website; each file's `fetchedAt` and `sources[].retrievedAt` record the extraction dates. Follow the [MSC usage policy](https://eccc-msc.github.io/open-data/usage-policy/readme_en/).
