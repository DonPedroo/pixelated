import { uniform, vec2, Fn, float, mix, step, vec3, uv, vec4, distance, smoothstep, If, clamp, floor, abs, color, atan, sin, pow } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { MaskEffect } from './masking.js';

/**
 * Rings Effect Module
 * Allows overlaying up to 5 procedural ring groups on the screen.
 */
export class RingsEffect {
    static id = 'RingsEffect';
    static type = 'standard';
    static order = 50;
    static getDefaults() {
        const ringDefaults = {
            enabled: false,
            x: 0.5,
            y: 0.5,
            count: 3,
            baseDiameter: 0.5,
            spacing: 0.05,
            thickness: 0.01,
            color: '#ffffff',
            opacity: 1.0,
            blendMode: 'mix',
            shadingEnabled: false,
            shadingIntensity: 0.5,
            shadingSharpness: 4.0,
            shadingAngle: 0.0,
            shadingAngleSpeed: 0.0,
            shadingColor: '#ffffff',
            ...MaskEffect.getDefaults('mask')
        };
        return {
            ringsEnabled: false,
            ringsSelected: 0,
            rings: [
                { ...ringDefaults, enabled: true },
                { ...ringDefaults },
                { ...ringDefaults },
                { ...ringDefaults },
                { ...ringDefaults }
            ]
        };
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
        this.maskEffects = [
            new MaskEffect(sketch, 'mask'),
            new MaskEffect(sketch, 'mask'),
            new MaskEffect(sketch, 'mask'),
            new MaskEffect(sketch, 'mask'),
            new MaskEffect(sketch, 'mask')
        ];
    }

    setupUniforms() {
        this.uniforms = {
            uEnabled: uniform(this.params.ringsEnabled ? 1 : 0),
            uResolution: this.sketch.uResolution,
            rings: this.params.rings.map((r, i) => {
                const defaults = RingsEffect.getDefaults().rings[i];
                const p = { ...defaults, ...r };
                return {
                    uPos: uniform(vec2(p.x, p.y)),
                    uCount: uniform(p.count),
                    uBaseDiameter: uniform(p.baseDiameter),
                    uSpacing: uniform(p.spacing),
                    uThickness: uniform(p.thickness),
                    uColor: uniform(color(p.color)),
                    uOpacity: uniform(p.opacity),
                    uShadingIntensity: uniform(p.shadingIntensity),
                    uShadingSharpness: uniform(p.shadingSharpness),
                    uShadingAngle: uniform(p.shadingAngle),
                    uShadingAngleSpeed: uniform(p.shadingAngleSpeed),
                    uShadingColor: uniform(color(p.shadingColor)),
                    maskUniforms: this.maskEffects[i].setupUniforms(p)
                };
            })
        };

        return this.uniforms;
    }

