# Initial release verification

Release review identified three material defects, all reproduced before fixing:

- Malformed provider fields could crash readers: the refresh now validates every consumed hourly array and readers preserve missing values.
- A 24-row gapped timeline could be called a complete 24-hour forecast: consecutive hourly times and matching lengths are now required in the runtime and data validator.
- Changing sections reset scenario inputs: the analysis restores its state from the parent evidence workspace.

Regression checks: **22 application tests** and **2 Python pipeline tests**, all passing; public data validation and TypeScript/Vite production build passed. The independent reviewer found no Critical issues. One minor limitation remains: if the initial weather cache cannot load, the user must select **Refresh weather**; automatic stale-cache refresh requires an existing snapshot.

Public browser checks on the deployed site confirmed: 106 vector paths and 15 loaded basemap tiles; seven Wynyard rows and ten Hardisty rows; the independent hand example produced 15,000 m³; an added local report appeared in AI evidence; edited scenario input survived navigation; no page errors; no horizontal overflow at a 390 px viewport. Reports used for QA stayed in a temporary browser profile and were not published.

Visual inspection caught API-key watermark tiles from the initial basemap provider; the source was replaced with key-free OpenStreetMap tiles. GitHub Pages base-path compilation was also checked independently.

The public Sites deployment succeeded. GitHub initially rejected repository creation through the integration (HTTP 403); the owner subsequently created the public repository, and the complete prepared source was pushed to `orgonag/RailwayWeatherPrediction` on `main`. Remote visibility and the uploaded README were checked. Pages activation through the integration also returned HTTP 403; the owner must select **GitHub Actions** in Settings → Pages before its deployment workflow can publish. No successful GitHub Pages deployment is claimed until verified. An AI provider was not configured; no provider-generated briefing or model quality is claimed.
