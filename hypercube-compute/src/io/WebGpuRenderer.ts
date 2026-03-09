import { HypercubeGPUContext } from '../core/gpu/HypercubeGPUContext';
import { HypercubeCpuGrid } from '../core/HypercubeCpuGrid';
import { HypercubeChunk } from '../core/HypercubeChunk';
import { NeoEngineProxy } from '../../hypercube-neo/core/NeoEngineProxy';
import { MasterBuffer as NeoMasterBuffer } from '../../hypercube-neo/core/MasterBuffer';
import { VirtualChunk as NeoVirtualChunk } from '../../hypercube-neo/core/GridAbstractions';

/**
 * WebGpuRenderer
 * Direct-to-VRAM Rendering. Read the float StorageBuffer from the Engine, 
 * run a WGSL Compute Shader to translate into RGBA8Unorm colors,
 * and copy directly to the Canvas context via WebGPU.
 */
export class WebGpuRenderer {
    private canvas: HTMLCanvasElement;
    private context: GPUCanvasContext;
    private format: GPUTextureFormat;

    private pipeline: GPUComputePipeline | null = null;
    private blitPipeline: GPURenderPipeline | null = null;
    private bindGroups: Map<HypercubeChunk, GPUBindGroup> = new Map();
    private blitBindGroup: GPUBindGroup | null = null;
    private uniformBuffer: GPUBuffer | null = null;

    // We render into a storage texture first, since compute shaders can't write to the canvas texture directly 
    // unless the format supports storage binding (bgra8unorm often doesn't on all devices).
    private storageTexture: GPUTexture | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('webgpu');
        if (!ctx) throw new Error("[WebGpuRenderer] Canvas does not support WebGPU.");
        this.context = ctx as unknown as GPUCanvasContext;

