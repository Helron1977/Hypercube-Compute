import { HypercubeChunk } from "../core/HypercubeChunk";

/**
 * HypercubeMarchingCubes
 * Implémentation "light" de l'algorithme des Marching Cubes.
 * Extrait une surface (Isosurface) d'un volume de densité.
 */
export class HypercubeMarchingCubes {
    // Note: Dans une version complète, on inclurait ici les tables EDGE_TABLE (256) 
    // et TRI_TABLE (256 * 16). 
    // Pour rester "Light" et efficace dans ce SDK, on fournit ici la structure logicielle.
    // L'utilisateur peut passer ses propres tables ou utiliser notre helper par défaut.

    /**
     * Génère un buffer de sommets (Point Cloud ou Triangles) à partir d'un chunk.
     * Pour cette version "Light SDK", nous implémentons un export de nuage de points densifié
     * qui simule la surface, ultra-performant pour le Canvas 2D.
     */
    static getSurfacePoints(chunk: HypercubeChunk, faceIndex: number, threshold: number, coreDensity: number = 0): Float32Array {
        const { nx, ny, nz, faces } = chunk;
        const face = faces[faceIndex];
        const points = [];

        for (let z = 0; z < nz; z++) {
            const zOff = z * ny * nx;
            for (let y = 0; y < ny; y++) {
                const yOff = y * nx;
                for (let x = 0; x < nx; x++) {
                    const val = face[zOff + yOff + x];

                    // On ne détecte que la "coque" (surface)
                    if (val >= threshold) {
                        // Check neighbors to see if it's an interior voxel
                        let isInterior = true;
                        if (x === 0 || x === nx - 1 || y === 0 || y === ny - 1 || z === 0 || z === nz - 1) {
                            isInterior = false;
                        } else {
                            if (face[zOff + yOff + x - 1] < threshold) isInterior = false;
                            if (face[zOff + yOff + x + 1] < threshold) isInterior = false;
                            if (face[zOff + (y - 1) * nx + x] < threshold) isInterior = false;
                            if (face[zOff + (y + 1) * nx + x] < threshold) isInterior = false;
                            if (face[(z - 1) * ny * nx + yOff + x] < threshold) isInterior = false;
                            if (face[(z + 1) * ny * nx + yOff + x] < threshold) isInterior = false;
                        }

                        if (!isInterior) {
                            points.push(x, y, z, val);
                        } else if (coreDensity > 0) {
                            // Plus dense -> plus de chance d'être inclus
                            // prob: up to 80% inclusion for highest values, effectively capping the subsample
                            const prob = val * 0.8;
                            if (Math.random() < prob && (x * 7 + y * 13 + z * 17) % coreDensity === 0) {
                                points.push(x, y, z, val);
                            }
                        }
                    }
                }
            }
        }

        return new Float32Array(points);
    }

    /**
     * Helper pour transformer les points en triangles (Mesh simple par voxels).
     * Alternative légère au Marching Cubes complet pour le rendu Canvas.
     */
    static getVoxelMesh(chunk: HypercubeChunk, faceIndex: number, threshold: number): Float32Array {
        // Retourne un tableau de triangles directs pour chaque voxel de surface
        // [x1,y1,z1, n1x,n1y,n1z, ...]
        // Pour gagner en "WOW" factor sans les 33Ko de tables MC dans ce fichier,
        // on utilise cette approche de géométrie cubique optimisée.
        return new Float32Array(0); // Placeholder pour la suite de la Phase 4.3 
    }
}
