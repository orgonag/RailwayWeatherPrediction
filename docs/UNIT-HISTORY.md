# Recovering the missing 2025 unit-value history

The official ECCC [unit-value archive](https://collaboration.cmc.ec.gc.ca/cmc/hydrometrics/www/UnitValueData/) supplies a separate source from HYDAT daily means. Its corrected Birch Creek files contain 2025 observations that are absent from the July 17, 2026 HYDAT release. This recovers actual source records, with their limitations, rather than filling a gap with invented measurements.

Run the bounded recovery explicitly:

```sh
python3 scripts/recover_unit_history.py --station 05MA011 --station 05KB003 --year 2025
python3 -m unittest discover -s scripts/tests -v
```

The script only downloads official ECCC corrected files for the requested stations and a complete past year. It saves the selected native records and a small daily summary in `public/data/unit-history/`. It does not modify `hydrology.json` or per-station chart history. Those consumers may add available derived values where an official daily value is missing, while preserving the source distinction; they must never replace an official HYDAT daily value with the derived result.

## Acquired data

The acquisition on October 28, 2026 UTC found:

| Station | Corrected discharge | Corrected level | Usable derived days in 2025 |
| --- | --- | --- | --- |
| Birch Creek near Elfros, 05MA011 | 117,737 native observations; all grade 20, estimated; mixed Approved, Reviewed and Preliminary status | 71,137 native observations; Reviewed status; 12,317 grade −2, unusable | 287 flow days; 193 level days, all on or after June 11 |
| Carrot River near Armley, 05KB003 | Not listed in the inspected corrected watershed 05 archive | Not listed in the inspected corrected watershed 05 archive | None recovered from this source |

Counts cover the CST calendar year plus the following midnight endpoint required for integration. They differ from counts obtained by selecting UTC timestamps beginning with `2025`.

The inspected raw watershed 05 indexes also did not list Armley; absence from this archive does not establish absence from every provincial source or from the provider's live records. The saved Armley result has `status: "not-listed"`, an empty daily array, and hashes, URLs and acquisition times for the inspected corrected indexes. It is not a zero-flow series.

Birch discharge was generated on **2026-05-04 at 03:38:58 UTC**, and stage at **03:16:37 UTC**. Their HTTP modification times are May 11. The [provider's disclaimer](https://collaboration.cmc.ec.gc.ca/cmc/hydrometrics/www/UnitValueData/UnitValueData_Disclaimer.pdf) makes the header generation date the data vintage and describes the collaboration archive as static and provisional. Downloading it today does not make these current observations. A source row marked Approved does not turn this separate export or the application-derived daily result into an official HYDAT daily record.

Full source archive SHA-256 values:

- [Discharge corrected](https://collaboration.cmc.ec.gc.ca/cmc/hydrometrics/www/UnitValueData/Discharge/corrected/05/Discharge.Working@05MA011.20110101_corrected.csv.xz): `5d29d80ea7ae34eb21fd3d004325f8b9078a6632590262dc40dad0ca94fa650a`.
- [Stage corrected](https://collaboration.cmc.ec.gc.ca/cmc/hydrometrics/www/UnitValueData/Stage/corrected/05/Stage.Working@05MA011.20110101_corrected.csv.xz): `b1e7ac2e970a607e23bb1976de794f2c184ca8231e7ad6659b8a2894ef9b38b2`.

The two original multiyear downloads total about 10.1 MB and are not bundled. The retained native 2025 subset totals about 829 KB compressed; the Birch daily JSON is about 219 KB. The application should load only the selected station's chart data; native CSV archives are separate downloads, not initial map payloads.

## Calculation and quality rules

The source contains instantaneous values at irregular three- and five-minute spacing. RWP computes a time-weighted trapezoidal integral, divided by 86,400 seconds, for a complete station-calendar day in UTC−6. This is labelled **RWP-derived daily mean from ECCC unit archive**, not an official daily mean. It is not a peak reading.

Each metric requires both midnight boundary observations, no interval longer than five minutes, finite values, no source qualifiers requiring interpretation, and no rejected source grades. Days failing a condition remain present with a null value and explicit reasons. Additional three-minute observations are time-weighted rather than over-weighted by a simple sample average. This strict method intentionally leaves otherwise partly observed days unavailable.

The official grade definitions are preserved: −2 unusable, −1 unspecified, 0 undefined, 10 ice, 20 estimated, 30 partial day, 40 dry, and 50 revised. Grades −2, 0, 10 and 30 are rejected from the derived means; estimated flow retains its label. Native excluded values remain in the downloadable subset for inspection. Approval statuses are separate from grades, and neither is silently converted to the other.

Birch relocated on June 10, 2025. The entire relocation day is excluded for level calculations, and `levelContinuityBreaks: ["2025-06-10"]` accompanies the recovered data. Consumers must also keep the existing station continuity rules: daily completeness is not evidence that levels before and after the move share a comparable reference. No level offset is calculated. The first usable recovered level day is June 11 because earlier values/gaps fail the source-quality or coverage conditions.

## Contract and reproducibility

`05MA011-2025.json` supplies ordinary `date`, `levelM` and `dischargeM3s` keys plus:

- `sourceType: "derived-unit-values"` and `sourceProvider: "ECCC unit archive"` on every daily row.
- `levelQualifier` / `dischargeQualifier` describing the calculation, static provisional source, source approval statuses, and non-unspecified grades.
- `levelProvenance` / `dischargeProvenance` holding `sampleCount`, `maxIntervalSeconds`, `approvalLevels`, `grades`, `qualifiers` and `excludedReasons`.
- Top-level source URLs, source generation/acquisition/HTTP times, compressed source hashes, native-subset file hashes, units, original export headers, grade counts and approval counts.

The native `.csv.xz` subsets preserve source value strings, native timestamps, approval, grade and qualifiers. Their original export header is retained; JSON metadata states the narrower subset interval, inclusive final boundary, and observation count. Retained boundary observations do not add an extra daily interval.

The parser rejects station, units, clock or corrected-signal mismatches; inconsistent UTC/CST clocks; duplicate or decreasing timestamps; unknown grades/statuses; non-finite values; and malformed rows within the selected subset. Older unselected source rows sometimes contain unquoted extra qualifier columns. They are not relevant to this bounded recovery and do not cause a valid 2025 subset to fail. The selected subset remains strictly validated.

Contains information licensed under the Open Government Licence – Canada. The source's provisional-data disclaimer remains applicable.
