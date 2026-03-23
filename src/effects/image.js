import { uniform, vec2, Fn, float, mix, step, vec3, texture, uv, vec4 } from 'three/tsl';
import * as THREE from 'three/webgpu';

/**
 * Blending functions in TSL
 */
export const blendOverlayTSL = Fn(([base, blend]) => {
    return mix(
        base.mul(blend).mul(2.0),
        vec3(1.0).sub(vec3(1.0).sub(base).mul(vec3(1.0).sub(blend)).mul(2.0)),
        step(0.5, base)
    );
});

/**
 * Core image processing logic (Scale, Aspect, Exposure, Gamma, Blend)
 * Can be reused by other effects like Circles.
 */
export const applyImageOverlayTSL = Fn(([inputColor, vUv, uTexture, uConfig]) => {
    const {
        uOpacity,
        uScale,
        uCover,
        uExposure,
        uGamma,
        uBlendMode,
        uAspect,
        uResolution,
        uInvert
    } = uConfig;

    const screenAspect = uResolution.x.div(uResolution.y);

    // UV manipulation for scaling and cover mode
    const imageUv = vUv.toVar();

    // Center the UVs before scaling
    imageUv.assign(imageUv.sub(0.5));

    const isWider = screenAspect.greaterThan(uAspect);

    // Logic for "Cover":
    const coverScale = isWider.select(
        vec2(1.0, screenAspect.div(uAspect)), // Wider screen: scale Y up
        vec2(uAspect.div(screenAspect), 1.0)  // Taller screen: scale X up
    );

    const finalScale = uCover.equal(1).select(coverScale, vec2(1.0));
    imageUv.assign(imageUv.div(finalScale));

    // Apply manual scale
    imageUv.assign(imageUv.div(uScale));

    const sampledUv = imageUv.add(0.5);
    const imgColor = uTexture.sample(sampledUv).toVar();

    // Invert
    imgColor.rgb.assign(uInvert.equal(1).select(vec3(1.0).sub(imgColor.rgb), imgColor.rgb));

    // Exposure & Gamma
    imgColor.rgb.assign(imgColor.rgb.mul(uExposure.exp2()));
    imgColor.rgb.assign(imgColor.rgb.pow(float(1.0).div(uGamma)));

    // Blending Logic
    const blendResult = vec3(0.0).toVar();
    const base = inputColor.rgb;
    const blend = imgColor.rgb;

    const isMix = uBlendMode.equal(0);
    const isAdd = uBlendMode.equal(1);
    const isScreen = uBlendMode.equal(2);
    const isMultiply = uBlendMode.equal(3);
    const isOverlay = uBlendMode.equal(4);

    blendResult.assign(
        isMix.select(blend,
            isAdd.select(base.add(blend),
                isScreen.select(vec3(1.0).sub(vec3(1.0).sub(base).mul(vec3(1.0).sub(blend))),
                    isMultiply.select(base.mul(blend),
                        isOverlay.select(blendOverlayTSL(base, blend),
                            blend)))))
    );

    const finalRgb = mix(base, blendResult, uOpacity.mul(imgColor.a));
    return vec4(finalRgb, inputColor.a);
});

/**
 * Image Effect Module
 * Allows overlaying an image from the textures folder with various blending modes and scaling options.
 */
export class ImageEffect {
    static id = 'ImageEffect';
    static type = 'post';
    static order = 10;
    static getDefaults() {
        return {
            imageEnabled: false,
            imageFilename: 'Grain – Light 1.png',
            imageInvert: false,
            imageOpacity: 1.0,
            imageScale: 1.0,
            imageCover: true,
            imageExposure: 0.0,
            imageGamma: 1.0,
            imageBlendMode: 'mix'
        };
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
        this.activeTexture = null;
    }

    /**
     * Initializes uniforms required for the image effect
     */
    setupUniforms() {
        // Initial valid texture to avoid TSL errors during the first frame (before preloading finishes)
        const dummyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
        dummyTex.wrapS = THREE.RepeatWrapping;
        dummyTex.wrapT = THREE.RepeatWrapping;
        dummyTex.needsUpdate = true;

        Object.assign(this.uniforms, {
            uImageEnabled: uniform(this.params.imageEnabled ? 1 : 0),
            uImageTexture: texture(dummyTex),
            uImageInvert: uniform(this.params.imageInvert ? 1 : 0),
            uImageOpacity: uniform(this.params.imageOpacity),
            uImageScale: uniform(this.params.imageScale),
            uImageCover: uniform(this.params.imageCover ? 1 : 0),
            uImageExposure: uniform(this.params.imageExposure),
            uImageGamma: uniform(this.params.imageGamma),
            uImageBlendMode: uniform(['mix', 'add', 'screen', 'multiply', 'overlay'].indexOf(this.params.imageBlendMode)),
            uImageAspect: uniform(1.0),
            uResolution: this.sketch.uResolution
        });

        // Lazy load initial texture
        if (this.params.imageFilename) {
            this.sketch.loadTexture(this.params.imageFilename).then(tex => {
                if (tex) {
                    this.uniforms.uImageTexture.value = tex;
                    this.updateAspectUniforms();
                }
            });
        }

        return this.uniforms;
    }

