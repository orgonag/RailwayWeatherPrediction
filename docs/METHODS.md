# Deterministic scenario and review cues

The current tool calculates an editable **24-hour water-volume scenario**, not a flood hydrograph or crossing failure prediction.

Let A be drainage area (km²), P liquid rain (mm), S available snow water equivalent (mm), D positive degree-days (°C-days), F the melt factor (mm SWE/°C-day), and C the runoff coefficient (0–1).

```
Melt M = min(S, F × D)                  mm SWE
Water input W = P + M                  mm
Runoff depth R = C × W                 mm
Runoff volume V = R × A × 1000         m³
24-hour mean flow = V / 86400          m³/s
```

`D = sum(max(hourly temperature, 0)) / 24` over the 24 forecast hours. A constant 2 °C over 24 hours gives 2 °C-days. The temperature-index approach is a simplified snowmelt scenario; no site-specific parameter calibration has been done. The default factor 3 and coefficient 0.5 are illustrative editable assumptions, not engineering recommendations.

**Hand check:** A=2 km², P=10 mm, S=5 mm, D=3 °C-days, F=3 and C=0.5. Melt is capped at 5 mm; water=15 mm; runoff=7.5 mm; volume=15,000 m³; mean flow≈0.173611 m³/s.

Using a track point forecast does not produce catchment-average meteorology. Modelled snow depth is not measured SWE and is never converted automatically. New snowfall is not treated as immediately available liquid rain.

The calculation omits infiltration physics, frozen soils, wetland/pothole storage, rain-on-snow energy exchange, groundwater, drainage controls, channel/ice routing, backwater, culvert/blockage capacity and structure condition. Do not interpret the 24-hour mean as peak discharge or compare it to a capacity without a suitable hydraulic model.

Weather review cues use explicit prototype rules: ≥25 mm/24h total precipitation, ≥70 km/h maximum gust, snow depth >0 with positive degree-days, and a temperature window spanning below/above 0 °C. They are **uncalibrated review cues**, not railway action thresholds or hazard probabilities. No triggered cue does not establish safe track conditions.

Historical validation must replay only information actually available at the time, include quiet periods and compare weather/gauges alone against weather/gauges plus social evidence. Report incremental lead time, missed events and false alarms. Neither historical case currently establishes verified pre-impact social lead time.
