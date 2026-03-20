import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { HypercubeNeoFactory } from '../../../core/HypercubeNeoFactory';

/**
 * LIFE NEBULA V17.0 - THE SOUL RESTORED
 * Fix: Ghost-Cell Stride (66x66 -> 64x64)
 * Fix: Prey Flocking (Boids) & Shark Persistence
 */
const NX = 64; const NY = 64; const NZ = 1;
const TANK_SIZE = 20;
const SURFACE_Y = 5;

enum SharkState {
    PATROL = "SEARCHING VOLUME",
    HUNT = "VOLUMETRIC CHASE",
    AMBUSH = "DEEP BRAIN AMBUSH",
}

class LifeNebula {
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private controls!: OrbitControls;
    
    private engine: any = null;
    private shark!: THREE.Group;
    private preyCount = 60;
    private preyList: THREE.Group[] = [];
    private preyVels: THREE.Vector3[] = [];

    private sharkVel = new THREE.Vector3(0, 0, 0);
    private sharkState: SharkState = SharkState.PATROL;
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
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(18, 14, 18);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.scene.add(new THREE.HemisphereLight(0x38bdf8, 0x020617, 2));
        const sun = new THREE.DirectionalLight(0xffffff, 3.5);
        sun.position.set(10, 25, 10);
        this.scene.add(sun);

        const canvas = document.createElement('canvas');
        canvas.width = NX; canvas.height = NY;
        canvas.style.cssText = 'position: absolute; bottom: 20px; right: 20px; width: 140px; height: 140px; border: 2px solid #38bdf8; border-radius: 4px; opacity: 0.8;';
        container.appendChild(canvas);
        this.heatmapCtx = canvas.getContext('2d')!;

