import { IHypercubeEngine } from "./IHypercubeEngine";

export class HeatDiffusionEngine3D implements IHypercubeEngine {
    private alpha: number = 0.1; // Diffusion rate

    getRequiredFaces(): number {
        return 2; // Face 0: Current temp, Face 1: Next temp
    }

    getConfig(): any {
        return { alpha: this.alpha };
    }

    applyConfig(config: any): void {
        if (config.alpha !== undefined) this.alpha = config.alpha;
    }

    compute(
        faces: Float32Array[],
        nx: number,
        ny: number,
        nz: number,
        obstacles: Float32Array
    ): void {
        const temp_in = faces[0];
        const temp_out = faces[1];

        // Very basic 3D Laplacian for thermal diffusion
        for (let z = 1; z < nz - 1; z++) {
            const zOff = z * ny * nx;
            const zOffPlus = (z + 1) * ny * nx;
            const zOffMinus = (z - 1) * ny * nx;

            for (let y = 1; y < ny - 1; y++) {
                const yOff = y * nx;
                const yOffPlus = (y + 1) * nx;
                const yOffMinus = (y - 1) * nx;

                for (let x = 1; x < nx - 1; x++) {
                    const idx = zOff + yOff + x;

                    if (obstacles[idx] > 0) {
                        temp_out[idx] = 0; // Cold wall
                        continue;
                    }

                    const current = temp_in[idx];

                    // 6 neighbors (Left, Right, Top, Bottom, Front, Back)
                    const left = temp_in[zOff + yOff + x - 1];
                    const right = temp_in[zOff + yOff + x + 1];
                    const top = temp_in[zOff + yOffMinus + x];
                    const bottom = temp_in[zOff + yOffPlus + x];
                    const front = temp_in[zOffPlus + yOff + x];
                    const back = temp_in[zOffMinus + yOff + x];

                    // Laplacian operator
                    const laplacian = (left + right + top + bottom + front + back) - 6 * current;

                    temp_out[idx] = current + this.alpha * laplacian;
                }
            }
        }

        // Swap references locally for next step
        temp_in.set(temp_out);
    }
}
