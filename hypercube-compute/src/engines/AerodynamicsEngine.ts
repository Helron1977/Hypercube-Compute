import type { IHypercubeEngine, FlatTensorView } from "./IHypercubeEngine";

/**
 * AerodynamicsEngine - Lattice Boltzmann D2Q9
 * Implémentation robuste avec Bounce-Back intégré au Streaming.
 */
export class AerodynamicsEngine implements IHypercubeEngine {
    public dragScore: number = 0;
    private lastNx: number = 256;
    private lastNy: number = 256;
    public boundaryConfig: any = null;
    private readonly cx = [0, 1, 0, -1, 0, 1, -1, -1, 1]; // E, N, W, S, NE, NW, SW, SE
    private readonly cy = [0, 0, 1, 0, -1, 1, 1, -1, -1];
    private readonly w = [4.0 / 9.0, 1.0 / 9.0, 1.0 / 9.0, 1.0 / 9.0, 1.0 / 9.0, 1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0];

    // WebGPU Attributes
    private pipelineLBM: GPUComputePipeline | null = null;
    private pipelineVorticity: GPUComputePipeline | null = null;
    private uniformBuffer: GPUBuffer | null = null;
    private parity: number = 0;
    public gpuEnabled: boolean = false;

    public get name(): string { return "AerodynamicsEngine LBM D2Q9"; }
    public getTags(): string[] { return ['aerodynamics', '2d', 'arctic', 'lbm']; }

    public getRequiredFaces(): number {
        // (9 pops P0 + 9 pops P1) + (obs, ux, uy, curl, smoke P0, smoke P1)
        return 24;
    }

    public getConfig(): Record<string, any> {
        return {
            boundaryConfig: this.boundaryConfig,
            parity: (this as any).parity || 0
        };
    }

    public setBoundaryConfig(config: any): void {
        this.boundaryConfig = config;
    }

