import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasAdapter } from '../src/io/CanvasAdapter';

// Mock Canvas context
class MockContext {
    data: Uint8ClampedArray;
    constructor(w: number, h: number) {
        this.data = new Uint8ClampedArray(w * h * 4);
    }
    getImageData(x: number, y: number, w: number, h: number) {
        return { data: this.data };
    }
    putImageData() { }
}

describe('CanvasAdapter Component Visualization', () => {
    let canvas: any;
    let adapter: CanvasAdapter;

    beforeEach(() => {
        canvas = {
            width: 128,
            height: 128,
            getContext: () => new MockContext(128, 128)
        };
        adapter = new CanvasAdapter(canvas);
    });

    it('should correctly prioritize vorticityFace (Red) over smokeFace (Navy)', () => {
        const nx = 4, ny = 4;
        const faces: Float32Array[] = Array.from({ length: 24 }, () => new Float32Array(nx * ny));

        // Face 22: Smoke (Full density)
        faces[22].fill(1.0);
        // Face 21: Vorticity (Extreme rotation)
        faces[21].fill(1.0);

        const gridFaces = [[faces]]; // [row][col][face]

        adapter.renderFromFaces(gridFaces, nx, ny, 1, 1, {
            faceIndex: 22,
            vorticityFace: 21,
            colormap: 'arctic',
            minVal: 0,
            maxVal: 1
        });

        const imgData = (adapter as any).ctx.getImageData(0, 0, 2, 2).data;

        // At full smoke and full vorticity, color should be Pure Red (255, 0, 0)
        // because Red is blended LAST in arctic colormap.
        expect(imgData[0]).toBeGreaterThan(200); // Red channel
        expect(imgData[1]).toBeLessThan(50);   // Green channel
        expect(imgData[2]).toBeLessThan(50);   // Blue channel
    });

    it('should show Navy Blue background when only smoke is present', () => {
        const nx = 4, ny = 4;
        const faces: Float32Array[] = Array.from({ length: 24 }, () => new Float32Array(nx * ny));

        faces[22].fill(1.0); // Full smoke
        faces[21].fill(0.0); // No vorticity

        const gridFaces = [[faces]];

        adapter.renderFromFaces(gridFaces, nx, ny, 1, 1, {
            faceIndex: 22,
            vorticityFace: 21,
            colormap: 'arctic',
            minVal: 0,
            maxVal: 1
        });

        const imgData = (adapter as any).ctx.getImageData(0, 0, 2, 2).data;

        // Navy Blue (approximately 10, 25, 70)
        expect(imgData[0]).toBeLessThan(50);   // Red
        expect(imgData[2]).toBeGreaterThan(50); // Blue
    });
});
