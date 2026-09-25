# AgroSentra — Field notes

A complete minimal redesign of the supplied AgroSentra website: warm paper, charcoal, muted olive, clean typography, restrained motion, and responsive layouts.

## Run locally

With Node.js installed, open a terminal in this folder and run:

```
node server.cjs
```

Then visit http://127.0.0.1:4173. No package installation or build step is needed. Serve over HTTP rather than opening index.html directly, because the app uses JavaScript modules.

## Publish

Upload this folder's contents to your existing static host or GitHub Pages repository root. Keep the bundled JavaScript libraries, license files, and images. The local server.cjs file is only for previewing; it is not required by a static host. The website uses the repository's existing GitHub Pages deployment. Arduino/ESP32 firmware and Firebase configuration are unchanged.

## Included

- Overview with live sensor readings, an actual history-based moisture chart, selectable time windows, and condition summary.
- Live readings, history and CSV export, soil insights, weather, device inspection, and settings.
- Responsive hardware explorer with assemble/explode/replay controls.
- Paper, Charcoal, and Midnight themes saved in the browser.
- Local chart and icon libraries, keyboard focus states, reduced-motion support, and accessible history confirmation.
- Existing Firebase configuration, database paths, analytics, and Open-Meteo integration retained.

Firebase and Open-Meteo need an internet connection. The navigation and preferences initialize independently of the Firebase SDK. No synthetic sensor data is included. A timestamp older than 30 seconds is marked offline; its latest reading remains visible with its date. Chart windows are relative to the latest recorded sample, with the recording date shown below the overview chart.

## Verification

Checked all seven views at desktop and phone widths, with no page-level horizontal overflow. Verified real Firebase readings and history loading, chart time windows, theme persistence, missing-coordinate validation, history confirmation/cancel, and both hardware assembly views. JavaScript syntax, HTML IDs, DOM references, and local asset paths pass checks. History deletion was not executed. CSV generation checks pass for chronological ordering, all twelve fields, empty history, missing values, download requests, and delayed URL cleanup. The in-app browser did not report a completed file download.

The connected Firebase database reports a missing timestamp index for history queries. Data currently loads using client-side filtering. Database rules and stored readings were not modified.

## Libraries

Chart.js 4.4.9 and Lucide are bundled in the project root with their licenses. DM Sans loads from Google Fonts, with a system-font fallback. Supplied hardware artwork is retained.
