import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { HypercubeNeoFactory } from '../../../core/HypercubeNeoFactory';
import { SharkEntity } from './shark';

/**
 * LIFE NEBULA V57.0 - MODULAR RE-IMPLEMENTATION
 * Architecture: Separated Brain (AI) from Bone (SharkEntity).
 * Suite: Ocean + Pathfinder + Tensor-CP.
 */
const NX = 64; const NY = 64;
const TANK_SIZE = 20;
const SURFACE_Y = 10;
const H_LIMIT = 0.5;

class LifeNebula {
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private controls!: OrbitControls;

    // THE TRIPLE HYPERCUBE SUITE
    private oceanEngine: any = null;
    private pathEngine: any = null;
    private tensorEngine: any = null;

    private shark!: SharkEntity;
    private sharkMat!: THREE.MeshPhysicalMaterial;
    private preyCount = 65;
    private preyList: THREE.Group[] = [];
    private preyVels: THREE.Vector3[] = [];
    private obstacles: THREE.Mesh[] = [];

    private bubbles!: THREE.Points;
    private bubbleGeos!: THREE.BufferGeometry;

    private sidePanels: { mesh: THREE.Mesh, normal: THREE.Vector3 }[] = [];

    private currentTargetIndex = -1;
    private splashCooldown = 0;
    private eatFlashCounter = 0;

    private surfaceGeo!: THREE.PlaneGeometry;

    constructor() {
        this.init3D().then(() => this.initEngines()).catch(console.error);
    }

    private async init3D() {
        const container = document.getElementById('canvas-container')!;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x010810);
        this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(24, 22, 24);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const sun = new THREE.DirectionalLight(0xffffff, 2.8); sun.position.set(10, 25, 10); this.scene.add(sun);
        const backSun = new THREE.DirectionalLight(0xffffff, 1.0); backSun.position.set(-10, 15, -15); this.scene.add(backSun);
        
        // Specular highlight light for the surface
        const surfLight = new THREE.PointLight(0xffffff, 2.0, 50);
        surfLight.position.set(0, SURFACE_Y + 5, 0);
        this.scene.add(surfLight);

