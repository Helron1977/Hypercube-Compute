# Lexique & Concepts Avancés : L'Âme de l'Hypercube

Ce document clarifie les concepts d'ingénierie haute performance utilisés dans Hypercube Neo pour les développeurs et les agents cognitifs.

## 🧠 Concepts de Base

### 1. Stride (Foulée)
Le **Stride** est l'écart mémoire entre deux éléments logiquement consécutifs dans une dimension donnée. 
- Dans Neo, nous forçons des **Strides de puissance de 2** (256 octets) pour que l'adressage GPU se résume à des opérations binaires (`<<`, `&`), évitant les multiplications CPU.

### 2. Stencil (Pochoir)
Un **Stencil** définit le voisinage d'influence d'un point. 
- Dans la diffusion thermique, c'est une croix (Haut, Bas, Gauche, Droite). 
- Dans le LBM (Fluides), c'est une grille de 9 directions (D2Q9).
- L'Hypercube Neo est conçu pour orchestrer ces Stencils de manière isolée sur chaque thread.

### 3. Halo / Ghost Cells (Cellules Fantômes)
Pour que les Chunks puissent "parler" entre eux sans goulot d'étranglement, chaque chunk possède une bordure de 1 pixel appartenant à ses voisins. 
- Le **BoundarySynchronizer** s'occupe de maintenir ces fantômes à jour.

## 🚀 Concepts GPU

### 4. Warp / Wavefront
Sur un GPU, les threads ne sont pas indépendants, ils travaillent par groupes de 32 (NVIDIA) ou 64 (AMD).
- **Optimisation Neo** : La taille de nos Chunks doit être multiple de 32 pour éviter la "Vibrance" (Divergence de threads) et garantir que toute la puissance du matériel est utilisée.

### 5. Bank Conflict
Une erreur classique où plusieurs threads tentent d'accéder à la même banque mémoire en même temps. 
- **Solution Neo** : L'alignement strict du **MasterBuffer** garantit que chaque thread accède à sa propre "voie" mémoire.

### 6. Jump Flooding Algorithm (JFA)
Une technique de propagation de donnée massivement parallèle qui permet de calculer une distance exacte sur 512 pixels en seulement 9 passes ($O(\log N)$) au lieu de 512. C'est le secret de l'instantanéité de notre moteur de décision (SDF).

---
*Ce guide est un pont entre la physique théorique et l'implémentation sur métal nu.*
