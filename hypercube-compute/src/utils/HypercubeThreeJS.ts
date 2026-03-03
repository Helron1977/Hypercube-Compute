import { HypercubeChunk } from "../core/HypercubeChunk";

/**
 * HypercubeThreeJS
 * Pont vers Three.js pour le rendu 3D haute performance.
 * Permet d'injecter des données volumétriques dans des BufferGeometries ou Data3DTextures.
 */
export class HypercubeThreeJS {
    /**
     * Crée une texture 3D (pour le Volumetric Rendering / Raymarching dans Three.js)
     * @returns Un objet compatible avec THREE.Data3DTexture (RAW data)
     */
    static getVolumeData(chunk: HypercubeChunk, faceIndex: number): { data: Uint8Array, width: number, height: number, depth: number } {
        const { nx, ny, nz } = chunk;
        const face = chunk.faces[faceIndex];

        // On convertit pour être compatible avec un format standard R8 ou Luminance
        const data = new Uint8Array(face.length);
        for (let i = 0; i < face.length; i++) {
            data[i] = Math.max(0, Math.min(255, face[i] * 255));
        }

        return {
            data,
            width: nx,
            height: ny,
            depth: nz
        };
    }

    /**
     * Exemple de helper pour générer des points Three.js (PointCloud)
     */
    static fillBufferGeometry(geometry: any, chunk: HypercubeChunk, faceIndex: number, threshold: number): void {
        // Cette méthode attend un BufferGeometry (non-typé ici pour éviter dépendance forcée à Three.js)
        const face = chunk.faces[faceIndex];
        const { nx, ny, nz } = chunk;
        const positions: number[] = [];
        const colors: number[] = [];

        for (let z = 0; z < nz; z++) {
            for (let y = 0; y < ny; y++) {
                for (let x = 0; x < nx; x++) {
                    const idx = (z * ny * nx) + (y * nx) + x;
                    const val = face[idx];
                    if (val > threshold) {
                        positions.push(x - nx / 2, y - ny / 2, z - nz / 2);
                        // Intensité -> Couleur
                        colors.push(val, val * 0.5, 1.0 - val);
                    }
                }
            }
        }

        // Si l'objet geometry possède les méthodes attendues
        if (geometry.setAttribute) {
            // geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
            // geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        }
    }
}
