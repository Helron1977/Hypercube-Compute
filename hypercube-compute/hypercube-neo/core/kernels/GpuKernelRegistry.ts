import { HypercubeGPUContext } from '../gpu/HypercubeGPUContext';

/**
 * Registry for WebGPU compute kernels in Neo.
 * Maps scheme types to WGSL source or ready-to-use pipelines.
 */
export class GpuKernelRegistry {
    private static cache: Map<string, string> = new Map();
    private static metadata: Map<string, any> = new Map();

    public static async register(type: string, wgslUrl: string) {
        const response = await fetch(wgslUrl);
        const source = await response.text();
        this.cache.set(type, source);
    }

    public static setSource(type: string, source: any) {
        let cleanSource = source;
        
        // 1. Handle object-wrapped defaults (common with some bundlers/loaders)
        if (cleanSource && typeof cleanSource === 'object' && cleanSource.default) {
            cleanSource = cleanSource.default;
        }
        
        // 2. Defensive fix: Handle string-wrapped "export default" (Vite fallback)
        if (typeof cleanSource === 'string' && (cleanSource.trim().startsWith('export default') || cleanSource.includes('export default "'))) {
            try {
                const firstQuote = cleanSource.indexOf('"');
                const lastQuote = cleanSource.lastIndexOf('"');
                if (firstQuote !== -1 && lastQuote > firstQuote) {
                    const literal = cleanSource.substring(firstQuote, lastQuote + 1);
                    cleanSource = JSON.parse(literal);
                    console.warn(`GpuKernelRegistry: Successfully extracted and parsed shader content for "${type}".`);
                }
            } catch (e) {
                console.error(`GpuKernelRegistry: Failed to parse wrapped shader "${type}":`, e);
            }
        }
        
        if (typeof cleanSource !== 'string') {
            console.error(`GpuKernelRegistry: Shader source for "${type}" is not a string after normalization! Type: ${typeof cleanSource}`);
        }
        
        this.cache.set(type, cleanSource);
    }

    public static getSource(type: string): string {
        const source = this.cache.get(type);
        if (!source) throw new Error(`GpuKernelRegistry: No WGSL source for type "${type}"`);
        return source;
    }

    public static setMetadata(type: string, meta: any) {
        this.metadata.set(type, meta);
    }

    public static getMetadata(type: string): any {
        return this.metadata.get(type) || {};
    }
}
