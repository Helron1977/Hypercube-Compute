export class CanvasAdapter {
    private ctx: CanvasRenderingContext2D;
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        if (!context) throw new Error("Could not get 2D context from canvas");
        this.ctx = context;
    }

    /**
     * Renders a multi-chunk grid of faces into the single large canvas.
     */
    public renderFromFaces(
        gridFaces: Float32Array[][][], // [row][col][faceIndex]
        nx: number,
        ny: number,
        cols: number,
        rows: number,
        options: {
            faceIndex: number,
            colormap: 'grayscale' | 'heatmap' | 'vorticity' | 'ocean' | 'arctic',
            minVal?: number,
            maxVal?: number,
            sliceZ?: number,
            obstaclesFace?: number,
            vorticityFace?: number
        }
    ) {
        const sliceZ = options.sliceZ || 0;
        const totalW = (nx - 2) * cols;
        const totalH = (ny - 2) * rows;

        const imgData = this.ctx.getImageData(0, 0, totalW, totalH);
        const pixelData = imgData.data;

        const faceIdx = options.faceIndex;
        const obsIdx = options.obstaclesFace;
        const minV = options.minVal ?? 0;
        const maxV = options.maxVal ?? 1;
        const range = (maxV - minV) || 0.0001;

        for (let gy = 0; gy < rows; gy++) {
            for (let gx = 0; gx < cols; gx++) {
                const faces = gridFaces[gy][gx];
                const data = faces[faceIdx];
                const obs = obsIdx !== undefined ? faces[obsIdx] : null;

                const zOff = sliceZ * ny * nx;

                for (let ly = 1; ly < ny - 1; ly++) {
                    const py = gy * (ny - 2) + (ly - 1);
                    for (let lx = 1; lx < nx - 1; lx++) {
                        const px = gx * (nx - 2) + (lx - 1);
                        const srcIdx = zOff + ly * nx + lx;
                        const dstIdx = (py * totalW + px) * 4;

                        // ... rest of mapping ...

                        // Obstacle check
                        if (obs && obs[srcIdx] > 0.5) {
                            pixelData[dstIdx] = 50;
                            pixelData[dstIdx + 1] = 50;
                            pixelData[dstIdx + 2] = 50;
                            pixelData[dstIdx + 3] = 255;
                            continue;
                        }

                        const val = (data[srcIdx] - minV) / range;
                        const v = Math.max(0, Math.min(1, val));

                        if (options.colormap === 'heatmap') {
                            pixelData[dstIdx] = v * 255;
                            pixelData[dstIdx + 1] = v > 0.5 ? (v - 0.5) * 510 : 0;
                            pixelData[dstIdx + 2] = v * 50;
                        } else if (options.colormap === 'ocean') {
                            const intensity = (v - 0.5) * 8.0;
                            pixelData[dstIdx] = Math.max(0, Math.min(255, 25 + intensity * 200));
                            pixelData[dstIdx + 1] = Math.max(0, Math.min(255, 100 + intensity * 155));
                            pixelData[dstIdx + 2] = Math.max(0, Math.min(255, 200 + intensity * 55));
                        } else if (options.colormap === 'arctic') {
                            // SCIENTIFIC COMPOSITE: Background(Light Blue) -> Smoke(Navy) -> Vorticity(Red)
                            const s = Math.max(0, Math.min(1.0, (data[srcIdx] - minV) / range));

                            // 1. BASE: Crisp Light Cyan/Blue
                            let r = 180, g = 220, b = 255;

                            // 2. SMOKE: Blend to Navy/Slate Blue (15, 30, 80)
                            const rN = 15, gN = 30, bN = 80;
                            const tS = Math.pow(s, 0.35); // Sharp transition
                            r = r * (1 - tS) + rN * tS;
                            g = g * (1 - tS) + gN * tS;
                            b = b * (1 - tS) + bN * tS;

                            // 3. VORTICITY: Pure Red details
                            if (options.vorticityFace !== undefined) {
                                const vData = faces[options.vorticityFace];
                                const vMag = Math.min(1.0, Math.abs(vData[srcIdx]) * 120.0); // High sensitivity

                                if (vMag > 0.05) {
                                    const tC = Math.min(1.0, (vMag - 0.05) * 1.5);
                                    r = r * (1 - tC) + 255 * tC;
                                    g = g * (1 - tC);
                                    b = b * (1 - tC);
                                }
                            }

                            pixelData[dstIdx] = r;
                            pixelData[dstIdx + 1] = g;
                            pixelData[dstIdx + 2] = b;
                        } else {
                            const c = v * 255;
                            const isArctic = (options.colormap as any) === 'arctic';
                            if (isArctic || options.colormap === undefined) {
                                // Fallback to arctic for Aerodynamics if not specified
                                // Simple gray for basics, but this block is reached only if not heatmap/ocean/arctic
                                pixelData[dstIdx] = c;
                                pixelData[dstIdx + 1] = c;
                                pixelData[dstIdx + 2] = c;
                            } else {
                                pixelData[dstIdx] = c;
                                pixelData[dstIdx + 1] = c;
                                pixelData[dstIdx + 2] = c;
                            }
                        }

                        pixelData[dstIdx + 3] = 255;
                    }
                }
            }
        }

        this.ctx.putImageData(imgData, 0, 0);
    }
}
