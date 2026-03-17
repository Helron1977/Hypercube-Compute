import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasAdapterNeo } from '../io/CanvasAdapterNeo';
import { NeoEngineProxy } from '../core/NeoEngineProxy';

// Generic Mock for 3D NeoEngineProxy
function createMock3DProxy(nx: number, ny: number, nz: number) {
    const padding = 1;
    const nxPhys = nx + 2 * padding;
    const nyPhys = ny + 2 * padding;
    const nzPhys = nz > 1 ? nz + 2 * padding : 1;
    const cells = nxPhys * nyPhys * nzPhys;

    // Create a data pattern that is different at each Z level
    const data = new Float32Array(cells);
    for (let k = 0; k < nzPhys; k++) {
        for (let j = 0; j < nyPhys; j++) {
            for (let i = 0; i < nxPhys; i++) {
                const idx = (k * nyPhys + j) * nxPhys + i;
                // Value is Z-dependent to verify we are looking at the right slice
                data[idx] = k / nzPhys; 
            }
        }
    }

    return {
        vGrid: {
            dimensions: { nx, ny, nz },
            chunkLayout: { x: 1, y: 1 },
            chunks: [{ 
                id: 'c0', 
                x: 0, y: 0, z: 0,
                localDimensions: { nx, ny, nz } 
            }],
            dataContract: {
                descriptor: {
                    faces: [
                        { name: 'data', type: 'scalar' }
                    ],
                    requirements: { ghostCells: padding }
                }
            }
        },
        bridge: {
            getChunkViews: () => [data]
        },
        parityManager: {
            getFaceIndices: (name: string) => ({ read: 0, write: 0 })
        }
    } as unknown as NeoEngineProxy;
}

describe('CanvasAdapterNeo 3D Support', () => {
    let mockCanvas: any;
    let mockCtx: any;
    const NX = 10;
    const NY = 10;
    const NZ = 5;

    beforeEach(() => {
        mockCtx = {
            createImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(NX * NY * 4)
            })),
            putImageData: vi.fn(),
        };
        mockCanvas = {
            getContext: vi.fn(() => mockCtx),
            width: NX,
            height: NY,
        };
    });

    it('should correctly render different slices in 3D', () => {
        const NX = 4;
        const NY = 4;
        const NZ = 3;
        const proxy = createMock3DProxy(NX, NY, NZ);
        
        const renderSlice = (z: number) => {
            const ctx = {
                createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(NX * NY * 4) })),
                putImageData: vi.fn(),
            };
            const canvas = { getContext: vi.fn(() => ctx), width: NX, height: NY };
            CanvasAdapterNeo.render(proxy, canvas as any, { 
                faceIndex: 0, 
                colormap: 'arctic',
                sliceZ: z 
            });
            return new Uint32Array(ctx.putImageData.mock.calls[0][0].data.buffer);
        };

        const pixels0 = renderSlice(0);
        const pixels1 = renderSlice(1);
        const pixels2 = renderSlice(2);

        // Verify that slices are different
        expect(pixels0[0]).not.toBe(pixels1[0]);
        expect(pixels1[0]).not.toBe(pixels2[0]);
        
        // Value in mock for slice 1 is 1/nzPhys. In arctic colormap this should be non-zero.
        expect(pixels1[0]).not.toBe(0);
    });
});
