# UI and public-data audit — October 27, 2026 CST

The data/map work precedes further deterministic-alert development. This records implementation and local verification; publication status is reported separately with the release.

| Reported issue | Action implemented | Remaining limitation |
| --- | --- | --- |
| Weather Play outruns imagery | Load-aware sequential playback; keep one completed image while one requested image loads; timestamp previous image; pause on tile errors/timeout; retry with Play | Provider outages still produce unavailable frames; no synthetic replacement |
| Too much geography buffered | WMS constrained to rail extent plus weather margin, zero offscreen buffer, bounded tile zoom; station history and regional basins loaded only when needed | Border tiles can include nearby areas; upstream basin geometry intentionally remains complete |
| Missing mile 1, 2, 3… | Independent calculated whole-mile layer, search, keyboard selection and source details; 1,090 references | Not an inventory of physical surveyed mileposts; uncalibrated/inconsistent spans excluded |
| Missing assets | 1,256 crossings, 59 bridges, 1 culvert and 1 station, independent controls and provenance | Public culvert/station coverage is sparse; current condition and completeness unverified |
| Why weather dots are there | UI explains roughly 32 km spacing plus endpoints on independent track chains; labels identify point forecasts | Model forecasts do not represent thermometers beside the track |
| Real local temperatures | 35 observed stations within 75 km, actual station coordinates/time/QC; selected station refreshes from public ECCC SWOB | No verified reusable Lanigan community-station feed; Watrous stays at Watrous |
| More basin outlines | Seven regional features alongside the original two gross gauge basins, separate selection and sources | Regional polygons overlap at different scales; no automatic crossing catchments or extra SWE estimates |
| Missing federal/provincial gauges | 57 unique stations: 34 ECCC and 23 WSA, provider labels, exact reading times, lazy history | 48 have dated native observations, not necessarily fresh; nine have no native observations |
| Missing history | 56 gauges with daily values; recovered Birch 2025 unit-derived daily records and source CSV subsets | Historical gaps remain; derived means are distinct from HYDAT, and datum/relocation breaks are retained |
| Ambiguous Total | Replaced with Period: start/end in CST, default 24 hours, complete hourly sums at forecast dots; missing intervals unavailable | Period point sums are not a gridded basin mean or a past radar reconstruction |
| Intensity meaning | Renamed Rate; described as instantaneous ECCC mm/h. Point/linear labels corrected to preceding-hour mm | Different model products and time supports can disagree |
| Snowpack meaning | Stored water equivalent (mm SWE), dated CaLDAS analysis; zero fill transparent | Two gauge basins only; no historical seasonal SWE baseline |
| Three years publicly accessible | Daily temperature archives for 35 station IDs (33 with usable values), date picker and downloads; gauge archive date selector and downloads | Temperature history is daily, not exact-hour; no complete three-year radar/snowpack/issued-forecast map |
| Along the line | Forecast table works; corrected precipitation unit and next-24-hour water header | Calculated/uncalibrated positions retain their qualification |
| Water scenario | Existing manual 24-hour assumptions/calculations retained; reference-gauge selector avoids rendering 57 cards | Uncalibrated scenario, no routing or automatic operational alert |
| Field reports | Form distinguishes source URL, observation time and publication time; local-browser storage/export | No automatic community/social collection |
| AI briefing | Evidence copy/export present; disabled generation correctly reports no provider connected | AI provider/server configuration is not supplied |

Browser verification exercised Period start/end, a 12-hour sum, radar buffering and advancement, independent layers, Mile 1 details, Armley provincial flow, gauge archive controls, Watrous June 15, 2024 daily statistics, Along the line, manual scenario, report form, AI connection state and source navigation. Automated tests cover slow imagery, exact frame times, timeout/error handling, opacity without re-fetch, asset selection, period amounts, provider parsers, datum/quality exclusions and source-data validation.

Sites and GitHub Pages are distinct publication targets. The existing scheduled Pages workflow refreshes its generated public dataset. A Sites build contains dated static archives; selected ECCC gauge/temperature records and map metadata can refresh in the browser. WSA static observations retain their original timestamp until republished. Old readings are not relabelled as current.
