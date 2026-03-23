import { uniform, vec2, Fn, float, fract, sin, dot, mix, step, abs, length, clamp, int, min, max, If } from 'three/tsl';
import { MaskEffect } from './masking.js';

/**
 * Pixelate Effect Module
 * Provides reusable logic for pixelation with TSL integration and Lil-GUI support.
 */
export class PixelateEffect {
    static id = 'PixelateEffect';
    static type = 'modifier';
    static order = 10;

    static getDefaults() {
        return {
            pixelateEnabled: false,
            pixelateHorizontalEnabled: true,
            pixelateVerticalEnabled: false,
            pixelateGrid: 10,
            pixelateRowAnimMode: 'Oscillate',
            pixelateRowOffset: 0,
            pixelateRowOffsetWave: 0,
            pixelateRowOffsetFreq: 0,
            pixelateRowOffsetSpeed: 0,
            pixelateWidthWaveAmp: 0,
            pixelateWidthWaveFreq: 0,
            pixelateWidthWaveSpeed: 0,
            pixelateHeightWaveAmp: 0,
            pixelateHeightWaveFreq: 0,
            pixelateHeightWaveSpeed: 0,
            pixelateColAnimMode: 'Oscillate',
            pixelateColOffset: 0,
            pixelateColOffsetWave: 0,
            pixelateColOffsetFreq: 0,
            pixelateColOffsetSpeed: 0,
            pixelateWidthWaveXAmp: 0,
            pixelateWidthWaveXFreq: 0,
            pixelateWidthWaveXSpeed: 0,
            pixelateHeightWaveYAmp: 0,
            pixelateHeightWaveYFreq: 0,
            pixelateHeightWaveYSpeed: 0,
            pixelateMaskStripePosition: 0.5,
            pixelateMaskStripeSpread: 0.2,
            pixelateMaskStripeOffset: 0.0,
            pixelateMaskStripeWidth: 0.5,
            pixelateMaskStripeSeed: 0.123,
            pixelateClusteringEnabled: false,
            pixelateClusteringInvert: false,
            pixelateVertClusteringEnabled: false,
            pixelateVertMaskStripePosition: 0.5,
            pixelateVertMaskStripeSpread: 0.2,
            pixelateVertMaskStripeOffset: 0.0,
            pixelateVertMaskStripeWidth: 0.5,
            pixelateVertMaskStripeSeed: 0.123,
            pixelateVertClusteringInvert: false,
            pixelateRowRandomAmp: 0,
            pixelateRowRandomFreq: 0,
            pixelateColRandomAmp: 0,
            pixelateColRandomFreq: 0,
            ...MaskEffect.getDefaults('pixelate')
        };
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
        this.maskEffect = new MaskEffect(sketch, 'pixelate');
    }

