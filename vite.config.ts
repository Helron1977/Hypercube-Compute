import { defineConfig } from 'vite';

export default defineConfig({
    root: 'examples', // Base directory for the showcase
    publicDir: '../assets', // Global assets if needed
    build: {
        outDir: '../dist-examples',
        emptyOutDir: true
    },
    server: {
        open: true,
        port: 3000,
        cors: true,
        headers: {
            // Essential for SharedArrayBuffer multithreading
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        }
    }
});
