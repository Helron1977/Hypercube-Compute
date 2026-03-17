/**
 * ShapeHelpers.ts
 * Declarative helpers for generating complex shapes in Hypercube Neo.
 */

export interface Point {
    x: number;
    y: number;
}

export class NacaHelper {
    /**
     * Generates a 4-digit NACA airfoil profile.
     * @param m Max camber (e.g. 0.02 for 2%)
     * @param p Position of max camber (e.g. 0.4 for 40%)
     * @param t Max thickness (e.g. 0.12 for 12%)
     * @param chord Chord length in grid units
     * @param points Number of points to generate
     * @param angle Rotation angle in radians
     * @returns An array of points representing the airfoil envelope
     */
    static generateNaca4(m: number, p: number, t: number, chord: number, points: number = 20, angle: number = 0): Point[] {
        const upper: Point[] = [];
        const lower: Point[] = [];

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        for (let i = 0; i <= points; i++) {
            const xVal = i / points;
            const xBase = xVal * chord;

            // Thickness distribution
            const yt = 5 * t * chord * (
                0.2969 * Math.sqrt(xVal) -
                0.1260 * xVal -
                0.3516 * Math.pow(xVal, 2) +
                0.2843 * Math.pow(xVal, 3) -
                0.1015 * Math.pow(xVal, 4)
            );

            // Mean camber line
            let yc = 0;
            let dyc_dx = 0;

            if (xVal < p) {
                yc = (m / Math.pow(p, 2)) * (2 * p * xVal - Math.pow(xVal, 2));
                dyc_dx = (2 * m / Math.pow(p, 2)) * (p - xVal);
            } else if (p > 0) {
                yc = (m / Math.pow(1 - p, 2)) * ((1 - p) * (1 - p) - (xVal - p) * (xVal - p)); // Corrected formula
                dyc_dx = (2 * m / Math.pow(1 - p, 2)) * (p - xVal);
            }

            const theta = Math.atan(dyc_dx);

            const xu = xBase - yt * Math.sin(theta);
            const yu = (yc * chord) + yt * Math.cos(theta);
            const xl = xBase + yt * Math.sin(theta);
            const yl = (yc * chord) - yt * Math.cos(theta);

            // Rotate
            upper.push({
                x: xu * cosA - yu * sinA,
                y: xu * sinA + yu * cosA
            });

            lower.push({
                x: xl * cosA - yl * sinA,
                y: xl * sinA + yl * cosA
            });
        }

        // Return combined profile (closed loop: trailing edge -> leading edge -> trailing edge)
        return [...upper, ...lower.slice().reverse()];
    }
}
