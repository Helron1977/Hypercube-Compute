# 🧪 Hypercube OS - Examples Directory

Ce répertoire contient les démonstrations interactives de l'algorithme **O(1) Tensor Engine**. Chaque exemple illustre une capacité spécifique du moteur Hypercube, allant de la dynamique des fluides à la simulation d'écosystèmes complexes.

## Liste des Exemples

### 01. Game of Life (Organic Ecosystem)
- **Description** : Une version évoluée de l'automate cellulaire de Conway, utilisant des tenseurs pour gérer trois types d'entités (Plantes, Herbivores, Carnivores).
- **Ce qu'il faut observer** : La croissance des plantes (vert), la colonisation progressive par les herbivores (jaune) et la régulation naturelle par les prédateurs.
- **Interactions** : Cliquez pour injecter des Carnivores et observer l'impact sur la chaîne alimentaire.

### 02. Heatmap Diffusion
- **Description** : Simulation de la diffusion de chaleur (Laplacien) via une convolution spatiale O(1).
- **Ce qu'il faut observer** : La manière dont des points de chaleur intense se dissipent et se lissent parfaitement dans l'espace au fil du temps.
- **Interactions** : Maintenez le clic gauche pour "peindre" de la chaleur sur la grille.

### 03. Ocean Currents
- **Description** : Simulation fluide utilisant la méthode **Lattice Boltzmann D2Q9**.
- **Ce qu'il faut observer** : La formation spontanée de vortex et de turbulences. Visualisation via la vorticité (Curl) avec une palette de couleurs `magma`.
- **Interactions** : Déplacez la souris pour créer des remous dynamiques dans le fluide.

### 04. Aerodynamics (Wind Tunnel)
- **Description** : Soufflerie numérique simulant un flux d'air constant rencontrant un obstacle circulaire, avec injection de fumée (traceur).
- **Ce qu'il faut observer** : La fumée contournant l'obstacle, créant un sillage turbulent et des allées de tourbillons (von Kármán) se détachant périodiquement.
- **Interactions** : Déplacez la souris pour injecter manuellement de la fumée supplémentaire et perturber le flux. Observez la fluctuation du `dragScore`.

### 05. Flowfields (Pathfinding)
- **Description** : Calcul d'un champ de distance potentiel pour la navigation de masse.
- **Ce qu'il faut observer** : La génération instantanée d'un gradient de distance qui "inonde" la grille depuis une cible.
- **Interactions** : (Le champ se recalcule si la cible change de position).

### 06. Ecosystem Organic
- **Description** : Version avancée de la simulation organique avec des règles de voisinage plus subtiles et des transitions d'états fluides.
- **Ce qu'il faut observer** : Les motifs émergents de croissance et de décroissance qui rappellent des structures bactériennes ou fongiques.

### 07. Volume Diffusion 3D
- **Description** : Démonstration de la puissance 3D du moteur. Simulation de diffusion dans un cube de données (ex: 64x64x64).
- **Ce qu'il faut observer** : La diffusion volumétrique. L'exemple affiche souvent une "tranche" (slice) 2D d'un volume 3D en cours de calcul.
- **Note** : C'est ici que l'accélération WebGPU brille le plus.

---

## 🚀 Comment lancer un exemple ?

1. Entrez dans le dossier de l'exemple choisi :
   ```powershell
   cd 04-aerodynamics
   ```
2. Installez les dépendances (si ce n'est pas déjà fait) :
   ```powershell
   npm install
   ```
3. Lancez le serveur de développement :
   ```powershell
   npm run dev
   ```
4. Ouvrez l'URL indiquée (généralement `http://localhost:5173`).

---
*Note : Pour bénéficier du multi-threading CPU, assurez-vous que votre navigateur supporte `SharedArrayBuffer` (le moteur gère le fallback automatique sinon).*
