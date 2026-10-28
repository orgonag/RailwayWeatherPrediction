# Hydrometric history and chart

The corridor expansion uses `python scripts/refresh_water_coverage.py`:57 unique stations, provider-aware ECCC/WSA observations and per-station lazy history files. The last-three-year archive view uses actual available dates. See [coverage and downloads](WATER-COVERAGE.md). Birch2025 was recovered from separate ECCC unit archives as clearly labelled RWP-derived daily means; it remains absent from the cited approved HYDAT release. See [unit archive methods](UNIT-HISTORY.md).

## Original two-station acquisition and continuity evidence

`python scripts/refresh_hydrology.py` refreshes `public/data/hydrology.json` from the public ECCC GeoMet hydrometric real-time, daily-mean and station collections. Python's standard HTTPS proxy configuration is respected. The two stations run with a concurrency limit of two; pagination, attempts and request times are bounded. A failed query records its error and does not return a partial series as complete. Zero and missing values remain distinct. All numeric records retain their original timestamps/dates and source quality symbols.

The original acquisition on **2026-10-28 02:49 UTC**, before the provincial fallback was added, retrieved:

| Station | Recent native observations | Historical archive | Level reference |
| --- | --- | --- | --- |
| 05MA011, Birch Creek near Elfros | 8,625 readings, 2026-09-28 02:50–2026-10-28 01:30 UTC, normally five-minute frequency | 1,766 daily records across 2020–2024; flow through 2024-12-31; level through 2023-12-10, with missing dates | CGVD2013, epoch 2010; relocated 2025-06-10 |
| 05KB003, Carrot River near Armley | No records returned for the preceding 30 days | 1,071 daily records across 2020–2023, through 2023-12-31, with missing dates | Assumed station datum |

The official [HYDAT SQLite release dated July 17, 2026](https://collaboration.cmc.ec.gc.ca/cmc/hydrometrics/www/Hydat_sqlite3_20260717.zip) was independently downloaded and inspected. Its `DLY_FLOWS` and `DLY_LEVELS` tables confirm those latest years; there were no 2025 records for either station. The archive ZIP SHA-256 was `b05eb121a547ca4a179a27aa47c354089fd902e93e5dc1e4a5416fc4641eb298`. The 266 MB archive and extracted database are not bundled. Relevant station datum and remarks are preserved with this explicit source version in the small snapshot.

`STN_REMARKS` explicitly states that Birch was relocated June 10, 2025, causing a step change in level. Historical and current Birch levels therefore cannot form a continuous comparison despite having the same named vertical datum. The chart suppresses comparisons across this break and splits any actual level line that crosses it. Pre-relocation archive views can compare pre-relocation years. No level offset is invented. Birch's 2024 remarks also state that all 2024 levels and significant discharge periods are unavailable.

`GaugeChart` accepts `{ gauge: GaugeHistory, now: Date }`. Pass the real observation clock independently of the weather forecast slider. Its 7-day and 30-day views cover station calendar dates through that clock; season means January 1 through that date. Saskatchewan's fixed CST (UTC−6) determines calendar alignment; source timestamps remain UTC, and historical daily dates remain unchanged. Every individual reading is retained at its native frequency. Blank spans and nulls split SVG paths rather than joining data across gaps.

`buildGaugeSeries(gauge, now, period, metric)` returns the unit, datum, window and three named lines: `actual`, `previousYear` and `priorThreeYears`. Each line provides points, separate renderable segments, and coverage. A point contains its displayed time, original `sourceTimes`, value, valid-year `sampleCount` and qualifiers. The previous-year line uses the same month/day one calendar year earlier, including across New Year. February 29 has no counterpart in a non-leap year. The prior-three-year daily mean requires all three preceding years on every displayed date; missing years never become zero or a partial mean. This short baseline is not a climatological normal.

Missing values, ice-qualified values and partial-day historical means are omitted from lines and remain available in the source records. Official estimates can be shown with their qualifier. Coverage counts and available source years disclose the remaining gaps. Level and flow use separate controls and axes: metres relative to the station reference and m³/s respectively. Daily means are not flood peaks. No gauge future is generated.

The default graph remains on the current period even when a station has no observations. **View latest archive** explicitly opens its dated historical daily readings and changes the comparison reference to that displayed archive year. It does not relabel an old record as the current observation or substitute 2023 for the missing 2025 comparison. Armley's archived graph is usable with this control. Its current discharge is now available from the separate WSA public hydrograph; the empty federal response does not establish an absence of provincial measurements.

These records retain the Open Government Licence – Canada attribution. Source URLs, response times, quality counts and archive coverage are available in the snapshot's additive `sourceMetadata`; shared application contracts remain compatible.
