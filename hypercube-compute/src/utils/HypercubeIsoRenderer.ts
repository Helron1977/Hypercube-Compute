import { HypercubeChunk } from "../core/HypercubeChunk";
import { HypercubeMarchingCubes } from "./HypercubeMarchingCubes";

/**
 * HypercubeIsoRenderer
 * Moteur de rendu 2D Canvas pour projections 3D isométriques et slicing.
 * Utilise l'algorithme du peintre et une manipulation directe d'ImageData.
 */
export class HypercubeIsoRenderer {
    /**
     * Calcule la couleur à partir d'une valeur (0.0 - 1.0)
     * Palette : Bleu (froid) -> Blanc -> Rouge (chaud)
     * Retourne [r, g, b] pour manipulation ImageData
     */
    static getColorRGB(val: number): [number, number, number] {
        val = Math.max(0, Math.min(1, val));
        let r, g, b;
        if (val < 0.5) {
            // Bleu -> Blanc
            const t = val * 2;
            r = Math.floor(255 * t);
            g = Math.floor(255 * t);
            b = 255;
        } else {
            // Blanc -> Rouge
            const t = (val - 0.5) * 2;
            r = 255;
            g = Math.floor(255 * (1 - t));
            b = Math.floor(255 * (1 - t));
        }
        return [r, g, b];
    }

    /**
     * Rendu d'une tranche Z sur un canvas (Utilise ImageData pour perfs).
     */
    static renderSliceZ(ctx: CanvasRenderingContext2D, chunk: HypercubeChunk, faceIndex: number, lz: number, scale: number = 4): void {
        const { nx, ny } = chunk;
        const slice = chunk.getSlice(faceIndex, lz);
        // Fallback to fillRect for slice as it's 2D and cheap enough, 
        // could be optimized to ImageData later if needed.
        for (let y = 0; y < ny; y++) {
            for (let x = 0; x < nx; x++) {
                const val = slice[y * nx + x];
                if (val > 0.001) {
                    const [r, g, b] = this.getColorRGB(val);
                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
        }
    }

    /**
     * Rendu Isométrique Volumétrique (Painter's Algorithm).
     * Ultra-Optimisé via ImageData et Manual Alpha Blending.
     */
    static renderIso(
        ctx: CanvasRenderingContext2D,
        chunk: HypercubeChunk,
        faceIndex: number,
        options: {
            scale?: number,
            offsetX?: number,
            offsetY?: number,
            threshold?: number,
            opacity?: number,
            coreDensity?: number
        } = {}
    ): void {
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        const { scale = 6, offsetX = w / 2, offsetY = h / 2 + 100, threshold = 0.05, opacity = 0.8, coreDensity = 5 } = options;
        const { nz } = chunk;

        // 1. Surface Extraction (Culling + Subsampling)
        const pointsFlat = HypercubeMarchingCubes.getSurfacePoints(chunk, faceIndex, threshold, coreDensity);

        // 2. Fetch existing Canvas Data (we need it for manual blending over the background)
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // 3. Depth Sorting (Optimized Bucket Sort approx)
        const maxDepth = 200; // Resolution of the depth buffer
        const buckets: { x: number, y: number, z: number, val: number }[][] = Array.from({ length: maxDepth }, () => []);

        // Depth scale factor relative to maximum possible depth in the chunk
        const dScale = maxDepth / (nz * 2.5);

        for (let i = 0; i < pointsFlat.length; i += 4) {
            const x = pointsFlat[i];
            const y = pointsFlat[i + 1];
            const z = pointsFlat[i + 2];
            const val = pointsFlat[i + 3];

            // Filter out extremely faint points to save sorting/rendering time
            if (val < 0.1) continue;

            const depthRaw = z + (x + y) * 0.707;
            let depthIdx = Math.floor(depthRaw * dScale);

            // Clamp strictly within bucket bounds
            depthIdx = Math.max(0, Math.min(maxDepth - 1, depthIdx));
            buckets[depthIdx].push({ x, y, z, val });
        }

        // 4. Fast Pixel Rendering (Back to Front)
        const halfScale = Math.max(1, Math.floor(scale / 2));

        for (let d = maxDepth - 1; d >= 0; d--) {
            const bucket = buckets[d];
            for (let i = 0; i < bucket.length; i++) {
                const v = bucket[i];

                const isoX = Math.round((v.x - v.y) * (scale * 0.866) + offsetX);
                const isoY = Math.round((v.x + v.y) * (scale * 0.5) - (v.z * scale * 0.8) + offsetY);

                // Quick bounds check for the center
                if (isoX < -scale || isoX >= w + scale || isoY < -scale || isoY >= h + scale) continue;

                const [r, g, b] = this.getColorRGB(v.val);

                // Opacity modulated by intensity and depth (front is more opaque)
                const depthAlphaMod = 1 - (v.z / nz) * 0.4;
                // Non-linear intensity scaling for visibility
                const intensityAlphaMod = Math.pow(v.val, 1.2);
                const alphaRaw = opacity * intensityAlphaMod * depthAlphaMod;

                // Clamp and convert to src factor [0, 1]
                const srcA = Math.max(0.05, Math.min(1.0, alphaRaw));
                const dstA = 1.0 - srcA;

                // Draw a "splat" (a square box of pixels matching the scale)
                for (let sy = -halfScale; sy < halfScale; sy++) {
                    const py = isoY + sy;
                    if (py < 0 || py >= h) continue;

                    for (let sx = -halfScale; sx < halfScale; sx++) {
                        const px = isoX + sx;
                        if (px < 0 || px >= w) continue;

                        const pxIdx = (py * w + px) * 4;

                        // Manual Alpha Blending over existing data
                        data[pxIdx] = Math.round(r * srcA + data[pxIdx] * dstA); // R
                        data[pxIdx + 1] = Math.round(g * srcA + data[pxIdx + 1] * dstA); // G
                        data[pxIdx + 2] = Math.round(b * srcA + data[pxIdx + 2] * dstA); // B
                        data[pxIdx + 3] = 255; // Destination becomes completely opaque
                    }
                }
            }
        }

        // 5. Final Push
        ctx.putImageData(imgData, 0, 0);
    }
}
