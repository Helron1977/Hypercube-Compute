import type { IHypercubeEngine } from './IHypercubeEngine';

export interface OceanEngineParams {
    tau_0: number;
    smagorinsky: number;
    cflLimit: number;
    bioDiffusion: number;
    bioGrowth: number;
    closedBounds: boolean;
}

/**
 * OceanEngine – Shallow Water + Plankton Dynamics (D2Q9 LBM)
 * Simulation océanique simplifiée : courants, tourbillons, forcing interactif, et bio-diffusion.
 * 
 * @faces
 * - 0–8   : f (populations LBM)
 * - 9–17  : f_post (post-collision temp buffers)
 * - 18    : obst (murs/îles statiques > 0.5)
 * - 19    : ux (vitesse X vectorielle)
 * - 20    : uy (vitesse Y vectorielle)
 * - 21    : curl (vorticité pour rendu)
 * - 22    : rho (densité de masse locale)
 * - 23    : bio (plancton / concentration passive)
 * - 24    : bio_next (temp buffer pour bio)
 * 
 * Note globale : La propriété `interaction` doit être mise à jour chaque frame 
 * par l'environnement ou un `EventListener` de type "mousemove & mousedown".
 */
export class OceanEngine implements IHypercubeEngine {
    public get name(): string {
        return "OceanEngine";
    }

    public getRequiredFaces(): number {
        return 25; // Suite faces 0-17 + 18-24
    }

    public getSyncFaces(): number[] {
        return [0, 1, 2, 3, 4, 5, 6, 7, 8, 18, 19, 20]; // LBM pop (0-8) + macros (ux, uy, rho)
    }

    // Re-use lab-perfect constants
    private readonly w = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
    private readonly cx = [0, 1, 0, -1, 0, 1, -1, -1, 1];
    private readonly cy = [0, 0, 1, 0, -1, 1, 1, -1, -1];
    private readonly opp = [0, 3, 4, 1, 2, 7, 8, 5, 6];

    // Caches to avoid per-frame allocations
    private feq_cache = new Float32Array(9);
    private pulled_f = new Float32Array(9);

    public params: OceanEngineParams = {
        tau_0: 0.8,
        smagorinsky: 0.2,
        cflLimit: 0.38,
        bioDiffusion: 0.05,
        bioGrowth: 0.0005,
        closedBounds: false
    };

    public stats = {
        maxU: 0,
        avgTau: 0,
        avgRho: 0
    };

    constructor() { }

    public getConfig(): Record<string, any> {
        return {
            ...this.params
        };
    }

    public getEquilibrium(rho: number, ux: number, uy: number): Float32Array {
        const res = new Float32Array(9);
        const u2 = ux * ux + uy * uy;
        for (let k = 0; k < 9; k++) {
            const cu = 3 * (this.cx[k] * ux + this.cy[k] * uy);
            res[k] = this.w[k] * rho * (1 + cu + 0.5 * cu * cu - 1.5 * u2);
        }
        return res;
    }

    public init(faces: Float32Array[], nx: number, ny: number, nz: number, isWorker: boolean = false): void {
        if (isWorker) return; // Main thread already initialized SAB

        const u0 = 0.0;
        const v0 = 0.0;
        const rho0 = 1.0;
        const u2 = u0 * u0 + v0 * v0;

        for (let lz = 0; lz < nz; lz++) {
            const zOff = lz * ny * nx;
            for (let i = 0; i < nx * ny; i++) {
                const idx = zOff + i;
                faces[22][idx] = rho0;
                faces[19][idx] = u0;
                faces[20][idx] = v0;
                faces[23][idx] = 0.01; // Initial small plankton amount

                for (let k = 0; k < 9; k++) {
                    const cu = 3 * (this.cx[k] * u0 + this.cy[k] * v0);
                    const feq = this.w[k] * rho0 * (1 + cu + 0.5 * cu * cu - 1.5 * u2);
                    faces[k][idx] = feq;
                    faces[k + 9][idx] = feq;
                }
            }
        }
    }



    /**
     * Entry point: Orchestrates LBM and Bio steps
     */
    compute(faces: Float32Array[], nx: number, ny: number, nz: number): void {
        for (let lz = 0; lz < nz; lz++) {
            this.stepLBM(faces, nx, ny, lz);
            this.stepBio(faces, nx, ny, lz);
        }
    }

