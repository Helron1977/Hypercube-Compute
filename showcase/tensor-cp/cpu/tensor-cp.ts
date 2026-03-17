import { HypercubeNeoFactory } from '../../../core/HypercubeNeoFactory';
import { HypercubeNeo } from '../../../HypercubeNeo';
import { BenchmarkHUD } from '../../../io/BenchmarkHUD';

async function launch() {
    const factory = new HypercubeNeoFactory();
    const urlParams = new URLSearchParams(window.location.search);
    const isGPU = urlParams.get('backend') === 'gpu';
    const manifestUrl = isGPU ? './manifest-tensor-cp-gpu.json' : './manifest-tensor-cp-cpu.json';
    
    console.log(`Tensor-CP: Loading manifest from ../showcase-tensor-cp.json`);
    const manifest = await factory.fromManifest('../showcase-tensor-cp.json');
    
    // Force backend based on URL
    if (isGPU) {
        manifest.config.mode = 'gpu';
    } else {
        manifest.config.mode = 'cpu';
    }
    
    // Override rank if present in URL
    const requestedRank = parseInt(urlParams.get('rank') || '0');
    if (requestedRank > 0) {
        if (!manifest.config.params) manifest.config.params = {};
        manifest.config.params.rank = requestedRank;
        
        if (manifest.engine.rules && manifest.engine.rules.length > 0) {
            if (!manifest.engine.rules[0].params) manifest.engine.rules[0].params = {};
            manifest.engine.rules[0].params.rank = requestedRank;
        }
    }

    const engine = await factory.build(manifest.config, manifest.engine);
    const bridge = (engine as any).bridge;
    const { nx, ny, nz } = manifest.config.dimensions;
    const rank = manifest.config.params.rank;

    console.log(`Grid: ${nx}x${ny}x${nz}, Rank: ${rank}, Mode: ${manifest.config.mode}`);

    // Setup Canvas for Visualization
    const container = document.getElementById('canvas-container') || document.body;
    const canvas = document.createElement('canvas');
    
    // Physical size remains simulation size (10x10 etc)
    // but CSS size is forced to 512px for visibility
    canvas.width = nx;
    canvas.height = ny;
    canvas.style.width = '512px';
    canvas.style.height = '512px';
    canvas.style.imageRendering = 'pixelated';
    
    container.appendChild(canvas);

    const { CanvasAdapterNeo } = await import('../../../io/CanvasAdapterNeo');
    const { BenchmarkHUD } = await import('../../../io/BenchmarkHUD');
    const hud = new BenchmarkHUD('Tensor-CP Core', `${nx}x${ny}x${nz}`);

    // 1. Random Initialization of Factors (Faces 0, 1, 2)
    // We access the raw Float32Array views from the bridge
    const chunkId = (engine as any).vGrid.chunks[0].id;
    const views = (engine as any).bridge.getChunkViews(chunkId);
    
    // Initialize mode_a, mode_b, mode_c with small random values [0.1, 0.5]
    // Increased from 0.1 to avoid all-black start
    for (let f = 0; f < 3; f++) {
        const view = views[f];
        for (let i = 0; i < view.length; i++) {
            view[i] = 0.1 + Math.random() * 0.4;
        }
    }

    // 2. Load CSV Data into 'target' (Face 3)
    try {
        const csvPath = "../../assets/tensor-sample.csv";
        const response = await fetch(csvPath);
        const text = await response.text();
        const lines = text.trim().split('\n');
        const target = views[3];
        target.fill(0); // Clear

        // Skip header: user_id,film_id,genre_id,value
        for (let i = 1; i < lines.length; i++) {
            const [u, f, g, val] = lines[i].split(',').map(Number);
            if (!isNaN(u) && u < nx && f < ny && g < nz) {
                const idx = u + f * nx + g * nx * ny;
                target[idx] = val;
            }
        }
        console.log(`Tensor-CP: Loaded ${lines.length - 1} entries from CSV.`);
    } catch (e) {
        console.warn("Tensor-CP: Failed to load CSV, using default zeros.", e);
    }

    // CRITICAL: Sync initialized factors and CSV data to GPU if in GPU mode
    if (isGPU && (engine as any).bridge.syncToDevice) {
        await (engine as any).bridge.syncToDevice();
        console.log("Tensor-CP: Initialized data synced to WebGPU.");
    }

    let iteration = 0;
    const maxIter = manifest.config.params.maxIterations || 100;

    async function loop() {
        const start = performance.now();
        await engine.step(iteration);
        const ms = performance.now() - start;

        iteration++;
        
        // CRITICAL: Sync back from GPU to CPU for visualization
        if (isGPU && (engine as any).bridge.syncToHost) {
            await (engine as any).bridge.syncToHost();
        }

        // Visualize the 'reconstruction' face
        CanvasAdapterNeo.render(engine as any, canvas, {
            faceIndex: 4, // Reconstruction Face
            colormap: 'viridis',
            minVal: 0,
            maxVal: 1,
            sliceZ: 0 // Explicitly set slice 0
        });

        hud.updateCompute(ms);
        hud.tickFrame();
        
        // Update HUD with progress
        (hud as any).setStatus(`Decomposing... ${iteration}/${maxIter}`);

        if (iteration < maxIter) {
            requestAnimationFrame(loop);
        } else {
            console.log("Tensor-CP: Decomposition Complete.");
            (hud as any).setStatus("Complete.");
        }
    }
    loop();
}

launch();
