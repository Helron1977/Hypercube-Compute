export class TriadeMasterBuffer {
    public readonly buffer: ArrayBuffer | SharedArrayBuffer;
    private offset: number = 0;

    /**
     * Alloue un unique bloc de mémoire vive pour l'ensemble du système.
     * Utilise un SharedArrayBuffer si disponible pour le support CPU multithread (Zero-Copy).
     * @param totalBytes Taille totale de la RAM allouée (par défaut 100 MB).
     */
    constructor(totalBytes: number = 100 * 1024 * 1024) {
        if (typeof SharedArrayBuffer !== 'undefined') {
            this.buffer = new SharedArrayBuffer(totalBytes);
        } else {
            console.warn("[TriadeMasterBuffer] SharedArrayBuffer n'est pas supporté (vérifiez vos headers COOP/COEP). Fallback sur ArrayBuffer (pas de multi-threading CPU possible).");
            this.buffer = new ArrayBuffer(totalBytes);
        }
    }

    /**
     * Alloue les octets nécessaires pour un Cube de 6 Faces en O(1) sans fragmentation.
     * @param mapSize Résolution (ex: 400x400)
     * @returns L'offset de départ dans l'ArrayBuffer
     */
    allocateCube(mapSize: number, numFaces: number = 6): number {
        const floatsPerFace = mapSize * mapSize;
        const bytesPerFace = floatsPerFace * Float32Array.BYTES_PER_ELEMENT; // 4 octets
        const totalCubeBytes = bytesPerFace * numFaces;

        if (this.offset + totalCubeBytes > this.buffer.byteLength) {
            throw new Error(`[TriadeMasterBuffer] Out Of Memory. Impossible d'allouer ${totalCubeBytes} bytes supplémentaires.`);
        }

        const startOffset = this.offset;
        this.offset += totalCubeBytes;

        return startOffset;
    }

    /** Retourne la quantité de RAM consommée */
    getUsedMemoryInMB(): string {
        return (this.offset / (1024 * 1024)).toFixed(2) + ' MB';
    }
}