    public getSyncFaces(): number[] {
        const p = (this as any).parity ?? 0;
        const outOffset = (1 - p) * 9;
        const smokeOutIdx = 22 + (1 - p);

        return [
            outOffset + 0, outOffset + 1, outOffset + 2, outOffset + 3, outOffset + 4,
            outOffset + 5, outOffset + 6, outOffset + 7, outOffset + 8,
            18, 19, 20, 21, smokeOutIdx
        ];
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
        if (isWorker) return; // Do not overwrite SAB data initialized by HypercubeGrid

        const u0 = 0.12;
        for (let idx = 0; idx < nx * ny * nz; idx++) {
            const rho = 1.0;
            const ux = u0; const uy = 0.0;
            const u_sq_15 = 1.5 * (ux * ux + uy * uy);
            for (let i = 0; i < 9; i++) {
                const cu = this.cx[i] * ux + this.cy[i] * uy;
                const feq = this.w[i] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - u_sq_15);
                faces[i][idx] = feq;
                faces[i + 9][idx] = feq;
            }
            faces[22][idx] = 0; // Smoke 0
            faces[23][idx] = 0; // Smoke 1
        }
    }

    public initGPU(device: GPUDevice, readBuffer: GPUBuffer, writeBuffer: GPUBuffer, stride: number, nx: number, ny: number, nz: number): void {
        const shaderModule = device.createShaderModule({ code: this.wgslSource });

        const bindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' }
                }
            ]
        });

        const pipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        });

        this.pipelineLBM = device.createComputePipeline({
            layout: pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'compute_lbm' }
        });

        this.pipelineVorticity = device.createComputePipeline({
            layout: pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'compute_vorticity' }
        });

        this.uniformBuffer = device.createBuffer({
            size: 64, // Increased to match common alignment
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const strideFloats = stride / 4;
        const uniformData = new ArrayBuffer(64);
        const u32 = new Uint32Array(uniformData);
        const f32 = new Float32Array(uniformData);

        u32[0] = nx;
        f32[1] = 0.12; // u0
        f32[2] = 1.95; // omega
        u32[3] = strideFloats;

        device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

        this.gpuEnabled = true;
    }

    public computeGPU(device: GPUDevice, commandEncoder: GPUCommandEncoder, nx: number, ny: number, nz: number, readBuffer: GPUBuffer, writeBuffer: GPUBuffer): void {
        if (!this.pipelineLBM || !this.pipelineVorticity || !this.uniformBuffer) return;

        // Current AerodynamicsEngine implementation expects a single buffer.
        // We'll use readBuffer as the target to satisfy the interface for now.
        const bindGroup = device.createBindGroup({
            layout: this.pipelineLBM.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: readBuffer } },
                { binding: 1, resource: { buffer: this.uniformBuffer } }
            ]
        });

        const wgSize = 16;
        const wgX = Math.ceil(nx / wgSize);
        const wgY = Math.ceil(ny / wgSize);

        const pass1 = commandEncoder.beginComputePass();
        pass1.setBindGroup(0, bindGroup);
        pass1.setPipeline(this.pipelineLBM);
        pass1.dispatchWorkgroups(wgX, wgY, nz || 1);
        pass1.end();

        const pass2 = commandEncoder.beginComputePass();
        pass2.setBindGroup(0, bindGroup);
        pass2.setPipeline(this.pipelineVorticity);
        pass2.dispatchWorkgroups(wgX, wgY, nz || 1);
        pass2.end();
    }

    public compute(faces: Float32Array[], nx: number, ny: number, nz: number): void {
        this.lastNx = nx;
        this.lastNy = ny;
        const obstacles = faces[18];
        const ux_out = faces[19];
        const uy_out = faces[20];
        const curl_out = faces[21];
        const smoke = faces[22];

        const cx_w = [
            4.0 / 9.0,         // c0 (0,0)
            1.0 / 9.0,         // c1 (1,0)
            1.0 / 9.0,         // c2 (0,1)
            1.0 / 9.0,         // c3 (-1,0)
            1.0 / 9.0,         // c4 (0,-1)
            1.0 / 36.0,        // c5 (1,1)
            1.0 / 36.0,        // c6 (-1,1)
            1.0 / 36.0,        // c7 (-1,-1)
            1.0 / 36.0         // c8 (1,-1)
        ];

        // const f0_arr = faces[0], f1_arr = faces[1], f2_arr = faces[2], f3_arr = faces[3], f4_arr = faces[4];
        // const f5_arr = faces[5], f6_arr = faces[6], f7_arr = faces[7], f8_arr = faces[8];
        // const out0 = faces[9], out1 = faces[10], out2 = faces[11], out3 = faces[12], out4 = faces[13];
        // const out5 = faces[14], out6 = faces[15], out7 = faces[16], out8 = faces[17];

        if (this.parity === undefined) (this as any).parity = 0;
        const parity = (this as any).parity;
        const nextParity = 1 - parity;

        const offsetIn = parity * 9;
        const offsetOut = nextParity * 9;

        const f_in = [
            faces[offsetIn + 0], faces[offsetIn + 1], faces[offsetIn + 2], faces[offsetIn + 3], faces[offsetIn + 4],
            faces[offsetIn + 5], faces[offsetIn + 6], faces[offsetIn + 7], faces[offsetIn + 8]
        ];
        const f_out = [
            faces[offsetOut + 0], faces[offsetOut + 1], faces[offsetOut + 2], faces[offsetOut + 3], faces[offsetOut + 4],
            faces[offsetOut + 5], faces[offsetOut + 6], faces[offsetOut + 7], faces[offsetOut + 8]
        ];
        const omega = 1.75;

        for (let lz = 0; lz < nz; lz++) {
            const zOff = lz * ny * nx;

            // 1. PULL-STREAMING, MACROS & COLLISION
            for (let y = 1; y < ny - 1; y++) {
                for (let x = 1; x < nx - 1; x++) {
                    const i = zOff + y * nx + x;

                    if (obstacles[i] > 0.5) {
                        ux_out[i] = 0;
                        uy_out[i] = 0;
                        // Stationary equilibrium for obstacles
                        for (let k = 0; k < 9; k++) f_out[k][i] = cx_w[k];
                        continue;
                    }

                    // --- BOUNDARY CONDITIONS ---
                    const config = this.boundaryConfig;
                    if (config) {
                        if (config.isLeftBoundary && x === 1 && config.left === 'INFLOW') {
                            let scale = 1.0;
                            if (config.isTopBoundary && y < 16) scale = y / 16.0;
                            if (config.isBottomBoundary && y > ny - 17) scale = (ny - 1 - y) / 16.0;

                            const inUx = (config.inflowUx ?? 0.12) * scale;
                            const inUy = (config.inflowUy ?? 0.0) * scale;
                            const inRho = config.inflowDensity ?? 1.0;

                            ux_out[i] = inUx;
                            uy_out[i] = inUy;
                            const u_sq_15 = 1.5 * (inUx * inUx + inUy * inUy);

                            for (let k = 0; k < 9; k++) {
                                const cu = this.cx[k] * inUx + this.cy[k] * inUy;
                                f_out[k][i] = cx_w[k] * inRho * (1.0 + 3.0 * cu + 4.5 * cu * cu - u_sq_15);
                            }
                            continue;
                        }

                        if (config.isRightBoundary && x === nx - 2 && config.right === 'OUTFLOW') {
                            const prev = i - 1;
                            const uH = ux_out[prev];
                            const vH = uy_out[prev];
                            const u2 = 1.5 * (uH * uH + vH * vH);
                            for (let k = 0; k < 9; k++) {
                                const cu = this.cx[k] * uH + this.cy[k] * vH;
                                f_out[k][i] = cx_w[k] * (1.0 + 3.0 * cu + 4.5 * cu * cu - u2);
                            }
                            ux_out[i] = uH;
                            uy_out[i] = vH;
                            continue;
                        }
                    }

                    const opp = [0, 3, 4, 1, 2, 7, 8, 5, 6];
                    let pf0 = f_in[0][i];
                    let pf1, pf2, pf3, pf4, pf5, pf6, pf7, pf8;

                    // Pull Streaming from neighbors with proper boundaries
                    pf1 = (obstacles[i - 1] > 0.5) ? f_in[3][i] : f_in[1][i - 1];
                    pf2 = (obstacles[i - nx] > 0.5) ? f_in[4][i] : f_in[2][i - nx];
                    pf3 = (obstacles[i + 1] > 0.5) ? f_in[1][i] : f_in[3][i + 1];
                    pf4 = (obstacles[i + nx] > 0.5) ? f_in[2][i] : f_in[4][i + nx];
                    pf5 = (obstacles[i - nx - 1] > 0.5) ? f_in[7][i] : f_in[5][i - nx - 1];
                    pf6 = (obstacles[i - nx + 1] > 0.5) ? f_in[8][i] : f_in[6][i - nx + 1];
                    pf7 = (obstacles[i + nx + 1] > 0.5) ? f_in[5][i] : f_in[7][i + nx + 1];
                    pf8 = (obstacles[i + nx - 1] > 0.5) ? f_in[6][i] : f_in[8][i + nx - 1];

                    let rho = pf0 + pf1 + pf2 + pf3 + pf4 + pf5 + pf6 + pf7 + pf8;
                    let ux = (pf1 + pf5 + pf8) - (pf3 + pf6 + pf7);
                    let uy = (pf2 + pf5 + pf6) - (pf4 + pf7 + pf8);

                    ux /= rho; uy /= rho;
                    ux_out[i] = ux;
                    uy_out[i] = uy;

                    const u_sq_15 = 1.5 * (ux * ux + uy * uy);
                    const om_1 = 1.0 - omega;

                    f_out[0][i] = pf0 * om_1 + (cx_w[0] * rho * (1.0 - u_sq_15)) * omega;
                    f_out[1][i] = pf1 * om_1 + (cx_w[1] * rho * (1.0 + 3.0 * ux + 4.5 * ux * ux - u_sq_15)) * omega;
                    f_out[2][i] = pf2 * om_1 + (cx_w[2] * rho * (1.0 + 3.0 * uy + 4.5 * uy * uy - u_sq_15)) * omega;
                    f_out[3][i] = pf3 * om_1 + (cx_w[3] * rho * (1.0 - 3.0 * ux + 4.5 * ux * ux - u_sq_15)) * omega;
                    f_out[4][i] = pf4 * om_1 + (cx_w[4] * rho * (1.0 - 3.0 * uy + 4.5 * uy * uy - u_sq_15)) * omega;
                    f_out[5][i] = pf5 * om_1 + (cx_w[5] * rho * (1.0 + 3.0 * (ux + uy) + 4.5 * (ux + uy) * (ux + uy) - u_sq_15)) * omega;
                    f_out[6][i] = pf6 * om_1 + (cx_w[6] * rho * (1.0 + 3.0 * (-ux + uy) + 4.5 * (-ux + uy) * (-ux + uy) - u_sq_15)) * omega;
                    f_out[7][i] = pf7 * om_1 + (cx_w[7] * rho * (1.0 + 3.0 * (-ux - uy) + 4.5 * (-ux - uy) * (-ux - uy) - u_sq_15)) * omega;
                    f_out[8][i] = pf8 * om_1 + (cx_w[8] * rho * (1.0 + 3.0 * (ux - uy) + 4.5 * (ux - uy) * (ux - uy) - u_sq_15)) * omega;
                }
            }

            // No explicit swap needed due to ping-pong buffer strategy

            // 3. VORTICITY
            // 3. VORTICITY
            for (let y = 1; y < ny - 1; y++) {
                const yM = y - 1;
                const yP = y + 1;
                for (let x = 1; x < nx - 1; x++) {
                    const xM = x - 1;
                    const xP = x + 1;

                    // Central Difference across 2 units
                    const dUy_dx = (uy_out[zOff + y * nx + xP] - uy_out[zOff + y * nx + xM]) / 2.0;
                    const dUx_dy = (ux_out[zOff + yP * nx + x] - ux_out[zOff + yM * nx + x]) / 2.0;
                    curl_out[zOff + y * nx + x] = dUy_dx - dUx_dy;
                }
            }

            // 4. TRACER ADVECTION (Smoke)
            // Smoke uses a dedicated parity too for perfect smoothness across chunks
            const smoke_in = faces[22 + parity];
            const smoke_out = faces[22 + nextParity];

            for (let y = 1; y < ny - 1; y++) {
                for (let x = 1; x < nx - 1; x++) {
                    const idx = zOff + y * nx + x;
                    if (obstacles[idx] > 0) {
                        smoke_out[idx] = 0;
                        continue;
                    }
                    const vx = ux_out[idx];
                    const vy = uy_out[idx];
                    const sx = x - vx;
                    const sy = y - vy;

                    // BILINEAR INTERPOLATION for "SMOKE" look
                    // Instead of Math.floor, we blend 4 neighbor pixels
                    const x0 = Math.floor(sx), y0 = Math.floor(sy);
                    const x1 = x0 + 1, y1 = y0 + 1;
                    const fx = sx - x0, fy = sy - y0;

                    if (x0 >= 0 && x1 < nx && y0 >= 0 && y1 < ny) {
                        const val00 = smoke_in[y0 * nx + x0];
                        const val10 = smoke_in[y0 * nx + x1];
                        const val01 = smoke_in[y1 * nx + x0];
                        const val11 = smoke_in[y1 * nx + x1];
                        const raw = (val00 * (1 - fx) + val10 * fx) * (1 - fy) + (val01 * (1 - fx) + val11 * fx) * fy;

                        const neighborAvg = (smoke_in[idx - 1] + smoke_in[idx + 1] + smoke_in[idx - nx] + smoke_in[idx + nx]) * 0.25;
                        smoke_out[idx] = (raw * 0.995 + neighborAvg * 0.005) * 0.9999;
                    }

                    if (this.boundaryConfig?.isLeftBoundary && x === 1) {
                        const pitch = Math.floor(ny / 20);
                        if ((y + 2) % pitch <= 2) {
                            smoke_out[idx] = 1.0;
                        }
                    }
                }
            }
        }
    }

    public get wgslSource(): string {
        return `
            struct Config {
                mapSize: u32,
                u0: f32,
                omega: f32,
                stride: u32,
            };

            @group(0) @binding(0) var<storage, read_write> cube: array<f32>;
            @group(0) @binding(1) var<uniform> config: Config;

            const cx: array<f32, 9> = array<f32, 9>(0.0, 1.0, 0.0, -1.0, 0.0, 1.0, -1.0, -1.0, 1.0);
            const cy: array<f32, 9> = array<f32, 9>(0.0, 0.0, 1.0, 0.0, -1.0, 1.0, 1.0, -1.0, -1.0);
            const w: array<f32, 9> = array<f32, 9>(0.444444, 0.111111, 0.111111, 0.111111, 0.111111, 0.027777, 0.027777, 0.027777, 0.027777);
            const opp: array<u32, 9> = array<u32, 9>(0u, 3u, 4u, 1u, 2u, 7u, 8u, 5u, 6u);

            fn get_face(f: u32, id: u32) -> f32 {
                return cube[f * config.stride + id];
            }

            fn set_face(f: u32, id: u32, val: f32) {
                cube[f * config.stride + id] = val;
            }

            @compute @workgroup_size(16, 16)
            fn compute_lbm(@builtin(global_invocation_id) id: vec3<u32>) {
                let x = id.x;
                let y = id.y;
                let N = config.mapSize;
                if (x == 0u || x >= N - 1u || y == 0u || y >= N - 1u) { return; }
                let idx = y * N + x;

                let obs = get_face(18u, idx);
                if (obs > 0.5) { 
                    set_face(19u, idx, 0.0);
                    set_face(20u, idx, 0.0);
                    return; 
                }

                var rho: f32 = 0.0;
                var ux: f32 = 0.0;
                var uy: f32 = 0.0;

                for(var i: u32 = 0u; i < 9u; i = i + 1u) {
                    let f_val = get_face(i, idx);
                    rho = rho + f_val;
                    ux = ux + cx[i] * f_val;
                    uy = uy + cy[i] * f_val;
                }


                if (rho > 0.0) { ux = ux / rho; uy = uy / rho; }
                set_face(19u, idx, ux);
                set_face(20u, idx, uy);

                let u_sq = ux * ux + uy * uy;
                for(var i: u32 = 0u; i < 9u; i = i + 1u) {
                    let cu = cx[i] * ux + cy[i] * uy;
                    let feq = w[i] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * u_sq);
                    let f_post = get_face(i, idx) * (1.0 - config.omega) + feq * config.omega;

                    var nx: i32 = i32(x) + i32(cx[i]);
                    var ny: i32 = i32(y) + i32(cy[i]);
                    if (ny < 0) { ny = i32(N) - 1; } else if (ny >= i32(N)) { ny = 0; }
                    if (nx < 0 || nx >= i32(N)) { continue; }

                    let n_idx = u32(ny) * N + u32(nx);
                    if (get_face(18u, n_idx) > 0.5) {
                        set_face(opp[i] + 9u, idx, f_post);
                    } else {
                        set_face(i + 9u, n_idx, f_post);
                    }
                }
            }

            @compute @workgroup_size(16, 16)
            fn compute_vorticity(@builtin(global_invocation_id) id: vec3<u32>) {
                let x = id.x;
                let y = id.y;
                let N = config.mapSize;
                if (x == 0u || x >= N - 1u || y == 0u || y >= N - 1u) { return; }
                let idx = y * N + x;

                for(var i: u32 = 0u; i < 9u; i = i + 1u) {
                    set_face(i, idx, get_face(i + 9u, idx));
                }

                let xM = max(x, 2u) - 1u;      // clamp to 1 
                let xP = min(x + 1u, N - 2u);  // clamp to N-2
                let yM = max(y, 2u) - 1u;
                let yP = min(y + 1u, N - 2u);

                var dxDist: f32 = 2.0;
                if (x == 1u || x == N - 2u) { dxDist = 1.0; }

                var dyDist: f32 = 2.0;
                if (y == 1u || y == N - 2u) { dyDist = 1.0; }

                let dUy_dx = (get_face(20u, y * N + xP) - get_face(20u, y * N + xM)) / dxDist;
                let dUx_dy = (get_face(19u, yP * N + x) - get_face(19u, yM * N + x)) / dyDist;
                set_face(21u, idx, dUy_dx - dUx_dy);
            }
        `;
    }
}
