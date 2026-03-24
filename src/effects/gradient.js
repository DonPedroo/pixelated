import * as THREE from 'three/webgpu';
import { Fn, float, int, sin, cos, vec2, vec3, color, uniform, smoothstep, mix, step, fract, If, uv, mx_fractal_noise_vec3 } from 'three/tsl';
import { BRAND_COLORS } from '../settings.js';

/**
 * Gradient Effect Module
 * Provides reusable logic for N-color gradients with TSL integration and Lil-GUI support.
 */
export class GradientEffect {
    static id = 'GradientEffect';
    static type = 'generator';
    static order = 10;

    static getDefaults() {
        return {
            gradientType: 'Noise Based Gradient',
            gradientColors: [BRAND_COLORS.Black2, BRAND_COLORS.Red, BRAND_COLORS.Red2],
            gradientStops: [0, 0.5, 1.0],
            gradientColorCount: 3,
            centerX: 0.5,
            centerY: 0.5,
            radius: 1.0,
            gradientMidpoint: 0.5,
            linearDirection: 'Left to Right',
            linearRotation: 0,
            linearScaleX: 1,
            linearScaleY: 1,
            linearWrapMode: 'Mirror',
            linearWrapMode: 'Mirror',
            gradientIGNDither: true,
            gradientDitherStrength: 1.0,
            gradientWarpMode: 'None',
            gradientWarpStrength: 0.1,
            gradientWarpScale: 2.0,
            gradientWarpSpeed: 0.1
        };
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
        this.dynamicControllers = [];
    }

    /**
     * Initializes uniforms required for the gradient shader
     */
    setupUniforms() {
        this.uniforms = {
            uCenter: uniform(vec2(this.params.centerX, this.params.centerY)),
            uRadius: uniform(this.params.radius),
            uGradientMidpoint: uniform(this.params.gradientMidpoint),
            uGradientType: uniform(this.params.gradientType === 'Noise Based Gradient' ? 0 : 1),
            uLinearDirection: uniform(['Left to Right', 'Right to Left', 'Top to Bottom', 'Bottom to Top'].indexOf(this.params.linearDirection)),
            uLinearRotation: uniform(this.params.linearRotation),
            uLinearScale: uniform(vec2(this.params.linearScaleX, this.params.linearScaleY)),
            uLinearWrapMode: uniform(['Clamp', 'Repeat', 'Mirror'].indexOf(this.params.linearWrapMode)),
            uGradientIGNDither: uniform(this.params.gradientIGNDither ? 1 : 0),
            uGradientDitherStrength: uniform(this.params.gradientDitherStrength),
            uWarpMode: uniform(['None', 'Wave', 'Noise'].indexOf(this.params.gradientWarpMode || 'None')),
            uWarpStrength: uniform(this.params.gradientWarpStrength !== undefined ? this.params.gradientWarpStrength : 0.1),
            uWarpScale: uniform(this.params.gradientWarpScale !== undefined ? this.params.gradientWarpScale : 2.0),
            uWarpSpeed: uniform(this.params.gradientWarpSpeed !== undefined ? this.params.gradientWarpSpeed : 0.1),
            uGlobalTime: this.sketch.uGlobalTime,
            uResolution: this.sketch.uResolution,
            uDpr: this.sketch.uDpr
        };

        // Initialize 5 color and stop uniforms
        for (let i = 0; i < 5; i++) {
            const colorHex = this.params.gradientColors && this.params.gradientColors[i] ? this.params.gradientColors[i] : '#ffffff';
            const stopVal = this.params.gradientStops && this.params.gradientStops[i] !== undefined ? this.params.gradientStops[i] : (i / 4);
            this.uniforms[`uColor${i}`] = uniform(color(colorHex));
            this.uniforms[`uStop${i}`] = uniform(float(stopVal));
        }

        return this.uniforms;
    }

    /**
     * Updates the gradient uniforms based on current params
     */
    updateTexture() {
        const colors = this.params.gradientColors || [];
        const stops = this.params.gradientStops || [];

        for (let i = 0; i < 5; i++) {
            if (this.uniforms[`uColor${i}`] && colors[i]) {
                this.uniforms[`uColor${i}`].value.set(colors[i]);
            }
            if (this.uniforms[`uStop${i}`] && stops[i] !== undefined) {
                this.uniforms[`uStop${i}`].value = stops[i];
            }
        }
    }

