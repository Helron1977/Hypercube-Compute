import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { HypercubeNeoFactory } from '../../../core/HypercubeNeoFactory';

/**
 * LIFE NEBULA V14.0 - THE MASTERPIECE RESTORED
 * Architecture: 2.5D Native ($NZ=1$)
 * Lifecycle: Step -> Sync -> Strategy -> Render
 */
const NX = 64; const NY = 64; const NZ = 1;
const TANK_SIZE = 20;

enum SharkState {
    PATROL = "SEARCHING VOLUME",
    HUNT = "VOLUMETRIC CHASE",
    AMBUSH = "DEEP BRAIN AMBUSH",
    WANDER = "EXPLORING NEBULA",
    RECOVERY = "RECOVERING"
}

class LifeNebula {
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private controls!: OrbitControls;
    
    private engine: any = null;
    private shark!: THREE.Group;
    private preyCount = 50;
    private preyList: THREE.Group[] = [];
    private preyVels: THREE.Vector3[] = [];
    private preyStatus: number[] = [];

    private sharkVel = new THREE.Vector3(0, 0, 0);
    private sharkState: SharkState = SharkState.PATROL;
    private stateTimer = 0;
    private targetIndex = -1;
    private ambushTarget = new THREE.Vector3(0, 0, 0);

    private waterMesh!: THREE.Mesh;
    private waterGeo!: THREE.PlaneGeometry;
    private heatmapCtx!: CanvasRenderingContext2D;

    constructor() {
        this.init3D().then(() => this.initEngine()).catch(console.error);
    }

    private async init3D() {
        const container = document.getElementById('canvas-container')!;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x020617);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(22, 12, 22);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.scene.add(new THREE.HemisphereLight(0x38bdf8, 0x020617, 2));
        const sun = new THREE.DirectionalLight(0xffffff, 4.0);
        sun.position.set(10, 25, 15);
        this.scene.add(sun);

        // Heatmap Display (Legacy HUD)
        const canvas = document.createElement('canvas');
        canvas.width = NX; canvas.height = NY;
        canvas.style.cssText = 'position: absolute; bottom: 20px; right: 20px; width: 140px; height: 140px; border: 2px solid #38bdf8; border-radius: 4px; opacity: 0.9;';
        container.appendChild(canvas);
        this.heatmapCtx = canvas.getContext('2d')!;

