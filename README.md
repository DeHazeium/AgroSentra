# AgroSentra GitHub Pages Dashboard

This package is the website-only version of AgroSentra.

## GitHub Pages deployment

Upload these files directly to the root of your GitHub repository:

- index.html
- styles.css
- app.js
- firebase-config.js
- .nojekyll
- README.md

Then go to:

Settings -> Pages

Choose:

- Source: Deploy from a branch
- Branch: main
- Folder: / (root)

Save the settings.

GitHub Pages will serve `index.html` directly from the main branch.

## Firebase

The dashboard reads live values from:

`devices/agrosentra-001/live`

The Firebase web configuration is already included in `firebase-config.js`.

## Important

This package does not require:

- Firebase Hosting
- Firebase CLI
- npm
- node_modules
- firebase.json
- .firebaserc
- public/ folder

Firebase is used only as the Realtime Database backend.


## Branding

This version includes the AgroSentra logo as `agrosentra-logo.png`.

Dashboard credit:
`Dashboard developed by Muhammad Irfan | Faculty of Electrical Engineering | Part 5`


## Latest visual update

- larger AgroSentra logo
- animated green glow behind the logo
- developer credit moved directly under the sidebar logo
- subtle logo floating animation
- staggered sensor-card entrance animation
- panel entrance animation
- animated health ring and online status glow
- shimmer interaction on sensor cards


## Stage 1 + Stage 2 Soil Analytics

This build adds browser-side intelligent soil analytics without requiring an external AI API.

### Stage 1 — Live analytics

The dashboard now calculates:

- Soil Stability Score (0–100)
- live range checks
- moisture trend
- pH trend
- NPK relative balance
- salinity risk
- historical anomaly detection
- automatically generated interpretation text
- analysis flags

### Stage 2 — Firebase history analytics

The dashboard reads:

`/devices/agrosentra-001/history`

and can analyse:

- last 10 minutes
- last 1 hour
- last 24 hours

The current firmware stores approximately one history sample per minute. The dashboard requests up to the latest 1440 samples, which represents about 24 hours of history.

The analytics engine compares the latest reading with recent historical averages and variation. An anomaly is raised when the latest value differs significantly from the recent baseline.

### Important technical note

This is a local statistical/rule-based analytics engine. It does not call an external generative AI service and therefore requires no AI API key or additional backend.

The salinity and nutrient bands are prototype indicators. Final thresholds should be calibrated against the exact soil probe documentation, measurement units, soil type, crop requirements and laboratory/reference data.


## External Environmental Context

This build adds context-aware analysis using Open-Meteo.

The browser requests:

- current air temperature
- relative humidity
- precipitation
- rain
- weather code
- modelled soil temperature near 0 cm
- modelled volumetric soil moisture at 0–1 cm
- approximately 24 hours of hourly weather context

The dashboard calculates recent 6-hour precipitation and compares it with the AgroSentra probe's moisture trend.

Examples of context-aware interpretation:

- rising probe moisture + recent modelled rain -> moisture response is consistent with rainfall
- rising probe moisture + no meaningful modelled rain -> local irrigation, ponding or another local water source may be contributing
- falling probe moisture + no recent rain -> drying pattern
- modelled rain + stable probe moisture -> limited measured response

### Monitoring location

Location priority:

1. If Firebase live data includes `latitude` and `longitude`, those values are used automatically.
2. Otherwise, a monitoring location saved in the browser is used.
3. If neither exists, use the dashboard's **Set Monitoring Location** button.

Optional Firebase fields:

```json
{
  "latitude": 1.5533,
  "longitude": 110.3592,
  "location_label": "Plot A"
}
```

The browser location is stored only in `localStorage` unless the coordinates are supplied through Firebase.

### Important

Open-Meteo modelled soil values are contextual references. They are not substitutes for the physical soil probe and should not be presented as laboratory-grade measurements.

No external AI API key is used. Context interpretation is performed locally in the browser.


## Default demo location

The website now starts with:

- The Waterfront Hotel, Kuching
- Latitude: 1.560
- Longitude: 110.345

Users can still change the monitoring location, use browser geolocation, enter custom coordinates, or reset back to the Waterfront Hotel default.

Location priority remains:

1. Firebase latitude/longitude from the probe, if present
2. Browser-saved custom location
3. Default Waterfront Hotel, Kuching location
