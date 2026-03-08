import { createShowcase } from './showcase-template';

async function run() {
    await createShowcase({
        title: "Fluid Dynamics - Declarative V4",
        engine: "SimplifiedFluidV8",
        dimensions: [128, 128, 1],
        onInit: (grid) => {
            const firstCube = grid.cubes[0][0];
            if (firstCube) {
                const nx = 128, ny = 128;
                const density = firstCube.faces[0];
                const velocity = firstCube.faces[2];

                // Add initial density splat
                for (let y = 0; y < ny; y++) {
                    for (let x = 0; x < nx; x++) {
                        const dx = x - nx / 2, dy = y - ny / 2;
                        if (dx * dx + dy * dy < 15 * 15) {
                            density[y * nx + x] = 1.0;
                            // Add some circular velocity
                            velocity[y * nx + x] = Math.sin(x / 10);
                        }
                    }
                }
            }
        }
    });
}

run().catch(console.error);
