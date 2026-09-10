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
