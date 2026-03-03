import type { IHypercubeEngine } from './IHypercubeEngine';

/**
 * VolumeDiffusionEngine
 * Premier moteur nativement 3D.
 * Simule la diffusion thermique ou de concentration dans un volume [nx, ny, nz]
 * via un stencil à 7 points (Laplacien 3D).
 * 
 * Mapping des Faces :
 * Face 0: State t (Input)
 * Face 1: State t+1 (Output)
 */
export class VolumeDiffusionEngine implements IHypercubeEngine {
    public get name(): string {
        return "Volume Diffusion (3D Stencil)";
    }

    public getRequiredFaces(): number {
        return 2;
    }

    /**
     * @param diffusionRate Coefficient de diffusion (D). Plafonné à 1/6 pour la stabilité.
     * @param dissipation Taux de perte par frame (ex: 1.0).
     * @param boundaryMode 'periodic' ou 'clamped' (Neumann no-flux).
     */
    constructor(
        public diffusionRate: number = 0.1,
        public dissipation: number = 1.0,
        public boundaryMode: 'periodic' | 'clamped' = 'periodic'
    ) {
        // CFL Stability : D * Δt / Δx^2 < 1/6 pour 7-point stencil
        this.diffusionRate = Math.min(diffusionRate, 1 / 6);
    }

    /**
     * Simulation CPU du stencil 3D.
     */
    compute(faces: Float32Array[], nx: number, ny: number, nz: number): void {
        const current = faces[0];
        const next = faces[1];

        for (let lz = 0; lz < nz; lz++) {
            const zOff = lz * ny * nx;

            // Indices pour Z
            let lzPrev, lzNext;
            if (this.boundaryMode === 'periodic') {
                lzPrev = (lz - 1 + nz) % nz;
                lzNext = (lz + 1) % nz;
            } else {
                lzPrev = Math.max(0, lz - 1);
                lzNext = Math.min(nz - 1, lz + 1);
            }
            const zPrevOff = lzPrev * ny * nx;
            const zNextOff = lzNext * ny * nx;

            for (let ly = 0; ly < ny; ly++) {
                const yOff = ly * nx;

                // Indices pour Y
                let lyPrev, lyNext;
                if (this.boundaryMode === 'periodic') {
                    lyPrev = (ly - 1 + ny) % ny;
                    lyNext = (ly + 1) % ny;
                } else {
                    lyPrev = Math.max(0, ly - 1);
                    lyNext = Math.min(ny - 1, ly + 1);
                }
                const yPrevOff = lyPrev * nx;
                const yNextOff = lyNext * nx;

                for (let lx = 0; lx < nx; lx++) {
                    const idx = zOff + yOff + lx;
                    const val = current[idx];

                    // Indices pour X
                    let lxPrev, lxNext;
                    if (this.boundaryMode === 'periodic') {
                        lxPrev = (lx - 1 + nx) % nx;
                        lxNext = (lx + 1) % nx;
                    } else {
                        lxPrev = Math.max(0, lx - 1);
                        lxNext = Math.min(nx - 1, lx + 1);
                    }

                    // Voisins 6 directions (7-point stencil)
                    const L = current[zOff + yOff + lxPrev];
                    const R = current[zOff + yOff + lxNext];
                    const T = current[zOff + yPrevOff + lx];
                    const B = current[zOff + yNextOff + lx];
                    const F = current[zPrevOff + yOff + lx];
                    const Bk = current[zNextOff + yOff + lx];

                    // Laplacien 3D : Δu ≈ sum(voisins) - 6*u
                    const laplacian = (L + R + T + B + F + Bk) - (6 * val);

                    // u_next = (u + D * Δu) * dissipation
                    next[idx] = (val + this.diffusionRate * laplacian) * this.dissipation;
                }
            }
        }

        // Finalisation : on recopie next dans current pour le prochain tour
        current.set(next);
    }

    // WebGPU implementation placeholder
    public initGPU(device: GPUDevice, cubeBuffer: GPUBuffer, stride: number, nx: number, ny: number, nz: number): void {
        // Shaders à venir en Phase 5 si demandé
    }
}
