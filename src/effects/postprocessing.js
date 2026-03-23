import { uniform, vec4, vec3, Fn, vec2, float, fract, dot, cos, sin, cross, mix, step, abs, clamp, int, Loop, If, color } from 'three/tsl';

export class PostProcessingEffect {
    static id = 'PostProcessingEffect';
    static type = 'post';
    static order = 20;
    static getDefaults() {
        return {
            colorCorrectionEnabled: true,
            noiseEnabled: false,
            distortionChromaEnabled: false,
            noiseIntensity: 0.1,
            noiseScale: 1.0,
            noiseBlendingMode: 'overlay',
            hue: 0,
            saturation: 1,
            exposure: 0,
            gamma: 1,
            vibrance: 0,
            lift: '#000000',
            gammaColor: '#ffffff',
            gain: '#ffffff',
            distortion: 0,
            chromaAmount: 0,
            chromaIterations: 8,
            ditherEnabled: true,
            ditherStrength: 1.0
        };
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
    }

    setupUniforms() {
        this.uniforms = {
            uColorCorrectionEnabled: uniform(this.params.colorCorrectionEnabled ? 1 : 0),
            uNoiseEnabled: uniform(this.params.noiseEnabled ? 1 : 0),
            uDistortionChromaEnabled: uniform(this.params.distortionChromaEnabled ? 1 : 0),
            uNoiseIntensity: uniform(this.params.noiseIntensity),
            uNoiseScale: uniform(this.params.noiseScale),
            uNoiseBlendingMode: uniform(['add', 'screen', 'multiply', 'overlay'].indexOf(this.params.noiseBlendingMode)),
            uHue: uniform(this.params.hue),
            uSaturation: uniform(this.params.saturation),
            uExposure: uniform(this.params.exposure),
            uGamma: uniform(this.params.gamma),
            uVibrance: uniform(this.params.vibrance),
            uLift: uniform(color(this.params.lift)),
            uGammaColor: uniform(color(this.params.gammaColor)),
            uGain: uniform(color(this.params.gain)),
            uDistortion: uniform(this.params.distortion),
            uChromaAmount: uniform(this.params.chromaAmount),
            uChromaIterations: uniform(int(this.params.chromaIterations)),
            uDitherEnabled: uniform(this.params.ditherEnabled ? 1 : 0),
            uDitherStrength: uniform(this.params.ditherStrength),
            uTime: uniform(0)
        };
        return this.uniforms;
    }

