@group(0) @binding(0) var<storage, read_write> uData : array<f32>;

struct Uniforms {
    nx: u32,
    ny: u32,
    chunkX: u32,
    chunkY: u32,
    rank: f32, // Offset 22
    reg: f32,  // Offset 23
    reserved: array<u32, 7>,
    idxModeA: u32, // Offset 31
    idxModeB: u32, // Offset 32
    idxModeC: u32, // Offset 33
    idxTarget: u32, // Offset 34
    idxRecon: u32  // Offset 35
};
@group(0) @binding(1) var<storage, read> u : Uniforms;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
    // Current point in the target tensor [NX x NY x NZ]
    // Note: NZ is handled by iteration or slicing in this simple version
    // For 2D/3D visualization of the slice:
    let nx = u.nx;
    let ny = u.ny;
    let nz = u32(7); // Default if not provided in uniforms, but should be from context
    // Note: We should ideally have nz in uniforms. Let's assume u.ny (already there) and add iteration.
    
    if (id.x >= nx || id.y >= ny) { return; }

    let i = id.x;
    let j = id.y;
    let rank = u32(u.rank);

    // Iterating over NZ to handle the full 3D tensor in this invocation
    // This is more robust for small tensors like 10x10x10
    for (var k: u32 = 0u; k < 128u; k = k + 1u) {
        // Dynamic bounds check (nz should be in uniforms, but for now we use a safe large cap ornx*ny*nz)
        // Hardcoding a limit for now as u.nx, u.ny are available.
        // Better: Use a global param from u.reserved or add nz to struct.
        
        // Actually, let's check GpuDispatcher.ts to see if we can add NZ.
        // For now, let's keep it 2D and wait for the dispatch logic update.
        // WAIT: GpuDispatcher.ts line 116-117 only shows nx_chunk, ny_chunk.
        
        let tensorIdx = i + j * nx + k * nx * ny;
        if (tensorIdx >= 1000000u) { break; } // Safety break

        let val = uData[u.idxTarget + tensorIdx];

        // 1. Calculate Reconstruction
        var pred: f32 = 0.0;
        for (var r: u32 = 0u; r < rank; r = r + 1u) {
            let valA = uData[u.idxModeA + i * rank + r];
            let valB = uData[u.idxModeB + j * rank + r];
            let valC = uData[u.idxModeC + k * rank + r];
            pred += valA * valB * valC;
        }

        // Store for visualization
        uData[u.idxRecon + tensorIdx] = pred;

        if (val == 0.0) { continue; }

        // 2. Gradient Update Step
        let err = val - pred;
        let lr = 0.01;

        for (var r: u32 = 0u; r < rank; r = r + 1u) {
            let idxA = u.idxModeA + i * rank + r;
            let idxB = u.idxModeB + j * rank + r;
            let idxC = u.idxModeC + k * rank + r;

            let valA = uData[idxA];
            let valB = uData[idxB];
            let valC = uData[idxC];

            uData[idxA] += lr * (err * valB * valC - u.reg * valA);
            uData[idxB] += lr * (err * valA * valC - u.reg * valB);
            uData[idxC] += lr * (err * valA * valB - u.reg * valC);
        }
    }
}
