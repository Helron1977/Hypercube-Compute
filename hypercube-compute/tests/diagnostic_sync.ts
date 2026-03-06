import { Hypercube } from '../src/Hypercube';
import { AerodynamicsEngine } from '../src/engines/AerodynamicsEngine';

/**
 * TEST DE DIAGNOSTIC - SYNCHRONISATION MULTI-CHUNKS
 * Ce script vérifie si une valeur injectée dans le chunk (0,0) 
 * traverse réellement vers le chunk (1,0).
 */
async function runDiagnostic() {
    console.log("🚀 Lancement du diagnostic de synchronisation...");

    const grid = await Hypercube.create({
        engine: 'Aerodynamics LBM D2Q9',
        resolution: 64,
        cols: 2,
        rows: 1,
        workers: false, // On teste en séquentiel d'abord pour isoler la logique
        periodic: false
    });

    const chunk0 = grid.cubes[0][0]!;
    const chunk1 = grid.cubes[0][1]!;

    // 1. Injection d'une valeur test dans la fumée (face 22) au bord droit du chunk 0
    // L'index (nx-2) est la dernière colonne active avant la zone fantôme.
    const nx = 64;
    const ny = 64;
    const testIdx = Math.floor(ny / 2) * nx + (nx - 2);
    chunk0.faces[22][testIdx] = 100.0;

    console.log(`Step 0: Valeur injectée dans Chunk 0 index ${testIdx}:`, chunk0.faces[22][testIdx]);
    console.log(`Step 0: Valeur fantôme dans Chunk 1 (colonne 0):`, chunk1.faces[22][Math.floor(ny / 2) * nx]);

    // 2. Déclenchement manuel de la synchronisation
    // @ts-ignore - access private for debug
    grid.synchronizeBoundaries(22);

    console.log("--- SYNCHRONISATION EFFECTUÉE ---");

    const ghostIdx = Math.floor(ny / 2) * nx; // Colonne 0 du chunk 1
    const valueInGhost = chunk1.faces[22][ghostIdx];

    if (valueInGhost === 100.0) {
        console.log("✅ SUCCÈS: La valeur a traversé la frontière vers la cellule fantôme du voisin !");
    } else {
        console.error("❌ ÉCHEC: La cellule fantôme du voisin est restée à:", valueInGhost);
        console.error("Le framework Hypercube ne transmet pas les données entre les chunks.");
    }
}

runDiagnostic().catch(console.error);