    // TSL Math Helpers
    random = Fn(([p]) => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453)));

    hueShift = Fn(([col, hue]) => {
        const k = vec3(0.57735);
        const cosAngle = cos(hue);
        const sinAngle = sin(hue);
        return col.mul(cosAngle)
            .add(cross(k, col)
                .mul(sinAngle))
            .add(k.mul(dot(k, col)).mul(float(1.0).sub(cosAngle)));
    });

    spectrum_offset = Fn(([t]) => {
        const linterp = (t) => clamp(float(1.0).sub(abs(float(2.0).mul(t).sub(1.0))), 0.0, 1.0);
        const remap = (t, a, b) => clamp(t.sub(a).div(float(b).sub(a)), 0.0, 1.0);
        const lo = step(t, 0.5);
        const hi = float(1.0).sub(lo);
        const w = linterp(remap(t, 1.0 / 6.0, 5.0 / 6.0));
        return vec4(lo, 1.0, hi, 1.0).mul(vec4(float(1.0).sub(w), w, float(1.0).sub(w), 1.0)).pow(1.0 / 2.2);
    });

    barrelDistortion = Fn(([uvCoord, intensity]) => {
        const p = uvCoord.sub(0.5);
        const r2 = dot(p, p);
        return p.mul(float(1.0).add(intensity.mul(r2))).add(0.5);
    });

    applyVibrance = Fn(([col, vibrance]) => {
        const average = col.r.add(col.g).add(col.b).div(3.0);
        const mx = col.r.max(col.g).max(col.b);
        const amt = mx.sub(average).mul(vibrance).mul(-3.0);
        return mix(col, vec3(mx), amt);
    });

    buildSamplingNode(inputColorNode, uvNode, uvTransform = null) {
        const { uChromaAmount, uChromaIterations, uDistortion } = this.uniforms;
        const applyTransform = (uv) => uvTransform ? uvTransform(uv) : uv;

        return Fn(() => {
            const vUv = uvNode;
            const sumcol = vec4(0.0).toVar();
            const sumw = vec4(0.0).toVar();
            const doChroma = uChromaAmount.notEqual(0.0).and(uChromaIterations.greaterThan(1));

            If(doChroma, () => {
                Loop({ start: int(0), end: uChromaIterations }, ({ i }) => {
                    const t = float(i).div(float(uChromaIterations).sub(1.0));
                    const w = this.spectrum_offset(t);
                    sumw.addAssign(w);
                    const currentDistortion = uDistortion.add(uChromaAmount.mul(t));
                    const dUv = this.barrelDistortion(vUv, currentDistortion);
                    const finalUv = applyTransform(dUv);
                    sumcol.addAssign(w.mul(inputColorNode.sample(finalUv)));
                });
            }).Else(() => {
                const dUv = this.barrelDistortion(vUv, uDistortion);
                const finalUv = applyTransform(dUv);
                sumcol.assign(inputColorNode.sample(finalUv));
                sumw.assign(vec4(1.0));
            });

            return sumcol.div(sumw);
        })();
    }

    buildColorCorrectionNode(inputColorNode) {
        const {
            uHue, uSaturation, uExposure, uGamma, uVibrance,
            uLift, uGammaColor, uGain
        } = this.uniforms;

        return Fn(() => {
            const color = vec4(inputColorNode).toVar();
            const rgb = color.rgb.toVar();

            rgb.assign(rgb.mul(uExposure.exp2()));
            rgb.assign(rgb.pow(float(1.0).div(uGamma)));

            // Lift / GammaColor / Gain
            rgb.assign(rgb.mul(uGain).add(uLift).max(0.0));
            rgb.assign(rgb.pow(vec3(1.0).div(uGammaColor.rgb)));

            // Hue & Vibrance
            rgb.assign(this.hueShift(rgb, uHue));
            rgb.assign(this.applyVibrance(rgb, uVibrance));

            // Saturation
            const luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
            rgb.assign(mix(vec3(luma), rgb, uSaturation));

            return vec4(rgb, color.a);
        })();
    }

    buildNoiseNode(inputColorNode, uvNode) {
        const {
            uDistortionChromaEnabled, uDistortion,
            uNoiseIntensity, uNoiseScale, uNoiseBlendingMode, uTime
        } = this.uniforms;

        return Fn(() => {
            const vUv = uvNode;
            const color = vec4(inputColorNode).toVar();
            const noiseRGB = color.rgb.toVar();

            const noiseDistUV = vec2(vUv).toVar();
            If(uDistortionChromaEnabled.equal(1), () => {
                noiseDistUV.assign(this.barrelDistortion(vUv, uDistortion));
            });

            const noiseCoords = noiseDistUV.mul(uNoiseScale);
            const timeOffset = this.random(vec2(uTime, uTime.mul(0.123)));
            const noiseValue = this.random(noiseCoords.add(timeOffset));
            const noiseCentered = noiseValue.sub(0.5).mul(uNoiseIntensity);

            const isAdd = uNoiseBlendingMode.equal(0);
            const isScreen = uNoiseBlendingMode.equal(1);
            const isMultiply = uNoiseBlendingMode.equal(2);
            const isOverlay = uNoiseBlendingMode.equal(3);

            If(isAdd, () => {
                noiseRGB.assign(noiseRGB.add(vec3(noiseCentered)));
            }).ElseIf(isScreen, () => {
                noiseRGB.assign(vec3(1.0).sub(vec3(1.0).sub(noiseRGB).mul(vec3(1.0).sub(noiseValue.mul(uNoiseIntensity)))));
            }).ElseIf(isMultiply, () => {
                noiseRGB.assign(noiseRGB.mul(noiseValue.mul(uNoiseIntensity).add(float(1.0).sub(uNoiseIntensity))));
            }).ElseIf(isOverlay, () => {
                const noiseFactor = noiseValue.mul(uNoiseIntensity).add(float(0.5).mul(float(1.0).sub(uNoiseIntensity)));
                const overlayRes = mix(
                    noiseRGB.mul(noiseFactor).mul(2.0),
                    vec3(1.0).sub(vec3(1.0).sub(noiseRGB).mul(vec3(1.0).sub(noiseFactor)).mul(2.0)),
                    step(0.5, noiseRGB)
                );
                noiseRGB.assign(overlayRes);
            });

            return vec4(noiseRGB, color.a);
        })();
    }

    buildDitherNode(inputColorNode, uvNode) {
        const { uTime, uDitherEnabled, uDitherStrength } = this.uniforms;
        return Fn(() => {
            const color = vec4(inputColorNode).toVar();

            If(uDitherEnabled.equal(1), () => {
                const ditherNoise = this.random(uvNode.add(fract(uTime)));
                const ditheredRes = color.rgb.add(ditherNoise.sub(0.5).mul(2.0 / 255.0).mul(uDitherStrength));
                color.rgb.assign(ditheredRes);
            });

            return color;
        })();
    }

    setupGUI(parentFolder) {
        const ccFolder = parentFolder.addFolder('Color Correction');
        ccFolder.add(this.params, 'colorCorrectionEnabled').name('Enabled').onChange(v => {
            this.uniforms.uColorCorrectionEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();
        ccFolder.add(this.params, 'exposure', -2, 2).name('Exposure').onChange(v => this.uniforms.uExposure.value = v).listen();
        ccFolder.add(this.params, 'gamma', 0.1, 3).name('Gamma').onChange(v => this.uniforms.uGamma.value = v).listen();
        ccFolder.add(this.params, 'vibrance', -1, 1).name('Vibrance').onChange(v => this.uniforms.uVibrance.value = v).listen();

        const cdlFolder = ccFolder.addFolder('Lift / Gamma / Gain');
        cdlFolder.addColor(this.params, 'lift').name('Lift (Shadows)').onChange(v => this.uniforms.uLift.value.set(v)).listen();
        cdlFolder.addColor(this.params, 'gammaColor').name('Gamma (Midtones)').onChange(v => this.uniforms.uGammaColor.value.set(v)).listen();
        cdlFolder.addColor(this.params, 'gain').name('Gain (Highlights)').onChange(v => this.uniforms.uGain.value.set(v)).listen();

        const hslFolder = ccFolder.addFolder('Hue & Saturation');
        hslFolder.add(this.params, 'hue', -Math.PI, Math.PI).name('Hue').onChange(v => this.uniforms.uHue.value = v).listen();
        hslFolder.add(this.params, 'saturation', 0, 4).name('Saturation').onChange(v => this.uniforms.uSaturation.value = v).listen();

        const distFolder = parentFolder.addFolder('Distortion & Chroma');
        distFolder.add(this.params, 'distortionChromaEnabled').name('Enabled').onChange(v => {
            this.uniforms.uDistortionChromaEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();
        distFolder.add(this.params, 'distortion', -2, 2).name('Distortion').onChange(v => this.uniforms.uDistortion.value = v).listen();
        distFolder.add(this.params, 'chromaAmount', -2, 2).name('Chroma Amount').onChange(v => this.uniforms.uChromaAmount.value = v).listen();
        distFolder.add(this.params, 'chromaIterations', 1, 16, 1).name('Chroma Iterations').onChange(v => this.uniforms.uChromaIterations.value = v).listen();

        const noiseFolder = parentFolder.addFolder('Noise');
        noiseFolder.add(this.params, 'noiseEnabled').name('Enabled').onChange(v => {
            this.uniforms.uNoiseEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();
        const noiseBlendModes = ['add', 'screen', 'multiply', 'overlay'];
        noiseFolder.add(this.params, 'noiseIntensity', 0, 1).name('Intensity').onChange(v => this.uniforms.uNoiseIntensity.value = v).listen();
        noiseFolder.add(this.params, 'noiseScale', 0, 10).name('Scale').onChange(v => this.uniforms.uNoiseScale.value = v).listen();
        noiseFolder.add(this.params, 'noiseBlendingMode', noiseBlendModes).name('Blend Mode').onChange(v => {
            this.uniforms.uNoiseBlendingMode.value = noiseBlendModes.indexOf(v);
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        const ditherFolder = parentFolder.addFolder('Dither');
        ditherFolder.add(this.params, 'ditherEnabled').name('Enabled').onChange(v => {
            this.uniforms.uDitherEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();
        ditherFolder.add(this.params, 'ditherStrength', 0, 5).name('Strength').onChange(v => this.uniforms.uDitherStrength.value = v).listen();

        return ccFolder;
    }

    updateUniforms(params) {
        if (this.uniforms.uColorCorrectionEnabled) this.uniforms.uColorCorrectionEnabled.value = params.colorCorrectionEnabled ? 1 : 0;
        if (this.uniforms.uNoiseEnabled) this.uniforms.uNoiseEnabled.value = params.noiseEnabled ? 1 : 0;
        if (this.uniforms.uDistortionChromaEnabled) this.uniforms.uDistortionChromaEnabled.value = params.distortionChromaEnabled ? 1 : 0;

        if (this.uniforms.uNoiseIntensity) this.uniforms.uNoiseIntensity.value = params.noiseIntensity;
        if (this.uniforms.uNoiseScale) this.uniforms.uNoiseScale.value = params.noiseScale;
        const noiseBlendModes = ['add', 'screen', 'multiply', 'overlay'];
        if (this.uniforms.uNoiseBlendingMode) this.uniforms.uNoiseBlendingMode.value = noiseBlendModes.indexOf(params.noiseBlendingMode);

        if (this.uniforms.uHue) this.uniforms.uHue.value = params.hue;
        if (this.uniforms.uSaturation) this.uniforms.uSaturation.value = params.saturation;
        if (this.uniforms.uExposure) this.uniforms.uExposure.value = params.exposure;
        if (this.uniforms.uGamma) this.uniforms.uGamma.value = params.gamma;
        if (this.uniforms.uVibrance) this.uniforms.uVibrance.value = params.vibrance;
        if (this.uniforms.uLift) this.uniforms.uLift.value.set(params.lift);
        if (this.uniforms.uGammaColor) this.uniforms.uGammaColor.value.set(params.gammaColor);
        if (this.uniforms.uGain) this.uniforms.uGain.value.set(params.gain);

        if (this.uniforms.uDistortion) this.uniforms.uDistortion.value = params.distortion;
        if (this.uniforms.uChromaAmount) this.uniforms.uChromaAmount.value = params.chromaAmount;
        if (this.uniforms.uChromaIterations) this.uniforms.uChromaIterations.value = params.chromaIterations;

        if (this.uniforms.uDitherEnabled) this.uniforms.uDitherEnabled.value = params.ditherEnabled ? 1 : 0;
        if (this.uniforms.uDitherStrength) this.uniforms.uDitherStrength.value = params.ditherStrength;
    }
}
