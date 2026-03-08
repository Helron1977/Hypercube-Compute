import { createShowcase } from './showcase-template';

async function run() {
    await createShowcase({
        title: "Ocean 2.5D - Declarative V4",
        engine: "OceanEngine 2.5D (V4)",
        dimensions: [128, 128, 1],
        params: {
            tau_0: 0.8,
            bioGrowth: 0.001
        },
        onInit: (grid) => {
            const firstCube = grid.cubes[0][0];
            if (firstCube) {
                const nx = 128, ny = 128;
                const bioIdx = (firstCube.engine as any).getFaceIndex('Biology');
                const bio = firstCube.faces[bioIdx];
                for (let y = 0; y < ny; y++) {
                    for (let x = 0; x < nx; x++) {
                        const dx = x - nx / 2, dy = y - ny / 2;
                        if (dx * dx + dy * dy < 20 * 20) {
                            bio[y * nx + x] = 1.0;
                        }
                    }
                }
            }
        }
    });
}

run().catch(console.error);
