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

    // CPU: buffer temporaire pour l'algorithme wavefront (Dijkstra)
    private wavefrontBuffer: Float32Array | null = null;

    // WebGPU: Pipelines multi-passes (Bellman-Ford Parallèle)
    private pipelineInit: GPUComputePipeline | null = null;
    private pipelineRelax: GPUComputePipeline | null = null;
    private pipelineGradient: GPUComputePipeline | null = null;
    private bindGroup: GPUBindGroup | null = null;
    private passCount: number;

    /**
     * @param gpuPassCount Nombre d'itérations de relaxation (Bellman-Ford) par Frame. Plus c'est élevé, plus la carte de distance converge vite sur la grille.
     */
    constructor(gpuPassCount: number = 30) {
        this.passCount = gpuPassCount;
    }

    /**
     * Initialisation spécifique au GPU. Compile les shaders et prépare les BindGroups.
     */
    initGPU(device: GPUDevice, facesBuffers: GPUBuffer[], mapSize: number): void {
        const wgsl = this.wgslSource;
        const shaderModule = device.createShaderModule({ code: wgsl });

        this.pipelineInit = device.createComputePipeline({ layout: 'auto', compute: { module: shaderModule, entryPoint: 'compute_init' } });
        this.pipelineRelax = device.createComputePipeline({ layout: 'auto', compute: { module: shaderModule, entryPoint: 'compute_relax' } });
        this.pipelineGradient = device.createComputePipeline({ layout: 'auto', compute: { module: shaderModule, entryPoint: 'compute_gradient' } });

        const uniformBuffer = device.createBuffer({
            size: 16, // mapSize(u32) + padding
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([mapSize]));

        this.bindGroup = device.createBindGroup({
            layout: this.pipelineInit.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: facesBuffers[0] } }, // Face 1 (Cost)
                { binding: 1, resource: { buffer: facesBuffers[1] } }, // Face 2 (Target)
                { binding: 2, resource: { buffer: facesBuffers[2] } }, // Face 3 (Integration/Distance)
                { binding: 3, resource: { buffer: facesBuffers[5] } }, // Face 6 (Vector Field)
                { binding: 4, resource: { buffer: uniformBuffer } }
            ]
        });
    }

    /**
     * Dispatch GPU des différents Compute Shaders (Bellman-Ford itératif)
     */
    computeGPU(passEncoder: GPUComputePassEncoder, mapSize: number): void {
        if (!this.bindGroup) return;

        passEncoder.setBindGroup(0, this.bindGroup);
        const workgroupCount = Math.ceil(mapSize / 16);

        // 1. Initialisation (Reset distances, cibles à 0)
        if (this.pipelineInit) {
            passEncoder.setPipeline(this.pipelineInit);
            passEncoder.dispatchWorkgroups(workgroupCount, workgroupCount);
        }

        // 2. Relaxation Bellman-Ford (Propagation de la distance)
        if (this.pipelineRelax) {
            passEncoder.setPipeline(this.pipelineRelax);
            // On exécute N passes par frame pour propager les valeurs à travers la grille
            for (let i = 0; i < this.passCount; i++) {
                passEncoder.dispatchWorkgroups(workgroupCount, workgroupCount);
            }
        }

        // 3. Calcul du Gradient (Vector Field O(1))
        if (this.pipelineGradient) {
            passEncoder.setPipeline(this.pipelineGradient);
            passEncoder.dispatchWorkgroups(workgroupCount, workgroupCount);
        }
    }

    /**
     * @WebGPU
     * Code WGSL statique du Flow Field Pathfinding.
     * Implémente le Bellman-Ford parallèle pour la carte de distance (Face 3)
     * et l'algorithme de Kernel d'influence 3x3 pour le calcul de gradient (Face 6).
     */
    get wgslSource(): string {
        return `
            struct Uniforms {
                mapSize: u32,
            };

            @group(0) @binding(0) var<storage, read> face1_cost: array<f32>;
            @group(0) @binding(1) var<storage, read> face2_target: array<f32>;
            @group(0) @binding(2) var<storage, read_write> face3_integration: array<f32>;
            @group(0) @binding(3) var<storage, write> face6_vector: array<f32>;
            @group(0) @binding(4) var<uniform> config: Uniforms;

            const MAX_DISTANCE: f32 = 999999.0;

            // --- PASS 1: Initialisation ---
            @compute @workgroup_size(16, 16)
            fn compute_init(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let x = global_id.x;
                let y = global_id.y;
                let mapSize = config.mapSize;

                if (x >= mapSize || y >= mapSize) { return; }
                let idx = y * mapSize + x;

                if (face2_target[idx] == 0.0) {
                    face3_integration[idx] = 0.0; // Distance à la cible = 0
                } else {
                    face3_integration[idx] = MAX_DISTANCE; // Autres cases à l'infini
                }
            }

            // --- PASS 2: Relaxation (Bellman-Ford Parallèle sur Grille) ---
            @compute @workgroup_size(16, 16)
            fn compute_relax(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let x = i32(global_id.x);
                let y = i32(global_id.y);
                let mapSize = i32(config.mapSize);

                if (x >= mapSize || y >= mapSize) { return; }
                
                let idx = u32(y * mapSize + x);
                let myCost = face1_cost[idx];

                // Si c'est un mur infranchissable, ignorer
                if (myCost == 0.0) { return; }

                var bestDist = face3_integration[idx];
                let offsets = array<vec2<i32>, 4>(
                    vec2<i32>(0, -1), vec2<i32>(1, 0), vec2<i32>(0, 1), vec2<i32>(-1, 0)
                );

                for (var i = 0; i < 4; i++) {
                    let nx = x + offsets[i].x;
                    let ny = y + offsets[i].y;

                    if (nx >= 0 && nx < mapSize && ny >= 0 && ny < mapSize) {
                        let nIdx = u32(ny * mapSize + nx);
                        // Ne lire que les voisins franchissables (facultatif si myCost suffit, mais plus sûr)
                        if (face1_cost[nIdx] > 0.0) {
                            let neighborDist = face3_integration[nIdx];
                            let theoreticalDist = neighborDist + myCost;
                            
                            if (theoreticalDist < bestDist) {
                                bestDist = theoreticalDist;
                            }
                        }
                    }
                }

                if (bestDist < face3_integration[idx]) {
                    face3_integration[idx] = bestDist;
                }
            }

            // --- PASS 3: Vector Vector Field (Gradient) ---
            @compute @workgroup_size(16, 16)
            fn compute_gradient(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let x = i32(global_id.x);
                let y = i32(global_id.y);
                let mapSize = i32(config.mapSize);

                if (x >= mapSize || y >= mapSize) { return; }
                let idx = u32(y * mapSize + x);

                if (face1_cost[idx] == 0.0) {
                    face6_vector[idx] = 0.0;
                    return;
                }

                var bestDist = face3_integration[idx];
                var dirX: f32 = 0.0;
                var dirY: f32 = 0.0;

                for (var dy = -1; dy <= 1; dy++) {
                    for (var dx = -1; dx <= 1; dx++) {
                        if (dx == 0 && dy == 0) { continue; }

                        let nx = x + dx;
                        let ny = y + dy;

                        if (nx >= 0 && nx < mapSize && ny >= 0 && ny < mapSize) {
                            let nIdx = u32(ny * mapSize + nx);
                            if (face1_cost[nIdx] > 0.0) {
                                let dist = face3_integration[nIdx];
                                if (dist < bestDist) {
                                    bestDist = dist;
                                    dirX = f32(dx);
                                    dirY = f32(dy);
                                }
                            }
                        }
                    }
                }

                var length = sqrt(dirX * dirX + dirY * dirY);
                if (length > 0.0) {
                    dirX = dirX / length;
                    dirY = dirY / length;
                }

                // Compress vector: encodeX = (X+1)*1000, encodeY = (Y+1)
                let packedVector = ((dirX + 1.0) * 1000.0) + (dirY + 1.0);
                face6_vector[idx] = packedVector;
            }
        `;
    }

    /**
     * Calcule la carte d'intégration (Dijkstra) puis dérive le champ vectoriel.
     * Version CPU (Mode Fallback Séquentiel/WebWorker).
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

        let activeNodes: number[] = [];
        for (let i = 0; i < totalCells; i++) {
            if (face2_Target[i] === 0) {
                face3_Integration[i] = 0;
                activeNodes.push(i);
            } else {
                face3_Integration[i] = this.MAX_DISTANCE;
            }
        }

        const cardinalOffsets = [-mapSize, 1, mapSize, -1];

        // 2. Wavefront (DijkstraCPU)
        while (activeNodes.length > 0) {
            const nextNodes: number[] = [];

            for (let idx of activeNodes) {
                const currentDist = face3_Integration[idx];
                const c = idx % mapSize;

                for (let i = 0; i < 4; i++) {
                    if (i === 1 && c === mapSize - 1) continue;
                    if (i === 3 && c === 0) continue;

                    const nIdx = idx + cardinalOffsets[i];

                    if (nIdx >= 0 && nIdx < totalCells) {
                        const cost = face1_Cost[nIdx];
                        if (cost > 0) {
                            const newDist = currentDist + cost;
                            if (newDist < face3_Integration[nIdx]) {
                                face3_Integration[nIdx] = newDist;
                                nextNodes.push(nIdx);
                            }
                        }
                    }
                }
            }
            activeNodes = nextNodes;
        }

        // 3. Vector Field (Face 6)
        for (let y = 0; y < mapSize; y++) {
            for (let x = 0; x < mapSize; x++) {
                const idx = y * mapSize + x;

                if (face1_Cost[idx] === 0) {
                    face6_Vector[idx] = 0;
                    continue;
                }

                let bestDist = face3_Integration[idx];
                let dirX = 0; let dirY = 0;

                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;

                        const nx = x + dx; const ny = y + dy;

                        if (nx >= 0 && nx < mapSize && ny >= 0 && ny < mapSize) {
                            const nIdx = ny * mapSize + nx;
                            if (face1_Cost[nIdx] > 0) {
                                const dist = face3_Integration[nIdx];
                                if (dist < bestDist) {
                                    bestDist = dist;
                                    dirX = dx; dirY = dy;
                                }
                            }
                        }
                    }
                }

                let length = Math.sqrt(dirX * dirX + dirY * dirY);
                if (length > 0) { dirX /= length; dirY /= length; }

                face6_Vector[idx] = ((dirX + 1.0) * 1000.0) + (dirY + 1.0);
            }
        }
    }
}
