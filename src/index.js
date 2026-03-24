import * as THREE from 'three/webgpu';
import { vec2, uniform, int, float, pass, Fn, uv, rtt } from 'three/tsl';
import { createMainMaterial } from './material.js';
import GUI from 'lil-gui';
import { themes, themeOptions, defaultThemeName } from './settings.js';
import { EffectManager } from './EffectManager.js';
import { setupSketchGUI, getFolderStates, applyFolderStates } from './gui.js';
import { saveCanvasToPNG } from './utils/export-image.js';
import { exportSequence } from './utils/export-sequence.js';
import { setupMetadataDrop } from './utils/drag-drop.js';
import { deepMerge } from './utils/deepMerge.js';

/**
 * Sketch 016: Full Screen Quad Gradient with Noise Post Processing
 */
export default class Sketch {
    constructor(container) {
        this.container = container;

        // Stage Init
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); // For Full Screen Quad

        this.scenePass = pass(this.scene, this.camera);

        // Texture Cache System
        this.textures = {};
        this.imageFiles = import.meta.glob(['./tex/*.{png,jpg,jpeg,webp}'], { eager: true, as: 'url', import: 'default' });

        // GUI Initialization
        this.gui = new GUI();
        this.themes = themes;
        this.themeOptions = themeOptions;

        this.params = {};
        this.effectManager = new EffectManager(this);

        this.globalDefaults = this.getGlobalDefaults();
        const currentTheme = themes[defaultThemeName];
        deepMerge(this.params, this.globalDefaults, { theme: defaultThemeName }, currentTheme);

        // Renderer
        this.renderer = new THREE.WebGPURenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setClearColor(0x000000, 0); // Default to transparent
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // Global Shared TSL Uniforms
        this.uDpr = uniform(Math.min(window.devicePixelRatio, 2));
        this.uResolution = uniform(vec2(this.width, this.height));
        this.uGlobalTime = uniform(0);
        this.uLoopDuration = uniform(float(this.params.exportDuration || 4.0));
        this.uPerfectLoop = uniform(this.params.perfectLoop ? 1 : 0);
        this.resolution = this.uResolution; // alias for effects
        this.dpr = this.uDpr; // alias for effects

        // Initial Uniforms setup
        this.uniforms = {
            ...this.effectManager.setupUniforms(),
            uResolution: this.uResolution,
            uDpr: this.uDpr,
            uGlobalTime: this.uGlobalTime,
            uLoopDuration: this.uLoopDuration,
            uPerfectLoop: this.uPerfectLoop,
            uAnimationSpeed: uniform(vec2(this.params.animationSpeed, this.params.animationSpeed * 0.8)),
            uDistortionAmplitude: uniform(this.params.distortionAmplitude),
            uDistortionFrequency: uniform(this.params.distortionFrequency),
        };

        // Get direct access to key effects for legacy logic where needed
        this.gradientEffect = this.effectManager.getEffect('GradientEffect');
        this.pixelateEffect = this.effectManager.getEffect('PixelateEffect');
        this.imageEffect = this.effectManager.getEffect('ImageEffect');
        this.circlesEffect = this.effectManager.getEffect('CirclesEffect');
        this.particlesEffect = this.effectManager.getEffect('ParticlesEffect');
        this.wireframeShapesEffect = this.effectManager.getEffect('WireframeShapesEffect');
        this.ringsEffect = this.effectManager.getEffect('RingsEffect');
        this.postProcessingEffect = this.effectManager.getEffect('PostProcessingEffect');

        // Alias uniform properties for backwards compat with scripts that expect them on "this"
        Object.assign(this, this.uniforms);

        // Mesh - Full Screen Quad
        const geometry = new THREE.PlaneGeometry(2, 2);

        // TSL Material
        this.material = new THREE.MeshBasicNodeMaterial();
        this.updateMaterial();

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.scene.add(this.mesh);

        // Post Processing Setup
        this.postProcessing = new THREE.RenderPipeline(this.renderer);
        this.postUniforms = this.postProcessingEffect?.uniforms;

