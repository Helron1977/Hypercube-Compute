struct SyncParams {
    srcOffset: u32,
    dstOffset: u32,
    count: u32,
    stride: u32
};

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<storage, read> batch: array<SyncParams>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>, @builtin(workgroup_id) wg_id: vec3<u32>) {
    let batchIdx = wg_id.x;
    let p = batch[batchIdx];
    let i = id.x % p.count; // Thread index within the batch item
    
    if (i >= p.count) { return; }
    
    // Perform the copy
    // This allows for contiguous or strided copies (e.g. for vertical edges)
    data[p.dstOffset + i * p.stride] = data[p.srcOffset + i * p.stride];
}
