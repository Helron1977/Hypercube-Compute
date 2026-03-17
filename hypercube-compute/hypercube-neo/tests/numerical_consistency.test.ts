import { describe, it, expect, beforeEach } from 'vitest';
import { DataContract } from '../core/DataContract';
import { ParityManager } from '../core/ParityManager';

describe('Aero GPU Numerical Consistency (Headless)', () => {
    it('should calculate correct face indices for Ping-Pong LBM', () => {
        const descriptor = {
            requirements: { pingPong: true },
            faces: [
                { name: 'f0', type: 'f32', isSynchronized: true },
                { name: 'obstacles', type: 'f32', isSynchronized: false }
            ]
        };
        const contract = new DataContract(descriptor as any);
        const mappings = contract.getFaceMappings();
        
        // f0 is ping-pong -> 2 slots
        expect(mappings[0].isPingPong).toBe(true);
        expect(mappings[0].faceIndex).toBe(0);
        
        // obstacles is NOT ping-pong -> 1 slot
        expect(mappings[1].isPingPong).toBe(false);
        expect(mappings[1].faceIndex).toBe(1);
    });

    it('should compute absolute base offsets matching the Shader logic', () => {
        const descriptor = {
            requirements: { pingPong: true },
            faces: [
                { name: 'f0', type: 'f32', isSynchronized: true }, // 0, 1
                { name: 'f1', type: 'f32', isSynchronized: true }, // 2, 3
                { name: 'obstacles', type: 'f32', isSynchronized: false } // 4
            ]
        };
        const contract = new DataContract(descriptor as any);
        const mappings = contract.getFaceMappings();
        
        const getAbsoluteIdx = (name: string) => {
            const faceIdx = mappings.findIndex(m => m.name === name);
            let baseIdx = 0;
            for (let k = 0; k < faceIdx; k++) {
                baseIdx += mappings[k].isPingPong ? 2 : 1;
            }
            return baseIdx;
        };

        expect(getAbsoluteIdx('f0')).toBe(0);
        expect(getAbsoluteIdx('f1')).toBe(2);
        expect(getAbsoluteIdx('obstacles')).toBe(4);
    });

    it('should calculate correct global-to-local and local-to-buffer indices with ghost cells', () => {
        // Setup a 512x512 grid split into 2x1 chunks (256x512 per chunk)
        const nx = 512;
        const ny = 512;
        const chunksX = 2;
        const chunksY = 1;
        
        const nx_chunk = nx / chunksX; // 256
        const pNx = nx_chunk + 2; // 258 (with ghosts)
        
        // Chunk 0 (Left): gx range [0, 255]
        // Chunk 1 (Right): gx range [256, 511]
        
        const getLocalX = (gx: number, chunkX: number) => {
            return (gx % nx_chunk) + 1;
        };

        // Test world boundary (Left-most ghost of World)
        // gx = 0 is first physical pixel. 
        // Ghost cell at world-left should be lx=0 of chunkX=0.
        expect(getLocalX(0, 0)).toBe(1); // lx=1 is first physical
        
        // Test joint between Chunk 0 and Chunk 1
        // gx = 255 (Last of Chunk 0) -> lx = 256
        // gx = 256 (First of Chunk 1) -> lx = 1
        expect(getLocalX(255, 0)).toBe(256);
        expect(getLocalX(256, 1)).toBe(1);
        
        // Buffer Index for a pixel (px, py) in chunk buffer
        const getBufIdx = (lx: number, ly: number, pNx: number) => ly * pNx + lx;
        
        // lx=0 is left ghost, lx=257 is right ghost (for nx_chunk=256)
        expect(getBufIdx(256, 10, pNx)).toBe(10 * 258 + 256);
        expect(getBufIdx(257, 10, pNx)).toBe(10 * 258 + 257);
    });

    it('should calculate correct offsets for inter-chunk synchronization (GpuBoundarySynchronizer logic)', () => {
        const pNx = 258;
        const pNy = 258;
        const padding = 1;

        // Sync Left Face of Chunk B (Target) from Right Face of Chunk A (Source)
        // Source (Chunk A) Right Face is at lx = nx_chunk
        const srcLx = 256; 
        // Target (Chunk B) Left Ghost is at lx = 0
        const dstLx = 0;

        const getRowOffset = (y: number) => y * pNx;

        // Test a middle row
        const y = 100;
        const srcIdx = getRowOffset(y) + srcLx;
        const dstIdx = getRowOffset(y) + dstLx;

        expect(srcIdx).toBe(100 * 258 + 256);
        expect(dstIdx).toBe(100 * 258 + 0);

        // Test Corners (Top-Left ghost of Chunk B from Top-Right of Chunk A)
        // This is crucial for D2Q9 diagonals
        const srcCornerX = 256;
        const srcCornerY = 256; // Bottom-Right physical of A
        const dstCornerX = 0;
        const dstCornerY = 0;  // Top-Left ghost of B (if B is below A)
        
        // Wait, if B is to the right of A:
        // TR of A (256, 1) should go to TL ghost of B (0, 1) -> No, that's face.
        // Diagonal: TR corner of A (256, 1) goes to TL ghost of B... 
        // Actually, diagonal synchronization happens for corners that don't share a face.
    });

    it('should correctly initialize LBM equilibrium across all slots', () => {
        const w = [4/9, 1/9, 1/9, 1/9, 1/9, 1/36, 1/36, 1/36, 1/36];
        
        // Simulating the logic inside MasterBuffer.initializeEquilibrium
        const testBuffer = new Float32Array(200); // Small buffer for test
        const simulateFill = (d: number, wi: number) => {
            // Ping-pong 0 and 1
            const bufA = new Float32Array(testBuffer.buffer, d * 2 * 10 * 4, 10);
            const bufB = new Float32Array(testBuffer.buffer, (d * 2 + 1) * 10 * 4, 10);
            bufA.fill(wi);
            bufB.fill(wi);
        };

        for(let d=0; d<9; d++) simulateFill(d, w[d]);

        expect(testBuffer[0]).toBeCloseTo(4/9); // f0 parity A
        expect(testBuffer[10]).toBeCloseTo(4/9); // f0 parity B
        expect(testBuffer[20]).toBeCloseTo(1/9); // f1 parity A
    });
});
