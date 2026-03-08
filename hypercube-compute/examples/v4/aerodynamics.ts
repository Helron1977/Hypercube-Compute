import { createShowcase } from './showcase-template';

async function run() {
    await createShowcase({
        title: "Aerodynamics LBM - Declarative V4",
        engine: "AerodynamicsV8",
        dimensions: [256, 128, 1],
        params: {
            omega: 1.8,
            inflowVelocity: 0.12
        },
        onInit: (grid) => {
            const firstCube = grid.cubes[0][0];
            if (firstCube) {
                const nx = 256, ny = 128;
                const obsIdx = (firstCube.engine as any).getFaceIndex('Obstacles');
                const obs = firstCube.faces[obsIdx];
                // Add a circular obstacle
                for (let y = 0; y < ny; y++) {
                    for (let x = 0; x < nx; x++) {
                        const dx = x - 64, dy = y - ny / 2;
                        if (dx * dx + dy * dy < 15 * 15) {
                            obs[y * nx + x] = 1.0;
                        }
                    }
                }
            }
        }
    });
}

run().catch(console.error);
