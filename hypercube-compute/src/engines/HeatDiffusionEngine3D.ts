import { IHypercubeEngine } from "./IHypercubeEngine";

export class HeatDiffusionEngine3D implements IHypercubeEngine {
    private alpha: number = 0.1; // Diffusion rate

    get name(): string {
        return "HeatDiffusionEngine3D";
    }

    getRequiredFaces(): number {
        return 2; // Face 0: Current temp, Face 1: Next temp
    }

    getConfig(): any {
        return { alpha: this.alpha };
    }

    init(faces: Float32Array[], nx: number, ny: number, nz: number, isWorker?: boolean): void {
        if (isWorker) return; // Skip clear if worker (SharedArrayBuffer already initialized by main)

        // Clear buffers
        for (const face of faces) {
            face.fill(0);
        }
    }

    applyConfig(config: any): void {
        if (config.alpha !== undefined) this.alpha = config.alpha;
    }

    compute(
        faces: Float32Array[],
        nx: number,
        ny: number,
        nz: number,
        chunkX?: number,
        chunkY?: number,
        chunkZ?: number
    ): void {
        const temp_in = faces[0];
        const temp_out = faces[1];
        const obstacles = faces.length > 2 ? faces[2] : null;

        // Laplacian 3D
        for (let z = 1; z < nz - 1; z++) {
            const zOff = z * ny * nx;
            const zOffP = (z + 1) * ny * nx;
            const zOffM = (z - 1) * ny * nx;

            for (let y = 1; y < ny - 1; y++) {
                const yOff = y * nx;
                const yOffP = (y + 1) * nx;
                const yOffM = (y - 1) * nx;

                for (let x = 1; x < nx - 1; x++) {
                    const idx = zOff + yOff + x;

                    if (obstacles && obstacles[idx] > 0) {
                        temp_out[idx] = 0;
                        continue;
                    }

                    const val = temp_in[idx];
                    const laplacian = (
                        temp_in[idx - 1] + temp_in[idx + 1] + // Left / Right
                        temp_in[zOff + yOffM + x] + temp_in[zOff + yOffP + x] + // Top / Bottom
                        temp_in[zOffM + yOff + x] + temp_in[zOffP + yOff + x]   // Front / Back
                    ) - 6 * val;

                    temp_out[idx] = val + this.alpha * laplacian;
                }
            }
        }

        // DANGEROUS: face.set() overwrites boundaries (ghost cells).
        // Only copy back the "useful" part to avoid zeroing out sync data.
        for (let z = 1; z < nz - 1; z++) {
            const zOff = z * ny * nx;
            for (let y = 1; y < ny - 1; y++) {
                const yOff = zOff + y * nx;
                const start = yOff + 1;
                const end = yOff + nx - 1;
                temp_in.set(temp_out.subarray(start, end), start);
            }
        }
    }
}
