# Static railway assets and calculated miles

The layers use the same scoped public railway geometry as the weather map. They are bundled static records; switching a layer on does not request an external asset inventory.

## Sources and coverage

The pinned [CANTRE public snapshot](https://orgonag.github.io/cantre-research/data/nrwn-national-c400fd8d-cantre.0.1.1/snapshot.bin.gz) is `nrwn-national-c400fd8d+cantre.0.1.1`. Its source is Natural Resources Canada's [National Railway Network](https://open.canada.ca/data/en/dataset/ac26807e-a1e8-49fa-87bf-451175a859b8), supplemented by the [Transport Canada grade crossing inventory](https://open.canada.ca/data/en/dataset/d0f54727-6c0b-4e5a-aa04-ea1463cf9f4c) for qualifying mileage anchors. Source data are mostly 2016 or earlier; the Transport Canada input is its 2023 update. Retrieval in 2026 does not establish current geometry, ownership, condition or operating status. Data retain the Open Government Licence–Canada.

The snapshot and its separate asset-details file are checksum-verified before decoding. Their exact URLs, hashes, counts and excluded calibration spans are recorded in `data/sources/railway-assets.json`; full upstream acquisition provenance remains in `data/sources/cantre-manifest.json`.

| Layer | Records | What this count means |
| --- | ---: | --- |
| Crossings | 1,256 | NRWN crossing records positioned on an included chain: 1,036 public-access, 128 private-access, 92 unknown-access records. |
| Bridges | 59 | Historical structure features, not a complete current bridge inventory. |
| Culverts | 1 | One published Sutherland feature; absence elsewhere means missing inventory, not no culverts. |
| Stations | 1 | Sutherland intermodal station; NRWN station features are not all named operating points, sidings or control points. |
| Whole-mile references | 1,090 | Calculated integer-mile positions inside accepted calibration; not physical markerpost records. |

Only assets already positioned by the upstream pipeline on the scoped historical **CPR** chains are included. A same-name subdivision elsewhere is insufficient. In particular, the CN Tisdale must not be mixed with the separate CPR-context Tisdale. Separate chain and provincial boundaries remain separate. Asset names, source IDs, TC crossing IDs, access classification and available source attributes are retained. `research/north-line/public-data-coverage.csv` gives the per-subdivision counts.

## How the mile 1, 2, 3… layer is made

The scoped snapshot has **zero markerpost-source anchors**. The mile layer therefore consists of calculated references, clearly labelled “calculated.” It does not claim surveyed post locations.

For every accepted adjacent anchor pair `(s₀, MP₀)` and `(s₁, MP₁)`, each whole mile `M` between the two anchor mileages is placed at:

```text
s = s₀ + (M − MP₀) × (s₁ − s₀) / (MP₁ − MP₀)
```

The point is interpolated along the matching chain geometry at distance `s`. Both increasing and decreasing mileage are supported. Shared endpoints are deduplicated on the same chain; the same mile on another chain remains a distinct point. No references are extrapolated beyond calibration, across gaps, or across provincial boundaries. This means some subdivisions legitimately have missing whole miles at their uncalibrated ends or internal gaps.

Every source interval must contain only `posted` or `tc` anchors and strictly monotone mileage. An interval containing an unverified anchor is withheld as a whole; removing only that anchor would bridge its unaccepted section.

Monotonicity alone is insufficient. The pinned Tisdale source includes MP113.27 followed by MP28.51 only 357.681 m away, which would otherwise generate dozens of false points. Upstream skips its slope test for spans shorter than 800 m. RWP applies the distance-consistency check to **every pair**:

```text
abs(abs(MP₁ − MP₀) × 1609.344 − (s₁ − s₀))
    <= 0.15 × (s₁ − s₀) + 0.01 × 1609.344
```

Here `s` is in metres. The 15% research tolerance follows upstream's existing long-span rule; the additional 0.01 mile allows one source posting-resolution step. This is a conservative display qualification, not surveyed accuracy. Seventeen inconsistent pairs are split and retained in the provenance audit. No inferred values cross them. The 84 existing weather points and their IDs, coordinates and mileages remain unchanged by this added check.

## Published and calculated asset mileage

`mp` is RWP's calculated mileage, recomputed using the same accepted intervals as the whole-mile layer. Upstream derived values from an unverified interval are not silently reused. A line feature may have separate start/end calculated mileages.

`postedMp` is a separate published value and is shown only for its matching published subdivision. `postedMileageTier` preserves `posted`, `tc`, or `unverified`; the latter must never be labelled a confirmed post. Sutherland station's published MP109.7 is unverified and its calculated mileage is unavailable. Its geographic feature remains visible. Coordinates or a small track residual alone do not establish accurate milepost calibration.

## Rebuilding this pinned layer

```sh
python3 scripts/build_network.py --manifest data/sources/cantre-manifest.json
```

Downloaded sources are kept in ignored `.cache/cantre/`, rechecked by checksum on each use. The pinned command preserves the existing source manifest and weather sampling. Omitting `--manifest` acquires the latest upstream manifest; inspect sample IDs and refresh weather if that changes the network. Assets do not add forecast queries.

This import exposes the public records already available. Complete operating points and culverts still require a suitably licensed, authoritative public inventory. A matching name alone, an unrelated province's markerposts, or a private employer inventory is not a substitute.
