import { EngineDescriptor, NumericalScheme } from '../engines/EngineManifest';
import { IHypercubeEngine, FlatTensorView } from '../engines/IHypercubeEngine';
import { StencilHelper } from './helpers/StencilHelper';
import { AdvectionHelper } from './helpers/AdvectionHelper';
import { LbmHelper } from './helpers/LbmHelper';

/**
 * V8 Engine Shim - The Bridge between Declarative Manifests and Imperative Execution.
 * It executes the "rules" of the manifest on CPU or prepares the GPU pipeline.
 */
export class V8EngineShim implements IHypercubeEngine {
    public readonly name: string;
    public parity: number = 0;

    constructor(public readonly descriptor: EngineDescriptor) {
        this.name = descriptor.name;
    }

    getRequiredFaces(): number {
        return this.descriptor.faces.length;
    }

    init(faces: FlatTensorView[], nx: number, ny: number, nz: number, useWorkers: boolean): void {
        // Initialization from defaults in manifest
        this.descriptor.faces.forEach((face, i) => {
            if (face.defaultValue !== undefined) {
                faces[i].fill(face.defaultValue);
            }
        });
    }

    /**
     * @description CPU Computation Loop - Derived from Manifest Rules
     */
    async compute(faces: FlatTensorView[], nx: number, ny: number, nz: number): Promise<void> {
        if (!this.descriptor.rules) return;

        const stride = nx * ny * nz;
        const pSourceOffset = this.parity === 0 ? 0 : stride;
        const pDestOffset = this.parity === 0 ? stride : 0;

        const nextParity = (this.parity + 1) % 2;
        const obstIdx = this.descriptor.faces.findIndex(f => f.name === 'Obstacles');
        const obstacles = obstIdx !== -1 ? faces[obstIdx].subarray(0, stride) : undefined;

        for (const rule of this.descriptor.rules) {
            if (rule.type === 'lbm-d2q9' || (rule.type as any) === 'lbm-d2q9') {
                const omega = (this.descriptor.parameters?.find(p => p.name === 'omega')?.defaultValue as number) ?? 1.8;
                const pSource = [];
                const pDest = [];
                for (let k = 0; k < 9; k++) {
                    const fIdx = this.getFaceIndex(`P${k}`);
                    pSource.push(faces[fIdx].subarray(pSourceOffset, pSourceOffset + stride));
                    pDest.push(faces[fIdx].subarray(pDestOffset, pDestOffset + stride));
                }

                const uxIdx = this.descriptor.faces.findIndex(f => f.name === 'Velocity_X');
                const uyIdx = this.descriptor.faces.findIndex(f => f.name === 'Velocity_Y');

                LbmHelper.collideAndStream(
                    pSource, pDest, nx, ny, omega, 0, 0, obstacles,
                    uxIdx !== -1 ? faces[uxIdx].subarray(pDestOffset, pDestOffset + stride) : undefined,
                    uyIdx !== -1 ? faces[uyIdx].subarray(pDestOffset, pDestOffset + stride) : undefined
                );
                continue;
            }

            if (!rule.source) continue;

            let sourceIdx: number;
            try {
                sourceIdx = this.getFaceIndex(rule.source as string);
            } catch (err: any) {
                console.error(`[Worker CPU] [${this.name}] Rule ${rule.type} failed: ${err.message}`);
                throw err;
            }

            // Subarray Ping-Pong: swap halves of the SAME face
            const src = faces[sourceIdx].subarray(pSourceOffset, pSourceOffset + stride);
            const dst = faces[sourceIdx].subarray(pDestOffset, pDestOffset + stride);

            if (rule.type === 'diffusion') {
                const rate = (rule.params?.diffusionRate as number) ?? 0.1;
                StencilHelper.applyLaplacian(src, dst, nx, ny, nz, rate, obstacles);
            } else if (rule.type === 'advection') {
                const uxIdx = this.getFaceIndex('Velocity_X');
                const uyIdx = this.getFaceIndex('Velocity_Y');
                const uzIdx = this.descriptor.faces.findIndex(f => f.name === 'Velocity_Z');

                AdvectionHelper.semiLagrangian(
                    src, dst,
                    faces[uxIdx].subarray(pSourceOffset, pSourceOffset + stride),
                    faces[uyIdx].subarray(pSourceOffset, pSourceOffset + stride),
                    uzIdx !== -1 ? faces[uzIdx].subarray(pSourceOffset, pSourceOffset + stride) : undefined,
                    nx, ny, nz, 1.0, obstacles
                );
            }
        }
        this.parity = nextParity;
    }

    getSyncFaces(): number[] {
        return this.descriptor.faces
            .map((f, i) => f.isSynchronized ? i : -1)
            .filter(i => i !== -1);
    }

    getConfig(): Record<string, any> {
        return { name: this.name, params: this.descriptor.parameters };
    }

    getVisualProfile(): any {
        return this.descriptor.visualProfile;
    }

    getSchema(): any {
        return {
            faces: this.descriptor.faces.map((f, i) => ({ label: f.name, index: i }))
        };
    }

    public getFaceIndex(name: string): number {
        const idx = this.descriptor.faces.findIndex(f => f.name === name);
        if (idx === -1) throw new Error(`[${this.name}] Face unknown: ${name}`);
        return idx;
    }

    /**
     * @description Surface standard LBM equilibrium for initialization (splashes).
     */
    public getEquilibrium(rho: number, ux: number, uy: number): Float32Array {
        return LbmHelper.getEquilibrium(rho, ux, uy);
    }
}
