/**
 * HypercubeIsoRenderer
 * Special renderer for 2.5D Isometric volumetric views of multi-chunk grids.
 */
export class HypercubeIsoRenderer {
    private ctx: CanvasRenderingContext2D;
    private canvas: HTMLCanvasElement;
    private scale: number;

    constructor(canvas: HTMLCanvasElement, options?: any, scale: number = 4.0) {
        this.canvas = canvas;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error("Could not get 2D context");
        this.ctx = context;
        this.scale = scale;
    }

    public clearAndSetup(r: number, g: number, b: number) {
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Renders a multi-chunk volume in 2.5D isometric view.
     * Logic: Bottom-to-top, Right-to-left painter's algorithm.
     */
    public renderMultiChunkVolume(
        gridFaces: Float32Array[][][],
        nx: number,
        ny: number,
        cols: number,
        rows: number,
        options: { densityFaceIndex: number, obstacleFaceIndex?: number }
    ) {
        const { densityFaceIndex: dfi, obstacleFaceIndex: ofi } = options;
        const scale = this.scale;

        // Isometric constants
        const isoXScale = scale * 0.866;
        const isoYScale = scale * 0.5;

        // UTILE (sans ghost cells)
        const vNX = nx - 2;
        const vNY = ny - 2;

        // On calcule le décalage pour que (Center World) == (Center Screen)
        // Le centre du monde en pixels est à (TotalW/2, TotalH/2)
        const midW = (vNX * cols) / 2;
        const midH = (vNY * rows) / 2;

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2 + (midH * isoYScale * 0.5);

        for (let gy = 0; gy < rows; gy++) {
            for (let gx = 0; gx < cols; gx++) {
                const faces = gridFaces[gy][gx];
                const density = faces[dfi];
                const obs = ofi !== undefined ? faces[ofi] : null;

                for (let ly = 1; ly < ny - 1; ly += 2) {
                    for (let lx = 1; lx < nx - 1; lx += 2) {
                        const idx = ly * nx + lx;
                        const val = density[idx];
                        const isObs = obs ? obs[idx] > 0.5 : false;

                        if (val < 0.01 && !isObs) continue;

                        // Coordonnées GLOBALES relatives au centre du monde
                        const worldX = (gx * vNX + (lx - 1)) - midW;
                        const worldY = (gy * vNY + (ly - 1)) - midH;

                        // Projection
                        const x = centerX + (worldX - worldY) * isoXScale;
                        const y = centerY + (worldX + worldY) * isoYScale;

                        const h = isObs ? scale * 10 : val * scale * 25; // Boost ondes

                        if (isObs) {
                            this.ctx.fillStyle = '#333';
                        } else {
                            // Ocean surface contrast (focus on variation around 1.0)
                            const intensity = (val - 1.0) * 800;
                            const r = Math.max(0, Math.min(255, 20 + intensity));
                            const g = Math.max(0, Math.min(255, 100 + intensity));
                            const b = Math.max(0, Math.min(255, 200 + intensity));
                            this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                        }

                        this.ctx.fillRect(x, y - h, scale * 2, h || scale);
                    }
                }
            }
        }
    }
}
