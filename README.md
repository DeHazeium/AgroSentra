# AgroSentra001 — Multi-View Soil Monitoring Dashboard

This build reorganizes the interface so the main dashboard is no longer overloaded.

## Views

- Dashboard — clean overview with four main readings, health status and quick links
- Live Soil Data — live graph plus all ten current readings
- History — historical chart, recent table and CSV download
- AI Analytics — Stage 1 + Stage 2 trend, anomaly and baseline analysis
- External Weather — Open-Meteo rainfall / temperature / humidity / model soil context
- Device Info — AgroSentra001 model image, hardware description and system status
- Settings — theme and monitoring-location controls

## Themes

Settings includes:

- Agro Dark
- Midnight
- Light

Theme selection is stored in browser localStorage.

## Monitoring location

Default:

The Waterfront Hotel, Kuching
Latitude 1.560
Longitude 110.345

Users can:

- use browser geolocation
- enter custom coordinates
- add a custom location label
- reset to the default Waterfront Hotel location

If Firebase live data contains `latitude` and `longitude`, the probe location takes priority.

## Firebase

Live path:

`devices/agrosentra-001/live`

History path:

`devices/agrosentra-001/history`

The dashboard loads up to 1440 recent history samples.

## History export

The History page includes **Download CSV**. It exports loaded history with:

- timestamp
- date/time
- temperature
- moisture
- pH
- EC
- N
- P
- K
- salinity
- voltage
- current

## GitHub Pages

Upload all files in this ZIP directly to your GitHub repository root.

Settings -> Pages -> Deploy from a branch -> main -> /(root)

No Firebase CLI is required.


## Readability + dashboard fit update

This build increases small UI text throughout the website and redesigns only the Dashboard view to fit inside a typical desktop viewport without requiring vertical scrolling.

Optimized for:
- 1366 × 768 laptops
- 1920 × 1080 desktops

The History, Live Soil Data, AI Analytics, External Weather, Device Info, and Settings views still use normal scrolling when their content exceeds the viewport.

The update reduces oversized dashboard spacing/graphics instead of making the text smaller.


## Startup loading animation

This version adds an AgroSentra-branded loading screen whenever the website is opened, reloaded or refreshed.

The loader includes:
- AgroSentra logo
- animated green glow
- scanning light
- orbiting particles
- animated progress line
- smooth fade into the dashboard
- safety fallback so the loading overlay cannot trap the page

The animation stays visible for about one second minimum so it is noticeable even on fast connections.


## Strict 3-second live refresh

This build keeps Firebase Realtime Database `onValue()` listening for immediate push updates and also performs an explicit Firebase read every 3000 ms.

This means:

- Firebase push changes can appear immediately
- the dashboard checks the latest `/devices/agrosentra-001/live` data every 3 seconds
- the online status and last-update indicator refresh continuously
- unchanged sensor values are still re-checked every 3 seconds

The ESP32 firmware is already configured with a `3000 ms` Firebase live upload interval, so when the device is running the website and firmware operate on the same 3-second cadence.