    /**
     * Initializes uniforms required for the pixelate effect
     */
    setupUniforms() {
        Object.assign(this.uniforms, {
            uPixelateEnabled: uniform(this.params.pixelateEnabled ? 1 : 0),
            uPixelateHorizontalEnabled: uniform(this.params.pixelateHorizontalEnabled ? 1 : 0),
            uPixelateVerticalEnabled: uniform(this.params.pixelateVerticalEnabled ? 1 : 0),
            uPixelateGrid: uniform(this.params.pixelateGrid),
            uPixelateRowAnimMode: uniform(this.params.pixelateRowAnimMode === 'Left to Right' ? 1 : this.params.pixelateRowAnimMode === 'Right to Left' ? -1 : 0),
            uPixelateRowOffset: uniform(this.params.pixelateRowOffset),
            uPixelateRowOffsetWave: uniform(this.params.pixelateRowOffsetWave),
            uPixelateRowOffsetFreq: uniform(this.params.pixelateRowOffsetFreq),
            uPixelateRowOffsetSpeed: uniform(this.params.pixelateRowOffsetSpeed),
            uPixelateWidthWaveAmp: uniform(this.params.pixelateWidthWaveAmp),
            uPixelateWidthWaveFreq: uniform(this.params.pixelateWidthWaveFreq),
            uPixelateWidthWaveSpeed: uniform(this.params.pixelateWidthWaveSpeed),
            uPixelateHeightWaveAmp: uniform(this.params.pixelateHeightWaveAmp),
            uPixelateHeightWaveFreq: uniform(this.params.pixelateHeightWaveFreq),
            uPixelateHeightWaveSpeed: uniform(this.params.pixelateHeightWaveSpeed),
            uPixelateColAnimMode: uniform(this.params.pixelateColAnimMode === 'Top to Bottom' ? 1 : this.params.pixelateColAnimMode === 'Bottom to Top' ? -1 : 0),
            uPixelateColOffset: uniform(this.params.pixelateColOffset),
            uPixelateColOffsetWave: uniform(this.params.pixelateColOffsetWave),
            uPixelateColOffsetFreq: uniform(this.params.pixelateColOffsetFreq),
            uPixelateColOffsetSpeed: uniform(this.params.pixelateColOffsetSpeed),
            uPixelateWidthWaveXAmp: uniform(this.params.pixelateWidthWaveXAmp),
            uPixelateWidthWaveXFreq: uniform(this.params.pixelateWidthWaveXFreq),
            uPixelateWidthWaveXSpeed: uniform(this.params.pixelateWidthWaveXSpeed),
            uPixelateHeightWaveYAmp: uniform(this.params.pixelateHeightWaveYAmp),
            uPixelateHeightWaveYFreq: uniform(this.params.pixelateHeightWaveYFreq),
            uPixelateHeightWaveYSpeed: uniform(this.params.pixelateHeightWaveYSpeed),
            uPixelateMaskStripePosition: uniform(this.params.pixelateMaskStripePosition),
            uPixelateMaskStripeSpread: uniform(this.params.pixelateMaskStripeSpread),
            uPixelateMaskStripeOffset: uniform(this.params.pixelateMaskStripeOffset),
            uPixelateMaskStripeWidth: uniform(this.params.pixelateMaskStripeWidth),
            uPixelateMaskStripeSeed: uniform(this.params.pixelateMaskStripeSeed),
            uPixelateClusteringEnabled: uniform(this.params.pixelateClusteringEnabled ? 1 : 0),
            uPixelateClusteringInvert: uniform(this.params.pixelateClusteringInvert ? 1 : 0),
            uPixelateVertClusteringEnabled: uniform(this.params.pixelateVertClusteringEnabled ? 1 : 0),
            uPixelateVertMaskStripePosition: uniform(this.params.pixelateVertMaskStripePosition),
            uPixelateVertMaskStripeSpread: uniform(this.params.pixelateVertMaskStripeSpread),
            uPixelateVertMaskStripeOffset: uniform(this.params.pixelateVertMaskStripeOffset),
            uPixelateVertMaskStripeWidth: uniform(this.params.pixelateVertMaskStripeWidth),
            uPixelateVertMaskStripeSeed: uniform(this.params.pixelateVertMaskStripeSeed),
            uPixelateVertClusteringInvert: uniform(this.params.pixelateVertClusteringInvert ? 1 : 0),
            uPixelateRowRandomAmp: uniform(this.params.pixelateRowRandomAmp),
            uPixelateRowRandomFreq: uniform(this.params.pixelateRowRandomFreq),
            uPixelateColRandomAmp: uniform(this.params.pixelateColRandomAmp),
            uPixelateColRandomFreq: uniform(this.params.pixelateColRandomFreq),
            uTime: uniform(0)
        });
        Object.assign(this.uniforms, this.maskEffect.setupUniforms(this.params));
        return this.uniforms;
    }

