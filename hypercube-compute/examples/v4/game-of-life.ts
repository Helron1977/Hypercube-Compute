import { createShowcase } from './showcase-template';

async function run() {
    await createShowcase({
        title: "Game of Life - Declarative V4",
        engine: "GameOfLifeV8",
        dimensions: [128, 128, 1],
        onInit: (grid) => {
            const firstCube = grid.cubes[0][0];
            if (firstCube) {
                const nx = 128, ny = 128;
                const face = firstCube.faces[0];
                // Randomly seed
                for (let i = 0; i < nx * ny; i++) {
                    face[i] = Math.random() > 0.7 ? 1.0 : 0.0;
                }
            }
        }
    });
}

run().catch(console.error);