        // Registry of all modular effects (Now managed via manager)
        this.mountedEffects = this.effectManager.effects;

        this.updatePostProcessingChain();
        this.updateAnimationSpeeds();

        // GUI Initialization
        const guiSetup = setupSketchGUI(this);

        // Events
        this.resizeHandler = this.onResize.bind(this);
        window.addEventListener('resize', this.resizeHandler);

        // Auto-Save / Initial Theme Setup
        this.ignoreAutoSave = true;
        const autoSavedSettings = localStorage.getItem('pixelated_sketch_autosave');
        if (autoSavedSettings) {
            try {
                const parsedSettings = JSON.parse(autoSavedSettings);
                // Merge GlobalDefaults -> Current Theme in autosave (if any) -> Parsed Settings
                const baseThemeName = parsedSettings.theme || defaultThemeName;
                const baseTheme = themes[baseThemeName] || themes[defaultThemeName];
                const themeSettings = baseTheme ? (baseTheme.params || baseTheme) : {};
                const mergedSettings = deepMerge({}, this.globalDefaults, { theme: baseThemeName }, themeSettings, parsedSettings);
                this.loadSettings(mergedSettings);
            } catch (e) {
                console.error("Failed to load auto-saved settings", e);
                applyFolderStates(this.gui, this.params.guiFolderStates);
                this.applyTheme(defaultThemeName);
            }
        } else {
            // Initially collapse all folders from params if present
            applyFolderStates(this.gui, this.params.guiFolderStates);
            // Apply Initial Theme
            this.applyTheme(defaultThemeName);
        }

        // Make sure GUI reflects the state
        applyFolderStates(this.gui, this.params.guiFolderStates);

        // Setup Auto-Save Listeners
        this.gui.onChange(() => this.scheduleAutoSave());
        // Listen to interaction to catch folder opening/closing and custom swatches
        this.gui.domElement.addEventListener('click', () => this.scheduleAutoSave());
        this.gui.domElement.addEventListener('keyup', () => this.scheduleAutoSave());

        // Wait a bit before enabling auto-save to ensure setup initialization is fully done
        setTimeout(() => {
            this.ignoreAutoSave = false;
        }, 100);

        // Drag and Drop for PNG metadata
        this.dropCleanup = setupMetadataDrop(
            this.container,
            'pixelated-settings',
            (params) => {
                const baseThemeName = params.theme || defaultThemeName;
                const baseTheme = themes[baseThemeName] || themes[defaultThemeName];
                const themeSettings = baseTheme ? (baseTheme.params || baseTheme) : {};
                const mergedSettings = deepMerge({}, this.globalDefaults, { theme: baseThemeName }, themeSettings, params);
                this.loadSettings(mergedSettings);
            }
        );