    buildNode(inputColorNode, uvNode) {
        if (!this.params.ringsEnabled) return inputColorNode;

        return Fn(() => {
            const finalColor = vec4(inputColorNode).toVar();
            const screenAspect = this.uniforms.uResolution.x.div(this.uniforms.uResolution.y);

            for (let i = 0; i < 5; i++) {
                const rParams = this.params.rings[i];
                if (!rParams.enabled) continue;

                const r = this.uniforms.rings[i];
                const maskEffect = this.maskEffects[i];

                // Aspect correct UV and Center
                const aspectCorrectedUv = vec2(uvNode).toVar();
                aspectCorrectedUv.x.assign(aspectCorrectedUv.x.mul(screenAspect));

                const correctedPos = vec2(r.uPos).toVar();
                correctedPos.x.assign(correctedPos.x.mul(screenAspect));

                const dist = distance(aspectCorrectedUv, correctedPos);
                const baseRadius = r.uBaseDiameter.div(2.0);

                const distFromBase = dist.sub(baseRadius);

                // Procedural ring math
                // ringIndex = floor(distFromBase / spacing + 0.5)
                const ringIndex = floor(distFromBase.div(r.uSpacing).add(0.5));

                // clamp index between 0 and count - 1
                const clampedIndex = clamp(ringIndex, 0.0, float(r.uCount).sub(1.0));

                const closestRingRadius = baseRadius.add(clampedIndex.mul(r.uSpacing));
                const distToRing = abs(dist.sub(closestRingRadius));

                const halfThickness = r.uThickness.div(2.0);
                // Add slight antialiasing based on resolution roughly, or just small constant
                const aa = float(1.5).div(this.uniforms.uResolution.y);

                const ringMask = float(1.0).sub(smoothstep(halfThickness, halfThickness.add(aa), distToRing));

                // Apply the ring's custom masking here
                let customMaskValue = float(1.0);
                if (rParams.maskMasked) {
                    customMaskValue = maskEffect.applyMasking(uvNode);
                }

                const finalAlpha = ringMask.mul(r.uOpacity).mul(customMaskValue);

                // Geometric Shading ("Vinyl/CD" reflection)
                const ringColorOutput = r.uColor.toVar();

                if (rParams.shadingEnabled) {
                    // Direction vector from center to fragment
                    const dir = aspectCorrectedUv.sub(correctedPos);

                    // Calculate angle (atan2)
                    const angle = atan(dir.y, dir.x);

                    // Apply angle offset and take the sine to create geometric bowtie reflection
                    // sin(angle * 2 + offset) creates 2 bright peaks across 360 degress -> symmetrical shine
                    const animatedAngle = r.uShadingAngle.add(this.sketch.uGlobalTime.mul(r.uShadingAngleSpeed));
                    const reflectionT = sin(angle.mul(2.0).add(animatedAngle));

                    // Map -1 to 1 sine wave to 0 to 1
                    const normalizedT = reflectionT.mul(0.5).add(0.5);

                    // Tighten the specular beam using a power curve (sharpness makes the beam thinner)
                    const specularPower = pow(normalizedT, r.uShadingSharpness);

                    // Multiply by intensity
                    const shine = specularPower.mul(r.uShadingIntensity);

                    // Add the specular highlight linearly (clamped) to the base color
                    ringColorOutput.assign(
                        clamp(ringColorOutput.add(r.uShadingColor.mul(shine)), 0.0, 1.0)
                    );
                }

                // Blend Modes logic similar to Circles/Noise
                const baseColor = finalColor.rgb;
                const c = ringColorOutput;

                let blendResult;
                if (rParams.blendMode === 'add') {
                    blendResult = baseColor.add(c);
                } else if (rParams.blendMode === 'screen') {
                    blendResult = vec3(1.0).sub(vec3(1.0).sub(baseColor).mul(vec3(1.0).sub(c)));
                } else if (rParams.blendMode === 'multiply') {
                    blendResult = baseColor.mul(c);
                } else if (rParams.blendMode === 'overlay') {
                    blendResult = mix(
                        baseColor.mul(c).mul(2.0),
                        vec3(1.0).sub(vec3(1.0).sub(baseColor).mul(vec3(1.0).sub(c)).mul(2.0)),
                        step(0.5, baseColor)
                    );
                } else {
                    blendResult = c;
                }

                const blendedCol = mix(
                    baseColor,
                    blendResult,
                    finalAlpha
                );

                finalColor.assign(vec4(blendedCol, finalColor.a));
            }

            return finalColor;
        })();
    }

