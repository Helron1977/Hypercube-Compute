import type { IHypercubeEngine } from "./IHypercubeEngine";

export class GameOfLifeEngine implements IHypercubeEngine {
    public get name(): string {
        return "Game of Life Ecosystem (O1 Tile)";
    }

    public getRequiredFaces(): number {
        return 6; // Standard
    }

    public getSyncFaces(): number[] {
        return [1, 3]; // L'état actuel t (Face 1) et sa densité visuelle (Face 3) doivent être partagés
    }

    // Seuil et probas pour équilibrer
    private readonly survivalMin = 2; // Min voisins même état pour survivre
    private readonly survivalMax = 3; // Max pour éviter surpop
    private readonly birthThreshold = 3; // Prédateurs pour naissance
    private readonly deathProb = 0.05; // Proba aléatoire de mort (variabilité)
    private readonly growthProb = 0.1; // Proba extra pour vide → plante

    public compute(faces: Float32Array[], mapSize: number): void {
        const current = faces[1]; // État actuel t (0-3)
        const next = faces[2];    // État futur t+1 (0-3)
        const density = faces[3]; // Densité/âge pour visuel soft (0.0-1.0)

        // Clear next
        next.fill(0);

        // Double boucle optimisée pour accès mémoires continus
        for (let y = 0; y < mapSize; y++) {

            const top = (y === 0) ? mapSize - 1 : y - 1;
            const bottom = (y === mapSize - 1) ? 0 : y + 1;

            const topRow = top * mapSize;
            const midRow = y * mapSize;
            const botRow = bottom * mapSize;

            for (let x = 0; x < mapSize; x++) {
                const left = (x === 0) ? mapSize - 1 : x - 1;
                const right = (x === mapSize - 1) ? 0 : x + 1;

                const idx = midRow + x;
                const state = Math.floor(current[idx]); // 0: Vide, 1: Plante, 2: Herbi, 3: Carni

                // Le prédateur / successeur de l'état actuel
                const targetState = (state + 1) % 4;

                let sameState = 0;
                let predators = 0;

                // Von Neumann Neighborhood (Cardinaux, poids 1.5)
                sameState += (current[topRow + x] === state ? 1.5 : 0) + (current[botRow + x] === state ? 1.5 : 0) +
                    (current[midRow + left] === state ? 1.5 : 0) + (current[midRow + right] === state ? 1.5 : 0);
                predators += (current[topRow + x] === targetState ? 1.5 : 0) + (current[botRow + x] === targetState ? 1.5 : 0) +
                    (current[midRow + left] === targetState ? 1.5 : 0) + (current[midRow + right] === targetState ? 1.5 : 0);

                // Moore Neighborhood (Diagonales, poids 1)
                sameState += (current[topRow + left] === state ? 1 : 0) + (current[topRow + right] === state ? 1 : 0) +
                    (current[botRow + left] === state ? 1 : 0) + (current[botRow + right] === state ? 1 : 0);
                predators += (current[topRow + left] === targetState ? 1 : 0) + (current[topRow + right] === targetState ? 1 : 0) +
                    (current[botRow + left] === targetState ? 1 : 0) + (current[botRow + right] === targetState ? 1 : 0);

                // Règles organiques d'écosystème
                let newState = state;
                let newDensity = density[idx];

                if (predators >= this.birthThreshold) {
                    newState = targetState; // Naissance / invasion par le prédateur
                    newDensity = 0.5 + Math.random() * 0.5; // Densité initiale aléatoire
                } else if (sameState < this.survivalMin || sameState > this.survivalMax) {
                    newState = 0; // Mort par isolement ou surpopulation
                    newDensity = 0;
                } else if (Math.random() < this.deathProb) {
                    newState = 0; // Mort stochastique naturelle
                    newDensity = 0;
                } else if (state === 0 && Math.random() < this.growthProb) {
                    newState = 1; // Colonisation aléatoire du vide par plante
                    newDensity = 0.3 + Math.random() * 0.4;
                } else {
                    // Survie saine : la densité/âge augmente
                    newDensity = Math.min(1.0, newDensity + 0.1);
                }

                next[idx] = newState;
                density[idx] = newDensity;
            }
        }

        // Swap / Recopie mémoire ultra-rapide de l'état (t+1) vers (t)
        current.set(next);
    }
}




