    private stepLBM(faces: Float32Array[], nx: number, ny: number, lz: number): void {
        const size = nx;
        const rho = faces[22], ux = faces[19], uy = faces[20], obst = faces[18];
        const zOff = lz * ny * nx;

        let maxU = 0;
        let sumTau = 0;
        let sumRho = 0;
        let activeCells = 0;

        // 0. CLEAR NEXT FRAME BUFFERS (Only the slice part)
        for (let k = 0; k < 9; k++) {
            for (let i = 0; i < nx * ny; i++) faces[k + 9][zOff + i] = 0;
        }

        const out0 = faces[9], out1 = faces[10], out2 = faces[11], out3 = faces[12], out4 = faces[13], out5 = faces[14], out6 = faces[15], out7 = faces[16], out8 = faces[17];
        const in0 = faces[0], in1 = faces[1], in2 = faces[2], in3 = faces[3], in4 = faces[4], in5 = faces[5], in6 = faces[6], in7 = faces[7], in8 = faces[8];
        const cx_w = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
        const isClosed = this.params.closedBounds;

        // 1. PULL-STREAMING, MACROS & COLLISION (O1 Optimized)
        for (let y = 1; y < ny - 1; y++) {
            for (let x = 1; x < nx - 1; x++) {
                const i = zOff + y * nx + x;

                if (obst[i] > 0.5) {
                    out0[i] = cx_w[0]; out1[i] = cx_w[1]; out2[i] = cx_w[2];
                    out3[i] = cx_w[3]; out4[i] = cx_w[4]; out5[i] = cx_w[5];
                    out6[i] = cx_w[6]; out7[i] = cx_w[7]; out8[i] = cx_w[8];
                    continue;
                }

                // --- PULL STREAMING UNROLLED ---
                let pf0 = in0[i];
                let pf1: number, pf2: number, pf3: number, pf4: number, pf5: number, pf6: number, pf7: number, pf8: number;

                // Dir 1 (cx:1, cy:0) opp:3
                let nx1 = x - 1, ny1 = y;
                if (isClosed && nx1 <= 0) pf1 = in3[i]; else { let ni = zOff + ny1 * nx + nx1; pf1 = obst[ni] > 0.5 ? in3[i] : in1[ni]; }
                // Dir 2 (cx:0, cy:1) opp:4
                let nx2 = x, ny2 = y - 1;
                if (isClosed && ny2 <= 0) pf2 = in4[i]; else { let ni = zOff + ny2 * nx + nx2; pf2 = obst[ni] > 0.5 ? in4[i] : in2[ni]; }
                // Dir 3 (cx:-1, cy:0) opp:1
                let nx3 = x + 1, ny3 = y;
                if (isClosed && nx3 >= nx - 1) pf3 = in1[i]; else { let ni = zOff + ny3 * nx + nx3; pf3 = obst[ni] > 0.5 ? in1[i] : in3[ni]; }
                // Dir 4 (cx:0, cy:-1) opp:2
                let nx4 = x, ny4 = y + 1;
                if (isClosed && ny4 >= ny - 1) pf4 = in2[i]; else { let ni = zOff + ny4 * nx + nx4; pf4 = obst[ni] > 0.5 ? in2[i] : in4[ni]; }
                // Dir 5 (cx:1, cy:1) opp:7
                let nx5 = x - 1, ny5 = y - 1;
                if (isClosed && (nx5 <= 0 || ny5 <= 0)) pf5 = in7[i]; else { let ni = zOff + ny5 * nx + nx5; pf5 = obst[ni] > 0.5 ? in7[i] : in5[ni]; }
                // Dir 6 (cx:-1, cy:1) opp:8
                let nx6 = x + 1, ny6 = y - 1;
                if (isClosed && (nx6 >= nx - 1 || ny6 <= 0)) pf6 = in8[i]; else { let ni = zOff + ny6 * nx + nx6; pf6 = obst[ni] > 0.5 ? in8[i] : in6[ni]; }
                // Dir 7 (cx:-1, cy:-1) opp:5
                let nx7 = x + 1, ny7 = y + 1;
                if (isClosed && (nx7 >= nx - 1 || ny7 >= ny - 1)) pf7 = in5[i]; else { let ni = zOff + ny7 * nx + nx7; pf7 = obst[ni] > 0.5 ? in5[i] : in7[ni]; }
                // Dir 8 (cx:1, cy:-1) opp:6
                let nx8 = x - 1, ny8 = y + 1;
                if (isClosed && (nx8 <= 0 || ny8 >= ny - 1)) pf8 = in6[i]; else { let ni = zOff + ny8 * nx + nx8; pf8 = obst[ni] > 0.5 ? in6[i] : in8[ni]; }

                let r = pf0 + pf1 + pf2 + pf3 + pf4 + pf5 + pf6 + pf7 + pf8;
                let vx = (pf1 + pf5 + pf8) - (pf3 + pf6 + pf7);
                let vy = (pf2 + pf5 + pf6) - (pf4 + pf7 + pf8);

                // Stability Clamping
                let isShockwave = false;
                if (r < 0.8 || r > 1.2 || r < 0.0001) {
                    const targetRho = Math.max(0.8, Math.min(1.2, r < 0.0001 ? 1.0 : r));
                    const scale = targetRho / r;
                    pf0 *= scale; pf1 *= scale; pf2 *= scale; pf3 *= scale; pf4 *= scale;
                    pf5 *= scale; pf6 *= scale; pf7 *= scale; pf8 *= scale;
                    r = targetRho;
                    isShockwave = true;
                }

                vx /= r; vy /= r;

                const v2 = vx * vx + vy * vy;
                const speed = Math.sqrt(v2);
                if (speed > maxU) maxU = speed;

                let u2_clamped = v2;
                if (speed > this.params.cflLimit) {
                    const scale = this.params.cflLimit / speed;
                    vx *= scale; vy *= scale;
                    u2_clamped = vx * vx + vy * vy;
                    isShockwave = true;
                }

                rho[i] = r; ux[i] = vx; uy[i] = vy;

                const u2_15 = 1.5 * u2_clamped;

                let feq0 = cx_w[0] * r * (1.0 - u2_15);
                let feq1 = cx_w[1] * r * (1.0 + 3.0 * vx + 4.5 * vx * vx - u2_15);
                let feq2 = cx_w[2] * r * (1.0 + 3.0 * vy + 4.5 * vy * vy - u2_15);
                let feq3 = cx_w[3] * r * (1.0 - 3.0 * vx + 4.5 * vx * vx - u2_15);
                let feq4 = cx_w[4] * r * (1.0 - 3.0 * vy + 4.5 * vy * vy - u2_15);

                let cu5 = vx + vy; let feq5 = cx_w[5] * r * (1.0 + 3.0 * cu5 + 4.5 * cu5 * cu5 - u2_15);
                let cu6 = -vx + vy; let feq6 = cx_w[6] * r * (1.0 + 3.0 * cu6 + 4.5 * cu6 * cu6 - u2_15);
                let cu7 = -vx - vy; let feq7 = cx_w[7] * r * (1.0 + 3.0 * cu7 + 4.5 * cu7 * cu7 - u2_15);
                let cu8 = vx - vy; let feq8 = cx_w[8] * r * (1.0 + 3.0 * cu8 + 4.5 * cu8 * cu8 - u2_15);

                if (isShockwave) {
                    out0[i] = feq0; out1[i] = feq1; out2[i] = feq2; out3[i] = feq3; out4[i] = feq4;
                    out5[i] = feq5; out6[i] = feq6; out7[i] = feq7; out8[i] = feq8;
                } else {
                    let fneq1 = pf1 - feq1; let fneq2 = pf2 - feq2;
                    let fneq3 = pf3 - feq3; let fneq4 = pf4 - feq4;
                    let fneq5 = pf5 - feq5; let fneq6 = pf6 - feq6;
                    let fneq7 = pf7 - feq7; let fneq8 = pf8 - feq8;

                    let Pxx = fneq1 + fneq3 + fneq5 + fneq6 + fneq7 + fneq8;
                    let Pyy = fneq2 + fneq4 + fneq5 + fneq6 + fneq7 + fneq8;
                    let Pxy = fneq5 - fneq6 + fneq7 - fneq8;

                    let S_norm = Math.sqrt(2 * (Pxx * Pxx + Pyy * Pyy + 2 * Pxy * Pxy));
                    if (S_norm > 10.0 || isNaN(S_norm)) S_norm = 10.0;
                    let tau_eff = this.params.tau_0 + this.params.smagorinsky * S_norm;
                    if (isNaN(tau_eff) || tau_eff < 0.505) tau_eff = 0.505;
                    else if (tau_eff > 2.0) tau_eff = 2.0;

                    sumTau += tau_eff;
                    sumRho += r;
                    activeCells++;

                    let inv_tau = 1.0 / tau_eff;
                    out0[i] = pf0 - (pf0 - feq0) * inv_tau;
                    out1[i] = pf1 - fneq1 * inv_tau;
                    out2[i] = pf2 - fneq2 * inv_tau;
                    out3[i] = pf3 - fneq3 * inv_tau;
                    out4[i] = pf4 - fneq4 * inv_tau;
                    out5[i] = pf5 - fneq5 * inv_tau;
                    out6[i] = pf6 - fneq6 * inv_tau;
                    out7[i] = pf7 - fneq7 * inv_tau;
                    out8[i] = pf8 - fneq8 * inv_tau;
                }
            }
        }

        // 2. VORTICITY / CURL Calculation (Face 21 - needed for visualization)
        const curl_out = faces[21];
        for (let y = 1; y < ny - 1; y++) {
            for (let x = 1; x < nx - 1; x++) {
                const i = zOff + y * nx + x;
                const xM = x > 1 ? x - 1 : 1;
                const xP = x < nx - 2 ? x + 1 : nx - 2;
                const dxDist = (x === 1 || x === nx - 2) ? 1.0 : 2.0;

                const yM_idx = y > 1 ? y - 1 : 1;
                const yP_idx = y < ny - 2 ? y + 1 : ny - 2;
                const dyDist = (y === 1 || y === ny - 2) ? 1.0 : 2.0;

                const dUy_dx = (uy[zOff + y * nx + xP] - uy[zOff + y * nx + xM]) / dxDist;
                const dUx_dy = (ux[zOff + yP_idx * nx + x] - ux[zOff + yM_idx * nx + x]) / dyDist;
                curl_out[i] = dUy_dx - dUx_dy;
            }
        }

        if (activeCells > 0) {
            this.stats.avgTau = sumTau / activeCells;
            this.stats.avgRho = sumRho / activeCells;
        }
        this.stats.maxU = maxU;

        // 4. MEMORY SWAP (Only for the slice)
        for (let k = 0; k < 9; k++) {
            for (let i = 0; i < nx * ny; i++) {
                const idx = zOff + i;
                const tmp = faces[k][idx];
                faces[k][idx] = faces[k + 9][idx];
                faces[k + 9][idx] = tmp;
            }
        }
    }