    setupGUI(parentFolder) {
        const folder = parentFolder.addFolder('Rings Effect');
        const params = this.params;
        const uniforms = this.uniforms;

        folder.add(params, 'ringsEnabled').name('Enabled').onChange(v => {
            uniforms.uEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        folder.add(params, 'ringsSelected', { 'Ring Group 1': 0, 'Ring Group 2': 1, 'Ring Group 3': 2, 'Ring Group 4': 3, 'Ring Group 5': 4 }).name('Select Group').onChange(() => {
            this.refreshRingsGUI();
        }).listen();

        this.ringsGroupFolder = folder.addFolder('Group Settings');
        this.refreshRingsGUI();

        return folder;
    }

    refreshRingsGUI() {
        const folder = this.ringsGroupFolder;
        // Clear previous controllers and subfolders
        folder.folders.forEach(f => f.destroy());
        const controllers = [...folder.controllers];
        controllers.forEach(c => c.destroy());

        const index = this.params.ringsSelected;
        const p = this.params.rings[index];
        const u = this.uniforms.rings[index];
        const maskEffect = this.maskEffects[index];

        folder.add(p, 'enabled').name('Enabled').onChange(v => {
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        folder.add(p, 'x', 0, 1).name('Pos X').onChange(v => u.uPos.value.x = v).listen();
        folder.add(p, 'y', 0, 1).name('Pos Y').onChange(v => u.uPos.value.y = v).listen();

        folder.add(p, 'count', 1, 60, 1).name('Rings Count').onChange(v => u.uCount.value = v).listen();
        folder.add(p, 'baseDiameter', 0.01, 2).name('Base Diameter').onChange(v => u.uBaseDiameter.value = v).listen();
        folder.add(p, 'spacing', 0.001, 0.5).name('Spacing').onChange(v => u.uSpacing.value = v).listen();
        folder.add(p, 'thickness', 0.0001, 0.1, 0.0001).name('Thickness').onChange(v => u.uThickness.value = v).listen();

        // Add color swatch grid if BRAND_COLORS is supported, but simple color works
        folder.addColor(p, 'color').name('Color').onChange(v => u.uColor.value.set(v)).listen();
        folder.add(p, 'opacity', 0, 1).name('Opacity').onChange(v => u.uOpacity.value = v).listen();

        const blendModes = ['mix', 'add', 'screen', 'multiply', 'overlay'];
        folder.add(p, 'blendMode', blendModes).name('Blend Mode').onChange(v => {
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        if (p.shadingEnabled === undefined) p.shadingEnabled = false;
        if (p.shadingIntensity === undefined) p.shadingIntensity = 0.5;
        if (p.shadingSharpness === undefined) p.shadingSharpness = 4.0;
        if (p.shadingAngle === undefined) p.shadingAngle = 0.0;
        if (p.shadingAngleSpeed === undefined) p.shadingAngleSpeed = 0.0;
        if (p.shadingColor === undefined) p.shadingColor = '#ffffff';

        folder.add(p, 'shadingEnabled').name('CD Shading').onChange(v => {
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();
        folder.addColor(p, 'shadingColor').name('Shine Color').onChange(v => u.uShadingColor.value.set(v)).listen();
        folder.add(p, 'shadingIntensity', 0, 2).name('Shine Intensity').onChange(v => u.uShadingIntensity.value = v).listen();
        folder.add(p, 'shadingSharpness', 0.5, 20).name('Shine Sharpness').onChange(v => u.uShadingSharpness.value = v).listen();
        folder.add(p, 'shadingAngle', -Math.PI, Math.PI).name('Shine Angle').onChange(v => u.uShadingAngle.value = v).listen();
        folder.add(p, 'shadingAngleSpeed', -10, 10).name('Shine Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        maskEffect.setupGUI(folder, p);
    }

    updateUniforms(params) {
        this.uniforms.uEnabled.value = params.ringsEnabled ? 1 : 0;
        params.rings.forEach((r, i) => {
            const defaults = RingsEffect.getDefaults().rings[i];
            const p = { ...defaults, ...r };
            const u = this.uniforms.rings[i];
            u.uPos.value.set(p.x, p.y);
            u.uCount.value = p.count;
            u.uBaseDiameter.value = p.baseDiameter;
            u.uSpacing.value = p.spacing;
            u.uThickness.value = p.thickness;
            u.uColor.value.set(p.color);
            u.uOpacity.value = p.opacity;
            u.uShadingColor.value.set(p.shadingColor);
            u.uShadingIntensity.value = p.shadingIntensity;
            u.uShadingSharpness.value = p.shadingSharpness;
            u.uShadingAngle.value = p.shadingAngle;
            u.uShadingAngleSpeed.value = p.shadingAngleSpeed;
            this.maskEffects[i].updateUniforms(p);
        });
    }

    updateSpeeds(isPerfectLoop, duration, quantizeFn) {
        const p = this.params;
        const u = this.uniforms;

        p.rings.forEach((ringParam, i) => {
            const ringUniform = u.rings[i];
            if (ringUniform.uShadingAngleSpeed) {
                ringUniform.uShadingAngleSpeed.value = isPerfectLoop
                    ? quantizeFn(ringParam.shadingAngleSpeed || 0, duration)
                    : (ringParam.shadingAngleSpeed || 0);
            }
        });
    }
}