        this.setupModels();
    }

    private setupModels() {
        const texLoader = new THREE.TextureLoader();

        // 1. Ghost Water & Frame
        const volumeMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.01, depthWrite: false });
        this.scene.add(new THREE.Mesh(new THREE.BoxGeometry(TANK_SIZE, TANK_SIZE, TANK_SIZE), volumeMat));
        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(TANK_SIZE, TANK_SIZE, TANK_SIZE));
        this.scene.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.1 })));

        // 2. Coral Pillars
        const coralTexture = texLoader.load('assets/coral_texture_seamless_1773999580516.png');
        coralTexture.wrapS = coralTexture.wrapT = THREE.RepeatWrapping; coralTexture.repeat.set(1, 2);
        const cryMat = new THREE.MeshStandardMaterial({ map: coralTexture, roughness: 0.8, metalness: 0.1 });
        const addPillar = (x:number, z:number, h:number) => {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, h, 8), cryMat);
            p.position.set(x, -10 + h/2, z); this.scene.add(p); this.obstacles.push(p);
        };
        addPillar(-5, -5, 12); addPillar(6, 4, 8); addPillar(-2, 7, 10);

        // 3. Leafy Algae (Chroma-Key Shader)
        const algaeTex = texLoader.load('assets/algue.jpg'); 
        const algaeMat = new THREE.ShaderMaterial({
            uniforms: { map: { value: algaeTex }, color: { value: new THREE.Color(0x166534) } },
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `
                varying vec2 vUv; uniform sampler2D map; uniform vec3 color;
                void main() {
                    vec4 tex = texture2D(map, vUv);
                    float d1 = distance(tex.rgb, vec3(0.8)); // Grey checker
                    float d2 = distance(tex.rgb, vec3(1.0)); // White checker
                    if (d1 < 0.1 || d2 < 0.1) discard;
                    gl_FragColor = vec4(tex.rgb * color * 1.5, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });
        for(let i=0; i<40; i++) {
            const h = 2 + Math.random()*5;
            const al = new THREE.Mesh(new THREE.PlaneGeometry(0.8, h, 1, 3), algaeMat);
            al.position.set((Math.random()-0.5)*18, -10 + h/2, (Math.random()-0.5)*18);
            al.rotation.y = Math.random() * Math.PI; this.scene.add(al);
        }

        // 4. Bubbles
        this.bubbleGeos = new THREE.BufferGeometry();
        const bPos = new Float32Array(300 * 3);
        for(let i=0; i<300; i++) { bPos[i*3]=(Math.random()-0.5)*19; bPos[i*3+1]=(Math.random()-0.5)*19; bPos[i*3+2]=(Math.random()-0.5)*19; }
        this.bubbleGeos.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
        this.bubbles = new THREE.Points(this.bubbleGeos, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.7 }));
        this.scene.add(this.bubbles);

        // 5. Side Panels & Surface
        const createWall = (nx:number, ny:number, nz:number, px:number, py:number, pz:number, rotX=0, rotY=0) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(TANK_SIZE, TANK_SIZE), new THREE.MeshStandardMaterial({ color: 0x082f49, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
            m.position.set(px, py, pz); m.rotation.x = rotX; m.rotation.y = rotY; this.scene.add(m);
            this.sidePanels.push({ mesh: m, normal: new THREE.Vector3(nx, ny, nz) });
        };
        createWall(0,0,1, 0,0,-10.05); createWall(0,0,-1, 0,0,10.05); createWall(1,0,0, -10.05,0,0,0,Math.PI/2); createWall(-1,0,0, 10.05,0,0,0,-Math.PI/2); createWall(0,1,0, 0,-10.05,0,-Math.PI/2);

        this.surfaceGeo = new THREE.PlaneGeometry(TANK_SIZE, TANK_SIZE, NX-1, NY-1);
        const colorAttr = new THREE.BufferAttribute(new Float32Array(this.surfaceGeo.attributes.position.count * 3), 3);
        this.surfaceGeo.setAttribute('color', colorAttr);
        const sMat = new THREE.MeshPhongMaterial({ 
            color: 0x1e3a8a, transparent: true, opacity: 0.6, 
            shininess: 200, specular: 0xffffff,
            vertexColors: true, side: THREE.DoubleSide 
        });
        const surfaceMesh = new THREE.Mesh(this.surfaceGeo, sMat);
        surfaceMesh.rotation.x = -Math.PI/2; surfaceMesh.position.y = SURFACE_Y+0.05; this.scene.add(surfaceMesh);

        // EXTRA FLOOR DETAIL (V75.5) - Large white-blue circle (Balanced)
        const floorGeom = new THREE.CircleGeometry(180, 64);
        const floorMat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(0xffffff) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                void main() {
                    float dist = distance(vUv, vec2(0.5));
                    float mask = smoothstep(0.5, 0.05, dist);
                    // Balanced luminance (not too gray, not too bright)
                    vec3 color = mix(vec3(0.06, 0.06, 0.12), vec3(0.75, 0.75, 0.85), mask);
                    gl_FragColor = vec4(color, mask * 0.7);
                }
            `,
            transparent: true,
            depthWrite: false, 
            side: THREE.DoubleSide
        });
        const floorMesh = new THREE.Mesh(floorGeom, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.y = -10.2; 
        this.scene.add(floorMesh);

        // 6. ENTITIES
        this.sharkMat = new THREE.MeshPhysicalMaterial({ color: 0x334155, metalness: 0.4, roughness: 0.3, clearcoat: 0.5 });
        this.shark = new SharkEntity(this.scene, this.sharkMat);

        const colors = [0xf43f5e, 0x38bdf8, 0x10b981];
        for (let i=0; i<this.preyCount; i++) {
            const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18), new THREE.MeshStandardMaterial({ color: colors[i%3], emissive: colors[i%3], emissiveIntensity: 2.5 }));
            p.scale.set(1, 0.5, 1.8); p.position.set((Math.random()-0.5)*18, (Math.random()-0.5)*18, (Math.random()-0.5)*18);
            this.scene.add(p); this.preyList.push(p as any);
            this.preyVels.push(new THREE.Vector3((Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1));
        }
    }

    private async initEngines() {
        const factory = new HypercubeNeoFactory();
        
        // ENGINE 1: OCEAN
        const oManifest = await factory.fromManifest('./nebula-manifest.json');
        this.oceanEngine = await factory.build(oManifest.config, oManifest.engine);

        // ENGINE 2: PATHFINDER
        const pManifest = await factory.fromManifest('../../path/cpu/path-cpu.json');
        pManifest.config.mode = 'gpu'; pManifest.config.dimensions = { nx: NX, ny: NY, nz: 1 };
        this.pathEngine = await factory.build(pManifest.config, pManifest.engine);
        // Init Path Data
        const bridge = this.pathEngine.bridge;
        const chunk = this.pathEngine.vGrid.chunks[0];
        const indices = this.pathEngine.parityManager.getFaceIndices('distance');
        bridge.getChunkViews(chunk.id)[indices.read].fill(1000);
        bridge.getChunkViews(chunk.id)[indices.write].fill(1000);
        bridge.syncToDevice();

        // ENGINE 3: TENSOR
        const tManifest = await factory.fromManifest('../../tensor-cp/manifest-tensor-cp-gpu.json');
        tManifest.config.mode = 'gpu'; tManifest.config.dimensions = { nx: 32, ny: 32, nz: 8 };
        this.tensorEngine = await factory.build(tManifest.config, tManifest.engine);

        if (this.oceanEngine && this.pathEngine && this.tensorEngine) {
            if (document.getElementById('loader')) document.getElementById('loader')!.style.display = 'none';
            this.animate();
        }
    }

    private worldToGrid(v: THREE.Vector3) {
        return { x: Math.floor((v.x / TANK_SIZE + 0.5) * 63), y: Math.floor((1.0 - (v.z / TANK_SIZE + 0.5)) * 63) };
    }

    private isUpdating = false;
    private updateSimulation = async () => {
        if (!this.oceanEngine || this.isUpdating) return;
        this.isUpdating = true;
        try {
            const sharkPos = this.shark.getPosition();
            const gPos = this.worldToGrid(sharkPos);
            
            // 1. OCEAN STEP
            const oConfig = (this.oceanEngine as any).vGrid.config;
            if (Math.abs(sharkPos.y - SURFACE_Y) < 1.5 && this.splashCooldown-- <= 0) {
                // MASSIVE density spike to force LBM reaction
                oConfig.objects.push({ id:'splash', type:'circle', position:{x:gPos.x-5, y:gPos.y-5}, dimensions:{w:10, h:10}, properties:{rho:3.0}, rasterMode:"add" });
                this.splashCooldown = 8;
            }
            await this.oceanEngine.step(1);
            oConfig.objects = [];

            // 2. PATHFINDER STEP (Avoidance)
            const pConfig = (this.pathEngine as any).vGrid.config;
            pConfig.objects = [
                { id:'wL', type:'rect', position:{x:0, y:0}, dimensions:{w:1, h:64}, properties:{obstacles:1.0} },
                { id:'wR', type:'rect', position:{x:63, y:0}, dimensions:{w:1, h:64}, properties:{obstacles:1.0} },
                { id:'wT', type:'rect', position:{x:0, y:0}, dimensions:{w:64, h:1}, properties:{obstacles:1.0} },
                { id:'wB', type:'rect', position:{x:0, y:63}, dimensions:{w:64, h:1}, properties:{obstacles:1.0} }
            ];
            this.obstacles.forEach((obs, i) => {
                const go = this.worldToGrid(obs.position);
                // Radius is 1.8m -> ~6 cells radius -> 12x12 dimension
                pConfig.objects.push({ id:'obs'+i, type:'circle', position:{x:go.x-6, y:go.y-6}, dimensions:{w:12, h:12}, properties:{obstacles:1.0} });
            });
            if (this.currentTargetIndex !== -1) {
                const tGo = this.worldToGrid(this.preyList[this.currentTargetIndex].position);
                pConfig.objects.push({ id:'prey', type:'circle', position:{x:tGo.x, y:tGo.y}, dimensions:{w:1, h:1}, properties:{distance:0.0}, rasterMode:'replace' });
            }
            await this.pathEngine.step(64);

            // 3. TENSOR STEP
            await this.tensorEngine.step(30);

            // SYNC VISUALS
            await this.syncVisuals();
        } finally { this.isUpdating = false; }
    }

    private async syncVisuals() {
        // 1. CAPTURE LOGIC (V75.4) - Using Snout Position
        if (this.currentTargetIndex !== -1) {
            const target = this.preyList[this.currentTargetIndex];
            const dist = this.shark.getSnoutPosition().distanceTo(target.position);
            if (dist < 1.8) {
                this.scene.remove(target); this.preyList.splice(this.currentTargetIndex, 1);
                this.preyVels.splice(this.currentTargetIndex, 1); this.currentTargetIndex = -1;
                this.eatFlashCounter = 12; this.sharkMat.emissive.set(0xff0000); this.sharkMat.emissiveIntensity = 2.0;
            }
        }
        if (this.eatFlashCounter > 0) {
            this.eatFlashCounter--; if (this.eatFlashCounter === 0) { this.sharkMat.emissive.set(0x000000); this.sharkMat.emissiveIntensity = 0; }
        }

        // 2. SURFACE SYNC
        const oBridge = this.oceanEngine.bridge; await oBridge.syncToHost();
        const rhoIdx = this.oceanEngine.parityManager.getFaceIndices('rho').read;
        const oData = oBridge.getChunkViews(this.oceanEngine.vGrid.chunks[0].id)[rhoIdx];
        
        const pAttr = this.surfaceGeo.attributes.position;
        const cAttr = this.surfaceGeo.attributes.color;
        for (let i=0; i<pAttr.count; i++) {
            const gx = Math.floor((pAttr.getX(i)/20+0.5)*63);
            const gy = Math.floor((pAttr.getY(i)/20+0.5)*63);
            const v = oData[(gy+1)*66+(gx+1)];
            // Massive multiplier (150.0) for visible ripples on small density diffs
            const h = Math.max(-H_LIMIT, Math.min(H_LIMIT, (v-1.0)*150.0 * Math.min(1.0, Math.min(gx,gy,63-gx,63-gy)/5)));
            pAttr.setZ(i, h);
            if(h > 0.4) cAttr.setXYZ(i, 1, 1, 1); else cAttr.setXYZ(i, 0.1, 0.4+h, 0.82);
        }
        pAttr.needsUpdate = true; cAttr.needsUpdate = true; this.surfaceGeo.computeVertexNormals();

        // 3. BUBBLES
        const bP = this.bubbleGeos.attributes.position.array as Float32Array;
        for(let i=0; i<300; i++) { bP[i*3+1]+=0.05; if(bP[i*3+1]>10) bP[i*3+1]=-10; }
        this.bubbleGeos.attributes.position.needsUpdate = true;
    }

    private animate = async () => {
        const start = performance.now();
        await this.updateSimulation();
        const sharkPos = this.shark.getPosition();
        
        // --- THE BRAIN ---
        if (this.currentTargetIndex === -1 || Math.random() < 0.01) {
            const forward = new THREE.Vector3(0,0,1).applyQuaternion(this.shark.group.quaternion);
            let mD = 1000; 
            this.preyList.forEach((p, idx) => { 
                if(!p) return; 
                const toPrey = p.position.clone().sub(this.shark.getPosition()).normalize();
                const visionDot = forward.dot(toPrey);
                
                // Broadened FOV (V75.5): -0.4 threshold allows near 200 degree vision
                if (visionDot > -0.4 || this.preyList.length < 5) {
                    const d = p.position.distanceTo(this.shark.getSnoutPosition()); 
                    if (d<mD){ mD=d; this.currentTargetIndex=idx; } 
                }
            });
        }
        
        let brainVector = new THREE.Vector3(0,0,1);
        if (this.currentTargetIndex !== -1) {
            const target = this.preyList[this.currentTargetIndex];
            
            // A. Pursuit
            const pursuit = target.position.clone().sub(sharkPos).normalize();
            
            // 2. PATHFINDER AVOIDANCE (Gradient-Based Obstacle Avoidance)
            await this.pathEngine.bridge.syncToHost();
            const pData = this.pathEngine.bridge.getChunkViews(this.pathEngine.vGrid.chunks[0].id)[0];
            
            const getSDF = (pos: THREE.Vector3) => {
                const gx = Math.floor((pos.x / 20 + 0.5) * 63);
                const gy = Math.floor((1.0 - (pos.z / 20 + 0.5)) * 63);
                if (gx < 0 || gx > 63 || gy < 0 || gy > 63) return 10.0;
                return pData[(gy + 1) * 66 + (gx + 1)];
            };

            let avoid = new THREE.Vector3(0,0,0);
            const distCenter = getSDF(sharkPos);
            
            // PROACTIVE AVOIDANCE: Check a point in front of the shark
            const forwardOffset = new THREE.Vector3(0,0,1).applyQuaternion(this.shark.group.quaternion).multiplyScalar(2.0);
            const lookAheadPos = sharkPos.clone().add(forwardOffset);
            const distAhead = getSDF(lookAheadPos);

            if (distCenter < 8.0 || distAhead < 8.0) {
                // Approximate gradient at current pos
                const gx = Math.floor((sharkPos.x / 20 + 0.5) * 63);
                const gy = Math.floor((1.0 - (sharkPos.z / 20 + 0.5)) * 63);
                const idx = (gy + 1) * 66 + (gx + 1);
                const gradX = pData[idx + 1] - pData[idx - 1];
                const gradY = pData[idx + 66] - pData[idx - 66];
                avoid.set(-gradX, 0, gradY); 
                if (avoid.lengthSq() > 0.0001) avoid.normalize();
                
                // Critical Repulsion if very close
                const intensity = THREE.MathUtils.mapLinear(Math.min(distCenter, distAhead), 0, 8, 3.0, 0.5);
                avoid.multiplyScalar(intensity); 
            }
            
            // C. Tensor Pattern (Optional Learning Bias)
            await this.tensorEngine.bridge.syncToHost();
            const tD = this.tensorEngine.bridge.getChunkViews(this.tensorEngine.vGrid.chunks[0].id)[4];
            const tx = Math.floor((sharkPos.x/20+0.5)*31);
            const tz = Math.floor((sharkPos.z/20+0.5)*31);
            const ty = Math.floor((sharkPos.y/20+0.5)*7);
            let scent = new THREE.Vector3(0,0,0);
            if (tx>0 && tx<31 && tz>0 && tz<31 && ty>0 && ty<7) {
                const vX = tD[(tx+1) + tz*32 + ty*32*32] - tD[(tx-1) + tz*32 + ty*32*32];
                const vY = tD[tx + tz*32 + (ty+1)*32*32] - tD[tx + tz*32 + (ty-1)*32*32];
                const vZ = tD[tx + (tz+1)*32 + ty*32*32] - tD[tx + (tz-1)*32 + ty*32*32];
                scent.set(vX, vY, vZ).normalize();
            }

            // D. BLENDING WITH DYNAMIC WANDER (Breaks 2D Loops)
            const wander = new THREE.Vector3(Math.sin(performance.now()*0.001), 0.2, Math.cos(performance.now()*0.0013)).multiplyScalar(0.2);
            
            if (this.currentTargetIndex !== -1) {
                brainVector.addScaledVector(pursuit, 0.8)
                           .addScaledVector(avoid, 1.2) // Increased influence
                           .addScaledVector(scent, 0.4)
                           .add(wander);
            } else {
                // SURFACE SEARCH MODE
                const search = new THREE.Vector3(0, 0, 0);
                // 1. Rise if too deep
                if (sharkPos.y < SURFACE_Y - 3.5) {
                    search.y = 1.2;
                }
                // 2. Circular tangent force
                const tangent = new THREE.Vector3(-sharkPos.z, 0, sharkPos.x).normalize();
                search.addScaledVector(tangent, 1.0);
                
                brainVector.addScaledVector(search, 0.8)
                           .addScaledVector(avoid, 1.2) // Increased influence
                           .add(wander);
            }
            
            // Center Bias (Soft constraint to stay in volume)
            const centerBias = new THREE.Vector3(0, 0, 0).sub(sharkPos).setY(0).normalize();
            const distFromCenter = sharkPos.clone().setY(0).length();
            if (distFromCenter > 7.0) brainVector.addScaledVector(centerBias, 0.4);
            
            // E. WALL REPULSION (Hard Bounds - Much stronger now)
            const boundsAvoid = new THREE.Vector3(0,0,0);
            const margin = 5.0; // Turn much earlier
            if (sharkPos.x < -10 + margin) boundsAvoid.x = 1.0;
            if (sharkPos.x > 10 - margin) boundsAvoid.x = -1.0;
            if (sharkPos.z < -10 + margin) boundsAvoid.z = 1.0;
            if (sharkPos.z > 10 - margin) boundsAvoid.z = -1.0;
            if (sharkPos.y < -10 + margin) boundsAvoid.y = 1.0;
            if (sharkPos.y > SURFACE_Y - 2.0) boundsAvoid.y = -1.5; // Strong surface push-down
            
            if (boundsAvoid.lengthSq() > 0) brainVector.addScaledVector(boundsAvoid.normalize(), 1.5);
            
            if (brainVector.lengthSq() > 0.0001) brainVector.normalize();
            else brainVector.set(0, 0, 1); // Default forward
        }

        // --- THE BODY ---
        this.shark.animate(performance.now() * 0.001);
        this.shark.update(brainVector);

        // --- PREY ECOSYSTEM ---
        this.preyList.forEach((p, i) => { 
            const v = this.preyVels[i]; 
            // 1. Random Jitter
            v.add(new THREE.Vector3((Math.random()-0.5)*0.015, (Math.random()-0.5)*0.015, (Math.random()-0.5)*0.015)); 
            
            // 2. FLEE FROM SHARK (Repulsion Field)
            const toShark = p.position.clone().sub(sharkPos);
            const dist = toShark.length();
            if (dist < 6.0) {
                const fleePower = 0.25 * (1.0 - dist/6.0);
                v.add(toShark.normalize().multiplyScalar(fleePower));
            }
            
            // 3. Speed Limit & Damping
            v.multiplyScalar(0.96); 
            v.clampLength(0, 0.3); // Increased speed for fleeing
            
            // 4. Boundary Bounce
            const B = 9.7;
            if (Math.abs(p.position.x)>B) { v.x *= -0.8; p.position.x = Math.sign(p.position.x)*B; }
            if (Math.abs(p.position.y)>B) { v.y *= -0.8; p.position.y = Math.sign(p.position.y)*B; }
            if (Math.abs(p.position.z)>B) { v.z *= -0.8; p.position.z = Math.sign(p.position.z)*B; }
            
            p.position.add(v); 
            if (v.lengthSq()>0.001) p.lookAt(p.position.clone().add(v)); 
        });

        // Dynamic Culling
        const camPos = this.camera.position.clone().normalize();
        this.sidePanels.forEach(p => { p.mesh.visible = (p.normal.dot(camPos) > 0); });

        this.renderer.render(this.scene, this.camera);
        this.controls.update();
        const hud = document.getElementById('stat-fps'); if (hud) hud.innerHTML = `${(performance.now() - start).toFixed(1)}ms (MULTI-HYPERCUBE ACTIVE)`;
        requestAnimationFrame(this.animate);
    }
}
new LifeNebula();