        this.setupModels();
    }

    private setupModels() {
        this.shark = new THREE.Group();
        const sMat = new THREE.MeshPhysicalMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.1, clearcoat: 1 });
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 4, 16), sMat);
        body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.8);
        this.shark.add(body);
        this.shark.position.set(0, SURFACE_Y, 0);
        this.scene.add(this.shark);

        const colors = [0xf43f5e, 0x38bdf8, 0x10b981, 0x818cf8];
        for (let i = 0; i < this.preyCount; i++) {
            const mat = new THREE.MeshStandardMaterial({ 
                color: colors[i%4], emissive: colors[i%4], emissiveIntensity: 2.5 
            });
            const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18), mat);
            p.scale.set(1, 0.5, 1.8);
            p.position.set((Math.random()-0.5)*18, SURFACE_Y + (Math.random()-0.5)*1, (Math.random()-0.5)*18);
            this.scene.add(p);
            this.preyList.push(p as any);
            this.preyVels.push(new THREE.Vector3((Math.random()-0.5)*0.1, 0, (Math.random()-0.5)*0.1));
        }

        this.waterGeo = new THREE.PlaneGeometry(TANK_SIZE, TANK_SIZE, NX - 1, NY - 1);
        const wMat = new THREE.MeshPhysicalMaterial({ 
            color: 0x38bdf8, transparent: true, opacity: 0.65, transmission: 0.5, side: THREE.DoubleSide,
            metalness: 0.9, roughness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.05
        });
        this.waterMesh = new THREE.Mesh(this.waterGeo, wMat);
        this.waterMesh.position.y = SURFACE_Y; 
        this.waterMesh.rotation.x = -Math.PI / 2;
        this.scene.add(this.waterMesh);
    }

    private async initEngine() {
        const factory = new HypercubeNeoFactory();
        const manifest = await factory.fromManifest('./nebula-manifest.json');
        this.engine = await factory.build(manifest.config, manifest.engine);
        if (document.getElementById('loader')) document.getElementById('loader')!.style.display = 'none';
        this.animate();
    }

    private worldToGrid(v: THREE.Vector3) {
        return {
            x: Math.floor(Math.max(0, Math.min(63, (v.x / TANK_SIZE + 0.5) * 64))),
            y: Math.floor(Math.max(0, Math.min(63, (v.z / TANK_SIZE + 0.5) * 64)))
        };
    }

    private gridToWorld(gx: number, gy: number) {
        return new THREE.Vector3(((gx / 64) - 0.5) * TANK_SIZE, SURFACE_Y, ((gy / 64) - 0.5) * TANK_SIZE);
    }

    private isUpdating = false;
    private updateAI = async () => {
        if (!this.engine || this.isUpdating) return;
        this.isUpdating = true;
        try {
            const bridge = this.engine.bridge;
            const chunk = this.engine.vGrid.chunks[0];
            const gShark = this.worldToGrid(this.shark.position);

            const config = (this.engine as any).vGrid.config;
            if (!config.objects) config.objects = [];
            config.objects.push({
                id: 'shark_wake', type: 'circle',
                position: { x: gShark.x - 3, y: gShark.y - 3 }, dimensions: { w: 7, h: 7 },
                properties: { rho: 6.0, biology: 1.0 }, rasterMode: "replace"
            });

            await this.engine.step(1);
            await bridge.syncToHost();
            
            config.objects = config.objects.filter((o: any) => o.id !== 'shark_wake');

            const views = bridge.getChunkViews(chunk.id);
            const rIdx = this.engine.parityManager.getFaceIndices('rho').read;
            const pIdx = this.engine.parityManager.getFaceIndices('sdf_predator_x').read;
            const hIdx = this.engine.parityManager.getFaceIndices('strategy_heatmap').read;
            
            const rData = views[rIdx];
            const pxData = views[pIdx];
            const heatData = views[hIdx];

            // --- STRIDE FIX (66x66 -> 64x64) ---
            const pAttr = this.waterGeo.attributes.position;
            const stride = NX + 2; // Padded width
            for (let y = 0; y < NY; y++) {
                for (let x = 0; x < NX; x++) {
                    const vertIdx = y * NX + x;
                    const vramIdx = (y + 1) * stride + (x + 1); // Skip 1-pixel ghost border
                    const v = rData[vramIdx];
                    pAttr.setZ(vertIdx, isNaN(v) ? 0 : (v - 1.0) * 80.0);
                }
            }
            pAttr.needsUpdate = true; this.waterGeo.computeVertexNormals();

            // --- SHARK INTELLIGENCE ---
            const tx = pxData[(gShark.y + 1) * stride + (gShark.x + 1)]; // Corrected index for SDF read
            if (tx !== -10000 && tx !== undefined) {
                const targetPos = this.gridToWorld(tx, gShark.y);
                const desired = targetPos.sub(this.shark.position).normalize();
                
                if (this.sharkState === SharkState.PATROL) {
                    this.sharkVel.lerp(desired.multiplyScalar(0.12), 0.05);
                    if (Math.random() < 0.01) this.sharkState = SharkState.AMBUSH;
                } else if (this.sharkState === SharkState.AMBUSH) {
                    this.sharkVel.multiplyScalar(0.85);
                    if (Math.random() < 0.05) this.sharkState = SharkState.HUNT;
                } else if (this.sharkState === SharkState.HUNT) {
                    this.sharkVel.lerp(desired.multiplyScalar(0.3), 0.15); // Faster strike
                    if (Math.random() < 0.04) this.sharkState = SharkState.PATROL;
                }
            }

            // --- CAPTURE & HEATMAP ---
            this.preyList.forEach((p, i) => {
                const dist = p.position.distanceTo(this.shark.position);
                if (dist < 1.4) {
                    const g = this.worldToGrid(p.position);
                    heatData[(g.y + 1) * stride + (g.x + 1)] += 20.0; 
                    p.position.set((Math.random()-0.5)*18, SURFACE_Y, (Math.random()-0.5)*18);
                    console.warn(`Success: Catch @ grid ${g.x}, ${g.y}`);
                }
            });

            // Viz Heatmap (Interior only)
            const imgData = this.heatmapCtx.createImageData(NX, NY);
            for(let y=0; y<NY; y++) {
                for(let x=0; x<NX; x++) {
                    const idx = (y * NX + x) * 4;
                    const h = heatData[(y + 1) * stride + (x + 1)];
                    imgData.data[idx+0] = 0; imgData.data[idx+1] = Math.min(255, h*25); imgData.data[idx+2] = 255; imgData.data[idx+3] = 255;
                }
            }
            this.heatmapCtx.putImageData(imgData, 0, 0);

        } catch (e) { console.error("Nebula Stride Error:", e); }
        finally { this.isUpdating = false; }
    }

    private animate = async () => {
        await this.updateAI();
        const b = 9.8; 
        
        // Wall Avoidance
        const distX = b - Math.abs(this.shark.position.x);
        const distZ = b - Math.abs(this.shark.position.z);
        if (distX < 3 || distZ < 3) {
            const push = new THREE.Vector3(-this.shark.position.x, 0, -this.shark.position.z).normalize().multiplyScalar(0.12);
            this.sharkVel.lerp(push, 0.1);
        }

        this.shark.position.add(this.sharkVel);
        if (this.sharkVel.lengthSq() > 0.001) this.shark.lookAt(this.shark.position.clone().add(this.sharkVel));
        this.shark.position.clamp(new THREE.Vector3(-b, SURFACE_Y - 2, -b), new THREE.Vector3(b, SURFACE_Y + 2, b));

        // --- PREY FLOCKING (BOIDS LIGHT) ---
        this.preyList.forEach((p, i) => {
            let cohesion = new THREE.Vector3();
            let separation = new THREE.Vector3();
            let count = 0;

            for (let j = 0; j < 15; j++) { // Check neighbors
                const other = this.preyList[(i + j + 1) % this.preyCount];
                const dist = p.position.distanceTo(other.position);
                if (dist < 3) {
                    cohesion.add(other.position);
                    separation.add(p.position.clone().sub(other.position).divideScalar(dist + 0.1));
                    count++;
                }
            }

            if (count > 0) {
                cohesion.divideScalar(count).sub(p.position).multiplyScalar(0.02);
                separation.multiplyScalar(0.05);
                this.preyVels[i].add(cohesion).add(separation);
            }

            // Wall Bounce
            if (b - Math.abs(p.position.x) < 2 || b - Math.abs(p.position.z) < 2) {
                this.preyVels[i].add(new THREE.Vector3(-p.position.x, 0, -p.position.z).normalize().multiplyScalar(0.04));
            }

            // Hunter Evasion
            const distToShark = p.position.distanceTo(this.shark.position);
            if (distToShark < 4.5) {
                const evade = p.position.clone().sub(this.shark.position).normalize().multiplyScalar(0.2);
                this.preyVels[i].lerp(evade, 0.3);
            }

            this.preyVels[i].clampLength(0.02, 0.15);
            p.position.add(this.preyVels[i]);
            if (this.preyVels[i].lengthSq() > 0.001) p.lookAt(p.position.clone().add(this.preyVels[i]));
            p.position.clamp(new THREE.Vector3(-b, SURFACE_Y - 1, -b), new THREE.Vector3(b, SURFACE_Y + 1, b));
        });

        this.renderer.render(this.scene, this.camera);
        this.controls.update();
        requestAnimationFrame(this.animate);
    }
}

new LifeNebula();
