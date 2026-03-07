import { AbstractGpuEngine } from './AbstractGpuEngine';
import { OceanV8Cpu } from './OceanV8Cpu';
import { V8_UNIFORM_WGSL } from '../core/UniformPresets';

/**
 * OceanV8Gpu - V8-Native GPU implementation of the Ocean Engine.
 * This class hosts the V8-aligned WGSL shader internally to avoid modifying legacy code.
 */
export class OceanV8Gpu extends AbstractGpuEngine {
    private pipelineLBM: GPUComputePipeline | null = null;
    private pipelineBio: GPUComputePipeline | null = null;
    public parity = 0;

    constructor() {
        super(OceanV8Cpu);
    }

    /**
     * @description Overriding initGPU to handle multiple compute passes.
     */
    public override initGPU(
        device: GPUDevice,
        readBuffer: GPUBuffer,
        writeBuffer: GPUBuffer,
        uniformBuffer: GPUBuffer,
        stride: number,
        nx: number,
        ny: number,
        nz: number
    ): void {
        this.initialReadBuffer = readBuffer;
        this.initialWriteBuffer = writeBuffer;

        const shaderSource = this.getShaderSource();
        const module = device.createShaderModule({ code: shaderSource });

        // V8 Standard Layout
        const layout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
            ]
        });

        const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });

        this.pipelineLBM = device.createComputePipeline({
            layout: pipelineLayout,
            compute: { module, entryPoint: 'compute_lbm' }
        });

        this.pipelineBio = device.createComputePipeline({
            layout: pipelineLayout,
            compute: { module, entryPoint: 'compute_bio' }
        });

        // Create BindGroups for both parities
        this.bindGroups[0] = device.createBindGroup({
            layout,
            entries: [
                { binding: 0, resource: { buffer: readBuffer } },
                { binding: 1, resource: { buffer: writeBuffer } },
                { binding: 2, resource: { buffer: uniformBuffer } }
            ]
        });

        this.bindGroups[1] = device.createBindGroup({
            layout,
            entries: [
                { binding: 0, resource: { buffer: writeBuffer } },
                { binding: 1, resource: { buffer: readBuffer } },
                { binding: 2, resource: { buffer: uniformBuffer } }
            ]
        });

        console.info(`[OceanV8Gpu] GPU Initialized with 2-pass compute pipeline.`);
    }

    /**
     * @description Overriding computeGPU to dispatch two passes.
     */
    public override computeGPU(
        device: GPUDevice,
        commandEncoder: GPUCommandEncoder,
        nx: number,
        ny: number,
        nz: number,
        readBuffer: GPUBuffer,
        writeBuffer: GPUBuffer
    ): void {
        if (!this.pipelineLBM || !this.pipelineBio) return;

        const currentParity = (readBuffer === this.initialReadBuffer) ? 0 : 1;
        const bindGroup = this.bindGroups[currentParity];

        const wx = Math.ceil(nx / 16);
        const wy = Math.ceil(ny / 16);

        // Pass 1: LBM
        const passLBM = commandEncoder.beginComputePass({ label: 'Ocean V8 LBM Pass' });
        passLBM.setPipeline(this.pipelineLBM);
        passLBM.setBindGroup(0, bindGroup);
        passLBM.dispatchWorkgroups(wx, wy, nz || 1);
        passLBM.end();

        // Pass 2: Bio
        const passBio = commandEncoder.beginComputePass({ label: 'Ocean V8 Bio Pass' });
        passBio.setPipeline(this.pipelineBio);
        passBio.setBindGroup(0, bindGroup);
        passBio.dispatchWorkgroups(wx, wy, nz || 1);
        passBio.end();

        // Parity Sync for V8 Framework
        (this as any).parity = (currentParity + 1) % 2;
        if (Math.random() < 0.01) console.log(`[OceanV8Gpu] Dispatched with parity ${currentParity}, next: ${this.parity}`);
    }

    protected getShaderSource(): string {
        return `
            ${V8_UNIFORM_WGSL}

            @group(0) @binding(0) var<storage, read> cube_in: array<f32>;
            @group(0) @binding(1) var<storage, read_write> cube_out: array<f32>;

            const cx = array<i32, 9>(0, 1, 0, -1, 0, 1, -1, -1, 1);
            const cy = array<i32, 9>(0, 0, 1, 0, -1, 1, 1, -1, -1);
            const w = array<f32, 9>(0.444444, 0.111111, 0.111111, 0.111111, 0.111111, 0.027778, 0.027778, 0.027778, 0.027778);
            const opp = array<u32, 9>(0u, 3u, 4u, 1u, 2u, 7u, 8u, 5u, 6u);

            @compute @workgroup_size(16, 16, 1)
            fn compute_lbm(@builtin(global_invocation_id) id: vec3<u32>) {
                let x = i32(id.x); let y = i32(id.y); let z = i32(id.z);
                if (x < 1 || y < 1 || x >= i32(u.nx) - 1 || y >= i32(u.ny) - 1) { return; }

                let idx = u32(z) * u32(u.nx) * u32(u.ny) + u32(y) * u32(u.nx) + u32(x);
                let stride = u32(u.stride / 4.0);
                
                // V8-Native Parity (swapped by AbstractGpuEngine)
                // In AbstractGpuEngine, we always write to cube_out at base index
                // but for LBM we need to handle the two population sets if the engine is legacy.
                // HOWEVER, if we are V8-Native, we can decide our own storage layout.
                // Let's assume we follow the legacy 25-face layout for compatibility with the renderer.
                
                let f_in = 0u; // AbstractGpuEngine swaps the buffers, so we always read from cube_in at 0
                let f_out = 9u * stride; // This is tricky if the legacy engine uses 18 faces for LBM

                // Actually, let's look at OceanShader.ts legacy logic:
                // let f_in = u.parity * 9u * stride;
                // let f_out = (1u - u.parity) * 9u * stride;
                
                // In V8 Sandbox mode, we should probably follow the V8 Uniform parity.
                let parity = u32(u.parity);
                let v8_f_in = parity * 9u * stride;
                let v8_f_out = (1u - parity) * 9u * stride;

                let tau_0 = u.params[0].x;
                let smagorinsky = u.params[1].x;
                let cflLimit = 0.38; // Default LBM safety

                let obst = cube_in[18u * stride + idx];
                cube_out[18u * stride + idx] = obst; 

                if (obst > 0.5) {
                    for (var k = 0u; k < 9u; k = k + 1u) {
                        cube_out[v8_f_out + k * stride + idx] = w[k];
                    }
                    return;
                }

                var pf: array<f32, 9>;
                pf[0] = cube_in[v8_f_in + 0u * stride + idx];

                for (var k = 1u; k < 9u; k = k + 1u) {
                    var sx = x - cx[k];
                    var sy = y - cy[k];
                    if (sx < 0 || sx >= i32(u.nx) || sy < 0 || sy >= i32(u.ny)) {
                        pf[k] = cube_in[v8_f_in + opp[k] * stride + idx];
                    } else {
                        let n_idx = u32(z) * u32(u.nx) * u32(u.ny) + u32(sy) * u32(u.nx) + u32(sx);
                        if (cube_in[18u * stride + n_idx] > 0.5) {
                            pf[k] = cube_in[v8_f_in + opp[k] * stride + idx];
                        } else {
                            pf[k] = cube_in[v8_f_in + k * stride + n_idx];
                        }
                    }
                }

                var r = 0.0;
                for (var k = 0u; k < 9u; k = k + 1u) { r += pf[k]; }
                
                if (r < 0.1 || r > 10.0) { 
                    r = 1.0; 
                    for (var k = 0u; k < 9u; k = k + 1u) { pf[k] = w[k]; }
                }

                var vx = (pf[1] + pf[5] + pf[8] - (pf[3] + pf[6] + pf[7])) / (r + 1e-6);
                var vy = (pf[2] + pf[5] + pf[6] - (pf[4] + pf[7] + pf[8])) / (r + 1e-6);
                
                // CFL Safety Clamp
                let v_mag = sqrt(vx * vx + vy * vy);
                if (v_mag > cflLimit) {
                    vx *= cflLimit / (v_mag + 1e-6);
                    vy *= cflLimit / (v_mag + 1e-6);
                }

                // Smagorinsky Turbulence (Optional enhancement)
                var S: f32 = 0.0;
                if (smagorinsky > 0.0) {
                   let cs = smagorinsky;
                   // (Simplified for performance)
                   let q1 = pf[1]-pf[3]; let q2 = pf[2]-pf[4];
                   S = cs * cs * sqrt(q1*q1 + q2*q2);
                }
                let effective_tau = tau_0 + S;

                cube_out[22u * stride + idx] = r;
                cube_out[19u * stride + idx] = vx;
                cube_out[20u * stride + idx] = vy;

                let u2_15 = 1.5 * (vx * vx + vy * vy);
                let inv_tau = 1.0 / (effective_tau + 1e-5);

                for (var k = 0u; k < 9u; k = k + 1u) {
                    let cu = 3.0 * (f32(cx[k]) * vx + f32(cy[k]) * vy);
                    let feq = w[k] * r * (1.0 + cu + 0.5 * cu * cu - u2_15);
                    cube_out[v8_f_out + k * stride + idx] = pf[k] - (pf[k] - feq) * inv_tau;
                }
            }

            @compute @workgroup_size(16, 16, 1)
            fn compute_bio(@builtin(global_invocation_id) id: vec3<u32>) {
                let x = i32(id.x); let y = i32(id.y); let z = i32(id.z);
                if (x < 1 || y < 1 || x >= i32(u.nx) - 1 || y >= i32(u.ny) - 1) { return; }

                let idx = u32(z) * u32(u.nx) * u32(u.ny) + u32(y) * u32(u.nx) + u32(x);
                let stride = u32(u.stride / 4.0);
                let parity = u32(u.parity);
                let b_in = (23u + parity) * stride;
                let b_out = (23u + (1u - parity)) * stride;

                let bioDiffusion = u.params[2].x;
                let bioGrowth = u.params[3].x;

                let bo = cube_in[b_in + idx];
                let lap = cube_in[b_in + idx - 1u] + cube_in[b_in + idx + 1u] + cube_in[b_in + idx - u32(u.nx)] + cube_in[b_in + idx + u32(u.nx)] - 4.0 * bo;

                // IMPORTANT: Use NEW velocity from cube_out (Pass 1 result)
                let ux = cube_out[19u * stride + idx];
                let uy = cube_out[20u * stride + idx];

                let ax = clamp(f32(x) - ux * 0.8, 1.0, u.nx - 2.0);
                let ay = clamp(f32(y) - uy * 0.8, 1.0, u.ny - 2.0);
                let ix = u32(ax); let iy = u32(ay);
                let fx = ax - f32(ix); let fy = ay - f32(iy);

                let base = u32(z) * u32(u.nx) * u32(u.ny);
                let v00 = cube_in[b_in + base + iy * u32(u.nx) + ix];
                let v10 = cube_in[b_in + base + iy * u32(u.nx) + ix + 1u];
                let v01 = cube_in[b_in + base + (iy + 1u) * u32(u.nx) + ix];
                let v11 = cube_in[b_in + base + (iy + 1u) * u32(u.nx) + ix + 1u];

                let adv = (1.0 - fy) * ((1.0 - fx) * v00 + fx * v10) + fy * ((1.0 - fx) * v01 + fx * v11);
                cube_out[b_out + idx] = clamp(adv + bioDiffusion * lap + bioGrowth * bo * (1.0 - bo), 0.0, 1.0);
            }
        `;
    }
}
