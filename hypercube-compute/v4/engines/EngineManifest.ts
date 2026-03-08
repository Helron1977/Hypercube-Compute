/**
 * V8 Engine Manifest - The "Ideal World" Contract
 */

export type FaceType = 'scalar' | 'vector' | 'mask';
export type FaceDataType = 'float32' | 'uint32' | 'int32'; // Prise en charge des simulations discrètes

/**
 * Types de conditions aux limites (V8/V4) :
 */
export type BoundaryRole = 'periodic' | 'clamped' | 'dirichlet' | 'neumann' | 'symmetry';

export interface BoundaryProperty {
    role: BoundaryRole;
    value?: number | number[]; // Valeur fixe ou vecteur (ex: pression, vitesse)
}

export interface BoundaryManifest {
    top?: BoundaryProperty;
    bottom?: BoundaryProperty;
    left?: BoundaryProperty;
    right?: BoundaryProperty;
    front?: BoundaryProperty;
    back?: BoundaryProperty;
    all?: BoundaryProperty;
}

export interface FaceRequirement {
    name: string;
    type: FaceType;
    dataType?: FaceDataType; // 'float32' par défaut
    isReadOnly?: boolean;
    isSynchronized?: boolean;
    isOptional?: boolean;
    defaultValue?: number;
}

/**
 * Paramètres Sémantiques :
 * Permet d'utiliser des noms humains (ex: 'viscosity') plutôt que des constantes mathématiques (ex: 'mu').
 */
export interface ParameterRequirement {
    name: string;
    label: string;      // Nom lisible pour l'UI
    description?: string;
    defaultValue: number;
    min?: number;
    max?: number;
}
// ... rest

export interface StencilPoint {
    offset: [number, number, number?];
    weight?: number;
}

export interface NumericalScheme {
    type: 'advection' | 'diffusion' | 'laplacian' | 'reaction' | 'stencil' | 'lbm-d2q9';
    method: 'Upwind' | 'Semi-Lagrangian' | 'MacCormack' | 'Explicit-Euler' | 'Custom';
    source: string; // Semantic name of the input face
    destination?: string; // Semantic name of the output face
    field?: string;  // Semantic name of the velocity/vector field
    stencil?: '7-point' | '27-point' | StencilPoint[];
    params?: Record<string, number | string>;
}

import { VisualProfile } from './IHypercubeEngine';

// ... (rest of imports)

export interface EngineDescriptor {
    name: string;
    version?: string;
    description?: string;

    // 1. Data Contract
    faces: FaceRequirement[];

    // 2. Control Contract (Parameters)
    parameters: ParameterRequirement[];

    // 3. Compute Contract
    rules: NumericalScheme[];

    // 4. Boundary Contract
    boundaries?: BoundaryManifest;

    // 5. Optional Custom WGSL/Logic
    customKernels?: {
        name: string;
        source: string;
    }[];

    // 6. Output & Projection Contract (Zero-Copy extraction)
    outputs?: {
        name: string;
        type: 'fusion' | 'slice' | 'probe' | 'downsample';
        sources: string[]; // Noms des faces sources
        expression?: string; // ex: "rho + speed"
        interval?: number; // Fréquence d'extraction (ms ou frames)
    }[];

    // 7. Default Visualization Profile
    visualProfile?: VisualProfile;
}
