const fs = require('fs');
const geoData = JSON.parse(fs.readFileSync('c:/Users/rolan/OneDrive/Desktop/hypercube/hypercube-compute/hypercube-neo/showcase/assets/paris_data.json', 'utf8'));

const BBOX = { minLat: 48.860, minLon: 2.360, maxLat: 48.870, maxLon: 2.375 };
const size = 512;
const nodes = new Map();
const pois = { metro: [], school: [], park: [] };

for (const el of geoData.elements) {
    if (el.type === 'node') {
        const node = el;
        nodes.set(node.id, { lon: node.lon, lat: node.lat });
        let type = '';
        if (node.tags?.station === 'subway') type = 'metro';
        if (node.tags?.amenity === 'school') type = 'school';

        if (type) {
            const px = Math.floor(((node.lon - BBOX.minLon) / (BBOX.maxLon - BBOX.minLon)) * size);
            const py = Math.floor((1.0 - (node.lat - BBOX.minLat) / (BBOX.maxLat - BBOX.minLat)) * size);
            if (px >= 0 && px < size && py >= 0 && py < size) {
                pois[type].push({ id: node.id.toString(), x: px, y: py });
            }
        }
    }
}

for (const el of geoData.elements) {
    if (el.type === 'way') {
        const way = el;
        if (way.tags?.leisure === 'park') {
            let cx = 0, cy = 0, count = 0;
            for (const nid of way.nodes) {
                const n = nodes.get(nid);
                if (n) {
                    cx += ((n.lon - BBOX.minLon) / (BBOX.maxLon - BBOX.minLon)) * size;
                    cy += (1.0 - (n.lat - BBOX.minLat) / (BBOX.maxLat - BBOX.minLat)) * size;
                    count++;
                }
            }
            if (count > 0) {
                pois.park.push({ id: way.id.toString(), x: Math.floor(cx / count), y: Math.floor(cy / count) });
            }
        }
    }
}

console.log("Parsed POIs:", { metro: pois.metro.length, school: pois.school.length, park: pois.park.length });
