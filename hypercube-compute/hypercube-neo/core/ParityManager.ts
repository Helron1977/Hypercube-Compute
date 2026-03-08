import { DataContract } from './DataContract';

/**
 * Manages the global simulation parity (Ping-Pong buffer indices).
 * Ensures that engines always know which buffer to read from and which to write to.
 */
export class ParityManager {
    private tick: number = 0;

    constructor(private dataContract: DataContract) { }

    /**
     * Increments the simulation tick and swaps parity.
     */
    public nextTick(): void {
        this.tick++;
    }

    /**
     * Gets the current buffer indices for a specific face.
     * @returns { read: number, write: number } Indices into the chunk's physical faces array.
     */
    public getFaceIndices(faceName: string): { read: number; write: number } {
        const mappings = this.dataContract.getFaceMappings();
        const faceIdx = mappings.findIndex(m => m.name === faceName);

        if (faceIdx === -1) {
            throw new Error(`ParityManager: Face "${faceName}" not found in contract.`);
        }

        // Calculate absolute start index in the faces array
        let baseIdx = 0;
        for (let i = 0; i < faceIdx; i++) {
            baseIdx += mappings[i].isPingPong ? 2 : 1;
        }

        const mapping = mappings[faceIdx];
        if (!mapping.isPingPong) {
            return { read: baseIdx, write: baseIdx };
        }

        // Swapping logic: 
        // Tick 0: Read A (0), Write B (1)
        // Tick 1: Read B (1), Write A (0)
        const isOdd = this.tick % 2 === 1;
        return {
            read: baseIdx + (isOdd ? 1 : 0),
            write: baseIdx + (isOdd ? 0 : 1)
        };
    }

    public get currentTick(): number {
        return this.tick;
    }
}