    private stepBio(faces: Float32Array[], nx: number, ny: number, lz: number): void {
        const bio = faces[23];
        const bio_next = faces[24];
        const zOff = lz * ny * nx;

        for (let y = 1; y < ny - 1; y++) {
            for (let x = 1; x < nx - 1; x++) {
                const i = zOff + y * nx + x;

                // Diffusion laplacienne
                const lap = bio[i - 1] + bio[i + 1] + bio[i - nx] + bio[i + nx] - 4 * bio[i];
                let next = bio[i] + this.params.bioDiffusion * lap + this.params.bioGrowth * bio[i] * (1 - bio[i]);

                // Advection
                const ux = faces[18][i];
                const uy = faces[19][i];
                const ax = Math.max(1, Math.min(nx - 2, x - ux * 0.8));
                const ay = Math.max(1, Math.min(ny - 2, y - uy * 0.8));
                const ix = Math.floor(ax);
                const iy = Math.floor(ay);
                const fx = ax - ix;
                const fy = ay - iy;

                const v00 = bio[zOff + iy * nx + ix];
                const v10 = bio[zOff + iy * nx + Math.min(ix + 1, nx - 2)];
                const v01 = bio[zOff + Math.min(iy + 1, ny - 2) * nx + ix];
                const v11 = bio[zOff + Math.min(iy + 1, ny - 2) * nx + Math.min(ix + 1, nx - 2)];

                const advected = (1 - fy) * ((1 - fx) * v00 + fx * v10) + fy * ((1 - fx) * v01 + fx * v11);
                next = advected + this.params.bioDiffusion * lap + this.params.bioGrowth * bio[i] * (1 - bio[i]);

                if (next < 0) next = 0;
                if (next > 1) next = 1;
                bio_next[i] = next;
            }
        }

        for (let i = 0; i < nx * ny; i++) bio[zOff + i] = bio_next[zOff + i];
    }
}


