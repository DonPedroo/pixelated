# Pixelated & Parametric Motion Engine

A high-performance real-time engine for generating procedural patterns, parametric 3D wireframes, and organic motion graphics. Built with **Three.js (WebGPU/WebGL)** and **TSL (Three Shading Language)**.

This project provides a modular environment for building complex visual systems where geometry, deformation, and motion are controlled directly through real-time parameters.

<div align="center">
  <img src="src/ref/sketch-016-Pixelated-20260324-121008.png" width="45%" />
  <img src="src/ref/sketch-016-Pixelated-20260324-123523.png" width="45%" />
  <br />
  <img src="src/ref/sketch-016-Pixelated-20260324-125259.png" width="45%" />
  <img src="src/ref/sketch-016-Pixelated-20260324-131648.png" width="45%" />
</div>

<div align="center">
  <br />
  <a href="https://donpedroo.github.io/pixelated/"><strong><kbd> LIVE DEMO </kbd></strong></a>
  <br />
  <br />
  <h1><a href="https://donpedroo.github.io/pixelated/">donpedroo.github.io/pixelated</a></h1>
</div>

## 🚀 Core Features

### 🧊 Wireframe Shapes
A robust 3D primitive system that renders continuous wireframes with advanced NodeMaterial deformations.
-   **Primitives**: Support for Spheres, Cubes, Toruses, and Icosahedrons.
-   **TSL Deformations**: Real-time Vertex-level warping, twisting, and pole attraction.
-   **Occlusion**: Intelligent back-line occlusion using depth-proxy meshes to maintain clean visual structure.
-   **Animation**: Independent per-axis rotation speeds with perfect loop quantization.

### 🌟 Particle System
A grid-based instanced particle renderer designed for complex surface motion.
-   **Surface Waves**: Z-axis wave animations with adjustable frequency, amplitude, and directional controls (Radial, X, or Y).
-   **Blending Modes**: Supports advanced blending including `Screen`, `Overlay`, and `Difference` for rich visual stacking.
-   **Perspective & Ortho**: Dedicated camera controls to switch between flat patterns and deep 3D perspectives.

### ⭕ Rings Effect
Procedural ring generation with CD-style geometric shading.
-   **Geometric Shading**: Simulates specular anisotropy (vinyl/CD reflections) with adjustable angle and shine sharpness.
-   **Custom Masking**: Deep integration with the masking system allowing for complex cutouts and overlays.
-   **Dynamic Groups**: Manage up to 5 independent ring groups simultaneously.

### 🌈 Gradient Engine
A dual-mode gradient generator for background and atmosphere.
-   **Noise Based**: Generates fluid, organic color transitions using domain warping and FBM.
-   **Linear Based**: Traditional geometric gradients with multi-color support and distortion overlays.

### 📺 Post-Processing Suite
A modular TSL-based post-processing chain.
-   **Chroma Distortion**: High-performance radial chromatic aberration.
-   **Pixelate & Dither**: Stylized resolution downsampling and Bayer dithering.
-   **Noise & Film Grain**: Adjustable procedural noise for texture and depth.

## 🔄 Perfect Loop Workflow
Designed specifically for digital creators and social media.
-   **Speed Quantization**: Automatically adjusts all animation speeds to the nearest perfect cycle relative to the export duration.
-   **Frame Consistency**: Preview at 60 FPS and export at 30 FPS with identical mathematical precision.
-   **Metadata Drag & Drop**: Every exported PNG contains its full project settings as metadata. Drop any PNG back into the app to instantly restore the exact state used to create it.

## 🛠 Technology Stack
-   **Three.js (WebGPU/WebGL)**: Next-generation rendering pipe with automatic fallback.
-   **TSL**: Shaders written in pure JavaScript/TypeScript via Three Shading Language.
-   **Vite**: Fast development and building.
-   **lil-gui**: Real-time parameter control.

## 📖 Getting Started

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Building for Production
```bash
npm run build
```