        // This format is required for the output texture
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: HypercubeGPUContext.device,
            format: this.format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
        });
    }

    private initPipelines() {
        if (this.pipeline) return;

        const device = HypercubeGPUContext.device;
        const computeShaderCode = `
            struct Uniforms {
                nx: u32,
                ny: u32,
                nz: u32,
                cellsPerFace: u32,
                faceIdx: u32,
                obsIdx: u32,
                minV: f32,
                maxV: f32,
                colormap: u32, // 0: gray, 1: heatmap, 2: arctic
                chunkX: u32,
                chunkY: u32,
                strideFace: u32,
                vortIdx: u32, // Added for blending
            };

            @group(0) @binding(0) var<storage, read> cube: array<f32>;
            @group(0) @binding(1) var<uniform> config: Uniforms;
            @group(0) @binding(2) var outTexture: texture_storage_2d<rgba8unorm, write>;

            @compute @workgroup_size(16, 16)
            fn compute_render(@builtin(global_invocation_id) id: vec3<u32>) {
                let lx = id.x + 1u; // Offset interior
                let ly = id.y + 1u;

                if (lx >= config.nx - 1u || ly >= config.ny - 1u) { return; }

                let srcIdx = ly * config.nx + lx;
                
                // Obstacles check
                if (config.obsIdx < 100u) {
                    let obsV = cube[config.obsIdx * config.strideFace + srcIdx];
                    if (obsV > 0.5) {
                        let outPos = vec2<u32>(
                            id.x + config.chunkX * (config.nx - 2u),
                            id.y + config.chunkY * (config.ny - 2u)
                        );
                        textureStore(outTexture, outPos, vec4<f32>(0.25, 0.25, 0.25, 1.0));
                        return;
                    }
                }

                let rawVal = cube[config.faceIdx * config.strideFace + srcIdx];
                let norm = clamp((rawVal - config.minV) / (config.maxV - config.minV + 0.00001), 0.0, 1.0);
                
                var r: f32 = norm;
                var g: f32 = norm;
                var b: f32 = norm;

                if (config.colormap == 1u) { // Heatmap
                    r = norm;
                    g = select(0.0, (norm - 0.5) * 2.0, norm > 0.5);
                    b = norm * 0.2;
                } else if (config.colormap == 2u) { // Arctic
                    // Base light blue (180, 220, 255) / 255
                    r = 0.706; g = 0.863; b = 1.0;
                    
                    let ts = norm * (2.0 - norm); // Linear approx of power
                    r = r * (1.0 - ts) + 0.059 * ts; // Blend to Navy (15, 30, 80)
                    g = g * (1.0 - ts) + 0.118 * ts;
                    b = b * (1.0 - ts) + 0.314 * ts;

                    // Smoke Visualization (Arctic Navy Blue)
                    if (norm > 0.001) { 
                        let t = clamp(norm * 5.0, 0.0, 1.0); 
                        // Dark Navy Blue (#001f3f) -> r=0, g=31, b=63
                        r = r * (1.0 - t) + 0.0 * t;
                        g = g * (1.0 - t) + 0.12 * t;
                        b = b * (1.0 - t) + 0.25 * t;
                    }

                    // Vorticity Highlights (if enabled)
                    if (config.vortIdx < 100u) {
                        let vRaw = cube[config.vortIdx * config.strideFace + srcIdx];
                        let vMag = clamp(abs(vRaw) * 15.0, 0.0, 1.0);
                        if (vMag > 0.02) {
                            let tc = clamp((vMag - 0.02) * 1.5, 0.0, 1.0);
                            r = r * (1.0 - tc) + 1.0 * tc; // Red highlights
                            g = g * (1.0 - tc);
                            b = b * (1.0 - tc);
                        }
                    }
                }

                let outPos = vec2<u32>(
                    id.x + config.chunkX * (config.nx - 2u),
                    id.y + config.chunkY * (config.ny - 2u)
                );
                textureStore(outTexture, outPos, vec4<f32>(r, g, b, 1.0));
            }
        `;

        const computeModule = device.createShaderModule({ code: computeShaderCode });
        this.pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: computeModule, entryPoint: 'compute_render' }
        });

        const blitShaderCode = `
            @vertex
            fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
                const pos = array(
                    vec2f(-1.0, -1.0),
                    vec2f( 3.0, -1.0),
                    vec2f(-1.0,  3.0)
                );
                return vec4f(pos[vertexIndex], 0.0, 1.0);
            }

            @group(0) @binding(0) var t: texture_2d<f32>;

            @fragment
            fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
                // Use i32 for textureLoad
                return textureLoad(t, vec2i(pos.xy), 0);
            }
        `;

        const blitModule = device.createShaderModule({ code: blitShaderCode });
        this.blitPipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: blitModule, entryPoint: 'vs_main' },
            fragment: {
                module: blitModule,
                entryPoint: 'fs_main',
                targets: [{ format: this.format }]
            },
            primitive: { topology: 'triangle-list' }
        });

        const uniformSize = 9 * 4; // 9 floats/uints
        this.uniformBuffer = device.createBuffer({
            size: Math.ceil(uniformSize / 16) * 16, // align 16
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    public resize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.context.configure({
            device: HypercubeGPUContext.device,
            format: this.format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
        });
        this.blitBindGroup = null; // Re-create on next render
    }

    public renderNeo(
        proxy: NeoEngineProxy,
        options: {
            faceIndex: number,
            colormap: 'grayscale' | 'heatmap' | 'arctic',
            minVal?: number,
            maxVal?: number,
            sliceZ?: number,
            obstaclesFace?: number,
            vorticityFace?: number
        }
    ) {
        if (!HypercubeGPUContext.device) return;
        this.initPipelines();

        const vGrid = proxy.vGrid;
        const mBuffer = proxy.mBuffer as NeoMasterBuffer;
        if (!mBuffer.gpuBuffer) return;

        const nx = Math.floor(vGrid.dimensions.nx / vGrid.chunkLayout.x);
        const ny = Math.floor(vGrid.dimensions.ny / vGrid.chunkLayout.y);
        const vnx = nx;
        const vny = ny;
        const totalW = vnx * vGrid.chunkLayout.x;
        const totalH = vny * vGrid.chunkLayout.y;

        // Ensure storage texture for composition
        if (!this.storageTexture || this.storageTexture.width !== totalW || this.storageTexture.height !== totalH) {
            if (this.storageTexture) this.storageTexture.destroy();
            this.storageTexture = HypercubeGPUContext.device.createTexture({
                size: [totalW, totalH, 1],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
            });
            this.bindGroups.clear();
            this.blitBindGroup = null;
        }

        const device = HypercubeGPUContext.device;
        const commandEncoder = device.createCommandEncoder();

        // 1. Prepare Uniform Buffer for ALL chunks (Dynamic Offsets)
        // Each chunk needs its own 256-byte aligned parameters to avoid corruption
        const paramsPerChunk = 13; // 13 uint32/float32
        const bytesPerChunkAligned = 256;
        const totalUniformSize = vGrid.chunks.length * bytesPerChunkAligned;

        if (!this.uniformBuffer || this.uniformBuffer.size < totalUniformSize) {
            if (this.uniformBuffer) this.uniformBuffer.destroy();
            this.uniformBuffer = device.createBuffer({
                size: totalUniformSize,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: 'Neo Renderer Uniforms'
            });
            this.bindGroups.clear();
        }

        const u32Data = new Uint32Array(vGrid.chunks.length * (bytesPerChunkAligned / 4));
        const facesPerChunk = mBuffer.totalSlotsPerChunk;
        const strideFaceBytes = mBuffer.strideFace * 4;

        for (let i = 0; i < vGrid.chunks.length; i++) {
            const chunk = vGrid.chunks[i];
            const base = i * (bytesPerChunkAligned / 4);
            const f32 = new Float32Array(u32Data.buffer);

            u32Data[base + 0] = nx + 2;
            u32Data[base + 1] = ny + 2;
            u32Data[base + 2] = 1;
            u32Data[base + 3] = (nx + 2) * (ny + 2);
            u32Data[base + 4] = options.faceIndex;
            u32Data[base + 5] = options.obstaclesFace ?? 999;
            f32[base + 6] = options.minVal ?? 0;
            f32[base + 7] = options.maxVal ?? 1;
            u32Data[base + 8] = options.colormap === 'heatmap' ? 1 : (options.colormap === 'arctic' ? 2 : 0);
            u32Data[base + 9] = chunk.x;
            u32Data[base + 10] = chunk.y;
            u32Data[base + 11] = mBuffer.strideFace;
            u32Data[base + 12] = options.vorticityFace ?? 999;
        }
        device.queue.writeBuffer(this.uniformBuffer!, 0, u32Data);

        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(this.pipeline!);
        const view = this.storageTexture.createView();

        for (let i = 0; i < vGrid.chunks.length; i++) {
            const chunk = vGrid.chunks[i];
            const chunkBufferOffset = i * facesPerChunk * strideFaceBytes;
            const uniformOffset = i * bytesPerChunkAligned;

            // Cache or create bind group with DYNAMIC offset support? 
            // For simplicity here, we'll use static offsets in separate bind groups, 
            // but mapped to the large buffer.
            const bgKey = `neo-${i}-${chunkBufferOffset}-${uniformOffset}`;
            let bg = (this as any).neoBindGroups?.get(bgKey);
            if (!bg) {
                if (!(this as any).neoBindGroups) (this as any).neoBindGroups = new Map();
                bg = device.createBindGroup({
                    layout: this.pipeline!.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: { buffer: mBuffer.gpuBuffer, offset: chunkBufferOffset, size: facesPerChunk * strideFaceBytes } },
                        { binding: 1, resource: { buffer: this.uniformBuffer!, offset: uniformOffset, size: 256 } },
                        { binding: 2, resource: view }
                    ]
                });
                (this as any).neoBindGroups.set(bgKey, bg);
            }

            pass.setBindGroup(0, bg);
            pass.dispatchWorkgroups(Math.ceil((nx) / 16), Math.ceil((ny) / 16), 1);
        }
        pass.end();

        // 3. Final Blit Pass
        const canvasTexture = this.context.getCurrentTexture();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: canvasTexture.createView(),
                loadOp: 'clear',
                clearValue: { r: 0.01, g: 0.02, b: 0.03, a: 1 }, // Dark navy background
                storeOp: 'store'
            }]
        });

        if (!this.blitBindGroup) {
            this.blitBindGroup = device.createBindGroup({
                layout: this.blitPipeline!.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: view }]
            });
        }

        renderPass.setPipeline(this.blitPipeline!);
        renderPass.setBindGroup(0, this.blitBindGroup);
        renderPass.draw(3, 1, 0, 0);
        renderPass.end();

        device.queue.submit([commandEncoder.finish()]);
    }

    public render(
        grid: HypercubeCpuGrid,
        options: {
            faceIndex: number,
            colormap: 'grayscale' | 'heatmap' | 'vorticity' | 'ocean',
            minVal?: number,
            maxVal?: number,
            sliceZ?: number,
            obstaclesFace?: number
        }
    ) {
        if (!HypercubeGPUContext.device) return;
        this.initPipelines();

        // Ensure texture exists and matches the grid's visual size
        const vnx = grid.nx - 2;
        const vny = grid.ny - 2;
        const totalW = vnx * grid.cols;
        const totalH = vny * grid.rows;

        // Ensure texture size matches canvas and logic
        if (!this.storageTexture || this.storageTexture.width !== totalW || this.storageTexture.height !== totalH) {
            if (this.storageTexture) this.storageTexture.destroy();
            this.storageTexture = HypercubeGPUContext.device.createTexture({
                size: [totalW, totalH, 1],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
            });
            this.bindGroups.clear(); // Rebind since texture changed
            this.blitBindGroup = null;
        }

        const device = HypercubeGPUContext.device;
        const commandEncoder = device.createCommandEncoder();

        // 1. Update Uniforms
        const u32 = new Uint32Array(12);
        const f32 = new Float32Array(u32.buffer);
        u32[0] = grid.nx; u32[1] = grid.ny; u32[2] = grid.nz; u32[3] = grid.nx * grid.ny * grid.nz;
        u32[4] = options.faceIndex; u32[5] = options.obstaclesFace ?? 999;
        f32[6] = options.minVal ?? 0; f32[7] = options.maxVal ?? 1;
        u32[8] = options.colormap === 'heatmap' ? 1 : (options.colormap === 'vorticity' ? 2 : 0);

        device.queue.writeBuffer(this.uniformBuffer!, 0, u32.buffer);

        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(this.pipeline!);

        // 2. Dispatch chunks
        const view = this.storageTexture.createView();

        for (let gy = 0; gy < grid.rows; gy++) {
            for (let gx = 0; gx < grid.cols; gx++) {
                const chunk = grid.cubes[gy][gx];
                if (!chunk || !chunk.gpuBuffer) continue;

                // Create or reuse bindgroup (if texture/buffer hasn't changed)
                let bg = this.bindGroups.get(chunk);
                if (!bg) {
                    bg = device.createBindGroup({
                        layout: this.pipeline!.getBindGroupLayout(0),
                        entries: [
                            { binding: 0, resource: { buffer: chunk.gpuBuffer } },
                            { binding: 1, resource: { buffer: this.uniformBuffer! } },
                            { binding: 2, resource: view }
                        ]
                    });
                    this.bindGroups.set(chunk, bg);
                }

                pass.setBindGroup(0, bg);
                pass.dispatchWorkgroups(Math.ceil(vnx / 16), Math.ceil(vny / 16), 1);
            }
        }
        pass.end();

        // 3. Blit from Storage Texture to Canvas Texture using a render pass
        const canvasTexture = this.context.getCurrentTexture();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: canvasTexture.createView(),
                loadOp: 'clear',
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                storeOp: 'store'
            }]
        });

        if (!this.blitBindGroup) {
            this.blitBindGroup = device.createBindGroup({
                layout: this.blitPipeline!.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: view }]
            });
        }

        renderPass.setPipeline(this.blitPipeline!);
        renderPass.setBindGroup(0, this.blitBindGroup);
        renderPass.draw(3, 1, 0, 0);
        renderPass.end();

        device.queue.submit([commandEncoder.finish()]);
    }
}
