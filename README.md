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
