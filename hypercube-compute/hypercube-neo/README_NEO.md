# Hypercube Neo - Cognitive Copilot 🚀

Hypercube Neo est une réimplémentation moderne, déclarative et modulaire du moteur Hypercube, conçue pour la performance multi-thread et la fidélité physique absolue.

## 🌟 Principes Clés

1.  **Parité 1:1** : Le noyau `NeoAeroKernel` est mathématiquement identique au moteur legacy (erreur de 0.0 confirmée par tests).
2.  **Architecture Déclarative** : Définissez votre simulation via un JSON simple (EngineDescriptor et HypercubeConfig).
3.  **Performance Native** : Optimisation **Zero-Copy** pour éliminer les copies mémoire inutiles entre les étapes de calcul.
4.  **Multi-Chunk** : Décomposition automatique du domaine pour le parallélisme CPU/GPU.

---

## 🛠️ Guide d'Utilisation (API)

### 1. Déclarer le Moteur (EngineDescriptor)
Définit les "visages" (faces) de données et les règles physiques.

```typescript
const aeroDescriptor: EngineDescriptor = {
    name: 'Aerodynamics-Neo',
    version: '1.0.0',
    faces: [
        { name: 'f0', type: 'scalar', isSynchronized: true, isPersistent: false }, // Population LBM
        { name: 'vx', type: 'scalar', isSynchronized: true },                      // Vitesse X
        { name: 'smoke', type: 'scalar', isSynchronized: true }                  // Traceur
        // ... (f1-f8, vy, vorticity, obstacles)
    ],
    rules: [
        { type: 'aero-fidelity', method: 'Custom', source: 'f0', params: { omega: 1.75, inflowUx: 0.15 } }
    ],
    requirements: { ghostCells: 1, pingPong: true }
};
```

### 2. Configurer la Simulation (HypercubeConfig)
Définit la résolution, le découpage et les objets physiques.

```typescript
const config: HypercubeConfig = {
    dimensions: { nx: 512, ny: 512, nz: 1 },
    chunks: { x: 2, y: 2 },                      // Découpe en 4 chunks pour le parallélisme
    boundaries: { all: { role: 'wall' } },
    engine: 'Aerodynamics-Neo',
    objects: [
        {
            id: 'wing-1',
            type: 'polygon',
            position: { x: 100, y: 200 },
            dimensions: { w: 100, h: 40 },
            points: wingPoints,                  // Points générés par NacaHelper
            properties: { isObstacle: 1 }
        }
    ],
    params: {},
    mode: 'cpu'
};
```

### 3. Instanciation et Exécution
Utilisez la factory pour démarrer la machine.

```typescript
const factory = new HypercubeNeoFactory();
const neo = await factory.instantiate(config, aeroDescriptor);

// Dans votre boucle de rendu
async function loop() {
    await neo.step(t); // Calculer t+1
    requestAnimationFrame(loop);
}
```

---

## 🧪 Validation & Tests

Pour s'assurer que vos modifications ne cassent rien, lancez les tests de fidélité :

```bash
npm test hypercube-neo/tests/fidelity.test.ts
```

- **Vert** : Votre moteur est mathématiquement identique à la référence.
- **Rouge** : Divergence numérique détectée (vérifiez vos indices ou groupements algébriques).

---

## 🚀 Prochaines Étapes
- [ ] **Multi-Worker Dispatcher** : Parallélisation réelle des chunks sur différents threads CPU.
- [ ] **WebGPU Backend** : Activation des kernels WGSL pour une performance massive.
- [ ] **SDF Interpolation** : Anti-aliasing des objets pour des contours parfaitement lisses.
