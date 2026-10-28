# Weather, threshold and water-scenario methods

## Selected time and forecast coverage

The map uses a UTC-hour clock from the current hour through +72h. Display times are labelled CST (America/Regina), including Alberta locations for a common corridor clock. Every selected point forecast follows that same time. Forecast acquisition uses five calendar days so a following24h window is still available at the far horizon.

Open-Meteo hourly rain, showers, snowfall and total precipitation are interval sums ending at their labelled time. A future window from t to t+24h uses labels t+1 through t+24. Temperature and modelled snow depth are instantaneous. Gusts are the maximum for the preceding hour. Liquid rainfall = rain + showers; missing inputs remain unknown. New snowfall is not assumed to melt immediately.

Current source freshness is evaluated against the actual clock, not a selected future forecast hour. Data older than6h or with invalid/future acquisition times are not used to declare threshold crossings. This6h gate is a research freshness setting, not a forecast-skill guarantee.

## Map weather and basin snow

ECCC hourly RDPS products provide the weather image layer. Validity time and model reference time are pinned; unsupported hours remain unavailable. Precipitation totals shown on this map are since the displayed run. Radar uses its own actual observation time and is never projected into the72h forecast.

CaLDAS basin SWE is a dated analysis, independently refreshed through bounded WCS requests. Raw numeric values are sampled at pixel centres inside the actual gross basin polygon, including holes, with latitude-area weighting. Coverage and source details are preserved. Zero is a valid snow-free value; NoData is not zero. The analysis is not presented as future snowpack when the weather slider moves. See [layer methods](MAP-LAYER-DATA.md).

## Configured threshold alerts

No rule is active until a user sets it. Rules are saved in that browser and are not official railway thresholds. Each enabled rule tests its own complete input window:

- Liquid rain over6h or24h, in mm.
- New snowfall over24h, in cm.
- Wind gusts for the hour ending at the selected time, in km/h.
- Instantaneous high/low air temperature, in°C.

Rain/snow alerts display their forward accumulation window; gust alerts identify the hour ending at the displayed instant; temperature alerts identify the instant. Values meeting the configured limit trigger the rule. Missing/stale checks remain unavailable, while valid triggered findings survive partial data.

The Next72h view evaluates every forecast hour, displaying the earliest matching hour for each location/rule; selecting it moves the map clock to that hour. Alert markers at the current selection time do not silently represent all future alerts.

No basin snow-normal, gauge high-water or gauge rate threshold is inferred without its supporting baseline/site settings. Gross-basin membership and gauge proximity alone never establish a crossing's hydraulic connection. Seasonal baselines and trained probability models remain future work.

## Gauge graph

Current curves use actual time-stamped observations at native frequency. Previous-year lines use calendar-aligned daily means; prior-three-year means require all three compatible years for that day. Missing, ice-affected and partial-day values remain gaps, not zero. Station-level datum and documented relocation exclusions are preserved. The graph can explicitly switch to an available archive period without labelling old data current. See [gauge history](GAUGE-HISTORY.md).

## Optional water-volume scenario

The secondary tools retain an editable24h scenario. For area A(km²), liquid rain P(mm), available SWE S(mm), positive degree-days D(°C-days), melt factor F(mm SWE/°C-day) and runoff coefficient C(0–1):

~~~text
Melt M = min(S,F×D)               mm SWE
Water input W = P+M              mm
Runoff depth R = C×W             mm
Runoff volume V = R×A×1000       m³
24h mean flow = V/86400          m³/s
~~~

This omits soil/frost physics, storage, routing, backwater, ice/debris blockage and actual crossing capacity. Mean flow is not peak discharge. Point weather is not catchment-average meteorology; snow depth is not measured SWE. Scenario parameters remain explicit assumptions.

## Historical validation

Future validation must replay only records actually available at the time, include ordinary/quiet periods, and compare weather/gauges alone with added original social evidence. Event, publication, acquisition and model-issue times remain separate. Neither researched recollection currently proves original pre-impact social lead time.
