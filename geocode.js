// geocode.js
// Read data/uploaded_example.csv and output standardized data/itinerary-with-coords.csv
// Columns: id,title,city,country,lat,lng,start_date,end_date,status,km,notes,address

import fs from "fs";
import Papa from "papaparse";
import fetch from "node-fetch";

const INPUT = "./data/uploaded_example.csv";
const OUTPUT = "./data/itinerary-with-coords.csv";
const DELAY_MS = 1100;

const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
const norm = (v)=> (v==null ? "" : String(v).trim());
const yesSet = new Set(["1","y","yes","true","booked"]);

function pick(row, keys, def=""){
  for (const k of keys) {
    for (const v of [k, k.toLowerCase(), k.toUpperCase()]) {
      if (v in row) return row[v];
    }
  }
  return def;
}
function buildAddress(row){
  const explicit = norm(pick(row, ["address","Address"]));
  if (explicit) return explicit;
  const parts = [
    norm(pick(row, ["Accommodation","accommodation","place","Place","location","Location","title","Title"])),
    norm(pick(row, ["Town/Area","town/area","Town","town","City","city","Area","area"])),
    norm(pick(row, ["Country","country","Country "])),
  ].filter(Boolean);
  return parts.join(", ");
}
async function geocode(address){
  if(!address) return {lat:"",lng:""};
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { "User-Agent": "HeesenVoyage/1.0 (CSV enrichment)" } });
  if(!res.ok) return {lat:"",lng:""};
  const data = await res.json();
  if (Array.isArray(data) && data.length>0) return {lat:data[0].lat, lng:data[0].lon};
  return {lat:"",lng:""};
}

(async()=>{
  if(!fs.existsSync(INPUT)){
    console.error(`Input not found: ${INPUT}`);
    process.exit(1);
  }
  const csv = fs.readFileSync(INPUT, "utf8");
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  const src = parsed.data;

  const outRows = [];
  // Cache for geocoded addresses
  const addressCache = {};
  for (let i=0; i<src.length; i++){
    const row = src[i];
    const id = String(i+1);
    const city = norm(pick(row, ["Town/Area","Town","City","Area","town/area","city","area"]));
    const country = norm(pick(row, ["Country","country","Country "]));
    const start_date = norm(pick(row, ["start_date","Start Date","Date","start","Start"]));
    const end_date = norm(pick(row, ["end_date","End Date","end","End"], start_date));
    const title = norm(pick(row, ["Title","title"])) || city || "(Stop)";
    const notes = norm(pick(row, ["Activity","activity"]));
    const km = norm(pick(row, ["km","KM","Distance (km)","distance_km"]));
    const rawBooked = norm(pick(row, ["status","Status","Booked","booked","isBooked"])).toLowerCase();
    const status = yesSet.has(rawBooked) ? "booked" : "planned";

      let lat = norm(pick(row, ["lat","latitude","Lat"]));
      let lng = norm(pick(row, ["lng","long","longitude","Lon","Long"]));
      // Use 'location' column if present and valid
      const locationStr = norm(pick(row, ["location","Location"]));
      if (locationStr && !lat && !lng) {
        const match = locationStr.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
        if (match) {
          lat = match[1];
          lng = match[2];
        }
      }
    const address = buildAddress(row);
    if (!(lat && lng) && (city || country || address)) {
      const searchAddress = address || [city, country].filter(Boolean).join(", ");
      if (searchAddress in addressCache) {
        lat = lat || addressCache[searchAddress].lat;
        lng = lng || addressCache[searchAddress].lng;
      } else {
        const g = await geocode(searchAddress);
        if (!(g.lat && g.lng)) {
          console.warn(`Location not found for address: '${searchAddress}' (row ${id})`);
        }
        lat = lat || g.lat;
        lng = lng || g.lng;
        addressCache[searchAddress] = { lat, lng };
        await sleep(DELAY_MS);
      }
    }

    outRows.push({ id, title, city, country, lat, lng, start_date, end_date, status, km, notes, address });
  }

  outRows.sort((a,b)=> new Date(a.start_date) - new Date(b.start_date));

  const outputCsv = Papa.unparse(outRows, {
    columns: ["id","title","city","country","lat","lng","start_date","end_date","status","km","notes","address"]
  });
  fs.writeFileSync(OUTPUT, outputCsv);
  console.log(`Saved ${OUTPUT} (${outRows.length} rows)`);
})();
