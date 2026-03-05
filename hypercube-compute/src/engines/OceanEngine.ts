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
 */
export class OceanEngine implements IHypercubeEngine {
    public get name(): string {
        return "OceanEngine";
    }

    public getRequiredFaces(): number {
        return 25; // Suite faces 0-17 + 18-24
    }

    public getSyncFaces(): number[] {
        // In Ping-Pong mode, we sync the faces that were just WRITTEN.
        // If parity is 0, we just wrote to 9-17 and 24.
        // If parity is 1, we just wrote to 0-8 and 23.
        const pops = this.parity === 0 ? [9, 10, 11, 12, 13, 14, 15, 16, 17] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
        const bio = this.parity === 0 ? [24] : [23];
        // We sync macros (19, 20, 22) for visual consistency and advection stability
        return [...pops, ...bio, 19, 20, 22];
    }

    public getParity(): number {
        return this.parity;
    }

    private readonly w = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
    private readonly cx = [0, 1, 0, -1, 0, 1, -1, -1, 1];
    private readonly cy = [0, 0, 1, 0, -1, 1, 1, -1, -1];
    private readonly opp = [0, 3, 4, 1, 2, 7, 8, 5, 6];

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
            ...this.params,
            parity: this.parity
        };
    }

    public applyConfig(config: any): void {
        if (config.tau_0 !== undefined) this.params.tau_0 = config.tau_0;
        if (config.smagorinsky !== undefined) this.params.smagorinsky = config.smagorinsky;
        if (config.cflLimit !== undefined) this.params.cflLimit = config.cflLimit;
        if (config.bioDiffusion !== undefined) this.params.bioDiffusion = config.bioDiffusion;
        if (config.bioGrowth !== undefined) this.params.bioGrowth = config.bioGrowth;
        if (config.closedBounds !== undefined) this.params.closedBounds = config.closedBounds;
        if (config.parity !== undefined) this.parity = config.parity;
    }

    private pipelineLBM: GPUComputePipeline | null = null;
    private pipelineBio: GPUComputePipeline | null = null;
    private uniformBuffer: GPUBuffer | null = null;
    private lastStride: number = 0;
    public parity: number = 0;
    public gpuEnabled: boolean = false;

    public initGPU(device: GPUDevice, readBuffer: GPUBuffer, writeBuffer: GPUBuffer, stride: number, nx: number, ny: number, nz: number): void {
        this.lastStride = stride / 4;
        const shaderModule = device.createShaderModule({ code: this.getWgslSource() });

        const bindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
            ]
        });
        const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

        this.pipelineLBM = device.createComputePipeline({
            layout: pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'compute_lbm' }
        });

        this.pipelineBio = device.createComputePipeline({
            layout: pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'compute_bio' }
        });

        this.uniformBuffer = device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.gpuEnabled = true;
    }

    public computeGPU(device: GPUDevice, commandEncoder: GPUCommandEncoder, nx: number, ny: number, nz: number, readBuffer: GPUBuffer, writeBuffer: GPUBuffer): void {
        if (!this.pipelineLBM || !this.pipelineBio || !this.uniformBuffer) return;

        const uniformSize = 16 * 4;
        const uniformData = new ArrayBuffer(uniformSize);
        const u32 = new Uint32Array(uniformData);
        const f32 = new Float32Array(uniformData);

        u32[0] = nx; u32[1] = ny; u32[2] = nz; u32[3] = this.lastStride;
        f32[4] = this.params.tau_0; f32[5] = this.params.smagorinsky;
        f32[6] = this.params.cflLimit; f32[7] = this.params.closedBounds ? 1.0 : 0.0;
        f32[8] = this.params.bioDiffusion; f32[9] = this.params.bioGrowth;
        u32[10] = this.parity;
        device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

        const bindGroup = device.createBindGroup({
            layout: this.pipelineLBM.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: readBuffer } },
                { binding: 1, resource: { buffer: writeBuffer } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        const passLBM = commandEncoder.beginComputePass();
        passLBM.setBindGroup(0, bindGroup);
        passLBM.setPipeline(this.pipelineLBM);
        passLBM.dispatchWorkgroups(Math.ceil(nx / 16), Math.ceil(ny / 16), nz || 1);
        passLBM.end();

        const passBio = commandEncoder.beginComputePass();
        passBio.setBindGroup(0, bindGroup);
        passBio.setPipeline(this.pipelineBio);
        passBio.dispatchWorkgroups(Math.ceil(nx / 16), Math.ceil(ny / 16), nz || 1);
        passBio.end();
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
        if (isWorker) return;

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
                faces[23][idx] = 0.01;

                for (let k = 0; k < 9; k++) {
                    const cu = 3 * (this.cx[k] * u0 + this.cy[k] * v0);
                    const feq = this.w[k] * rho0 * (1 + cu + 0.5 * cu * cu - 1.5 * u2);
                    faces[k][idx] = feq;
                    faces[k + 9][idx] = feq;
                }
            }
        }
    }

    compute(faces: Float32Array[], nx: number, ny: number, nz: number): void {
        for (let lz = 0; lz < nz; lz++) {
            this.stepLBM(faces, nx, ny, lz);
            this.stepBio(faces, nx, ny, lz);
        }
    }

    private stepLBM(faces: Float32Array[], nx: number, ny: number, lz: number): void {
        const rho = faces[22], ux = faces[19], uy = faces[20], obst = faces[18];
        const zOff = lz * ny * nx;

        const f_in_indices = this.parity === 0 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [9, 10, 11, 12, 13, 14, 15, 16, 17];
        const f_out_indices = this.parity === 0 ? [9, 10, 11, 12, 13, 14, 15, 16, 17] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
        const invTau = 1.0 / (this.params.tau_0 + 1e-6);

        const in0 = faces[f_in_indices[0]], in1 = faces[f_in_indices[1]], in2 = faces[f_in_indices[2]], in3 = faces[f_in_indices[3]], in4 = faces[f_in_indices[4]], in5 = faces[f_in_indices[5]], in6 = faces[f_in_indices[6]], in7 = faces[f_in_indices[7]], in8 = faces[f_in_indices[8]];
        const out0 = faces[f_out_indices[0]], out1 = faces[f_out_indices[1]], out2 = faces[f_out_indices[2]], out3 = faces[f_out_indices[3]], out4 = faces[f_out_indices[4]], out5 = faces[f_out_indices[5]], out6 = faces[f_out_indices[6]], out7 = faces[f_out_indices[7]], out8 = faces[f_out_indices[8]];

        const isClosed = this.params.closedBounds;

        for (let y = 1; y < ny - 1; y++) {
            for (let x = 1; x < nx - 1; x++) {
                const i = zOff + y * nx + x;
                if (obst[i] > 0.5) {
                    for (let k = 0; k < 9; k++) faces[f_out_indices[k]][i] = this.w[k];
                    continue;
                }

                const pf = this.pulled_f;
                pf[0] = in0[i];
                for (let k = 1; k < 9; k++) {
                    let sx = x - this.cx[k];
                    let sy = y - this.cy[k];
                    let bounce = false;
                    if (isClosed) {
                        if (sx < 0 || sx >= nx || sy < 0 || sy >= ny) bounce = true;
                    }
                    if (!bounce) {
                        const ni = zOff + sy * nx + sx;
                        if (obst[ni] > 0.5) bounce = true;
                        else pf[k] = faces[f_in_indices[k]][ni];
                    }
                    if (bounce) pf[k] = faces[f_in_indices[this.opp[k]]][i];
                }

                let r = 0; for (let k = 0; k < 9; k++) r += pf[k];

                // Stability Guard: Detect NaNs or extreme values and "heal" the simulation
                if (isNaN(r) || r < 0.1 || r > 10.0) {
                    r = 1.0;
                    for (let k = 0; k < 9; k++) pf[k] = this.w[k];
                }

                let vx = (pf[1] + pf[5] + pf[8] - (pf[3] + pf[6] + pf[7])) / (r + 1e-6);
                let vy = (pf[2] + pf[5] + pf[6] - (pf[4] + pf[7] + pf[8])) / (r + 1e-6);

                // CFL Limit (Numerical Stability)
                const vMagSq = vx * vx + vy * vy;
                if (vMagSq > this.params.cflLimit * this.params.cflLimit) {
                    const scale = this.params.cflLimit / Math.sqrt(vMagSq);
                    vx *= scale;
                    vy *= scale;
                }

                rho[i] = r; ux[i] = vx; uy[i] = vy;
                const u2 = vx * vx + vy * vy;
                for (let k = 0; k < 9; k++) {
                    const cu = 3 * (this.cx[k] * vx + this.cy[k] * vy);
                    const feq = this.w[k] * r * (1 + cu + 0.5 * cu * cu - 1.5 * u2);
                    faces[f_out_indices[k]][i] = pf[k] - (pf[k] - feq) * invTau;
                }
            }
        }
    }

    private stepBio(faces: Float32Array[], nx: number, ny: number, lz: number): void {
        const b_in = faces[this.parity === 0 ? 23 : 24];
        const b_out = faces[this.parity === 0 ? 24 : 23];
        const ux = faces[19], uy = faces[20];
        const diff = this.params.bioDiffusion;
        const growth = this.params.bioGrowth;
        const zOff = lz * ny * nx;

        for (let y = 1; y < ny - 1; y++) {
            for (let x = 1; x < nx - 1; x++) {
                const i = zOff + y * nx + x;
                const bo = b_in[i];
                const lap = b_in[i - 1] + b_in[i + 1] + b_in[i - nx] + b_in[i + nx] - 4 * bo;
                const ax = Math.max(1, Math.min(nx - 2, x - ux[i] * 0.8));
                const ay = Math.max(1, Math.min(ny - 2, y - uy[i] * 0.8));
                const ix = Math.floor(ax); const iy = Math.floor(ay);
                const fx = ax - ix; const fy = ay - iy;
                const v00 = b_in[zOff + iy * nx + ix];
                const v10 = b_in[zOff + iy * nx + (ix + 1)];
                const v01 = b_in[zOff + (iy + 1) * nx + ix];
                const v11 = b_in[zOff + (iy + 1) * nx + (ix + 1)];
                const advected = (1 - fy) * ((1 - fx) * v00 + fx * v10) + fy * ((1 - fx) * v01 + fx * v11);
                let next = advected + diff * lap + growth * bo * (1 - bo);
                b_out[i] = Math.max(0, Math.min(1, next));
            }
        }
    }

    private getWgslSource(): string {
        return `
            struct Uniforms {
                nx: u32, ny: u32, nz: u32, strideFace: u32,
                tau_0: f32, smagorinsky: f32, cflLimit: f32, isClosed: f32,
                bioDiffusion: f32, bioGrowth: f32, parity: u32, pad2: f32, pad3: f32, pad4: f32, pad5: f32, pad6: f32
            };

            @group(0) @binding(0) var<storage, read> cube_in: array<f32>;
            @group(0) @binding(1) var<storage, read_write> cube_out: array<f32>;
            @group(0) @binding(2) var<uniform> config: Uniforms;

            const cx: array<i32, 9> = array<i32, 9>(0, 1, 0, -1, 0, 1, -1, -1, 1);
            const cy: array<i32, 9> = array<i32, 9>(0, 0, 1, 0, -1, 1, 1, -1, -1);
            const w: array<f32, 9> = array<f32, 9>(0.44444444, 0.11111111, 0.11111111, 0.11111111, 0.11111111, 0.02777777, 0.02777777, 0.02777777, 0.02777777);
            const opp: array<u32, 9> = array<u32, 9>(0u, 3u, 4u, 1u, 2u, 7u, 8u, 5u, 6u);

            @compute @workgroup_size(16, 16, 1)
            fn compute_lbm(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let x = i32(global_id.x);
                let y = i32(global_id.y);
                let z = i32(global_id.z);
                let nx = i32(config.nx);
                let ny = i32(config.ny);
                let stride = config.strideFace;

                if (x >= nx || y >= ny || z >= i32(config.nz)) { return; }
                let idx = u32(z) * u32(nx) * u32(ny) + u32(y) * u32(nx) + u32(x);

                // Boundary Guard: Preserve Ghost Cells (handled by CPU Grid Sync)
                if (x <= 0 || y <= 0 || x >= nx - 1 || y >= ny - 1) {
                    for (var k = 0u; k < 25u; k = k + 1u) {
                        cube_out[k * stride + idx] = cube_in[k * stride + idx];
                    }
                    return;
                }

                let f_in_base = config.parity * 9u * stride;
                let f_out_base = (1u - config.parity) * 9u * stride;

                let obst = cube_in[18u * stride + idx];
                if (obst > 0.5) {
                    for (var k = 0u; k < 9u; k = k + 1u) {
                        cube_out[f_out_base + k * stride + idx] = w[k];
                    }
                    cube_out[18u * stride + idx] = 1.0;
                    return;
                }
                cube_out[18u * stride + idx] = 0.0;

                var pf: array<f32, 9>;
                pf[0] = cube_in[f_in_base + 0u * stride + idx];
                let isClosed = config.isClosed > 0.5;

                for (var k = 1u; k < 9u; k = k + 1u) {
                    var sx = x - cx[k];
                    var sy = y - cy[k];
                    var bounce = false;

                    if (sx < 0 || sx >= nx || sy < 0 || sy >= ny) {
                        if (isClosed) { bounce = true; }
                        else { 
                            // This part should technically use ghost cells
                            // but in 1x1 or when sx/sy reach neighbors, 
                            // normalize to 0..nx-1 if not handled by sync.
                        }
                    }

                    if (bounce) {
                        pf[k] = cube_in[f_in_base + opp[k] * stride + idx];
                    } else {
                        let nx_u_loc = u32(nx);
                        let ny_u_loc = u32(ny);
                        let nz_u_loc = u32(config.nz);
                        let n_idx = u32(z) * nx_u_loc * ny_u_loc + u32(sy) * nx_u_loc + u32(sx);
                        
                        if (cube_in[18u * stride + n_idx] > 0.5) {
                            pf[k] = cube_in[f_in_base + opp[k] * stride + idx];
                        } else {
                            pf[k] = cube_in[f_in_base + k * stride + n_idx];
                        }
                    }
                }

                var r: f32 = 0.0;
                for (var k = 0u; k < 9u; k = k + 1u) { r += pf[k]; }

                var vx = (pf[1] + pf[5] + pf[8] - (pf[3] + pf[6] + pf[7])) / (r + 1e-6);
                var vy = (pf[2] + pf[5] + pf[6] - (pf[4] + pf[7] + pf[8])) / (r + 1e-6);

                let v_mag = sqrt(vx * vx + vy * vy);
                if (v_mag > config.cflLimit) {
                    vx *= (config.cflLimit / v_mag);
                    vy *= (config.cflLimit / v_mag);
                }

                cube_out[22u * stride + idx] = r;
                cube_out[19u * stride + idx] = vx;
                cube_out[20u * stride + idx] = vy;

                let u2 = vx * vx + vy * vy;
                let u2_15 = 1.5 * u2;
                let inv_tau = 1.0 / (config.tau_0 + 1e-5);

                for (var k = 0u; k < 9u; k = k + 1u) {
                    let cu = 3.0 * (f32(cx[k]) * vx + f32(cy[k]) * vy);
                    let feq = w[k] * r * (1.0 + cu + 0.5 * cu * cu - u2_15);
                    cube_out[f_out_base + k * stride + idx] = pf[k] - (pf[k] - feq) * inv_tau;
                }

                // Curl Calculation
                let ux_base = 19u * stride;
                let uy_base = 20u * stride;
                let curl_base = 21u * stride;

                let nx_u = u32(nx);
                let ny_u = u32(ny);

                let iz = u32(z) * nx_u * ny_u;
                let iy = u32(y) * nx_u;
                let ix = u32(x);
                let i_loc = iz + iy + ix;

                let xP_cur = u32(min(nx - 1, x + 1));
                let xM_cur = u32(max(0, x - 1));
                let yP_cur = u32(min(ny - 1, y + 1));
                let yM_cur = u32(max(0, y - 1));

                // dUy/dx = (uy[x+1] - uy[x-1]) * 0.5
                let dUy_dx = (cube_in[uy_base + iz + iy + xP_cur] - cube_in[uy_base + iz + iy + xM_cur]) * 0.5;
                // dUx/dy = (ux[y+1] - ux[y-1]) * 0.5
                let dUx_dy = (cube_in[ux_base + iz + yP_cur * nx_u + ix] - cube_in[ux_base + iz + yM_cur * nx_u + ix]) * 0.5;
                
                cube_out[curl_base + i_loc] = dUy_dx - dUx_dy;
            }

            @compute @workgroup_size(16, 16, 1)
            fn compute_bio(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let x = i32(global_id.x); let y = i32(global_id.y); let z = i32(global_id.z);
                let nx = i32(config.nx); let ny = i32(config.ny);
                if (x >= nx || y >= ny || z >= i32(config.nz)) { return; }
                let nx_u_bio = u32(nx);
                let idx = u32(z) * nx_u_bio * u32(ny) + u32(y) * nx_u_bio + u32(x);
                let stride = config.strideFace;

                let b_in_base = (23u + config.parity) * stride;
                let b_out_base = (23u + (1u - config.parity)) * stride;

                // Boundary Case
                if (x <= 0 || y <= 0 || x >= nx - 1 || y >= ny - 1) {
                    cube_out[b_out_base + idx] = cube_in[b_in_base + idx];
                    return;
                }

                let bo = cube_in[b_in_base + idx];
                let i_xM = idx - 1u; let i_xP = idx + 1u;
                let i_yM = idx - u32(nx); let i_yP = idx + u32(nx);
                let lap = cube_in[b_in_base + i_xM] + cube_in[b_in_base + i_xP] + cube_in[b_in_base + i_yM] + cube_in[b_in_base + i_yP] - 4.0 * bo;

                let ux = cube_in[19u * stride + idx];
                let uy = cube_in[20u * stride + idx];
                
                let ax = clamp(f32(x) - ux * 0.8, 1.0, f32(nx) - 2.0);
                let ay = clamp(f32(y) - uy * 0.8, 1.0, f32(ny) - 2.0);
                
                let ix_val = u32(ax); 
                let iy_val = u32(ay);
                let fx = ax - f32(ix_val); 
                let fy = ay - f32(iy_val);

                let nx_u_val = u32(nx);
                let b_zOff_val = u32(z) * nx_u_val * u32(ny);

                let v00 = cube_in[b_in_base + b_zOff_val + iy_val * nx_u_val + ix_val];
                let v10 = cube_in[b_in_base + b_zOff_val + iy_val * nx_u_val + (ix_val + 1u)];
                let v01 = cube_in[b_in_base + b_zOff_val + (iy_val + 1u) * nx_u_val + ix_val];
                let v11 = cube_in[b_in_base + b_zOff_val + (iy_val + 1u) * nx_u_val + (ix_val + 1u)];

                let advected = (1.0 - fy) * ((1.0 - fx) * v00 + fx * v10) + fy * ((1.0 - fx) * v01 + fx * v11);
                var next = advected + config.bioDiffusion * lap + config.bioGrowth * bo * (1.0 - bo);
                cube_out[b_out_base + idx] = clamp(next, 0.0, 1.0);
            }
        `;
    }
}