    updateAspectUniforms() {
        if (this.uniforms.uImageTexture.value && this.uniforms.uImageTexture.value.image) {
            const img = this.uniforms.uImageTexture.value.image;
            this.uniforms.uImageAspect.value = img.width / img.height;
        }
    }

    /**
     * TSL function to apply the image overlay
     */
    buildNode(inputColor, vUv) {
        if (!this.params.imageEnabled) return inputColor;
        return this._buildNodeTSL(inputColor, vUv);
    }

    _buildNodeTSL = Fn(([inputColor, vUv]) => {
        const {
            uImageEnabled,
            uImageTexture,
            uImageInvert,
            uImageOpacity,
            uImageScale,
            uImageCover,
            uImageExposure,
            uImageGamma,
            uImageBlendMode,
            uImageAspect,
            uResolution
        } = this.uniforms;

        const config = {
            uInvert: uImageInvert,
            uOpacity: uImageOpacity,
            uScale: uImageScale,
            uCover: uImageCover,
            uExposure: uImageExposure,
            uGamma: uImageGamma,
            uBlendMode: uImageBlendMode,
            uAspect: uImageAspect,
            uResolution: uResolution
        };

        const result = applyImageOverlayTSL(inputColor, vUv, uImageTexture, config);

        return uImageEnabled.equal(1).select(result, inputColor);
    });

    /**
     * Injects GUI controls
     */
    setupGUI(parentFolder) {
        const folder = parentFolder.addFolder('Image Overlay');
        const params = this.params;
        const uniforms = this.uniforms;

        folder.add(params, 'imageEnabled').name('Enabled').onChange(v => {
            uniforms.uImageEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        // If textures haven't finished loading yet, we'll need to update this dropdown later or just use the filenames from import.meta.glob
        const filenames = Object.keys(this.sketch.imageFiles).map(path => path.split('/').pop());

        folder.add(params, 'imageFilename', filenames).name('Image').onChange(async v => {
            const tex = await this.sketch.loadTexture(v);
            if (tex) {
                uniforms.uImageTexture.value = tex;
                this.updateAspectUniforms();
            }
        }).listen();

        if (params.imageInvert === undefined) params.imageInvert = false;
        folder.add(params, 'imageInvert').name('Invert').onChange(v => {
            uniforms.uImageInvert.value = v ? 1 : 0;
        }).listen();

        folder.add(params, 'imageOpacity', 0, 1).name('Opacity').onChange(v => {
            uniforms.uImageOpacity.value = v;
        }).listen();

        folder.add(params, 'imageScale', 0.1, 5).name('Scale').onChange(v => {
            uniforms.uImageScale.value = v;
        }).listen();

        folder.add(params, 'imageCover').name('Cover Screen').onChange(v => {
            uniforms.uImageCover.value = v ? 1 : 0;
        }).listen();

        folder.add(params, 'imageExposure', -2, 2).name('Exposure').onChange(v => {
            uniforms.uImageExposure.value = v;
        }).listen();

        folder.add(params, 'imageGamma', 0.1, 3).name('Gamma').onChange(v => {
            uniforms.uImageGamma.value = v;
        }).listen();

        const blendModes = ['mix', 'add', 'screen', 'multiply', 'overlay'];
        folder.add(params, 'imageBlendMode', blendModes).name('Blend Mode').onChange(v => {
            uniforms.uImageBlendMode.value = blendModes.indexOf(v);
        }).listen();

        return folder;
    }

    updateUniforms(params) {
        const uniforms = this.uniforms;
        uniforms.uImageEnabled.value = params.imageEnabled ? 1 : 0;
        uniforms.uImageInvert.value = params.imageInvert ? 1 : 0;
        uniforms.uImageOpacity.value = params.imageOpacity;
        uniforms.uImageScale.value = params.imageScale;
        uniforms.uImageCover.value = params.imageCover ? 1 : 0;
        uniforms.uImageExposure.value = params.imageExposure;
        uniforms.uImageGamma.value = params.imageGamma;
        const blendModes = ['mix', 'add', 'screen', 'multiply', 'overlay'];
        uniforms.uImageBlendMode.value = blendModes.indexOf(params.imageBlendMode);

        if (params.imageFilename) {
            this.sketch.loadTexture(params.imageFilename).then(tex => {
                if (tex) {
                    uniforms.uImageTexture.value = tex;
                    this.updateAspectUniforms();
                }
            });
        }
    }

    /**
     * Updates animation speeds based on perfect loop settings
     * Placeholder for future animated parameters
     */
    updateSpeeds(isPerfectLoop, duration, quantizeFn) {
        // No animated parameters in ImageEffect currently
    }
}
