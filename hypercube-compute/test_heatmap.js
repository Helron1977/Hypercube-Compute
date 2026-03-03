const { HeatmapEngine } = require('./dist/index.js');
const nx = 10, ny = 10, nz = 1;
// Create an engine with radius=2, weight=1
const engine = new HeatmapEngine(2, 1.0);
const faces = Array(5).fill(null).map(() => new Float32Array(nx * ny));
// inject 1.0 at (5,5)
faces[0][5 * nx + 5] = 1.0;
// run compute
console.log("Pre-compute: Face 0 sum =", faces[0].reduce((a, b) => a + b, 0));
engine.compute(faces, nx, ny, nz);
console.log("Post-compute: Face 2 sum =", faces[2].reduce((a, b) => a + b, 0));
console.log("Face 2 output around 5,5:");
for (let y = 3; y <= 7; y++) {
    let row = "";
    for (let x = 3; x <= 7; x++) {
        row += faces[2][y * nx + x] + " ";
    }
    console.log(row);
}
