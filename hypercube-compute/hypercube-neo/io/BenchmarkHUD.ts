/**
 * BenchmarkHUD: A premium performance monitoring overlay for Hypercube Neo.
 */
export class BenchmarkHUD {
    private container: HTMLDivElement;
    private titleEl: HTMLDivElement;
    private statsEl: HTMLDivElement;
    private frameCount: number = 0;
    private lastTime: number = 0;
    private fps: number = 0;

    constructor(title: string, subtitle: string = '') {
        this.container = document.createElement('div');
        this.applyStyles();
        
        this.titleEl = document.createElement('div');
        this.titleEl.innerHTML = `<span style="color: #00f2ff; font-weight: 800;">HYPERCUBE</span> NEO <span style="opacity: 0.5; font-size: 0.7rem; font-weight: 400;">v4.0</span>`;
        this.container.appendChild(this.titleEl);

        const sub = document.createElement('div');
        sub.style.fontSize = '0.75rem';
        sub.style.opacity = '0.7';
        sub.style.marginTop = '2px';
        sub.style.marginBottom = '10px';
        sub.innerText = `${title} • ${subtitle}`;
        this.container.appendChild(sub);

        this.statsEl = document.createElement('div');
        this.container.appendChild(this.statsEl);

        document.body.appendChild(this.container);
        this.lastTime = performance.now();
    }

    private applyStyles() {
        Object.assign(this.container.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: 'rgba(5, 15, 35, 0.8)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            padding: '16px',
            color: '#fff',
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '0.9rem',
            zIndex: '10000',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
            minWidth: '220px',
            pointerEvents: 'none',
            userSelect: 'none'
        });
    }

    public updateCompute(ms: number) {
        this.statsEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="opacity: 0.6;">Compute:</span>
                <span style="font-family: monospace; font-weight: 600; color: ${ms > 16 ? '#ff4d4d' : '#4dff88'}">${ms.toFixed(2)}ms</span>
            </div>
        `;
    }

    public tickFrame() {
        this.frameCount++;
        const now = performance.now();
        const delta = now - this.lastTime;

        if (delta >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / delta);
            this.frameCount = 0;
            this.lastTime = now;
        }

        const fpsColor = this.fps >= 58 ? '#4dff88' : (this.fps >= 30 ? '#ffcc00' : '#ff4d4d');
        
        const fpsEl = this.statsEl.querySelector('.fps-counter');
        if (fpsEl) {
            fpsEl.innerHTML = `<span style="color: ${fpsColor}">${this.fps} FPS</span>`;
        } else {
            this.statsEl.innerHTML += `
                <div style="display: flex; justify-content: space-between;" class="fps-counter">
                    <span style="opacity: 0.6;">Performance:</span>
                    <span style="font-family: monospace; font-weight: 600; color: ${fpsColor}">${this.fps} FPS</span>
                </div>
            `;
        }
    }
}