        this.setupModels();
    }

    private setupModels() {
        // Shark: High Fidelity
        this.shark = new THREE.Group();
        const sMat = new THREE.MeshPhysicalMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2, clearcoat: 1 });
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.4, 4, 16), sMat);
        body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.7);
        this.shark.add(body);
        this.scene.add(this.shark);

        // Prey: Glow Schools
        const colors = [0xf43f5e, 0x38bdf8, 0x10b981, 0x818cf8];
        for (let i = 0; i < this.preyCount; i++) {
            const mat = new THREE.MeshStandardMaterial({ color: colors[i%4], emissive: colors[i%4], emissiveIntensity: 1.5 });
            const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2), mat);
            p.scale.set(1, 0.4, 1.6);
            this.scene.add(p);
            this.preyList.push(p as any);
            this.preyVels.push(new THREE.Vector3((Math.random()-0.5)*0.12, (Math.random()-0.5)*0.08, (Math.random()-0.5)*0.12));
            this.preyStatus.push(0);
        }

        // Water: Masterpiece Visuals
        this.waterGeo = new THREE.PlaneGeometry(TANK_SIZE, TANK_SIZE, NX - 1, NY - 1);
        const wMat = new THREE.MeshPhysicalMaterial({ 
            color: 0x38bdf8, transparent: true, opacity: 0.75, transmission: 0.4, side: THREE.DoubleSide,
            metalness: 0.8, roughness: 0.1, clearcoat: 1.0, clearcoatRoughness: 0.1
        });
        this.waterMesh = new THREE.Mesh(this.waterGeo, wMat);
        this.waterMesh.position.y = 5; 
        this.waterMesh.rotation.x = -Math.PI / 2;
        this.scene.add(this.waterMesh);
    }

    private async initEngine() {
        const factory = new HypercubeNeoFactory();
        const manifest = await factory.fromManifest('./nebula-manifest.json');
        this.engine = await factory.build(manifest.config, manifest.engine);
        
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'none';

        this.animate();
    }

    private worldToGrid(v: THREE.Vector3) {
        return {
            x: Math.floor(Math.max(0, Math.min(63, (v.x / TANK_SIZE + 0.5) * 64))),
            y: Math.floor(Math.max(0, Math.min(63, (v.z / TANK_SIZE + 0.5) * 64)))
        };
    }

    private gridToWorld(gx: number, gy: number) {
        return new THREE.Vector3(((gx / 64) - 0.5) * TANK_SIZE, 5, ((gy / 64) - 0.5) * TANK_SIZE);
    }

    private isUpdating = false;
    private updateAI = async () => {
        if (!this.engine || this.isUpdating) return;
        this.isUpdating = true;
        try {
            const bridge = this.engine.bridge;
            const chunk = this.engine.vGrid.chunks[0];
            const gShark = this.worldToGrid(this.shark.position);

            // 1. Shark Wake & Obstacle Injection
            const config = (this.engine as any).vGrid.config;
            if (!config.objects) config.objects = [];
            config.objects.push({
                id: 'shark_wake', type: 'circle',
                position: { x: gShark.x - 3, y: gShark.y - 3 }, dimensions: { w: 7, h: 7 },
                properties: { water_h: 8.0, biology: 1.0, obstacles: 1.0 }, rasterMode: "replace"
            });

            // 2. Step Engine (Compute)
            await this.engine.step(1);
            
            // 3. Sync VRAM to RAM (Lifecycle)
            await bridge.syncToHost();
            
            // Cleanup objects for next tick
            config.objects = config.objects.filter((o: any) => o.id !== 'shark_wake');

            // 4. Data Retrieval (Native Patterns)
            const views = bridge.getChunkViews(chunk.id);
            const waterIdx = this.engine.parityManager.getFaceIndices('water_h').read;
            const predIdx = this.engine.parityManager.getFaceIndices('sdf_predator_x').read;
            const heatIdx = this.engine.parityManager.getFaceIndices('strategy_heatmap').read;
            
            const hData = views[waterIdx];
            const px = views[predIdx];
            const heat = views[heatIdx];

            // 5. Update Water Rendering
            const pAttr = this.waterGeo.attributes.position;
            for (let i = 0; i < NX * NY; i++) {
                const v = hData[i];
                pAttr.setZ(i, isNaN(v) ? 0 : (v) * 0.15); // Local Z = Height
            }
            pAttr.needsUpdate = true; this.waterGeo.computeVertexNormals();

            // 6. Shark Strategy Machine
            const tx = px[gShark.y * 64 + gShark.x];
            if (tx !== -10000 && tx !== undefined) {
                const targetPos = this.gridToWorld(tx, gShark.y);
                const desired = targetPos.sub(this.shark.position).normalize();
                
                // Behavior Shifts
                if (this.sharkState === SharkState.PATROL) {
                    this.sharkVel.lerp(desired.multiplyScalar(0.12), 0.05);
                    if (Math.random() < 0.01) this.sharkState = SharkState.AMBUSH;
                } else if (this.sharkState === SharkState.AMBUSH) {
                    this.sharkVel.multiplyScalar(0.8); // Stillness
                    if (Math.random() < 0.05) this.sharkState = SharkState.HUNT;
                } else if (this.sharkState === SharkState.HUNT) {
                    this.sharkVel.lerp(desired.multiplyScalar(0.25), 0.1); // Strike
                    if (Math.random() < 0.05) this.sharkState = SharkState.PATROL;
                }
            }

            // 7. Heatmap & Reinforcement
            this.preyList.forEach((p, i) => {
                const dist = p.position.distanceTo(this.shark.position);
                if (dist < 1.5) {
                    // CATCH!
                    const g = this.worldToGrid(p.position);
                    heat[g.y * 64 + g.x] += 10.0; // Reinforce this location
                    p.position.set((Math.random()-0.5)*18, (Math.random()-0.5)*8, (Math.random()-0.5)*18);
                    console.warn(`Nebula AI: Prey ${i} caught! Heatmap reinforced.`);
                }
            });

            // Viz Heatmap
            const imgData = this.heatmapCtx.createImageData(NX, NY);
            for(let i=0; i<NX*NY; i++) {
                imgData.data[i*4+0] = 0; imgData.data[i*4+1] = Math.min(255, heat[i]*20); imgData.data[i*4+2] = 255; imgData.data[i*4+3] = 255;
            }
            this.heatmapCtx.putImageData(imgData, 0, 0);

        } catch (e) {
            console.error("Nebula Cycle Error:", e);
        } finally {
            this.isUpdating = false;
        }
    }

    private animate = async () => {
        await this.updateAI();
        const b = 9.8; const vh = 4.8;
        
        // Move Shark
        this.shark.position.add(this.sharkVel);
        if (this.sharkVel.lengthSq() > 0.001) this.shark.lookAt(this.shark.position.clone().add(this.sharkVel));
        this.shark.position.clamp(new THREE.Vector3(-b, -vh, -b), new THREE.Vector3(b, vh, b));

        // Move Prey (Escape Drift)
        this.preyList.forEach((p, i) => {
            p.position.add(this.preyVels[i]);
            if (this.preyVels[i].lengthSq() > 0.001) p.lookAt(p.position.clone().add(this.preyVels[i]));
            p.position.clamp(new THREE.Vector3(-b, -vh, -b), new THREE.Vector3(b, vh, b));
            
            // Simple evasion
            if (p.position.distanceTo(this.shark.position) < 4) {
                const evade = p.position.clone().sub(this.shark.position).normalize().multiplyScalar(0.15);
                this.preyVels[i].lerp(evade, 0.2);
            }
        });

        this.renderer.render(this.scene, this.camera);
        this.controls.update();
        requestAnimationFrame(this.animate);
    }
}

new LifeNebula();
