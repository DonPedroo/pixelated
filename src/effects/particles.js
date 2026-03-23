import { uniform, Fn, float, vec3, vec4, color, positionLocal, instanceIndex, vec2, sin, cos, mat3, rotate, positionWorld, step, mod, floor, mix, pass, uv, If, abs } from 'three/tsl';
import * as THREE from 'three/webgpu';

/**
 * Particles Effect
 * Renders a grid of circular particles with Z-wave animation and 3D rotation.
 */
export class ParticlesEffect {
    static type = 'standard';
    static order = 30;
    static getDefaults() {
        return {
            particlesEnabled: false,
            particlesCameraType: 'Perspective',
            particlesCameraFov: 75,
            particlesCameraSize: 5.0,
            particlesGridX: 50,
            particlesGridY: 50,
            particlesShapeX: 1.0,
            particlesShapeY: 1.0,
            particlesSize: 0.02,
            particlesColor: "#ffffff",
            particlesRotationX: 0,
            particlesRotationY: 0,
            particlesRotationZ: 0,
            particlesPosX: 0,
            particlesPosY: 0,
            particlesPosZ: 0,
            particlesWaveAmp: 0.2,
            particlesWaveFreq: 5.0,
            particlesWaveSpeed: 1.0,
            particlesWaveDirection: 0,
            particlesWaveSmooth: 0.5,
            particlesWaveInvertAlt: false,
            particlesBlendMode: 'mix'
        };
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
        this.meshInitialized = false;

        // Configuration for the InstancedMesh
        this.maxInstances = 250000; // max 500x500 grid
    }

