# Hypercube V4 - Declarative Architecture (CPU Focus)

Hypercube V4 marks a fundamental shift from imperative memory management to a **Declarative Physical Simulation** model, optimized for high-performance CPU execution.

## 核心哲学 (Philosophy)

L'architecture V4 repose sur trois piliers :
1. **Contrat sur l'Espace (Grid)** : Les dimensions et le partitionnement sont gérés par le système. Support multi-chunks natif.
2. **Contrat sur l'Engine (Declarative)** : L'utilisateur définit *ce qui se passe* (LBM, Heat, Aerodynamics) via un Manifest (`EngineDescriptor`) sans se soucier du transport de données.
3. **Contrat sur le Rendu (Visual Profile)** : Le rendu est une conséquence automatique de l'état physique, géré par le `Rasterizer`.

## API Haute Niveau (V4/V5)

Initialisez une simulation complexe en une seule déclaration :

```typescript
const sim = await Hypercube.create({
    dimensions: [256, 256, 1],
    engine: "HeatDiffusion3D", // Declarative Engine ID
    params: {
        diffusionRate: 0.15
    },
    useWorkers: true // Multithreading automatique
});

// Le rendu est orchestré séparément
Hypercube.start(sim, canvas);
```

## Structure de V4

Le dossier `/v4` contient le noyau de cette nouvelle approche :
- `/core` : Gestionnaire de mémoire (`MasterBuffer`), Workers (CPU Pool), et synchronisation automatique des frontières.
- `/engines` : Implémentations physiques conformes à l'interface `IHypercubeEngine`.
- `/archive` : Stockage des expérimentations GPU précédentes (pour référence future).

## Orchestration (V8 Core)

V4 utilise un système de **Shims** (V8EngineShim) pour traduire les manifests déclaratifs en exécution impérative optimisée sur les threads CPU d'Hypercube.
