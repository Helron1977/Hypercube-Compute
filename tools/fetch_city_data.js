import https from 'https';
import fs from 'fs';
import path from 'path';

// Paris 11e arrondissement (Republique / Bastille)
const BBOX = "48.860,2.360,48.870,2.375";

function fetchOverpass(query) {
    return new Promise((resolve, reject) => {
        const req = https.request('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    console.error("Failed to parse JSON, response was:", data.substring(0, 100));
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(`data=${encodeURIComponent(query)}`);
        req.end();
    });
}

async function main() {
    console.log("Fetching City Data (Buildings, Subways, Parks)...");

    const query = `
    [out:json][timeout:25];
    (
      way["building"](${BBOX});
      node["station"="subway"](${BBOX});
      way["leisure"="park"](${BBOX});
      node["amenity"="school"](${BBOX});
      node["amenity"="hospital"](${BBOX});
      node["shop"](${BBOX});
      way["natural"="water"](${BBOX});
    );
    out body;
    >;
    out skel qt;
    `;

    try {
        const rawData = await fetchOverpass(query);
        const outPath = path.join(process.cwd(), 'showcase', 'assets', 'paris_data.json');

        // Ensure directory exists
        const dir = path.dirname(outPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Save the raw JSON data
        fs.writeFileSync(outPath, JSON.stringify(rawData, null, 2));
        console.log(`Saved ${rawData.elements.length} elements to ${outPath}`);
    } catch (err) {
        console.error("Error fetching data:", err);
    }
}

main();
