# Heesen Voyage

Framework‑free itinerary website using **Web Components** + **Leaflet** + **CSV**.

## Quick start
```bash
npm install
npm run start
# open http://localhost:5173
```

## Geocoding your CSV
Put your CSV at `data/itinerary.csv`. If it lacks `lat/lng`, run:

```bash
npm run geocode
```

This looks at `Address`, `City`, `Country` (and falls back to `title/stop/place`) and calls **Nominatim** (~1 request/sec) to create `data/itinerary-with-coords.csv`.  
Rename that file to `itinerary.csv` (or change the loader path) to use it in the site.


