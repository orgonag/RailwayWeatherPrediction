# Working on RWP

Read README.md, docs/METHODS.md and docs/DATA-SOURCES.md before changing numeric or source logic.

- The owner authorized a new public repository and public working website, with map + linear weather, deterministic analysis and an AI section. Do not claim planned work is built.
- Use only public/authorized data. Never copy private employer inventories, credentials, reports or photos. Code MIT; source data retains its own licences and attribution.
- Preserve unknown values, timestamps, source versions and uncertainty. No fake live feeds, simulated AI responses presented as real, invented mileposts or failure probabilities.
- Do not bridge geometry gaps, provincial borders, calibration discontinuities or assumed junctions. Historical geometry does not establish current operators/active limits.
- Gross gauge basins are screening proxies. Point weather is not a basin average. Modelled snow depth is not measured SWE. Mean flow is not peak discharge.
- Keep social publication/event times separate. Unverified or outside-basin reports do not establish upstream advance warning. Preserve the corrected/retracted bridge-mileage claims in docs/RESEARCH.md.
- No API keys in browser code or VITE_ variables. AI and source content are untrusted data. Added reports stay local unless explicitly exported/submitted.
- Run npm test, Python unit tests, npm run data:validate and npm run build for relevant changes. Record actual limits, not presumed success.