    /**
     * Injects GUI controls into a Lil-GUI folder
     */
    setupGUI(parentFolder) {
        const gradFolder = parentFolder.addFolder('Gradient Settings');
        const params = this.params;
        const uniforms = this.uniforms;

        const typeController = gradFolder.add(params, 'gradientType', ['Noise Based Gradient', 'Linear Gradient']).name('Type').onChange((v) => {
            uniforms.uGradientType.value = (v === 'Noise Based Gradient' ? 0 : 1);
            this.updateVisibility(v);
            if (this.sketch.updateMaterial) this.sketch.updateMaterial();
        }).listen();

        const linearDirectionController = gradFolder.add(params, 'linearDirection', ['Left to Right', 'Right to Left', 'Top to Bottom', 'Bottom to Top']).name('Direction').onChange((v) => {
            const directions = ['Left to Right', 'Right to Left', 'Top to Bottom', 'Bottom to Top'];
            uniforms.uLinearDirection.value = directions.indexOf(v);
        }).listen();

        const linearRotationController = gradFolder.add(params, 'linearRotation', 0, Math.PI * 2).name('Rotation').onChange((v) => {
            uniforms.uLinearRotation.value = v;
        }).listen();

        const linearScaleXController = gradFolder.add(params, 'linearScaleX', 0.01, 10).name('Scale X').onChange((v) => {
            uniforms.uLinearScale.value.x = v;
        }).listen();

        const linearScaleYController = gradFolder.add(params, 'linearScaleY', 0.01, 10).name('Scale Y').onChange((v) => {
            uniforms.uLinearScale.value.y = v;
        }).listen();

        const linearWrapModeController = gradFolder.add(params, 'linearWrapMode', ['Clamp', 'Repeat', 'Mirror']).name('Wrap Mode').onChange((v) => {
            uniforms.uLinearWrapMode.value = ['Clamp', 'Repeat', 'Mirror'].indexOf(v);
        }).listen();

        const centerXController = gradFolder.add(params, 'centerX', -1, 2).name('Gradient Center X').onChange((v) => uniforms.uCenter.value.x = v).listen();
        const centerYController = gradFolder.add(params, 'centerY', -1, 2).name('Gradient Center Y').onChange((v) => uniforms.uCenter.value.y = v).listen();
        const radiusController = gradFolder.add(params, 'radius', 0.1, 5.0).name('Radius').onChange((v) => uniforms.uRadius.value = v).listen();
        const mid2Controller = gradFolder.add(params, 'gradientMidpoint', 0.1, 0.9).name('Midpoint').onChange((v) => uniforms.uGradientMidpoint.value = v).listen();

        this.controllers = {
            typeController,
            linearDirectionController,
            linearRotationController,
            linearScaleXController,
            linearScaleYController,
            centerXController,
            centerYController,
            radiusController,
            linearWrapModeController,
            mid2Controller
        };

        gradFolder.add(params, 'gradientIGNDither').name('IGN Dithering').onChange(v => {
            uniforms.uGradientIGNDither.value = v ? 1 : 0;
            if (this.sketch.updateMaterial) this.sketch.updateMaterial();
        }).listen();

        gradFolder.add(params, 'gradientDitherStrength', 0, 2).name('Dither Strength').onChange(v => {
            uniforms.uGradientDitherStrength.value = v;
            if (this.sketch.updateMaterial) this.sketch.updateMaterial();
        }).listen();

        const warpFolder = gradFolder.addFolder('Distortion / Warping');
        warpFolder.add(params, 'gradientWarpMode', ['None', 'Wave', 'Noise']).name('Warp Mode').onChange((v) => {
            uniforms.uWarpMode.value = ['None', 'Wave', 'Noise'].indexOf(v);
        }).listen();
        warpFolder.add(params, 'gradientWarpStrength', 0, 1).name('Warp Strength').onChange((v) => uniforms.uWarpStrength.value = v).listen();
        warpFolder.add(params, 'gradientWarpScale', 0.1, 10).name('Warp Scale').onChange((v) => uniforms.uWarpScale.value = v).listen();
        warpFolder.add(params, 'gradientWarpSpeed', 0, 5).name('Warp Speed').onChange((v) => {
            uniforms.uWarpSpeed.value = v;
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        const colorFolder = gradFolder.addFolder('Colors');
        this.colorFolder = colorFolder;

        // N-Color Dynamic Controls
        params.gradientColorCount = params.gradientColors ? params.gradientColors.length : 3;

        const rebuildDynamicControls = (forceEvenStops = false) => {
            this.dynamicControllers.forEach(c => {
                if (c.destroy) c.destroy();
                if (c._swatchWrapper && c._swatchWrapper.parentNode) {
                    c._swatchWrapper.parentNode.removeChild(c._swatchWrapper);
                }
            });
            this.dynamicControllers.length = 0;

            const count = params.gradientColorCount;
            params.gradientColors = params.gradientColors ? [...params.gradientColors] : [];
            params.gradientStops = params.gradientStops ? [...params.gradientStops] : [];

            while (params.gradientColors.length < count) params.gradientColors.push('#ffffff');
            params.gradientColors = params.gradientColors.slice(0, count);

            if (forceEvenStops === true) {
                params.gradientStops = [];
                for (let i = 0; i < count; i++) {
                    params.gradientStops.push(i / (count - 1));
                }
            } else {
                while (params.gradientStops.length < count) {
                    params.gradientStops.push(params.gradientStops.length / (count - 1));
                }
                params.gradientStops = params.gradientStops.slice(0, count);
            }

            for (let i = 0; i < count; i++) {
                const colorCtrl = colorFolder.addColor(params.gradientColors, i).name(`Color ${i + 1}`).onChange(() => this.updateTexture());

                // Swatch Grid
                const wrapper = document.createElement('div');
                wrapper.style.marginBottom = '10px';
                const container = document.createElement('div');
                container.className = 'brand-swatches-container';
                Object.entries(BRAND_COLORS).forEach(([name, color]) => {
                    const swatch = document.createElement('div');
                    swatch.className = 'brand-swatch';
                    swatch.style.backgroundColor = color;
                    swatch.onclick = () => {
                        params.gradientColors[i] = color;
                        colorCtrl.updateDisplay();
                        this.updateTexture();
                        container.querySelectorAll('.brand-swatch').forEach(s => s.classList.remove('selected'));
                        swatch.classList.add('selected');
                    };
                    container.appendChild(swatch);
                });
                wrapper.appendChild(container);
                if (colorCtrl.domElement) {
                    colorCtrl.domElement.parentNode.insertBefore(wrapper, colorCtrl.domElement);
                    colorCtrl._swatchWrapper = wrapper;
                }
                this.dynamicControllers.push(colorCtrl);

                if (i > 0 && i < count - 1) {
                    const stopCtrl = colorFolder.add(params.gradientStops, i, 0, 1).name(`Color ${i + 1} Pos`).onChange(() => this.updateTexture());
                    this.dynamicControllers.push(stopCtrl);
                }
            }

            // Colors and stops already update via their existing uniforms in updateTexture()
            this.updateTexture();
        };

        this.rebuildDynamicControls = rebuildDynamicControls;

        colorFolder.add(params, 'gradientColorCount', 2, 5, 1).name('Number of Colors').onChange(() => {
            rebuildDynamicControls(true);
            if (this.sketch.updateMaterial) this.sketch.updateMaterial();
        });
        rebuildDynamicControls();


        this.updateVisibility(params.gradientType || 'Noise Based Gradient');

        return gradFolder;
    }

    updateVisibility(type) {
        if (!this.controllers) return;
        const isCircular = type === 'Noise Based Gradient';
        const isLinear = type === 'Linear Gradient';

        // Circular specific
        this.controllers.centerXController.show(isCircular);
        this.controllers.centerYController.show(isCircular);
        this.controllers.radiusController.show(isCircular);

        // Linear specific
        this.controllers.linearDirectionController.show(isLinear);
        this.controllers.linearRotationController.show(isLinear);
        this.controllers.linearScaleXController.show(true); // Now used by both for elliptical/scale
        this.controllers.linearScaleYController.show(true);
        this.controllers.centerXController.show(true); // Unified Offset
        this.controllers.centerYController.show(true);
        this.controllers.linearWrapModeController.show(isLinear);
        this.controllers.radiusController.show(isCircular);
    }

    updateUniforms(params) {
        if (this.uniforms.uGradientIGNDither) this.uniforms.uGradientIGNDither.value = params.gradientIGNDither ? 1 : 0;
        if (this.uniforms.uGradientDitherStrength) this.uniforms.uGradientDitherStrength.value = params.gradientDitherStrength;
        
        if (this.uniforms.uWarpMode) this.uniforms.uWarpMode.value = ['None', 'Wave', 'Noise'].indexOf(params.gradientWarpMode || 'None');
        if (this.uniforms.uWarpStrength) this.uniforms.uWarpStrength.value = params.gradientWarpStrength !== undefined ? params.gradientWarpStrength : 0.1;
        if (this.uniforms.uWarpScale) this.uniforms.uWarpScale.value = params.gradientWarpScale !== undefined ? params.gradientWarpScale : 2.0;
        if (this.uniforms.uWarpSpeed) this.uniforms.uWarpSpeed.value = params.gradientWarpSpeed !== undefined ? params.gradientWarpSpeed : 0.1;

        this.updateTexture(); // Sync colors and stops
    }
}

/**
 * TSL Gradient Implementation
 * Returns a color node based on gradient uniforms and distorted UVs
 */
export const getGradientColorNode = (uvNode, uniforms, params) => {
    const {
        uGradientType,
        uLinearDirection,
        uLinearRotation,
        uLinearScale,
        uCenter,
        uLinearWrapMode,
        uGradientMidpoint,
        uRadius,
        uWarpMode,
        uWarpStrength,
        uWarpScale,
        uWarpSpeed,
        uGlobalTime,
        uLoopDuration,
        uPerfectLoop
    } = uniforms;


    const ign = Fn(([pixelPos]) => {
        const magic = float(0.06711056).mul(pixelPos.x).add(float(0.00583715).mul(pixelPos.y));
        return fract(float(52.9829189).mul(fract(magic)));
    });

    const finalAngle = uLinearDirection.equal(0).select(float(0),
        uLinearDirection.equal(1).select(float(Math.PI),
            uLinearDirection.equal(2).select(float(Math.PI * 0.5),
                float(Math.PI * 1.5)
            )
        )
    ).add(uLinearRotation);

    const centeredUv = uvNode.sub(uCenter);

    // Warping Logic
    const warpedUv = centeredUv.toVar();
    
    // Use periodic time for warping to ensure perfect loops
    // We use mod(uLoopDuration) to handle both live playback and export cases safely
    const periodicTime = uPerfectLoop.equal(1).select(uGlobalTime.mod(uLoopDuration), uGlobalTime);
    const t_time = periodicTime.mul(uWarpSpeed);
    const t_angle = periodicTime.mul(float(Math.PI * 2.0)).div(uLoopDuration);

    If(uWarpMode.equal(1), () => { // Wave
        const waveOffset = vec2(
            sin(centeredUv.y.mul(uWarpScale).add(t_time)),
            cos(centeredUv.x.mul(uWarpScale).sub(t_time))
        ).mul(uWarpStrength);
        warpedUv.addAssign(waveOffset);
    }).ElseIf(uWarpMode.equal(2), () => { // Noise
        // For a perfect loop in 3D noise, we move through a circular path in the Z dimension
        // by utilizing sin/cos of the normalized periodic time.
        const radius = float(1.0); // Radius in noise space
        const noiseInput = vec3(
            centeredUv.mul(uWarpScale), 
            sin(t_angle).mul(radius)
        );
        const noiseOffset = mx_fractal_noise_vec3(noiseInput).xy.sub(0.5).mul(uWarpStrength.mul(2.0));
        warpedUv.addAssign(noiseOffset);
    });

    const s = sin(finalAngle);
    const c = cos(finalAngle);

    const rotatedUv = vec2(
        warpedUv.x.mul(c).sub(warpedUv.y.mul(s)),
        warpedUv.x.mul(s).add(warpedUv.y.mul(c))
    );

    const transformedUv = rotatedUv.div(uLinearScale);
    const linearGradRaw = transformedUv.x.add(0.5);
    const circularGradRaw = transformedUv.length().div(uRadius.clamp(0.001, 10.0));

    const t = uGradientType.equal(0).select(circularGradRaw, linearGradRaw).toVar();

    // Wrap Mode
    const wrapMode = uLinearWrapMode;
    t.assign(wrapMode.equal(0).select(
        t,
        wrapMode.equal(1).select(
            t.fract(),
            t.mul(0.5).fract().mul(2.0).sub(1.0).abs()
        )
    ));

    // Clamp and apply Midpoint bias
    const mid = uGradientMidpoint;
    const p = float(0.5).log().div(mid.clamp(0.01, 0.99).log());
    t.assign(t.clamp(0.0, 1.0).pow(p));

    // Mathematical Gradient Calculation (Multi-Stop)
    const finalColor = vec3(0, 0, 0).toVar();
    const count = params.gradientColorCount;

    // Collect uniforms into JS arrays for easy loop unrolling
    const uColors = [];
    const uStops = [];
    for (let i = 0; i < 5; i++) {
        uColors.push(uniforms[`uColor${i}`]);
        uStops.push(uniforms[`uStop${i}`]);
    }

    // We blend stops directly - Three.js Color objects are already in linear space in TSL uniforms
    const linearColors = uColors.map(c => c.rgb);

    for (let i = 0; i < 4; i++) {
        // Only process segments up to count-1
        if (i < count - 1) {
            const colorA = linearColors[i];
            const colorB = linearColors[i + 1];
            const stopA = uStops[i];
            const stopB = uStops[i + 1];

            const isCurrentSegment = t.greaterThanEqual(stopA).and(t.lessThan(stopB));
            const localT = t.sub(stopA).div(stopB.sub(stopA).clamp(0.0001, 1.0));

            If(isCurrentSegment, () => {
                finalColor.assign(mix(colorA, colorB, localT));
            });
        }
    }

    // Handle edges
    If(t.lessThan(uStops[0]), () => {
        finalColor.assign(linearColors[0]);
    });
    If(t.greaterThanEqual(uStops[count - 1]), () => {
        finalColor.assign(linearColors[count - 1]);
    });

    // Convert back to sRGB
    const finalRGB = finalColor.toVar();

    // Apply IGN Dithering if enabled
    const { uGradientIGNDither, uGradientDitherStrength, uResolution, uDpr } = uniforms;
    If(uGradientIGNDither.greaterThan(0.5), () => {
        // Use uv() instead of uvNode (which might be distorted) to match screen-space dithering
        // Multiply by uDpr to ensure pixel-space resolution on high-DPI screens
        const pixelPos = uv().mul(uResolution.mul(uDpr));

        const noise = ign(pixelPos).sub(0.5);
        // 8-bit style dither amplitude
        finalRGB.addAssign(noise.mul(uGradientDitherStrength.div(255.0)));

        // Clamp to prevent values going out of [0, 1] range after dither
        finalRGB.assign(finalRGB.clamp(0.0, 1.0));
    });

    return finalRGB;
};

/**
 * Updates animation speeds based on perfect loop settings
 * Placeholder for future animated parameters.
 * Core animation logic for the gradient is handled in the main material based on uAnimationSpeed.
 */
GradientEffect.prototype.updateSpeeds = function (isPerfectLoop, duration, quantizeFn) {
    if (this.uniforms.uWarpSpeed) {
        let speed = this.params.gradientWarpSpeed !== undefined ? this.params.gradientWarpSpeed : 0.1;
        if (isPerfectLoop) {
            speed = quantizeFn(speed, duration);
        }
        this.uniforms.uWarpSpeed.value = speed;
    }
};
