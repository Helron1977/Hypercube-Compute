import { HypercubeMasterBuffer } from './HypercubeMasterBuffer';
import type { IHypercubeEngine } from '../engines/IHypercubeEngine';

export class HypercubeChunk {
    public readonly nx: number;
    public readonly ny: number;
    public readonly nz: number;
    public readonly faces: Float32Array[] = [];


    public readonly offset: number;
    public readonly stride: number;
    public engine: IHypercubeEngine | null = null;
    public readonly x: number;
    public readonly y: number;
    public readonly z: number;
    private masterBuffer: HypercubeMasterBuffer;

    constructor(
        x: number, y: number, nx: number, ny: number, nz: number = 1,
        masterBuffer: HypercubeMasterBuffer, numFaces: number = 6, z: number = 0
    ) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.masterBuffer = masterBuffer;
        this.nx = nx;
        this.ny = ny;
        this.nz = nz;

        const allocation = masterBuffer.allocateCube(nx, ny, nz, numFaces);
        this.offset = allocation.offset;
        this.stride = allocation.stride;

        const floatCount = nx * ny * nz;
        for (let i = 0; i < numFaces; i++) {
            this.faces.push(
                new Float32Array(masterBuffer.buffer, this.offset + (i * this.stride), floatCount)
            );
        }
    }

    public getIndex(lx: number, ly: number, lz: number = 0): number {
        return (lz * this.ny * this.nx) + (ly * this.nx) + lx;
    }

    public getSlice(faceIndex: number, lz: number): Float32Array {
        const sliceSize = this.nx * this.ny;
        const offset = lz * sliceSize;
        return this.faces[faceIndex].slice(offset, offset + sliceSize);
    }

    setEngine(engine: IHypercubeEngine) {
        this.engine = engine;
    }




    async compute() {
        if (!this.engine) return;
        await (this.engine.compute as any)(this.faces, this.nx, this.ny, this.nz, this.x, this.y, this.z);
    }

    clearFace(faceIndex: number) {
        this.faces[faceIndex].fill(0);
    }



    destroy() {
    }
}