        // Start Loop
        this.renderer.setAnimationLoop(this.update.bind(this));
    }

    async init() {
        try {
            await this.renderer.init();
            console.log(`Renderer initialized with ${this.renderer.backend.name} backend`);
        } catch (e) {
            console.error('Failed to initialize WebGPURenderer:', e);
            // If it fails, maybe it's Safari failing to pick WebGL automatically
            // We could try forceWebGL: true here as a last resort in some contexts,
            // but for now we just log for debugging.
        }
        this.initialized = true;
    }

    async loadTexture(filename) {
        if (this.textures[filename]) return this.textures[filename];
        const path = Object.keys(this.imageFiles).find(p => p.endsWith(filename));
        if (!path) return null;

        const loader = new THREE.TextureLoader();
        const url = this.imageFiles[path];
        const tex = await loader.loadAsync(url);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        this.textures[filename] = tex;
        return tex;
    }

    updateMaterial() {
        this.material.colorNode = createMainMaterial(this.uniforms, this.params)();
        this.material.needsUpdate = true;
    }

    updatePostProcessingChain() {
        const sceneTexture = this.scenePass.getTextureNode('output');
        const vUv = uv();

        // Ensure resolution is integer and valid
        const w = Math.floor(this.width);
        const h = Math.floor(this.height);

        // Backend optimization: WebGL is slower with RTT/RenderTarget swaps.
        // We bypass intermediate RTTs on WebGL to keep it as a single monolithic shader pass.
        const isWebGPU = this.renderer.backend.name === 'WebGPU';

        // Start with sampled scene or chroma distortion
        let currentNode;
        if (this.params.distortionChromaEnabled && this.postProcessingEffect) {
            // Optimization: RTT pre-pass the heavy pixelation module so we don't 
            // inject its math 16 times per pixel inside the Chroma radial sampling loop.
            let sourceTextureToSample = sceneTexture;
            let uvTransform = null;

            if (this.params.pixelateEnabled && this.pixelateEffect) {
                const pixelatedUv = this.pixelateEffect.applyPixelation(vUv);
                const pixelatedNode = sceneTexture.sample(pixelatedUv);
                
                // Optimized: Always use RTT when combining with heavy distortion loops
                // to avoid re-evaluating complex pixelate math 16+ times per pixel.
                sourceTextureToSample = rtt(pixelatedNode, w, h, { type: THREE.HalfFloatType });
                uvTransform = null;
            }

            const chromaNode = this.postProcessingEffect.buildSamplingNode(sourceTextureToSample, vUv, uvTransform);
            
            if (isWebGPU) {
                currentNode = rtt(chromaNode, w, h, { type: THREE.HalfFloatType }).sample(vUv);
            } else {
                currentNode = chromaNode;
            }
        } else {
            if (this.params.pixelateEnabled && this.pixelateEffect) {
                const pixelatedUv = this.pixelateEffect.applyPixelation(vUv);
                const pixelatedNode = sceneTexture.sample(pixelatedUv);
                
                if (isWebGPU) {
                    currentNode = rtt(pixelatedNode, w, h, { type: THREE.HalfFloatType }).sample(vUv);
                } else {
                    currentNode = pixelatedNode;
                }
            } else {
                if (isWebGPU) {
                    currentNode = rtt(sceneTexture.sample(vUv), w, h, { type: THREE.HalfFloatType }).sample(vUv);
                } else {
                    currentNode = sceneTexture.sample(vUv);
                }
            }
        }

        // Standard effects (Generator -> Shapes -> Particles -> etc)
        currentNode = this.effectManager.buildStandardNodes(currentNode, vUv);

        // Post-standard modifiers (Color correction, Image overlays, Noise)
        if (this.params.colorCorrectionEnabled && this.postProcessingEffect) {
            currentNode = this.postProcessingEffect.buildColorCorrectionNode(currentNode);
        }

        if (this.params.imageEnabled && this.imageEffect) {
            currentNode = this.imageEffect.buildNode(currentNode, vUv);
        }

        if (this.params.noiseEnabled && this.postProcessingEffect) {
            currentNode = this.postProcessingEffect.buildNoiseNode(currentNode, vUv);
        }

        if (this.postProcessingEffect) {
            currentNode = this.postProcessingEffect.buildDitherNode(currentNode, vUv);
        }

        this.postProcessing.outputNode = currentNode;
        this.postProcessing.needsUpdate = true;
    }

    updatePostProcessing() {
        this.updatePostProcessingChain();
    }

    getGlobalDefaults() {
        return {
            ...this.effectManager.gatherDefaults(),
            distortionAmplitude: 0.1,
            distortionFrequency: 2.0,
            animationSpeed: 0.1,
            perfectLoop: true,
            isPlaying: false,
            previewFrame: 0,
            exportFPS: 30,
            exportDuration: 4,
            exportScaleMultiplier: 1,
            gradientColorCount: 3,
            guiFolderStates: {}
        };
    }

    applyTheme(themeName) {
        const theme = themes[themeName];
        if (!theme) return;

        // Reset to global defaults first, then apply theme
        const settings = theme.params || theme;
        const mergedSettings = deepMerge({}, this.globalDefaults, settings, { theme: themeName });
        this.loadSettings(mergedSettings);
    }

    loadSettings(settings) {
        // Deep merge the incoming settings into our params
        deepMerge(this.params, settings);

        // Ensure color count is accurately reflected
        if (settings.gradientColors) {
            this.params.gradientColorCount = settings.gradientColors.length;
        }

        if (this.rebuildDynamicControls) {
            this.rebuildDynamicControls(false);
        }

        if (this.updateFrameLimits) {
            this.updateFrameLimits();
        }

        // Update Gradient Uniforms
        this.uCenter.value.set(settings.centerX, settings.centerY);
        this.uRadius.value = settings.radius;
        this.uDistortionAmplitude.value = settings.distortionAmplitude;
        this.uDistortionFrequency.value = settings.distortionFrequency;
        this.updateAnimationSpeeds();

        this.uGradientType.value = settings.gradientType === 'Noise Based Gradient' ? 0 : 1;
        const directions = ['Left to Right', 'Right to Left', 'Top to Bottom', 'Bottom to Top'];
        this.uLinearDirection.value = directions.indexOf(settings.linearDirection || 'Left to Right');
        this.uLinearRotation.value = settings.linearRotation !== undefined ? settings.linearRotation : 0;
        this.uLinearScale.value.set(settings.linearScaleX || 1, settings.linearScaleY || 1);
        this.uLinearWrapMode.value = ['Clamp', 'Repeat', 'Mirror'].indexOf(settings.linearWrapMode || 'Mirror');
        this.uGradientMidpoint.value = settings.gradientMidpoint !== undefined ? settings.gradientMidpoint : 0.5;

        // Update LUT Texture
        this.gradientEffect.updateTexture();

        if (this.updateGradientVisibility) {
            this.updateGradientVisibility(settings.gradientType || 'Noise Based Gradient');
        }

        this.updateMaterial();

        // Update Noise Post Processing Uniforms
        if (this.postUniforms) {
            this.effectManager.updateUniforms(this.params);
            this.updatePostProcessingChain();
            this.updateAnimationSpeeds();
        }


        // Refresh all swatch grids
        this.gui.folders.forEach(f => {
            if (f._updateSwatches) f._updateSwatches.forEach(update => update());
        });

        // Apply GUI folder states (collapses by default if states missing)
        applyFolderStates(this.gui, settings.guiFolderStates);

        // Update GUI display
        const refreshGui = (folders) => {
            folders.forEach(f => {
                f.controllers.forEach(c => c.updateDisplay());
                if (f.folders) refreshGui(f.folders);
            });
        };
        refreshGui([this.gui]);

        if (this.scheduleAutoSave) {
            this.scheduleAutoSave();
        }
    }

    // onDrop functionality is now handled by setupMetadataDrop in the constructor

    scheduleAutoSave() {
        if (this.ignoreAutoSave) return;
        if (this.autoSaveTimeout) clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.autoSave();
        }, 500);
    }

    getQuantizedSpeed(speed, duration) {
        if (duration <= 0) return speed;
        // Calculate nearest integer cycle
        let cycles = Math.round((duration * speed) / (2 * Math.PI));

        // Prevent speed from dropping to 0 (freezing) unless original speed was exactly 0
        if (speed !== 0 && cycles === 0) {
            cycles = Math.sign(speed);
        }

        // Return the perfect loop speed
        return (2 * Math.PI * cycles) / duration;
    }

    updateBaseSpeeds(isLoop, duration, quantizeFn) {
        let speedX = this.params.animationSpeed;
        let speedY = this.params.animationSpeed * 0.8;
        if (isLoop) {
            speedX = quantizeFn(speedX, duration);
            speedY = quantizeFn(speedY, duration);
        }
        if (this.uAnimationSpeed) {
            this.uAnimationSpeed.value.set(speedX, speedY);
        }
    }

    updateAnimationSpeeds() {
        const dur = this.params.exportDuration || 4;
        const isLoop = this.params.perfectLoop;

        // Sync duration/loop uniforms
        if (this.uLoopDuration) this.uLoopDuration.value = dur;
        if (this.uPerfectLoop) this.uPerfectLoop.value = isLoop ? 1 : 0;

        // Update base speeds (gradient/distortion)
        this.updateBaseSpeeds(isLoop, dur, this.getQuantizedSpeed.bind(this));

        // Delegate to mounted modular effects
        if (this.mountedEffects) {
            this.mountedEffects.forEach(effect => {
                if (typeof effect.updateSpeeds === 'function') {
                    effect.updateSpeeds(isLoop, dur, this.getQuantizedSpeed.bind(this));
                }
            });
        }
    }

    autoSave() {
        if (!this.initialized) return;

        // Record GUI states into params before saving
        this.params.guiFolderStates = getFolderStates(this.gui);

        const serializableParams = {};
        for (const [key, value] of Object.entries(this.params)) {
            if (typeof value !== 'function') {
                serializableParams[key] = value;
            }
        }
        localStorage.setItem('pixelated_sketch_autosave', JSON.stringify(serializableParams));
    }

    onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.renderer.setSize(this.width, this.height);
        const dpr = Math.min(window.devicePixelRatio, 2);
        this.renderer.setPixelRatio(dpr);

        this.uResolution.value.set(this.width, this.height);
        this.uDpr.value = dpr;
        this.updateAnimationSpeeds();

        if (this.particlesEffect) {
            this.particlesEffect.resize(this.width, this.height);
        }
        if (this.wireframeShapesEffect) {
            this.wireframeShapesEffect.resize(this.width, this.height);
        }
    }

    update(t) {
        if (!this.initialized) return;

        let deltaTime = 0;
        if (this.lastTime !== undefined) {
            deltaTime = t - this.lastTime;
        }
        this.lastTime = t;

        let timeSeconds;

        if (this.params.perfectLoop) {
            if (this.params.previewFrame === undefined || isNaN(this.params.previewFrame)) {
                this.params.previewFrame = 0;
            }

            const totalFrames = Math.floor(this.params.exportFPS * this.params.exportDuration);

            if (!this.isExporting) {
                // Keep fractional tracking independent so the GUI only receives pure integers
                if (this._fractionalFrame === undefined || Math.floor(this._fractionalFrame) !== this.params.previewFrame) {
                    this._fractionalFrame = this.params.previewFrame;
                }

                if (this.params.isPlaying) {
                    const frameIncrement = (deltaTime / 1000) * this.params.exportFPS;
                    this._fractionalFrame += frameIncrement;
                    this._fractionalFrame = this._fractionalFrame % totalFrames;

                    this.params.previewFrame = Math.floor(this._fractionalFrame);
                }
            }

            timeSeconds = this.params.previewFrame / this.params.exportFPS;
        } else {
            timeSeconds = t / 1000;
        }

        if (this.uniforms && this.uniforms.uGlobalTime) {
            this.uniforms.uGlobalTime.value = timeSeconds;
        }

        if (this.postUniforms && this.postUniforms.uTime) {
            this.postUniforms.uTime.value = timeSeconds;
        }
        if (this.pixelateEffect && this.pixelateEffect.uniforms.uTime) {
            this.pixelateEffect.uniforms.uTime.value = timeSeconds;
        }
        if (this.particlesEffect && this.particlesEffect.uniforms.uTime) {
            this.particlesEffect.uniforms.uTime.value = timeSeconds;
        }

        if (this.mountedEffects) {
            this.mountedEffects.forEach(effect => {
                if (typeof effect.update === 'function') {
                    effect.update(deltaTime, timeSeconds);
                }
            });
        }

        // Render Final Scene (Quad) with Post Processing
        this.postProcessing.render();
    }

    dispose() {
        this.renderer.setAnimationLoop(null);
        window.removeEventListener('resize', this.resizeHandler);

        if (this.gui) this.gui.destroy();
        if (this.dropCleanup) this.dropCleanup();

        this.renderer.dispose();

        // Dispose all mounted effects
        if (this.mountedEffects) {
            this.mountedEffects.forEach(effect => {
                if (typeof effect.dispose === 'function') {
                    effect.dispose();
                }
            });
        }

        // Dispose textures
        if (this.textures) {
            Object.values(this.textures).forEach(tex => {
                if (tex && typeof tex.dispose === 'function') {
                    tex.dispose();
                }
            });
            this.textures = {};
        }

        this.scene.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });

        if (this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
        }
    }

    saveAsPNG() {
        const themeName = this.params.theme;
        const date = new Date();
        const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
        const filename = `sketch-016-${themeName}-${timestamp}.png`;

        // Record GUI states into params before saving
        this.params.guiFolderStates = getFolderStates(this.gui);

        const multiplier = this.params.exportScaleMultiplier || 1;
        const exportWidth = Math.floor(this.width * multiplier);
        const exportHeight = Math.floor(this.height * multiplier);

        // Store original state
        const originalWidth = this.width;
        const originalHeight = this.height;

        // Resize for export
        this.renderer.setSize(exportWidth, exportHeight, false);
        this.uResolution.value.set(exportWidth, exportHeight);
        
        // Force a render at the new size
        this.postProcessing.render();

        // Save
        saveCanvasToPNG(this.renderer.domElement, this.params, 'pixelated-settings', filename);

        // Restore original size
        this.renderer.setSize(originalWidth, originalHeight);
        this.uResolution.value.set(originalWidth, originalHeight);
        this.postProcessing.render(); // Re-render at original size for UI consistency
    }

    async exportSequence() {
        if (this.isExporting) return;
        this.isExporting = true;

        let exportCtrl;
        this.gui.folders.forEach(f => {
            if (f._title === 'Export') {
                exportCtrl = f.controllers.find(c => c.property === 'exportSequence');
            }
        });

        // Prepare UI for export
        this.gui.domElement.style.pointerEvents = 'none';
        this.gui.domElement.style.opacity = '0.5';

        // Stop animation loop to take manual control
        this.renderer.setAnimationLoop(null);

        const wasPerfectLoop = this.params.perfectLoop;
        const wasPlaying = this.params.isPlaying;

        this.params.perfectLoop = true; // Force math
        this.params.isPlaying = false; // Freeze the scrubber
        this.updateAnimationSpeeds();

        try {
            await exportSequence({
                renderer: this.renderer,
                fps: this.params.exportFPS || 30,
                duration: this.params.exportDuration || 4,
                resolution: [
                    Math.floor(this.width * (this.params.exportScaleMultiplier || 1)),
                    Math.floor(this.height * (this.params.exportScaleMultiplier || 1))
                ],
                onProgress: (current, total, statusText) => {
                    if (exportCtrl) exportCtrl.name(statusText || `Exporting... ${current}/${total}`);
                },
                renderFrame: async (tSeconds, i) => {
                    this.params.previewFrame = i;

                    this.uResolution.value.set(
                        Math.floor(this.width * (this.params.exportScaleMultiplier || 1)),
                        Math.floor(this.height * (this.params.exportScaleMultiplier || 1))
                    );

                    // Drives the exact same math as the live canvas!
                    this.update(0);

                    // Yield to keep the browser responsive.
                    // This is ONLY for the export process. Regular playback (setAnimationLoop) 
                    // still uses the default requestAnimationFrame behavior and will pause in background as expected.
                    // requestAnimationFrame pauses in the background, so we use a fallback for exported frames.
                    if (document.visibilityState === 'visible') {
                        await new Promise(r => requestAnimationFrame(r));
                    } else {
                        // In background tabs, requestAnimationFrame won't fire.
                        // We use a small timeout to keep the loop moving while remaining responsive.
                        await new Promise(r => setTimeout(r, 0));
                    }
                }
            });
        } catch (err) {
            console.error("Failed to export sequence", err);
            alert(`Export failed: ${err.message}`);
        } finally {
            // Restore UI and state
            this.params.perfectLoop = wasPerfectLoop;
            this.params.isPlaying = wasPlaying;
            this.updateAnimationSpeeds();

            this.uResolution.value.set(this.width, this.height);
            this.gui.domElement.style.pointerEvents = 'auto';
            this.gui.domElement.style.opacity = '1';
            if (exportCtrl) exportCtrl.name('Export Sequence 🎬');
            this.isExporting = false;
            this.renderer.setAnimationLoop(this.update.bind(this));
        }
    }
}
