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


## Premium theme-aware loader + new device image

This build updates the AgroSentra001 device image and replaces the previous animated loading screen with a cleaner premium loader.

Changes:
- new AgroSentra001 device render
- much larger AgroSentra logo on loading
- minimal thin loading indicator
- subtle premium glow only
- no orbit rings, scanning streaks, or busy background effects
- loading screen automatically follows the theme previously saved by the user
- supports Agro Dark, Midnight, and Light themes before the main dashboard finishes loading


## Animated exploded assembly
Clicking the device image in Device Info opens `exploded-view.html`. The five white-outline internal modules start collapsed at the center, then automatically separate vertically into an exploded engineering view. Users can Assemble, Explode, or Replay the animation.


## Responsive exploded assembly v4

The exploded assembly animation is now orientation-aware:

- Desktop and tablet landscape: components separate horizontally from left to right.
- Phones and narrow portrait screens: components separate vertically from top to bottom.
- Assemble, Explode, and Replay controls are preserved.
- The layout switches automatically at 700 px viewport width.
- The desktop scene is compressed to fit common laptop screens more comfortably.


## Firebase usage optimization — 10 second live update

This build reduces Firebase traffic.

### Device
The ESP32 live upload interval is now:

`10000 ms` = one live upload every 10 seconds.

History remains at:

`60000 ms` = one history sample every 60 seconds.

### Website
The website no longer performs an extra Firebase `get()` request every few seconds.

It now uses Firebase Realtime Database `onValue()` only. This means the browser receives a live update when the ESP32 writes new data, instead of repeatedly downloading the same value when nothing has changed.

This is more efficient than polling Firebase every 10 seconds.

The included firmware is:

`firmware/AgroSentra_Firebase_10s.ino`

The corrected pH scaling is also preserved as `rawPH / 100.0`.


## Latest user firmware integrated

This package now uses the user's latest firmware as the source.

Only one firmware setting was changed:

- `FIREBASE_UPLOAD_INTERVAL`: 3000 ms → 10000 ms

The user's existing pH calibration is preserved exactly:
- pH 4.00 calibration raw = 600
- pH 7.00 calibration raw = 697
- two-point interpolation remains unchanged

History remains every 60000 ms (60 seconds).

Firmware:
`firmware/AgroSentra_Firebase_10s_Latest.ino`


## Clear History button

History now includes a **Clear History** button beside **Download CSV**.

The button:
- opens a confirmation modal
- deletes only `/devices/agrosentra-001/history`
- leaves `/devices/agrosentra-001/live` untouched
- refreshes the History and Analytics views after deletion
- reports a Firebase permission error if write access is blocked

Firebase Realtime Database write permission is required for the history path.


## Integrated Device Info exploded assembly

The separate exploded-view page has been removed.

The animation now lives directly inside **Device Info**:

- Default state shows the complete black AgroSentra001 device.
- **Explode** first fades/scales the complete unit out.
- The internal white-outline components then reveal with staggered animation.
- Desktop/tablet: components separate horizontally.
- Phone/portrait: components separate vertically.
- **Assemble** returns all components to the center first.
- Only after the components collapse does the complete black device fade back in.
- The large **“One unit. Multiple soil parameters.”** headline remains in the Device Info banner.
- Existing Firebase, 10-second device cadence, History, Clear History, Analytics, Weather, Settings and theme behavior are preserved.
