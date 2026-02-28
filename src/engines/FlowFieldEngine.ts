import type { ITriadeEngine } from './ITriadeEngine';

/**
 * FlowFieldEngine (Moteur de Pathfinding V3)
 * Génère un champ vectoriel continu pour guider 10 000+ agents vers une cible en temps constant O(1).
 * 
 * Mapping des Faces :
 * Face 1: Cost Map (0: Mur Infranchissable, >0: Coût de déplacement)
 * Face 2: Target Map (0: Objectif, 1: Neutre). Les cibles sont les sources de l'algorithme de Dijkstra.
 * Face 3: Integration Field (Distance cumulée vers la cible la plus proche).
 * Face 6: Vector Field (Vecteurs X, Y compactés depuis le gradient de Face 3).
 */
export class FlowFieldEngine implements ITriadeEngine {
    public readonly name = "Flow-Field Pathfinding V3";
    private readonly MAX_DISTANCE = 999999.0;

    // Optimisation CPU: buffer temporaire pour l'algorithme wavefront (Dijkstra)
    private wavefrontBuffer: Float32Array | null = null;

    constructor() { }

    /**
     * Calcule la carte d'intégration (Dijkstra) puis dérive le champ vectoriel.
     * Version CPU.
     */
    compute(faces: Float32Array[], mapSize: number): void {
        const face1_Cost = faces[0];
        const face2_Target = faces[1];
        const face3_Integration = faces[2];
        const face6_Vector = faces[5];

        const totalCells = mapSize * mapSize;

        // 1. Initialisation de l'Integration Field
        if (!this.wavefrontBuffer || this.wavefrontBuffer.length !== totalCells) {
            this.wavefrontBuffer = new Float32Array(totalCells);
        }

        // Marquer toutes les cellules à l'infini, sauf les cibles (Face 2 à 0) qui sont à distance 0
        let activeNodes: number[] = [];
        for (let i = 0; i < totalCells; i++) {
            if (face2_Target[i] === 0) {
                face3_Integration[i] = 0;
                activeNodes.push(i);
            } else {
                face3_Integration[i] = this.MAX_DISTANCE;
            }
        }

        // 2. Passe Wavefront (Dijkstra simplifié sur grille uniforme)
        // Les coûts (Face 1) déterminent le "poids" de la traversée. Un coût de 0 signifie un Obstacle (Infranchissable).
        const cardinalOffsets = [
            -mapSize, // Haut
            1,        // Droite
            mapSize,  // Bas
            -1        // Gauche
        ];

        while (activeNodes.length > 0) {
            const nextNodes: number[] = [];

            for (let idx of activeNodes) {
                const currentDist = face3_Integration[idx];
                const r = Math.floor(idx / mapSize);
                const c = idx % mapSize;

                // Parcourir les 4 voisins
                for (let i = 0; i < 4; i++) {
                    // Éviter le débordement des bords (Wrap-Around CPU handled par Boundary Sync, mais on sécurise ici l'intra-cube)
                    if (i === 1 && c === mapSize - 1) continue;
                    if (i === 3 && c === 0) continue;

                    const nIdx = idx + cardinalOffsets[i];

                    if (nIdx >= 0 && nIdx < totalCells) {
                        const cost = face1_Cost[nIdx];

                        // Si le voisin n'est pas un mur (cost > 0)
                        if (cost > 0) {
                            const newDist = currentDist + cost;

                            if (newDist < face3_Integration[nIdx]) {
                                face3_Integration[nIdx] = newDist; // Relaxation
                                nextNodes.push(nIdx);
                            }
                        }
                    }
                }
            }
            activeNodes = nextNodes; // Prochaine vague
        }

        // 3. Passe O(N) Opcodes pour la génération du Champ Vectoriel (Face 6)
        // Calcule le gradient (pente) de l'Integration Field
        for (let y = 0; y < mapSize; y++) {
            for (let x = 0; x < mapSize; x++) {
                const idx = y * mapSize + x;

                // Si la cellule est un mur, pas de vecteur
                if (face1_Cost[idx] === 0) {
                    face6_Vector[idx] = 0; // Float32 vide
                    continue;
                }

                let bestDist = face3_Integration[idx];
                let dirX = 0;
                let dirY = 0;

                // Vérifier les 8 voisins (Diagonales incluses pour un vecteur plus doux)
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue; // Soi-même

                        const nx = x + dx;
                        const ny = y + dy;

                        if (nx >= 0 && nx < mapSize && ny >= 0 && ny < mapSize) {
                            const nIdx = ny * mapSize + nx;
                            // Ne pas aller dans un mur
                            if (face1_Cost[nIdx] > 0) {
                                const dist = face3_Integration[nIdx];
                                if (dist < bestDist) {
                                    bestDist = dist;
                                    dirX = dx;
                                    dirY = dy;
                                }
                            }
                        }
                    }
                }

                // Normaliser le vecteur (dirX, dirY)
                let length = Math.sqrt(dirX * dirX + dirY * dirY);
                if (length > 0) {
                    dirX /= length;
                    dirY /= length;
                }

                // Compactage (Packing) des flotteurs X/Y dans le Float32 de Face 6
                // Sachant que X et Y sont entre -1 et 1, on les map de [0, 2]
                // Astuce O1 : EncodeX = (X+1)*1000, EncodeY = (Y+1) -> EncodeTotal = EncodeX + EncodeY
                // Ex: vecteur(1, 1) -> X+1=2, Y+1=2 -> 2002
                const packedVector = ((dirX + 1.0) * 1000.0) + (dirY + 1.0);
                face6_Vector[idx] = packedVector;
            }
        }
    }
}
