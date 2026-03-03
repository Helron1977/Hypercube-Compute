import { HypercubeMasterBuffer } from './core/HypercubeMasterBuffer';
import { HypercubeChunk } from './core/HypercubeChunk';
import type { IHypercubeEngine } from './engines/IHypercubeEngine';

/**
 * Chef d'orchestre de la V2. 
 * Il possède la VRAM globale partagée et gère les instanciations de Cubes sans fragmentation RAM.
 */
export class Hypercube {
    private _masterBuffer: HypercubeMasterBuffer;
    public cubes: Map<string, HypercubeChunk> = new Map();

    get masterBuffer() {
        return this._masterBuffer;
    }

    /**
     * @param vRamAllocMegabytes Taille du ArrayBuffer en Mega-Octets (par defaut 50MB)
     */
    constructor(vRamAllocMegabytes: number = 50) {
        this._masterBuffer = new HypercubeMasterBuffer(vRamAllocMegabytes * 1024 * 1024);
        console.log(`[Hypercube.js SDK] Initialized with ${vRamAllocMegabytes}MB of Raw Buffer Memory.`);
    }

    /**
     * Forge un nouveau Cube (View Paging) depuis le Buffer Maître.
     */
    public createCube(name: string, resolution: number | { nx: number, ny: number, nz?: number }, engine: IHypercubeEngine, numFaces: number = 6): HypercubeChunk {
        if (this.cubes.has(name)) {
            throw new Error(`Cube avec le nom ${name} existe déjà.`);
        }

        let nx, ny, nz;
        if (typeof resolution === 'number') {
            nx = resolution;
            ny = resolution;
            nz = 1;
        } else {
            nx = resolution.nx;
            ny = resolution.ny;
            nz = resolution.nz ?? 1;
        }

        const cube = new HypercubeChunk(0, 0, nx, ny, nz, this._masterBuffer, numFaces, 0);
        cube.setEngine(engine);
        this.cubes.set(name, cube);
        return cube;
    }

    /**
     * Accès sécurisé à un cube pour UI/Render logic.
     */
    public getCube(id: string): HypercubeChunk | undefined {
        return this.cubes.get(id);
    }
}




































