import { NeoEngineProxy } from '../core/NeoEngineProxy';
import { VisualRegistry } from './VisualRegistry';

export interface RenderOptions {
    faceIndex: number;
    colormap?: string;
    minVal?: number;
    maxVal?: number;
    obstaclesFace?: number;
    vorticityFace?: number; // Deprecated, use auxiliaryFaces
    sliceZ?: number;
    criteria?: { faceIndex: number, weight: number, distanceThreshold?: number }[];
    criteriaSDF?: { xFace: number, yFace: number, weight: number, distanceThreshold: number }[];
    auxiliaryFaces?: number[]; // [0]=vorticity, [1]=vx, [2]=vy, etc.
}

/**
 * CanvasAdapterNeo: Neo-native rendering orchestrator.
 * Understands multi-chunk grids and assembles them into a single canvas.
 */
export class CanvasAdapterNeo {

    /**
     * Renders a NeoEngineProxy (multi-chunk) to a single canvas.
     */
    static render(neo: NeoEngineProxy, canvas: HTMLCanvasElement, options: RenderOptions): void {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dims = neo.vGrid.dimensions;
        const totalW = dims.nx;
        const totalH = dims.ny;

        // Ensure canvas size matches simulation resolution
        if (canvas.width !== totalW || canvas.height !== totalH) {
            canvas.width = totalW;
            canvas.height = totalH;
        }

        const imageData = ctx.createImageData(totalW, totalH);
        const pixelData = new Uint32Array(imageData.data.buffer);

        const chunkLayout = neo.vGrid.chunkLayout;
        const nChunksX = chunkLayout.x;
        const nChunksY = chunkLayout.y;

        // Note: vnx/vny are no longer uniform. We calculate them per-chunk from localDimensions.

        // Colormap configuration
        const colormap = options.colormap || 'arctic';
        const minV = options.minVal ?? 0;
        const maxV = options.maxVal ?? 1;
        const invRange = 1.0 / (maxV - minV || 1.0);


        // Resolve logical face indices → physical slots via parityManager
        // (same convention as WebGpuRendererNeo: faceIndex is a descriptor.faces index)
        const descriptor = (neo.vGrid as any).dataContract.descriptor;
        const getPhysicalSlot = (logicalIdx: number | undefined): number | undefined => {
            if (logicalIdx === undefined || logicalIdx >= descriptor.faces.length) return undefined;
            const faceName = descriptor.faces[logicalIdx].name;
            return neo.parityManager.getFaceIndices(faceName).read;
        };
        const physFaceIdx = getPhysicalSlot(options.faceIndex);
        const physObsIdx  = getPhysicalSlot(options.obstaclesFace);
        const physVortIdx = getPhysicalSlot(options.vorticityFace); // Keep for compatibility
        const auxIndices = (options.auxiliaryFaces || []).map(idx => getPhysicalSlot(idx));

        // Pre-calculate max dimensions for correct stride logic
        let maxNx = 0;
        for (const c of neo.vGrid.chunks) {
            maxNx = Math.max(maxNx, c.localDimensions.nx);
        }
        const padding = descriptor.requirements.ghostCells;
        const nxPhys = maxNx + 2 * padding;

        // Iterate through chunks and "tile" them into the global imageData
        for (const chunk of neo.vGrid.chunks) {
            const views = neo.mBuffer.getChunkViews(chunk.id);
            const faces = views.faces;
            // ... (rest of getting data arrays)
            const data = physFaceIdx !== undefined ? faces[physFaceIdx] : null;
            const criteria = options.criteria || [];
            const criteriaFaces = criteria.map(c => {
                const phys = getPhysicalSlot(c.faceIndex);
                return phys !== undefined ? faces[phys] : new Float32Array(0);
            });
            const criteriaSDF = options.criteriaSDF || [];
            const criteriaSDFFaces = criteriaSDF.map(c => ({
                x: getPhysicalSlot(c.xFace) !== undefined ? faces[getPhysicalSlot(c.xFace)!] : new Float32Array(0),
                y: getPhysicalSlot(c.yFace) !== undefined ? faces[getPhysicalSlot(c.yFace)!] : new Float32Array(0)
            }));
            const obsData  = physObsIdx  !== undefined ? faces[physObsIdx]  : null;
            const vortData = physVortIdx !== undefined ? faces[physVortIdx] : null;

            // Calculate world offsets by summing preceding chunks
            let worldXOffset = 0;
            let worldYOffset = 0;
            for (const c of neo.vGrid.chunks) {
                if (c.y === chunk.y && c.z === chunk.z && c.x < chunk.x) worldXOffset += c.localDimensions.nx;
                if (c.x === chunk.x && c.z === chunk.z && c.y < chunk.y) worldYOffset += c.localDimensions.ny;
            }

            const nx = chunk.localDimensions.nx;
            const ny = chunk.localDimensions.ny;

            for (let ly = padding; ly < ny + padding; ly++) {
                const worldY = worldYOffset + (ly - padding);
                const dstRowOffset = worldY * totalW;
                const srcRowOffset = ly * nxPhys;

                for (let lx = padding; lx < nx + padding; lx++) {
                    const srcIdx = srcRowOffset + lx;
                    const worldX = worldXOffset + (lx - padding);
                    const dstIdx = dstRowOffset + worldX;

                        // 1. OBSTACLES (Static Priority)
                        if (obsData && obsData[srcIdx] > 0.9) {
                            if (colormap === 'spatial-decision') {
                                pixelData[dstIdx] = 0x00000000; // Transparent for Leaflet
                            } else {
                                pixelData[dstIdx] = 0xff282828; // ABGR: 255, 40, 40, 40
                            }
                            continue;
                        }

                        const val = data ? data[srcIdx] : 0.0;
                        let r = 180, g = 220, b = 255, a = 255; // Base color with Alpha

                        if (colormap === 'arctic') {
                            const s = Math.max(0, Math.min(1.0, (val - minV) * invRange));

                            // Smoke/Density: Blend to Navy (15, 30, 80)
                            // Replaced Math.pow(s, 0.35) with faster linear approximation for 60fps target
                            const tS = s * (2.0 - s);
                            r = r * (1 - tS) + 15 * tS;
                            g = g * (1 - tS) + 30 * tS;
                            b = b * (1 - tS) + 80 * tS;

                            // Vorticity: Red Highlights
                            let vortDataForArctic = vortData;
                            if (!vortDataForArctic && auxIndices[0] !== undefined) {
                                vortDataForArctic = faces[auxIndices[0]];
                            }

                            if (vortDataForArctic) {
                                const vMag = Math.min(1.0, Math.abs(vortDataForArctic[srcIdx]) * 120.0);
                                if (vMag > 0.05) {
                                    const tC = Math.min(1.0, (vMag - 0.05) * 1.5);
                                    r = r * (1 - tC) + 255 * tC;
                                    g = g * (1 - tC);
                                    b = b * (1 - tC);
                                }
                            }
                        } else if (colormap === 'heatmap') {
                            let sTotal = 1.0;
                            if (criteria.length > 0) {
                                let sumW = 0;
                                for (let i = 0; i < criteria.length; i++) sumW += criteria[i].weight;

                                if (sumW > 0) {
                                    let score = 0;
                                    for (let i = 0; i < criteria.length; i++) {
                                        const weight = criteria[i].weight;
                                        if (weight === 0) continue;

                                        const hThresh = criteria[i].distanceThreshold || 0.05;
                                        const hRaw = Math.max(0, Math.min(1.0, (criteriaFaces[i][srcIdx] - minV) * invRange));

                                        // Local satisfaction: 1.0 if inside threshold (close enough), drops if far.
                                        const sLoc = (hRaw >= hThresh) ? 1.0 : (hRaw / hThresh);

                                        // Weighted average accumulation
                                        score += (weight / sumW) * sLoc;
                                    }
                                    sTotal = score;
                                    
                                    // Descente en paliers (Decision Engine Steps) - Only for criteria-based heatmap
                                    const steps = 6;
                                    const quantizedS = Math.floor(sTotal * steps) / steps;

                                    if (quantizedS < 0.1) {
                                        r = 15; g = 23; b = 42;     // Very dark slate (Fail)
                                    } else if (quantizedS < 0.3) {
                                        r = 14; g = 110; b = 180;   // Dark Blue
                                    } else if (quantizedS < 0.5) {
                                        r = 6; g = 182; b = 212;    // Cyan
                                    } else if (quantizedS < 0.7) {
                                        r = 234; g = 179; b = 8;    // Yellow
                                    } else if (quantizedS < 0.9) {
                                        r = 132; g = 204; b = 22;   // Yellow-Green
                                    } else {
                                        r = 34; g = 197; b = 94;    // Pure Green (Optimal Zones)
                                    }
                                }
                            } else {
                                sTotal = (maxV === 0) ? 1.0 : Math.max(0, Math.min(1.0, (val - minV) * invRange));
                                
                                // Thermal Heatmap Transition (Black -> Red -> Orange -> Yellow)
                                const s = sTotal;
                                if (s < 0.5) {
                                    r = Math.floor(s * 2.0 * 255);
                                    g = 0;
                                    b = Math.floor(s * 0.2 * 255);
                                } else {
                                    r = 255;
                                    g = Math.floor((s - 0.5) * 2.0 * 255);
                                    b = Math.floor(s * 0.2 * 255);
                                }
                                r = Math.max(0, Math.min(255, r));
                                g = Math.max(0, Math.min(255, g));
                                b = Math.max(0, Math.min(255, b));
                            }
                        } else if (colormap === 'spatial-decision') {
                            // Exact O(1) Analytical Distance Resolving (SDF via Jump Flooding)
                            let sTotal = 1.0;
                            if (criteriaSDF.length > 0) {
                                let sumW = 0;
                                for (let i = 0; i < criteriaSDF.length; i++) sumW += criteriaSDF[i].weight;

                                if (sumW > 0) {
                                    let score = 0;
                                    for (let i = 0; i < criteriaSDF.length; i++) {
                                        const weight = criteriaSDF[i].weight;
                                        if (weight === 0) continue;

                                        const seedX = criteriaSDFFaces[i].x[srcIdx];
                                        const seedY = criteriaSDFFaces[i].y[srcIdx];

                                        if (seedX < -9000 || seedY < -9000) {
                                            // No seed ever reached this pixel (e.g. perfectly walled off)
                                            continue;
                                        }

                                        // Exact Pythagorean distance from current global pixel to best seed
                                        const dx = worldX - seedX;
                                        const dy = worldY - seedY;
                                        // A 512 map represents approx 1000m x 1000m (Paris center slice)
                                        // => 1 pixel ~ 2 meters
                                        const distMeters = Math.sqrt(dx * dx + dy * dy) * 2.0;

                                        const distThresh = criteriaSDF[i].distanceThreshold;

                                        // Strict constraint mapping (Satisfied vs Not Satisfied)
                                        // Smooth cutoff inside the threshold radius
                                        let sLoc = 0;
                                        if (distMeters <= distThresh) {
                                            sLoc = Math.pow(1.0 - (distMeters / distThresh), 0.5);
                                        }

                                        score += (weight / sumW) * sLoc;
                                    }
                                    sTotal = score;
                                } else {
                                    sTotal = 0; // Fix: Prevent full green map when weights are zero
                                }
                            }

                            // Stepped Palettes (Pareto Quantization)
                            const steps = 6;
                            const quantizedS = Math.floor(sTotal * steps) / steps;

                            if (quantizedS <= 0.05) {
                                r = 0; g = 0; b = 0; a = 0; // Transparence totale (Zone Inutile)
                            } else if (quantizedS < 0.2) {
                                r = 14; g = 110; b = 180; a = 150; // Dark Blue
                            } else if (quantizedS < 0.4) {
                                r = 6; g = 182; b = 212; a = 180; // Cyan
                            } else if (quantizedS < 0.6) {
                                r = 234; g = 179; b = 8; a = 200; // Yellow
                            } else if (quantizedS < 0.8) {
                                r = 132; g = 204; b = 22; a = 220; // Yellow-Green
                            } else {
                                r = 34; g = 197; b = 94; a = 255; // Pure Green (Optimal Zones)
                            }

                        } else {
                            const gray = Math.floor(Math.max(0, Math.min(1.0, (val - minV) * invRange)) * 255);
                            r = g = b = gray;
                        }

                        // Write pixel (ABGR format for Little Endian architecture)
                        pixelData[dstIdx] = (a << 24) | (b << 16) | (g << 8) | r;
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }
}
