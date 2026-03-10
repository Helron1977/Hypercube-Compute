import { HypercubeGPUContext } from '../core/gpu/HypercubeGPUContext';
import { NeoEngineProxy } from '../core/NeoEngineProxy';
import { MasterBuffer as NeoMasterBuffer } from '../core/MasterBuffer';

export interface RenderOptions {
    faceIndex: number;
    colormap: 'grayscale' | 'heatmap' | 'arctic';
    minVal?: number;
    maxVal?: number;
    obstaclesFace?: number;
    vorticityFace?: number;
    sliceZ?: number;
}

/**
 * WebGpuRendererNeo
 * Neo-native Direct-to-VRAM Rendering.
 * Efficiently assembles multi-chunk buffers directly in WebGPU.
 */
export class WebGpuRendererNeo {
    private canvas: HTMLCanvasElement;
    private context: GPUCanvasContext;
    private format: GPUTextureFormat;

    private pipeline: GPUComputePipeline | null = null;
    private blitPipeline: GPURenderPipeline | null = null;
    private blitBindGroup: GPUBindGroup | null = null;
    private uniformBuffer: GPUBuffer | null = null;
    private storageTexture: GPUTexture | null = null;
    private neoBindGroups: Map<string, GPUBindGroup> = new Map();

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('webgpu');
        if (!ctx) throw new Error("[WebGpuRendererNeo] Canvas does not support WebGPU.");
        this.context = ctx as unknown as GPUCanvasContext;

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
                colormap: u32, 
                chunkX: u32,
                chunkY: u32,
                strideFace: u32,
                vortIdx: u32,
            };

            @group(0) @binding(0) var<storage, read> cube: array<f32>;
            @group(0) @binding(1) var<uniform> config: Uniforms;
            @group(0) @binding(2) var outTexture: texture_storage_2d<rgba8unorm, write>;

            @compute @workgroup_size(16, 16)
            fn compute_render(@builtin(global_invocation_id) id: vec3<u32>) {
                let lx = id.x + 1u; 
                let ly = id.y + 1u;

                if (lx >= config.nx - 1u || ly >= config.ny - 1u) { return; }

                let srcIdx = ly * config.nx + lx;
                
                let outPos = vec2<u32>(
                    id.x + config.chunkX * (config.nx - 2u),
                    id.y + config.chunkY * (config.ny - 2u)
                );

                // 1. Obstacles (Priority)
                if (config.obsIdx < 100u) {
                    let obsV = cube[config.obsIdx * config.strideFace + srcIdx];
                    if (obsV > 0.5) {
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
                } else if (config.colormap == 2u) { // Arctic (Consistent with CanvasAdapterNeo)
                    r = 0.706; g = 0.863; b = 1.0; // Base light blue
                    let ts = norm * (2.0 - norm);
                    r = r * (1.0 - ts) + 0.059 * ts; // Blend to Navy
                    g = g * (1.0 - ts) + 0.118 * ts;
                    b = b * (1.0 - ts) + 0.314 * ts;

                    // Vorticity Highlights
                    if (config.vortIdx < 100u) {
                        let vRaw = cube[config.vortIdx * config.strideFace + srcIdx];
                        let vMag = clamp(abs(vRaw) * 120.0, 0.0, 1.0);
                        if (vMag > 0.05) {
                            let tc = clamp((vMag - 0.05) * 1.5, 0.0, 1.0);
                            r = r * (1.0 - tc) + 1.0 * tc; 
                            g = g * (1.0 - tc);
                            b = b * (1.0 - tc);
                        }
                    }
                }

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

        this.uniformBuffer = device.createBuffer({
            size: 1024, // Plenty for params
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    public render(
        proxy: NeoEngineProxy,
        options: RenderOptions
    ) {
        if (!HypercubeGPUContext.device) return;
        this.initPipelines();

        const vGrid = proxy.vGrid;
        const mBuffer = proxy.mBuffer as NeoMasterBuffer;
        if (!mBuffer.gpuBuffer) return;

        const nx = Math.floor(vGrid.dimensions.nx / vGrid.chunkLayout.x);
        const ny = Math.floor(vGrid.dimensions.ny / vGrid.chunkLayout.y);
        const totalW = vGrid.dimensions.nx;
        const totalH = vGrid.dimensions.ny;

        // Ensure storage texture
        if (!this.storageTexture || this.storageTexture.width !== totalW || this.storageTexture.height !== totalH) {
            if (this.storageTexture) this.storageTexture.destroy();
            this.storageTexture = HypercubeGPUContext.device.createTexture({
                size: [totalW, totalH, 1],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
            });
            this.neoBindGroups.clear();
            this.blitBindGroup = null;
        }

        const device = HypercubeGPUContext.device;
        const commandEncoder = device.createCommandEncoder();

        const bytesPerChunkAligned = 256;
        const totalUniformSize = vGrid.chunks.length * bytesPerChunkAligned;
        if (this.uniformBuffer!.size < totalUniformSize) {
            // Resize if needed (unlikely for fixed grid)
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
            const chunkBufferOffset = i * facesPerChunk * strideFaceBytes;
            const uniformOffset = i * bytesPerChunkAligned;

            const bgKey = `${i}-${chunkBufferOffset}-${uniformOffset}-${this.storageTexture.width}`;
            let bg = this.neoBindGroups.get(bgKey);
            if (!bg) {
                bg = device.createBindGroup({
                    layout: this.pipeline!.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: { buffer: mBuffer.gpuBuffer, offset: chunkBufferOffset, size: facesPerChunk * strideFaceBytes } },
                        { binding: 1, resource: { buffer: this.uniformBuffer!, offset: uniformOffset, size: 256 } },
                        { binding: 2, resource: view }
                    ]
                });
                this.neoBindGroups.set(bgKey, bg);
            }

            pass.setBindGroup(0, bg);
            pass.dispatchWorkgroups(Math.ceil((nx) / 16), Math.ceil((ny) / 16), 1);
        }
        pass.end();

        const canvasTexture = this.context.getCurrentTexture();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: canvasTexture.createView(),
                loadOp: 'clear',
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1 },
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
