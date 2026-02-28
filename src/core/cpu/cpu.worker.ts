import type { TriadeMasterBuffer } from '../TriadeMasterBuffer';
import { TriadeCubeV2 } from '../TriadeCubeV2';
import type { ITriadeEngine } from '../../engines/ITriadeEngine';
// Import statique des moteurs connus (A améliorer via un Registry dynamique plus tard)
import { HeatmapEngine } from '../../engines/HeatmapEngine';

/**
 * Script de base exécuté par les instances Web Worker de la TriadeWorkerPool.
 * N'a pas de DOM, uniquement CPU/Math.
 */

// Simulation d'un faux Master Buffer pour passer la vérification du constructeur TriadeCubeV2
class WorkerMasterBufferDummy {
    public buffer: SharedArrayBuffer;
    private offset: number = 0;
    constructor(sharedBuf: SharedArrayBuffer) {
        this.buffer = sharedBuf;
    }
    // Ne fait rien, car le cube est déjà alloué par le Main Thread
    allocateCube(mapSize: number, numFaces: number = 6): number {
        return this.offset;
    }
}

self.onmessage = (e: MessageEvent) => {
    const data = e.data;

    if (data.type === 'COMPUTE') {
        const { engineName, engineConfig, sharedBuffer, cubeOffset, mapSize } = data;

        if (!sharedBuffer) {
            console.error("[Worker] Pas de SharedArrayBuffer reçu.");
            postMessage({ type: 'DONE', success: false });
            return;
        }

        // 1. Recréer l'Engine depuis son nom et sa config
        let engine: ITriadeEngine | null = null;
        if (engineName === 'Heatmap (O1 Spatial Convolution)') {
            engine = new HeatmapEngine(engineConfig?.radius, engineConfig?.weight);
        } else {
            // Fallback temporaire pour les autres moteurs non gérés dynamiquement ici
            console.error(`[Worker] Moteur non reconnu ou non supporté par les Web Workers: ${engineName}`);
            postMessage({ type: 'DONE', success: false });
            return;
        }

        // 2. Mock du Master Buffer pour Mapper la VUE (les Float32Array)
        const dummyBuffer = new WorkerMasterBufferDummy(sharedBuffer);
        // On fausse l'offset du dummyBuffer pour que allocateCube renvoie l'offset demandé
        (dummyBuffer as any).offset = cubeOffset;

        // 3. Reconstruire le Cube (Zéro-Copie des données, on ne fait que recréer l'objet JS conteneur)
        // Attention: TriadeCubeV2 va instancier ses Float32Array par dessus l'offset passé
        const cube = new TriadeCubeV2(mapSize, dummyBuffer as unknown as TriadeMasterBuffer, 6);
        cube.setEngine(engine);

        // 4. Calcul Lourd O(N) -> O(1)
        cube.compute();

        // 5. Libération et notification Main Thread
        // (La mémoire est déjà à jour via SharedArrayBuffer)
        postMessage({ type: 'DONE', success: true });
    }
};
