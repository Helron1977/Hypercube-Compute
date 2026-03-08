import { StencilHelper } from './StencilHelper';

/**
 * LbmHelper - Encapsulates Lattice Boltzmann kernels for CPU.
 * Implementation of D2Q9 scheme.
 */
export class LbmHelper {
    private static readonly NX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
    private static readonly NY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
    private static readonly W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];

    /**
     * D2Q9 Collision and Streaming (Ping-Pong)
     */
    static collideAndStream(
        pSource: Float32Array[], // 9 populations (source halves)
        pDest: Float32Array[],   // 9 populations (dest halves)
        nx: number, ny: number,
        omega: number,
        lux: number = 0, luy: number = 0, // Global force/macro bias
        obstacles?: Float32Array,
        uxOut?: Float32Array, uyOut?: Float32Array
    ) {
        const stride = nx * ny;

        for (let y = 0; y < ny; y++) {
            for (let x = 0; x < nx; x++) {
                const idx = y * nx + x;

                if (obstacles && obstacles[idx] > 0.5) {
                    // Simple Bounce-Back
                    for (let k = 0; k < 9; k++) {
                        const opp = this.getOpposite(k);
                        pDest[opp][idx] = pSource[k][idx];
                    }
                    continue;
                }

                // 1. Macros
                let rho = 0;
                let ux = lux;
                let uy = luy;
                for (let k = 0; k < 9; k++) {
                    const f = pSource[k][idx];
                    rho += f;
                    ux += f * this.NX[k];
                    uy += f * this.NY[k];
                }
                if (rho > 0) {
                    ux /= rho;
                    uy /= rho;
                }

                if (uxOut) uxOut[idx] = ux;
                if (uyOut) uyOut[idx] = uy;

                // 2. Equilibrium & Collision
                const u2 = ux * ux + uy * uy;
                for (let k = 0; k < 9; k++) {
                    const cu = 3 * (this.NX[k] * ux + this.NY[k] * uy);
                    const feq = rho * this.W[k] * (1 + cu + 0.5 * cu * cu - 1.5 * u2);

                    const fPost = pSource[k][idx] + omega * (feq - pSource[k][idx]);

                    // 3. Streaming (Agnostic: Stream to borders for Grid sync)
                    const nextX = x + this.NX[k];
                    const nextY = y + this.NY[k];
                    const nextIdx = nextY * nx + nextX;

                    pDest[k][nextIdx] = fPost;
                }
            }
        }
    }

    private static getOpposite(k: number): number {
        if (k === 0) return 0;
        if (k === 1) return 3;
        if (k === 2) return 4;
        if (k === 3) return 1;
        if (k === 4) return 2;
        if (k === 5) return 7;
        if (k === 6) return 8;
        if (k === 7) return 5;
        if (k === 8) return 6;
        return 0;
    }

    /**
     * @description Returns the 9 equilibrium populations for a given rho and velocity.
     */
    static getEquilibrium(rho: number, ux: number, uy: number): Float32Array {
        const f = new Float32Array(9);
        const u2 = ux * ux + uy * uy;
        for (let k = 0; k < 9; k++) {
            const cu = 3 * (this.NX[k] * ux + this.NY[k] * uy);
            f[k] = rho * this.W[k] * (1 + cu + 0.5 * cu * cu - 1.5 * u2);
        }
        return f;
    }
}