    setupMesh() {
        if (this.meshInitialized) return;

        // Simple circular geometry
        const geometry = new THREE.PlaneGeometry(1, 1);

        this.material = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide
        });

        // Create a separate scene and camera for the particles
        this.scene = new THREE.Scene();

        const aspect = this.sketch.width / this.sketch.height;
        if (this.params.particlesCameraType === 'Orthographic') {
            const size = this.params.particlesCameraSize || 5.0;
            this.camera = new THREE.OrthographicCamera(size * aspect / -2, size * aspect / 2, size / 2, size / -2, 0.1, 100);
        } else {
            this.camera = new THREE.PerspectiveCamera(this.params.particlesCameraFov || 75, aspect, 0.1, 100);
        }
        this.camera.position.z = 2; // Position camera back so we can see particles at Z=0

        this.mesh = new THREE.InstancedMesh(geometry, this.material, this.maxInstances);
        this.mesh.frustumCulled = false; // Always render
        this.mesh.visible = this.params.particlesEnabled;

        this.scene.add(this.mesh);

        // Create a render pass for the particles scene
        this.passNode = pass(this.scene, this.camera);

        this.meshInitialized = true;
    }

    setupUniforms() {
        this.uniforms = {
            uEnabled: uniform(this.params.particlesEnabled ? 1 : 0),
            uGridX: uniform(this.params.particlesGridX),
            uGridY: uniform(this.params.particlesGridY),
            uShapeX: uniform(this.params.particlesShapeX),
            uShapeY: uniform(this.params.particlesShapeY),
            uSize: uniform(this.params.particlesSize),
            uColor: uniform(color(this.params.particlesColor)),
            uPosX: uniform(this.params.particlesPosX),
            uPosY: uniform(this.params.particlesPosY),
            uPosZ: uniform(this.params.particlesPosZ),
            uRotX: uniform(this.params.particlesRotationX * (Math.PI / 180)),
            uRotY: uniform(this.params.particlesRotationY * (Math.PI / 180)),
            uRotZ: uniform(this.params.particlesRotationZ * (Math.PI / 180)),
            uWaveAmp: uniform(this.params.particlesWaveAmp),
            uWaveFreq: uniform(this.params.particlesWaveFreq),
            uWaveSpeed: uniform(this.params.particlesWaveSpeed),
            uWaveDirection: uniform(this.params.particlesWaveDirection),
            uWaveSmooth: uniform(this.params.particlesWaveSmooth),
            uWaveInvertAlt: uniform(this.params.particlesWaveInvertAlt ? 1.0 : 0.0),
            uBlendMode: uniform(this.getBlendModeIndex(this.params.particlesBlendMode)),
            uTime: uniform(0)
        };

        if (this.params.particlesEnabled) {
            this.setupMesh();
        }

        if (this.meshInitialized) {
            this.updateMaterial();
        }

        return this.uniforms;
    }

    updateMaterial() {
        if (!this.meshInitialized) return;
        const { uEnabled, uGridX, uGridY, uShapeX, uShapeY, uSize, uColor, uPosX, uPosY, uPosZ, uRotX, uRotY, uRotZ, uWaveAmp, uWaveFreq, uWaveSpeed, uTime, uWaveDirection, uWaveSmooth, uWaveInvertAlt } = this.uniforms;

        // Discard pixels outside the circle (circle shape)
        this.material.opacityNode = Fn(() => {
            const dist = uv().sub(0.5).length();
            return float(1.0).sub(step(0.5, dist));
        })();

        this.material.colorNode = uColor;

        // Position Logic
        this.material.positionNode = Fn(() => {
            // Calculate grid index
            const idx = float(instanceIndex);
            const gridX = float(uGridX);
            const gridY = float(uGridY);
            const xIdx = mod(idx, gridX);
            const yIdx = floor(idx.div(gridX));

            // Normalized coordinates (-0.5 to 0.5)
            const uv = vec2(
                xIdx.div(gridX.sub(1.0)).sub(0.5),
                yIdx.div(gridY.sub(1.0)).sub(0.5)
            );

            // Scale to shape
            const shapedUv = vec2(
                uv.x.mul(uShapeX),
                uv.y.mul(uShapeY)
            );

            // Initial Position (Grid)
            const pos = vec3(shapedUv.x, shapedUv.y, 0.0).toVar();

            // Wave Animation (Z-axis)
            const dirF = float(uWaveDirection);
            const isX = step(0.5, dirF).mul(step(dirF, 1.5)); // dir == 1
            const isY = step(1.5, dirF); // dir == 2
            const isRadial = float(1.0).sub(isX).sub(isY); // dir == 0

            const dist = shapedUv.length().mul(isRadial).add(shapedUv.x.mul(isX)).add(shapedUv.y.mul(isY));

            // Smooth the peak at the center for radial direction
            const smoothedDist = mix(dist, dist.smoothstep(0.0, uWaveSmooth), isRadial.mul(step(0.001, uWaveSmooth)));

            // Invert alternating rows/columns if enabled (not for radial)
            const axisIndex = isX.mul(yIdx).add(isY.mul(xIdx));
            const isAlt = mod(axisIndex, 2.0);
            const invertFactor = float(1.0).sub(isAlt.mul(uWaveInvertAlt).mul(2.0));

            const wave = sin(smoothedDist.mul(uWaveFreq).sub(uTime.mul(uWaveSpeed))).mul(uWaveAmp).mul(invertFactor);
            pos.z.assign(wave);

            // Apply Size
            const finalPos = positionLocal.mul(uSize).add(pos);

            // Rotation around X axis
            const cosX = cos(uRotX);
            const sinX = sin(uRotX);
            const y1 = pos.y.mul(cosX).sub(pos.z.mul(sinX));
            const z1 = pos.y.mul(sinX).add(pos.z.mul(cosX));
            const rotXPos = vec3(pos.x, y1, z1);

            // Rotation around Y axis
            const cosY = cos(uRotY);
            const sinY = sin(uRotY);
            const rx = rotXPos.x.mul(cosY).add(rotXPos.z.mul(sinY));
            const rz = rotXPos.x.mul(sinY).negate().add(rotXPos.z.mul(cosY));
            const rotYPos = vec3(rx, rotXPos.y, rz);

            // Rotation around Z axis
            const cosZ = cos(uRotZ);
            const sinZ = sin(uRotZ);
            const zrx = rotYPos.x.mul(cosZ).sub(rotYPos.y.mul(sinZ));
            const zry = rotYPos.x.mul(sinZ).add(rotYPos.y.mul(cosZ));
            const rotZPos = vec3(zrx, zry, rotYPos.z);

            // Translation
            const translatedPos = rotZPos.add(vec3(uPosX, uPosY, uPosZ));

            return translatedPos.add(positionLocal.mul(uSize));
        })();

        this.mesh.count = Math.floor(Math.min(this.params.particlesGridX * this.params.particlesGridY, this.maxInstances));
        this.mesh.visible = this.params.particlesEnabled;
    }

    setupGUI(parentFolder) {
        const folder = parentFolder.addFolder('Particle System');
        const p = this.params;
        const u = this.uniforms;

        folder.add(p, 'particlesEnabled').name('Enabled').onChange(v => {
            u.uEnabled.value = v ? 1 : 0;
            if (v && !this.meshInitialized) {
                this.setupMesh();
                this.updateMaterial();
            }
            if (this.meshInitialized) {
                this.mesh.visible = v;
                if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
            }
        }).listen();

        folder.add(p, 'particlesCameraType', ['Perspective', 'Orthographic']).name('Camera Type').onChange(v => {
            if (this.camera) {
                const aspect = this.sketch.width / this.sketch.height;
                if (v === 'Orthographic') {
                    const size = p.particlesCameraSize || 5.0;
                    this.camera = new THREE.OrthographicCamera(size * aspect / -2, size * aspect / 2, size / 2, size / -2, 0.1, 100);
                } else {
                    this.camera = new THREE.PerspectiveCamera(p.particlesCameraFov || 75, aspect, 0.1, 100);
                }
                this.camera.position.z = 2;
                this.passNode = pass(this.scene, this.camera);
                if (this.updateCameraControlsVisibility) this.updateCameraControlsVisibility();
                if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
            }
        }).listen();

        this.fovCtrl = folder.add(p, 'particlesCameraFov', 10, 150, 1).name('Camera FOV').onChange(v => {
            if (this.camera && this.camera.isPerspectiveCamera) {
                this.camera.fov = v;
                this.camera.updateProjectionMatrix();
                if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
            }
        }).listen();

        this.sizeCtrl = folder.add(p, 'particlesCameraSize', 1.0, 20.0, 0.1).name('Camera Size').onChange(v => {
            if (this.camera && this.camera.isOrthographicCamera) {
                const aspect = this.sketch.width / this.sketch.height;
                this.camera.left = v * aspect / -2;
                this.camera.right = v * aspect / 2;
                this.camera.top = v / 2;
                this.camera.bottom = v / -2;
                this.camera.updateProjectionMatrix();
                if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
            }
        }).listen();

        this.updateCameraControlsVisibility = () => {
            const isPersp = p.particlesCameraType !== 'Orthographic';
            if (this.fovCtrl && typeof this.fovCtrl.show === 'function') this.fovCtrl.show(isPersp);
            if (this.sizeCtrl && typeof this.sizeCtrl.show === 'function') this.sizeCtrl.show(!isPersp);
        };
        setTimeout(this.updateCameraControlsVisibility, 0);

        folder.add(p, 'particlesGridX', 2, 500, 1).name('Grid X').onChange(v => {
            u.uGridX.value = v;
            if (this.meshInitialized) {
                this.mesh.count = Math.floor(Math.min(v * p.particlesGridY, this.maxInstances));
            }
        }).listen();

        folder.add(p, 'particlesGridY', 2, 500, 1).name('Grid Y').onChange(v => {
            u.uGridY.value = v;
            if (this.meshInitialized) {
                this.mesh.count = Math.floor(Math.min(p.particlesGridX * v, this.maxInstances));
            }
        }).listen();

        folder.add(p, 'particlesShapeX', 0.1, 10).name('Shape X').onChange(v => u.uShapeX.value = v).listen();
        folder.add(p, 'particlesShapeY', 0.1, 10).name('Shape Y').onChange(v => u.uShapeY.value = v).listen();

        folder.add(p, 'particlesSize', 0.001, 0.1).name('Size').onChange(v => u.uSize.value = v).listen();
        folder.addColor(p, 'particlesColor').name('Color').onChange(v => u.uColor.value.set(v)).listen();

        const posFolder = folder.addFolder('Position');
        posFolder.add(p, 'particlesPosX', -5, 5).name('X').onChange(v => u.uPosX.value = v).listen();
        posFolder.add(p, 'particlesPosY', -5, 5).name('Y').onChange(v => u.uPosY.value = v).listen();
        posFolder.add(p, 'particlesPosZ', -5, 5).name('Z').onChange(v => u.uPosZ.value = v).listen();

        const rotFolder = folder.addFolder('Rotation');
        rotFolder.add(p, 'particlesRotationX', -180, 180).name('Rot X (deg)').onChange(v => u.uRotX.value = v * (Math.PI / 180)).listen();
        rotFolder.add(p, 'particlesRotationY', -180, 180).name('Rot Y (deg)').onChange(v => u.uRotY.value = v * (Math.PI / 180)).listen();
        rotFolder.add(p, 'particlesRotationZ', -180, 180).name('Rot Z (deg)').onChange(v => u.uRotZ.value = v * (Math.PI / 180)).listen();

        const waveFolder = folder.addFolder('Wave Animation');
        waveFolder.add(p, 'particlesWaveDirection', { Radial: 0, 'X-Axis': 1, 'Y-Axis': 2 }).name('Direction').onChange(v => u.uWaveDirection.value = parseInt(v)).listen();
        waveFolder.add(p, 'particlesWaveInvertAlt').name('Invert Alternate').onChange(v => u.uWaveInvertAlt.value = v ? 1.0 : 0.0).listen();
        waveFolder.add(p, 'particlesWaveSmooth', 0, 2).name('Smooth Peak').onChange(v => u.uWaveSmooth.value = v).listen();
        waveFolder.add(p, 'particlesWaveAmp', 0, 1).name('Amplitude').onChange(v => u.uWaveAmp.value = v).listen();
        waveFolder.add(p, 'particlesWaveFreq', 0, 20).name('Frequency').onChange(v => u.uWaveFreq.value = v).listen();
        waveFolder.add(p, 'particlesWaveSpeed', 0, 5).name('Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();
        
        const blendModes = ['mix', 'add', 'screen', 'multiply', 'overlay', 'difference'];
        folder.add(p, 'particlesBlendMode', blendModes).name('Blend Mode').onChange(v => {
            u.uBlendMode.value = this.getBlendModeIndex(v);
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        return folder;
    }

    updateUniforms(params) {
        const u = this.uniforms;
        if (params.particlesEnabled && !this.meshInitialized) {
            this.setupMesh();
            this.updateMaterial();
        }

        u.uEnabled.value = params.particlesEnabled ? 1 : 0;
        
        if (this.camera) {
            let cameraChanged = false;
            const wantsOrtho = params.particlesCameraType === 'Orthographic';
            const isOrtho = this.camera.isOrthographicCamera;
            
            if (isOrtho !== wantsOrtho) {
                const aspect = this.sketch.width / this.sketch.height;
                if (wantsOrtho) {
                    const size = params.particlesCameraSize || 5.0;
                    this.camera = new THREE.OrthographicCamera(size * aspect / -2, size * aspect / 2, size / 2, size / -2, 0.1, 100);
                } else {
                    this.camera = new THREE.PerspectiveCamera(params.particlesCameraFov || 75, aspect, 0.1, 100);
                }
                this.camera.position.z = 2;
                this.passNode = pass(this.scene, this.camera);
                cameraChanged = true;
                if (this.updateCameraControlsVisibility) this.updateCameraControlsVisibility();
            } else {
                if (this.camera.isPerspectiveCamera && params.particlesCameraFov !== undefined && this.camera.fov !== params.particlesCameraFov) {
                    this.camera.fov = params.particlesCameraFov;
                    this.camera.updateProjectionMatrix();
                    cameraChanged = true;
                } else if (this.camera.isOrthographicCamera && params.particlesCameraSize !== undefined) {
                    const aspect = this.sketch.width / this.sketch.height;
                    const size = params.particlesCameraSize;
                    this.camera.left = size * aspect / -2;
                    this.camera.right = size * aspect / 2;
                    this.camera.top = size / 2;
                    this.camera.bottom = size / -2;
                    this.camera.updateProjectionMatrix();
                    cameraChanged = true;
                }
            }
            
            if (cameraChanged && this.sketch.updatePostProcessing) {
                this.sketch.updatePostProcessing();
            }
        }
        
        u.uGridX.value = params.particlesGridX;
        u.uGridY.value = params.particlesGridY;
        u.uShapeX.value = params.particlesShapeX;
        u.uShapeY.value = params.particlesShapeY;
        u.uSize.value = params.particlesSize;
        u.uColor.value.set(params.particlesColor);
        u.uPosX.value = params.particlesPosX;
        u.uPosY.value = params.particlesPosY;
        u.uPosZ.value = params.particlesPosZ;
        u.uRotX.value = params.particlesRotationX * (Math.PI / 180);
        u.uRotY.value = params.particlesRotationY * (Math.PI / 180);
        u.uRotZ.value = params.particlesRotationZ * (Math.PI / 180);
        u.uWaveAmp.value = params.particlesWaveAmp;
        u.uWaveFreq.value = params.particlesWaveFreq;
        u.uWaveSpeed.value = params.particlesWaveSpeed;
        u.uWaveDirection.value = params.particlesWaveDirection;
        u.uWaveSmooth.value = params.particlesWaveSmooth;
        u.uWaveInvertAlt.value = params.particlesWaveInvertAlt ? 1.0 : 0.0;
        u.uBlendMode.value = this.getBlendModeIndex(params.particlesBlendMode);

        if (this.meshInitialized) {
            this.mesh.visible = params.particlesEnabled;
            this.mesh.count = Math.floor(Math.min(params.particlesGridX * params.particlesGridY, this.maxInstances));
        }
    }

    updateSpeeds(isPerfectLoop, duration, quantizeFn) {
        const u = this.uniforms;
        if (u.uWaveSpeed) {
            u.uWaveSpeed.value = isPerfectLoop
                ? quantizeFn(this.params.particlesWaveSpeed, duration)
                : this.params.particlesWaveSpeed;
        }
    }

    resize(width, height) {
        if (this.camera) {
            const aspect = width / height;
            if (this.camera.isPerspectiveCamera) {
                this.camera.aspect = aspect;
            } else if (this.camera.isOrthographicCamera) {
                const size = this.params.particlesCameraSize || 5.0;
                this.camera.left = size * aspect / -2;
                this.camera.right = size * aspect / 2;
                this.camera.top = size / 2;
                this.camera.bottom = size / -2;
            }
            this.camera.updateProjectionMatrix();
        }
    }

    dispose() {
        if (this.mesh) {
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
            this.mesh.dispose();
        }
    }

    getBlendModeIndex(mode) {
        const modes = ['mix', 'add', 'screen', 'multiply', 'overlay', 'difference'];
        return modes.indexOf(mode || 'mix');
    }

    // Blend particles with the input node
    buildNode(inputColorNode, uvNode) {
        if (!this.params.particlesEnabled) return inputColorNode;
        if (!this.meshInitialized) {
            this.setupMesh();
            this.updateMaterial();
        }
        
        return Fn(() => {
            const finalColor = vec4(inputColorNode).toVar();
            const pColorNode = this.passNode.getTextureNode('output');
            const mixFactor = pColorNode.a.mul(this.uniforms.uEnabled);
            
            const baseColor = finalColor.rgb;
            const c = pColorNode.rgb;
            const blendMode = this.uniforms.uBlendMode;
            const blendResult = vec3(0.0).toVar();

            // mix
            If(blendMode.equal(0), () => {
                blendResult.assign(c);
            })
            // add
            .ElseIf(blendMode.equal(1), () => {
                blendResult.assign(baseColor.add(c));
            })
            // screen
            .ElseIf(blendMode.equal(2), () => {
                blendResult.assign(vec3(1.0).sub(vec3(1.0).sub(baseColor).mul(vec3(1.0).sub(c))));
            })
            // multiply
            .ElseIf(blendMode.equal(3), () => {
                blendResult.assign(baseColor.mul(c));
            })
            // overlay
            .ElseIf(blendMode.equal(4), () => {
                blendResult.assign(mix(
                    baseColor.mul(c).mul(2.0),
                    vec3(1.0).sub(vec3(1.0).sub(baseColor).mul(vec3(1.0).sub(c)).mul(2.0)),
                    step(0.5, baseColor)
                ));
            })
            // difference
            .ElseIf(blendMode.equal(5), () => {
                blendResult.assign(baseColor.sub(c).abs());
            });

            finalColor.rgb.assign(mix(baseColor, blendResult, mixFactor));
            return finalColor;
        })();
    }
}