    /**
     * TSL Math Helpers
     */
    random = Fn(([p]) => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453)));

    smoothstepTSL = Fn(([edge0, edge1, x]) => {
        const t = clamp(x.sub(edge0).div(edge1.sub(edge0)), 0.0, 1.0);
        return t.mul(t).mul(float(3.0).sub(float(2.0).mul(t)));
    });

    applyHorizontalAxis = Fn(([dUv, grid]) => {
        const {
            uPixelateRowAnimMode, uPixelateRowOffset, uPixelateRowOffsetWave,
            uPixelateRowOffsetFreq, uPixelateRowOffsetSpeed, uPixelateWidthWaveAmp,
            uPixelateWidthWaveFreq, uPixelateWidthWaveSpeed, uPixelateWidthWaveXAmp,
            uPixelateWidthWaveXFreq, uPixelateWidthWaveXSpeed, uPixelateRowRandomAmp,
            uPixelateRowRandomFreq, uTime
        } = this.uniforms;

        const distortedUvY = dUv.y.add(sin(dUv.y.mul(uPixelateRowRandomFreq)).mul(uPixelateRowRandomAmp.mul(0.1)));
        const rowDir = uPixelateRowAnimMode.equal(0).select(1.0, uPixelateRowAnimMode.mul(-1.0));
        const rowIdx = distortedUvY.mul(grid.y).add(0.0001).floor();
        const widthWaveRaw = sin(rowIdx.mul(uPixelateWidthWaveFreq).add(uTime.mul(uPixelateWidthWaveSpeed).mul(rowDir))).mul(uPixelateWidthWaveAmp).add(1.0);

        const widthWave = widthWaveRaw.greaterThanEqual(0.0).select(
            max(widthWaveRaw, 0.01),
            min(widthWaveRaw, -0.01)
        );
        const dynamicGridX = grid.x.div(widthWave);
        const rowOffsetWave = sin(rowIdx.mul(uPixelateRowOffsetFreq).add(uTime.mul(uPixelateRowOffsetSpeed))).mul(uPixelateRowOffsetWave);
        const rowDirOffset = uTime.mul(uPixelateRowOffsetSpeed).mul(uPixelateRowAnimMode);
        const finalRowOffset = uPixelateRowAnimMode.equal(0).select(rowOffsetWave, rowDirOffset);
        const totalRowOffset = uPixelateRowOffset.add(finalRowOffset);

        const waveX = uPixelateWidthWaveXFreq.mul(dUv.x).add(uTime.mul(uPixelateWidthWaveXSpeed).mul(rowDir));
        const baseUvX = dUv.x.add(sin(waveX).mul(uPixelateWidthWaveXAmp));
        const cellSpaceOffset = totalRowOffset.mul(grid.x);

        const cellColIdx = baseUvX.mul(dynamicGridX).sub(cellSpaceOffset).add(0.0001).floor();
        const distortedCenterX = cellColIdx.add(0.5).add(cellSpaceOffset).div(dynamicGridX);

        const centerWaveX = uPixelateWidthWaveXFreq.mul(distortedCenterX).add(uTime.mul(uPixelateWidthWaveXSpeed).mul(rowDir));
        return distortedCenterX.sub(sin(centerWaveX).mul(uPixelateWidthWaveXAmp));
    });

    applyVerticalAxis = Fn(([dUv, grid]) => {
        const {
            uPixelateColAnimMode, uPixelateColOffset, uPixelateColOffsetWave,
            uPixelateColOffsetFreq, uPixelateColOffsetSpeed, uPixelateHeightWaveAmp,
            uPixelateHeightWaveFreq, uPixelateHeightWaveSpeed, uPixelateHeightWaveYAmp,
            uPixelateHeightWaveYFreq, uPixelateHeightWaveYSpeed, uPixelateColRandomAmp,
            uPixelateColRandomFreq, uTime
        } = this.uniforms;

        const distortedUvX = dUv.x.add(sin(dUv.x.mul(uPixelateColRandomFreq)).mul(uPixelateColRandomAmp.mul(0.1)));
        const colDir = uPixelateColAnimMode.equal(0).select(1.0, uPixelateColAnimMode.mul(-1.0));
        const colIdx = distortedUvX.mul(grid.x).add(0.0001).floor();

        const heightWaveRaw = sin(colIdx.mul(uPixelateHeightWaveFreq).add(uTime.mul(uPixelateHeightWaveSpeed).mul(colDir))).mul(uPixelateHeightWaveAmp).add(1.0);
        const heightWave = heightWaveRaw.greaterThanEqual(0.0).select(
            max(heightWaveRaw, 0.01),
            min(heightWaveRaw, -0.01)
        );
        const dynamicGridY = grid.y.div(heightWave);
        const colOffsetWave = sin(colIdx.mul(uPixelateColOffsetFreq).add(uTime.mul(uPixelateColOffsetSpeed))).mul(uPixelateColOffsetWave);
        const colDirOffset = uTime.mul(uPixelateColOffsetSpeed).mul(uPixelateColAnimMode);
        const finalColOffset = uPixelateColAnimMode.equal(0).select(colOffsetWave, colDirOffset);
        const totalColOffset = uPixelateColOffset.add(finalColOffset);

        const waveY = uPixelateHeightWaveYFreq.mul(dUv.y).add(uTime.mul(uPixelateHeightWaveYSpeed).mul(colDir));
        const baseUvY = dUv.y.add(sin(waveY).mul(uPixelateHeightWaveYAmp));
        const cellSpaceOffsetY = totalColOffset.mul(grid.y);

        const cellRowIdx = baseUvY.mul(dynamicGridY).sub(cellSpaceOffsetY).add(0.0001).floor();
        const distortedCenterY = cellRowIdx.add(0.5).add(cellSpaceOffsetY).div(dynamicGridY);

        const centerWaveY = uPixelateHeightWaveYFreq.mul(distortedCenterY).add(uTime.mul(uPixelateHeightWaveYSpeed).mul(colDir));
        return distortedCenterY.sub(sin(centerWaveY).mul(uPixelateHeightWaveYAmp));
    });

    applyMasking = Fn(([dUv, grid]) => {
        const {
            uPixelateClusteringEnabled, uPixelateClusteringInvert,
            uPixelateMaskStripePosition, uPixelateMaskStripeSpread, uPixelateMaskStripeOffset,
            uPixelateMaskStripeWidth, uPixelateMaskStripeSeed,
            uPixelateVertClusteringEnabled, uPixelateVertClusteringInvert,
            uPixelateVertMaskStripePosition, uPixelateVertMaskStripeSpread, uPixelateVertMaskStripeOffset,
            uPixelateVertMaskStripeWidth, uPixelateVertMaskStripeSeed,
            uPixelateRowRandomAmp, uPixelateRowRandomFreq,
            uPixelateColRandomAmp, uPixelateColRandomFreq,
            uPixelateHorizontalEnabled, uPixelateVerticalEnabled
        } = this.uniforms;

        const finalMask = this.maskEffect.applyMasking(dUv).toVar();

        If(uPixelateClusteringEnabled.equal(1).and(uPixelateHorizontalEnabled.equal(1)), () => {
            const spreadRows = uPixelateMaskStripeSpread.mul(grid.y);
            const centerRowIdx = uPixelateMaskStripePosition.mul(grid.y).floor();

            const distortedUvY = dUv.y.add(sin(dUv.y.mul(uPixelateRowRandomFreq)).mul(uPixelateRowRandomAmp.mul(0.1)));
            const rowIdx = distortedUvY.mul(grid.y).add(0.0001).floor();

            const rowRandom = this.random(vec2(rowIdx, uPixelateMaskStripeSeed)).sub(0.5);
            const horizontalOffset = rowRandom.mul(uPixelateMaskStripeOffset);
            const horizontalWindow = step(fract(dUv.x.add(horizontalOffset)), uPixelateMaskStripeWidth);

            const verticalDist = abs(rowIdx.sub(centerRowIdx));
            const verticalWindow = step(verticalDist, spreadRows.mul(0.5));

            const clusterMask = verticalWindow.mul(horizontalWindow);
            const invertClustering = uPixelateClusteringInvert.equal(1);

            finalMask.mulAssign(invertClustering.select(float(1.0).sub(clusterMask), clusterMask));
        });

        If(uPixelateVertClusteringEnabled.equal(1).and(uPixelateVerticalEnabled.equal(1)), () => {
            const spreadCols = uPixelateVertMaskStripeSpread.mul(grid.x);
            const centerColIdx = uPixelateVertMaskStripePosition.mul(grid.x).floor();

            const distortedUvX = dUv.x.add(sin(dUv.x.mul(uPixelateColRandomFreq)).mul(uPixelateColRandomAmp.mul(0.1)));
            const colIdx = distortedUvX.mul(grid.x).add(0.0001).floor();

            const horizontalDist = abs(colIdx.sub(centerColIdx));
            const horizontalWindow = step(horizontalDist, spreadCols.mul(0.5));

            const colRandom = this.random(vec2(colIdx, uPixelateVertMaskStripeSeed)).sub(0.5);
            const verticalOffset = colRandom.mul(uPixelateVertMaskStripeOffset);
            const verticalWindow = step(fract(dUv.y.add(verticalOffset)), uPixelateVertMaskStripeWidth);

            const clusterMask = verticalWindow.mul(horizontalWindow);
            const invertClustering = uPixelateVertClusteringInvert.equal(1);

            finalMask.mulAssign(invertClustering.select(float(1.0).sub(clusterMask), clusterMask));
        });

        return finalMask;
    });

    /**
     * Returns a function that can be used as a UV transform for pixelation
     */
    applyPixelation = Fn(([dUv]) => {
        if (!this.params.pixelateEnabled) {
            return dUv;
        }

        const {
            uPixelateEnabled, uPixelateHorizontalEnabled, uPixelateVerticalEnabled, uPixelateGrid
        } = this.uniforms;

        const uResolution = this.sketch.resolution;
        const aspect = uResolution.x.div(uResolution.y);
        const grid = vec2(uPixelateGrid.mul(aspect), uPixelateGrid);

        const finalUvX = dUv.x.toVar();
        If(uPixelateHorizontalEnabled.greaterThan(0.5), () => {
            finalUvX.assign(this.applyHorizontalAxis(dUv, grid));
        });

        const finalUvY = dUv.y.toVar();
        If(uPixelateVerticalEnabled.greaterThan(0.5), () => {
            finalUvY.assign(this.applyVerticalAxis(dUv, grid));
        });

        const finalUvP = vec2(finalUvX, finalUvY);

        const finalMask = this.applyMasking(dUv, grid);

        const targetedUv = mix(dUv, finalUvP, finalMask);
        return uPixelateEnabled.greaterThan(0.5).select(targetedUv, dUv);
    });

    /**
     * Injects GUI controls into a Lil-GUI folder
     */
    setupGUI(parentFolder) {
        const pixelateFolder = parentFolder.addFolder('Pixelate');
        const params = this.params;
        const uniforms = this.uniforms;

        const updatePixelateGui = (enabled) => {
            gridController.show(enabled);
        };

        pixelateFolder.add(params, 'pixelateEnabled').name('Enabled').onChange(v => {
            uniforms.uPixelateEnabled.value = v ? 1 : 0;
            updatePixelateGui(v);
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        const gridController = pixelateFolder.add(params, 'pixelateGrid', 1, 30, 1).name('Grid Count').onChange(v => uniforms.uPixelateGrid.value = v).listen();

        let vertEnabledCtrl; // declare early for mutual exclusion access
        let horizFolder;
        let vertFolder;

        const updateAxisFolders = () => {
            if (horizFolder) horizFolder.show(params.pixelateHorizontalEnabled);
            if (vertFolder) vertFolder.show(params.pixelateVerticalEnabled);
        };

        const horizEnabledCtrl = pixelateFolder.add(params, 'pixelateHorizontalEnabled').name('Enable Horizontal Axis').onChange(v => {
            if (v) {
                params.pixelateVerticalEnabled = false;
                if (vertEnabledCtrl) vertEnabledCtrl.updateDisplay();
                uniforms.uPixelateVerticalEnabled.value = 0;
            } else {
                params.pixelateVerticalEnabled = true;
                if (vertEnabledCtrl) vertEnabledCtrl.updateDisplay();
                uniforms.uPixelateVerticalEnabled.value = 1;
            }
            uniforms.uPixelateHorizontalEnabled.value = v ? 1 : 0;
            updateAxisFolders();
        }).listen();

        vertEnabledCtrl = pixelateFolder.add(params, 'pixelateVerticalEnabled').name('Enable Vertical Axis').onChange(v => {
            if (v) {
                params.pixelateHorizontalEnabled = false;
                if (horizEnabledCtrl) horizEnabledCtrl.updateDisplay();
                uniforms.uPixelateHorizontalEnabled.value = 0;
            } else {
                params.pixelateHorizontalEnabled = true;
                if (horizEnabledCtrl) horizEnabledCtrl.updateDisplay();
                uniforms.uPixelateHorizontalEnabled.value = 1;
            }
            uniforms.uPixelateVerticalEnabled.value = v ? 1 : 0;
            updateAxisFolders();
        }).listen();

        // Horizontal Data Axis
        horizFolder = pixelateFolder.addFolder('Horizontal Axis');

        const rowOffsetFolder = horizFolder.addFolder('Row Offset');
        const rowAnimModes = ['Oscillate', 'Left to Right', 'Right to Left'];
        rowOffsetFolder.add(params, 'pixelateRowAnimMode', rowAnimModes).name('Animation Mode').onChange(v => {
            uniforms.uPixelateRowAnimMode.value = v === 'Left to Right' ? 1 : v === 'Right to Left' ? -1 : 0;
            if (this.controllers && this.controllers.updateRowAnimGui) this.controllers.updateRowAnimGui(v);
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();
        rowOffsetFolder.add(params, 'pixelateRowOffset', -1, 1).name('Base Offset').onChange(v => uniforms.uPixelateRowOffset.value = v).listen();
        const rowOffsetWaveCtrl = rowOffsetFolder.add(params, 'pixelateRowOffsetWave', 0, 1).name('Wave Amp').onChange(v => uniforms.uPixelateRowOffsetWave.value = v).listen();
        const rowOffsetFreqCtrl = rowOffsetFolder.add(params, 'pixelateRowOffsetFreq', 0, 20).name('Wave Freq').onChange(v => uniforms.uPixelateRowOffsetFreq.value = v).listen();
        rowOffsetFolder.add(params, 'pixelateRowOffsetSpeed', 0, 5).name('Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        const updateRowAnimGui = (mode) => {
            const isOscillate = mode === 'Oscillate';
            rowOffsetWaveCtrl.show(isOscillate);
            rowOffsetFreqCtrl.show(isOscillate);
        };

        const cellWidthFolder = horizFolder.addFolder('Cell Width');
        cellWidthFolder.add(params, 'pixelateWidthWaveAmp', 0, 3).name('Row Modulate Amp').onChange(v => uniforms.uPixelateWidthWaveAmp.value = v).listen();
        cellWidthFolder.add(params, 'pixelateWidthWaveFreq', 0, 20).name('Row Modulate Freq').onChange(v => uniforms.uPixelateWidthWaveFreq.value = v).listen();
        cellWidthFolder.add(params, 'pixelateWidthWaveSpeed', 0, 5).name('Row Modulate Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        cellWidthFolder.add(params, 'pixelateWidthWaveXAmp', -0.5, 0.5, 0.01).name('Inline Wave Amp').onChange(v => uniforms.uPixelateWidthWaveXAmp.value = v).listen();
        cellWidthFolder.add(params, 'pixelateWidthWaveXFreq', 0, 20).name('Inline Wave Freq').onChange(v => uniforms.uPixelateWidthWaveXFreq.value = v).listen();
        cellWidthFolder.add(params, 'pixelateWidthWaveXSpeed', 0, 5).name('Inline Wave Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        const rowHeightFolder = horizFolder.addFolder('Row Height');
        rowHeightFolder.add(params, 'pixelateRowRandomAmp', 0, 3).name('Random Height Amp').onChange(v => uniforms.uPixelateRowRandomAmp.value = v).listen();
        rowHeightFolder.add(params, 'pixelateRowRandomFreq', 0, 20).name('Random Height Freq').onChange(v => uniforms.uPixelateRowRandomFreq.value = v).listen();

        const horizClusterFolder = horizFolder.addFolder('Horizontal Clustering');
        horizClusterFolder.add(params, 'pixelateClusteringEnabled').name('Enabled').onChange(v => {
            uniforms.uPixelateClusteringEnabled.value = v ? 1 : 0;
        }).listen();
        horizClusterFolder.add(params, 'pixelateMaskStripePosition', 0, 1).name('Vertical Pos').onChange(v => uniforms.uPixelateMaskStripePosition.value = v).listen();
        horizClusterFolder.add(params, 'pixelateMaskStripeSpread', 0, 1).name('Vertical Spread').onChange(v => uniforms.uPixelateMaskStripeSpread.value = v).listen();
        horizClusterFolder.add(params, 'pixelateMaskStripeWidth', 0, 1).name('Stripe Width').onChange(v => uniforms.uPixelateMaskStripeWidth.value = v).listen();
        horizClusterFolder.add(params, 'pixelateMaskStripeOffset', 0, 1).name('Horizontal Chaos').onChange(v => uniforms.uPixelateMaskStripeOffset.value = v).listen();
        horizClusterFolder.add(params, 'pixelateMaskStripeSeed', 0, 1).name('Chaos Seed').onChange(v => uniforms.uPixelateMaskStripeSeed.value = v).listen();
        horizClusterFolder.add(params, 'pixelateClusteringInvert').name('Invert Clustering').onChange(v => {
            uniforms.uPixelateClusteringInvert.value = v ? 1 : 0;
        }).listen();

        // Vertical Data Axis
        vertFolder = pixelateFolder.addFolder('Vertical Axis');

        const colOffsetFolder = vertFolder.addFolder('Col Offset');
        const colAnimModes = ['Oscillate', 'Top to Bottom', 'Bottom to Top'];
        colOffsetFolder.add(params, 'pixelateColAnimMode', colAnimModes).name('Animation Mode').onChange(v => {
            uniforms.uPixelateColAnimMode.value = v === 'Top to Bottom' ? 1 : v === 'Bottom to Top' ? -1 : 0;
            if (this.controllers && this.controllers.updateColAnimGui) this.controllers.updateColAnimGui(v);
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();
        colOffsetFolder.add(params, 'pixelateColOffset', -1, 1).name('Base Offset').onChange(v => uniforms.uPixelateColOffset.value = v).listen();
        const colOffsetWaveCtrl = colOffsetFolder.add(params, 'pixelateColOffsetWave', 0, 1).name('Wave Amp').onChange(v => uniforms.uPixelateColOffsetWave.value = v).listen();
        const colOffsetFreqCtrl = colOffsetFolder.add(params, 'pixelateColOffsetFreq', 0, 20).name('Wave Freq').onChange(v => uniforms.uPixelateColOffsetFreq.value = v).listen();
        colOffsetFolder.add(params, 'pixelateColOffsetSpeed', 0, 5).name('Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        const updateColAnimGui = (mode) => {
            const isOscillate = mode === 'Oscillate';
            colOffsetWaveCtrl.show(isOscillate);
            colOffsetFreqCtrl.show(isOscillate);
        };

        const cellHeightFolder = vertFolder.addFolder('Cell Height');
        cellHeightFolder.add(params, 'pixelateHeightWaveAmp', 0, 3).name('Col Modulate Amp').onChange(v => uniforms.uPixelateHeightWaveAmp.value = v).listen();
        cellHeightFolder.add(params, 'pixelateHeightWaveFreq', 0, 20).name('Col Modulate Freq').onChange(v => uniforms.uPixelateHeightWaveFreq.value = v).listen();
        cellHeightFolder.add(params, 'pixelateHeightWaveSpeed', 0, 5).name('Col Modulate Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        cellHeightFolder.add(params, 'pixelateHeightWaveYAmp', -0.5, 0.5, 0.01).name('Inline Wave Amp').onChange(v => uniforms.uPixelateHeightWaveYAmp.value = v).listen();
        cellHeightFolder.add(params, 'pixelateHeightWaveYFreq', 0, 20).name('Inline Wave Freq').onChange(v => uniforms.uPixelateHeightWaveYFreq.value = v).listen();
        cellHeightFolder.add(params, 'pixelateHeightWaveYSpeed', 0, 5).name('Inline Wave Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        const colWidthFolder = vertFolder.addFolder('Col Width');
        colWidthFolder.add(params, 'pixelateColRandomAmp', 0, 3).name('Random Width Amp').onChange(v => uniforms.uPixelateColRandomAmp.value = v).listen();
        colWidthFolder.add(params, 'pixelateColRandomFreq', 0, 20).name('Random Width Freq').onChange(v => uniforms.uPixelateColRandomFreq.value = v).listen();

        const vertClusterFolder = vertFolder.addFolder('Vertical Clustering');
        vertClusterFolder.add(params, 'pixelateVertClusteringEnabled').name('Enabled').onChange(v => {
            uniforms.uPixelateVertClusteringEnabled.value = v ? 1 : 0;
        }).listen();
        vertClusterFolder.add(params, 'pixelateVertMaskStripePosition', 0, 1).name('Horizontal Pos').onChange(v => uniforms.uPixelateVertMaskStripePosition.value = v).listen();
        vertClusterFolder.add(params, 'pixelateVertMaskStripeSpread', 0, 1).name('Horizontal Spread').onChange(v => uniforms.uPixelateVertMaskStripeSpread.value = v).listen();
        vertClusterFolder.add(params, 'pixelateVertMaskStripeWidth', 0, 1).name('Stripe Width').onChange(v => uniforms.uPixelateVertMaskStripeWidth.value = v).listen();
        vertClusterFolder.add(params, 'pixelateVertMaskStripeOffset', 0, 1).name('Vertical Chaos').onChange(v => uniforms.uPixelateVertMaskStripeOffset.value = v).listen();
        vertClusterFolder.add(params, 'pixelateVertMaskStripeSeed', 0, 1).name('Chaos Seed').onChange(v => uniforms.uPixelateVertMaskStripeSeed.value = v).listen();
        vertClusterFolder.add(params, 'pixelateVertClusteringInvert').name('Invert Clustering').onChange(v => {
            uniforms.uPixelateVertClusteringInvert.value = v ? 1 : 0;
        }).listen();

        this.maskEffect.setupGUI(pixelateFolder, params);
        updatePixelateGui(params.pixelateEnabled);
        updateAxisFolders();
        updateRowAnimGui(params.pixelateRowAnimMode || 'Oscillate');
        updateColAnimGui(params.pixelateColAnimMode || 'Oscillate');

        this.controllers = {
            updatePixelateGui,
            updateAxisFolders,
            updateRowAnimGui,
            updateColAnimGui
        };

        return pixelateFolder;
    }

    /**
     * Updates uniforms based on params
     */
    updateUniforms(params) {
        const uniforms = this.uniforms;
        uniforms.uPixelateEnabled.value = params.pixelateEnabled ? 1 : 0;
        uniforms.uPixelateHorizontalEnabled.value = params.pixelateHorizontalEnabled ? 1 : 0;
        uniforms.uPixelateVerticalEnabled.value = params.pixelateVerticalEnabled ? 1 : 0;
        uniforms.uPixelateGrid.value = params.pixelateGrid;
        uniforms.uPixelateRowAnimMode.value = params.pixelateRowAnimMode === 'Left to Right' ? 1 : params.pixelateRowAnimMode === 'Right to Left' ? -1 : 0;
        uniforms.uPixelateRowOffset.value = params.pixelateRowOffset;
        uniforms.uPixelateRowOffsetWave.value = params.pixelateRowOffsetWave;
        uniforms.uPixelateRowOffsetFreq.value = params.pixelateRowOffsetFreq;
        uniforms.uPixelateRowOffsetSpeed.value = params.pixelateRowOffsetSpeed;
        uniforms.uPixelateWidthWaveAmp.value = params.pixelateWidthWaveAmp;
        uniforms.uPixelateWidthWaveFreq.value = params.pixelateWidthWaveFreq;
        uniforms.uPixelateWidthWaveSpeed.value = params.pixelateWidthWaveSpeed;
        uniforms.uPixelateWidthWaveXAmp.value = params.pixelateWidthWaveXAmp;
        uniforms.uPixelateWidthWaveXFreq.value = params.pixelateWidthWaveXFreq;
        uniforms.uPixelateWidthWaveXSpeed.value = params.pixelateWidthWaveXSpeed;
        uniforms.uPixelateHeightWaveAmp.value = params.pixelateHeightWaveAmp;
        uniforms.uPixelateHeightWaveFreq.value = params.pixelateHeightWaveFreq;
        uniforms.uPixelateHeightWaveSpeed.value = params.pixelateHeightWaveSpeed;
        uniforms.uPixelateHeightWaveYAmp.value = params.pixelateHeightWaveYAmp;
        uniforms.uPixelateHeightWaveYFreq.value = params.pixelateHeightWaveYFreq;
        uniforms.uPixelateHeightWaveYSpeed.value = params.pixelateHeightWaveYSpeed;

        uniforms.uPixelateRowRandomAmp.value = params.pixelateRowRandomAmp;
        uniforms.uPixelateRowRandomFreq.value = params.pixelateRowRandomFreq;
        uniforms.uPixelateColRandomAmp.value = params.pixelateColRandomAmp;
        uniforms.uPixelateColRandomFreq.value = params.pixelateColRandomFreq;

        uniforms.uPixelateColAnimMode.value = params.pixelateColAnimMode === 'Top to Bottom' ? 1 : params.pixelateColAnimMode === 'Bottom to Top' ? -1 : 0;
        uniforms.uPixelateColOffset.value = params.pixelateColOffset;
        uniforms.uPixelateColOffsetWave.value = params.pixelateColOffsetWave;
        uniforms.uPixelateColOffsetFreq.value = params.pixelateColOffsetFreq;
        uniforms.uPixelateColOffsetSpeed.value = params.pixelateColOffsetSpeed;
        uniforms.uPixelateMaskStripePosition.value = params.pixelateMaskStripePosition;
        uniforms.uPixelateMaskStripeSpread.value = params.pixelateMaskStripeSpread;
        uniforms.uPixelateMaskStripeOffset.value = params.pixelateMaskStripeOffset;
        uniforms.uPixelateMaskStripeWidth.value = params.pixelateMaskStripeWidth;
        uniforms.uPixelateMaskStripeSeed.value = params.pixelateMaskStripeSeed;
        uniforms.uPixelateClusteringEnabled.value = params.pixelateClusteringEnabled ? 1 : 0;
        uniforms.uPixelateClusteringInvert.value = params.pixelateClusteringInvert ? 1 : 0;

        uniforms.uPixelateVertClusteringEnabled.value = params.pixelateVertClusteringEnabled ? 1 : 0;
        uniforms.uPixelateVertMaskStripePosition.value = params.pixelateVertMaskStripePosition;
        uniforms.uPixelateVertMaskStripeSpread.value = params.pixelateVertMaskStripeSpread;
        uniforms.uPixelateVertMaskStripeOffset.value = params.pixelateVertMaskStripeOffset;
        uniforms.uPixelateVertMaskStripeWidth.value = params.pixelateVertMaskStripeWidth;
        uniforms.uPixelateVertMaskStripeSeed.value = params.pixelateVertMaskStripeSeed;
        uniforms.uPixelateVertClusteringInvert.value = params.pixelateVertClusteringInvert ? 1 : 0;

        this.maskEffect.updateUniforms(params);

        if (this.controllers) {
            this.controllers.updatePixelateGui(params.pixelateEnabled);
            if (this.controllers.updateAxisFolders) this.controllers.updateAxisFolders();
            if (this.controllers.updateRowAnimGui) this.controllers.updateRowAnimGui(params.pixelateRowAnimMode || 'Oscillate');
            if (this.controllers.updateColAnimGui) this.controllers.updateColAnimGui(params.pixelateColAnimMode || 'Oscillate');
        }
    }

    /**
     * Updates animation speeds based on perfect loop settings
     */
    updateSpeeds(isPerfectLoop, duration, quantizeFn) {
        const p = this.params;
        const pu = this.uniforms;

        // Linear speed quantization for animating row/col offsets
        const quantizeLinear = (speed, gridDivisor) => {
            if (duration <= 0) return speed;
            const period = 1.0 / gridDivisor;
            // Target: speed * duration = cycles * period => cycles = (speed * duration) / period
            let cycles = Math.round((duration * speed) / period);
            if (speed !== 0 && cycles === 0) {
                cycles = Math.sign(speed);
            }
            return (cycles * period) / duration;
        };

        const aspect = this.sketch.width / this.sketch.height;
        const gridX = p.pixelateGrid * aspect;
        const gridY = p.pixelateGrid;

        const isRowLinear = p.pixelateRowAnimMode === 'Left to Right' || p.pixelateRowAnimMode === 'Right to Left';
        const isColLinear = p.pixelateColAnimMode === 'Top to Bottom' || p.pixelateColAnimMode === 'Bottom to Top';

        if (pu.uPixelateRowOffsetSpeed) {
            if (isPerfectLoop && isRowLinear) {
                pu.uPixelateRowOffsetSpeed.value = quantizeLinear(p.pixelateRowOffsetSpeed, gridX);
            } else {
                pu.uPixelateRowOffsetSpeed.value = isPerfectLoop ? quantizeFn(p.pixelateRowOffsetSpeed, duration) : p.pixelateRowOffsetSpeed;
            }
        }
        if (pu.uPixelateColOffsetSpeed) {
            if (isPerfectLoop && isColLinear) {
                pu.uPixelateColOffsetSpeed.value = quantizeLinear(p.pixelateColOffsetSpeed, gridY);
            } else {
                pu.uPixelateColOffsetSpeed.value = isPerfectLoop ? quantizeFn(p.pixelateColOffsetSpeed, duration) : p.pixelateColOffsetSpeed;
            }
        }
        if (pu.uPixelateWidthWaveSpeed) {
            pu.uPixelateWidthWaveSpeed.value = isPerfectLoop ? quantizeFn(p.pixelateWidthWaveSpeed, duration) : p.pixelateWidthWaveSpeed;
        }
        if (pu.uPixelateWidthWaveXSpeed) {
            pu.uPixelateWidthWaveXSpeed.value = isPerfectLoop ? quantizeFn(p.pixelateWidthWaveXSpeed, duration) : p.pixelateWidthWaveXSpeed;
        }
        if (pu.uPixelateHeightWaveSpeed) {
            pu.uPixelateHeightWaveSpeed.value = isPerfectLoop ? quantizeFn(p.pixelateHeightWaveSpeed, duration) : p.pixelateHeightWaveSpeed;
        }
        if (pu.uPixelateHeightWaveYSpeed) {
            pu.uPixelateHeightWaveYSpeed.value = isPerfectLoop ? quantizeFn(p.pixelateHeightWaveYSpeed, duration) : p.pixelateHeightWaveYSpeed;
        }
    }
}
