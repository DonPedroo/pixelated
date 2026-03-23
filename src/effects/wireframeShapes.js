import { uniform, Fn, float, vec3, vec4, color, positionLocal, vec2, sin, cos, step, mix, pass, uv, attribute, normalize, cross, cameraPosition, normalLocal, abs, If } from 'three/tsl';
import * as THREE from 'three/webgpu';

/**
 * WireframeShapes Effect
 * Renders continuous wireframe objects using LineSegments and NodeMaterial based deformations.
 */
export class WireframeShapesEffect {
    static type = 'standard';
    static order = 35; // Rendering order

    static getDefaults() {
        const defaults = {
            wireframeShapesEnabled: false,
            wireframeShapesCameraType: 'Perspective',
            wireframeShapesCameraFov: 75,
            wireframeShapesCameraSize: 5.0
        };
        for (let i = 0; i < 5; i++) {
            defaults[`wireframeShape${i}Enabled`] = false;
            defaults[`wireframeShape${i}Visible`] = true;
            defaults[`wireframeShape${i}Type`] = 'Sphere';
            defaults[`wireframeShape${i}PosX`] = 0;
            defaults[`wireframeShape${i}PosY`] = 0;
            defaults[`wireframeShape${i}PosZ`] = 0;
            defaults[`wireframeShape${i}RotX`] = 0;
            defaults[`wireframeShape${i}RotY`] = 0;
            defaults[`wireframeShape${i}RotZ`] = 0;
            defaults[`wireframeShape${i}Scale`] = 1.0;

            defaults[`wireframeShape${i}Density`] = 5;
            defaults[`wireframeShape${i}LineDensity`] = 1.0;
            defaults[`wireframeShape${i}Thickness`] = 0.01;
            defaults[`wireframeShape${i}OccludeBack`] = false;
            defaults[`wireframeShape${i}SilhouetteEnabled`] = false;
            defaults[`wireframeShape${i}SilhouetteThickness`] = 0.05;

            defaults[`wireframeShape${i}WarpAmount`] = 0.0;
            defaults[`wireframeShape${i}WarpFreq`] = 1.0;
            defaults[`wireframeShape${i}TwistAmount`] = 0.0;
            defaults[`wireframeShape${i}PoleAmount`] = 0.0;

            defaults[`wireframeShape${i}AnimRotX`] = false;
            defaults[`wireframeShape${i}AnimRotY`] = false;
            defaults[`wireframeShape${i}AnimRotZ`] = false;
            defaults[`wireframeShape${i}AnimSpeed`] = 1.0;

            defaults[`wireframeShape${i}Color`] = "#ffffff";
            defaults[`wireframeShape${i}BlendMode`] = "mix";
        }
        return defaults;
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
        this.shapes = [];
        this.maxPrimitives = 5;
        this.maxEdges = 10000;
        this.meshInitialized = false;
    }

    setupMesh() {
        if (this.meshInitialized) return;

        this.scene = new THREE.Scene();
        const aspect = this.sketch.width / this.sketch.height;
        if (this.params.wireframeShapesCameraType === 'Orthographic') {
            const size = this.params.wireframeShapesCameraSize || 5.0;
            this.camera = new THREE.OrthographicCamera(size * aspect / -2, size * aspect / 2, size / 2, size / -2, 0.1, 100);
        } else {
            this.camera = new THREE.PerspectiveCamera(this.params.wireframeShapesCameraFov || 75, aspect, 0.1, 100);
        }
        this.camera.position.z = 2; // Position camera back so we can see shape at Z=0

        // Single generic cylinder primitive used for all edges
        // High enough height segments if we want to support internal curvature or simple 1 is enough for straight edges
        this.cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 4, 1);

        for (let i = 0; i < this.maxPrimitives; i++) {
            const mat = new THREE.MeshBasicNodeMaterial({
                transparent: true,
                depthWrite: false,
                depthTest: true,
                side: THREE.FrontSide
            });

            const proxyMat = new THREE.MeshBasicNodeMaterial({
                colorWrite: false,
                depthWrite: true,
                depthTest: true,
                transparent: false,
                side: THREE.FrontSide,
                polygonOffset: true,
                polygonOffsetFactor: 2,
                polygonOffsetUnits: 2
            });

            const silhouetteMat = new THREE.MeshBasicNodeMaterial({
                colorWrite: true,
                depthWrite: false,
                depthTest: true,
                transparent: true,
                side: THREE.BackSide
            });

            const instGeo = new THREE.InstancedBufferGeometry().copy(this.cylinderGeo);
            instGeo.instanceCount = 0;

            const startArray = new Float32Array(this.maxEdges * 3);
            const endArray = new Float32Array(this.maxEdges * 3);

            const startAttr = new THREE.InstancedBufferAttribute(startArray, 3);
            const endAttr = new THREE.InstancedBufferAttribute(endArray, 3);
            startAttr.setUsage(THREE.DynamicDrawUsage);
            endAttr.setUsage(THREE.DynamicDrawUsage);

            instGeo.setAttribute('edgeStart', startAttr);
            instGeo.setAttribute('edgeEnd', endAttr);

            const mesh = new THREE.Mesh(instGeo, mat);
            mesh.frustumCulled = false;
            mesh.visible = this.params[`wireframeShape${i}Enabled`] && this.params[`wireframeShape${i}Visible`];

            const proxyMesh = new THREE.Mesh(new THREE.BufferGeometry(), proxyMat);
            proxyMesh.frustumCulled = false;
            proxyMesh.visible = this.params[`wireframeShape${i}Enabled`] && this.params[`wireframeShape${i}Visible`] && this.params[`wireframeShape${i}OccludeBack`];

            const silhouetteMesh = new THREE.Mesh(new THREE.BufferGeometry(), silhouetteMat);
            silhouetteMesh.frustumCulled = false;
            silhouetteMesh.visible = this.params[`wireframeShape${i}Enabled`] && this.params[`wireframeShape${i}Visible`] && this.params[`wireframeShape${i}SilhouetteEnabled`];
            silhouetteMesh.renderOrder = 1;

            this.scene.add(proxyMesh);
            this.scene.add(mesh);
            this.scene.add(silhouetteMesh);

            this.shapes.push({
                index: i,
                mesh: mesh,
                proxyMesh: proxyMesh,
                silhouetteMesh: silhouetteMesh,
                material: mat,
                proxyMaterial: proxyMat,
                silhouetteMaterial: silhouetteMat
            });
        }

        this.passNodes = [];
        for (let i = 0; i < this.maxPrimitives; i++) {
            const shapeScene = new THREE.Scene();
            shapeScene.add(this.shapes[i].proxyMesh);
            shapeScene.add(this.shapes[i].mesh);
            shapeScene.add(this.shapes[i].silhouetteMesh);
            this.passNodes.push(pass(shapeScene, this.camera));
        }

        this.meshInitialized = true;
    }

    setupUniforms() {
        this.uniforms = {
            uWireframeShapesEnabled: uniform(this.params.wireframeShapesEnabled ? 1 : 0)
        };

        for (let i = 0; i < this.maxPrimitives; i++) {
            this.uniforms[`uShape${i}Enabled`] = uniform(this.params[`wireframeShape${i}Enabled`] ? 1 : 0);
            this.uniforms[`uShape${i}Visible`] = uniform(this.params[`wireframeShape${i}Visible`] ? 1 : 0);

            this.uniforms[`uShape${i}PosX`] = uniform(this.params[`wireframeShape${i}PosX`]);
            this.uniforms[`uShape${i}PosY`] = uniform(this.params[`wireframeShape${i}PosY`]);
            this.uniforms[`uShape${i}PosZ`] = uniform(this.params[`wireframeShape${i}PosZ`]);
            this.uniforms[`uShape${i}RotX`] = uniform(this.params[`wireframeShape${i}RotX`] * (Math.PI / 180));
            this.uniforms[`uShape${i}RotY`] = uniform(this.params[`wireframeShape${i}RotY`] * (Math.PI / 180));
            this.uniforms[`uShape${i}RotZ`] = uniform(this.params[`wireframeShape${i}RotZ`] * (Math.PI / 180));
            this.uniforms[`uShape${i}Scale`] = uniform(this.params[`wireframeShape${i}Scale`]);

            this.uniforms[`uShape${i}Thickness`] = uniform(this.params[`wireframeShape${i}Thickness`]);

            this.uniforms[`uShape${i}SilhouetteEnabled`] = uniform(this.params[`wireframeShape${i}SilhouetteEnabled`] ? 1 : 0);
            this.uniforms[`uShape${i}SilhouetteThickness`] = uniform(this.params[`wireframeShape${i}SilhouetteThickness`]);

            this.uniforms[`uShape${i}WarpAmount`] = uniform(this.params[`wireframeShape${i}WarpAmount`]);
            this.uniforms[`uShape${i}WarpFreq`] = uniform(this.params[`wireframeShape${i}WarpFreq`]);
            this.uniforms[`uShape${i}TwistAmount`] = uniform(this.params[`wireframeShape${i}TwistAmount`]);
            this.uniforms[`uShape${i}PoleAmount`] = uniform(this.params[`wireframeShape${i}PoleAmount`]);

            this.uniforms[`uShape${i}AnimRotX`] = uniform(this.params[`wireframeShape${i}AnimRotX`] ? 1 : 0);
            this.uniforms[`uShape${i}AnimRotY`] = uniform(this.params[`wireframeShape${i}AnimRotY`] ? 1 : 0);
            this.uniforms[`uShape${i}AnimRotZ`] = uniform(this.params[`wireframeShape${i}AnimRotZ`] ? 1 : 0);
            this.uniforms[`uShape${i}AnimSpeed`] = uniform(this.params[`wireframeShape${i}AnimSpeed`]);

            this.uniforms[`uShape${i}Color`] = uniform(color(this.params[`wireframeShape${i}Color`]));
            this.uniforms[`uShape${i}BlendMode`] = uniform(this.getBlendModeIndex(this.params[`wireframeShape${i}BlendMode`]));
        }

        this.uniforms.uTime = uniform(0);

        if (this.params.wireframeShapesEnabled) {
            this.setupMesh();
            this.updateMaterials();
        }

        return this.uniforms;
    }

    updateMaterials() {
        if (!this.meshInitialized) return;

        for (let i = 0; i < this.maxPrimitives; i++) {
            const shape = this.shapes[i];
            const mat = shape.material;
            const proxyMat = shape.proxyMaterial;
            const silhouetteMat = shape.silhouetteMaterial;
            const ui = this.uniforms;

            mat.colorNode = ui[`uShape${i}Color`];
            silhouetteMat.colorNode = ui[`uShape${i}Color`];

            const time = ui.uTime;
            const animSpeed = ui[`uShape${i}AnimSpeed`];
            const animX = ui[`uShape${i}AnimRotX`];
            const animY = ui[`uShape${i}AnimRotY`];
            const animZ = ui[`uShape${i}AnimRotZ`];

            // TSL position logic for cylinder edge matching + deformation + transform
            mat.positionNode = Fn(() => {
                const eStart = attribute('edgeStart', 'vec3');
                const eEnd = attribute('edgeEnd', 'vec3');

                // Cylinder moves from -0.5 to 0.5 on Y
                // Extend it slightly past 0 and 1 so segments intersect flawlessly without V-gaps
                const t = positionLocal.y.add(0.5).mul(1.04).sub(0.02);
                const centerPos = mix(eStart, eEnd, t); // This maps the cylinder spine to the edge

                // Thickness calculation
                const dir = eEnd.sub(eStart).normalize();

                const upVec = vec3(0.0, 1.0, 0.0);
                const isUp = dir.y.abs().greaterThan(0.999);
                const tempUp = isUp.select(vec3(1.0, 0.0, 0.0), upVec);

                const rightVec = tempUp.cross(dir).normalize();
                const newUp = dir.cross(rightVec).normalize();

                const thickness = ui[`uShape${i}Thickness`];
                const offsetX = rightVec.mul(positionLocal.x).mul(thickness);
                const offsetZ = newUp.mul(positionLocal.z).mul(thickness);

                let pos = centerPos.add(offsetX).add(offsetZ);

                // --- Local Animation Rotation (Before Deformation) ---
                const animRotX = time.mul(animSpeed).mul(animX);
                const aCosX = cos(animRotX); const aSinX = sin(animRotX);
                const ay1 = pos.y.mul(aCosX).sub(pos.z.mul(aSinX));
                const az1 = pos.y.mul(aSinX).add(pos.z.mul(aCosX));
                pos = vec3(pos.x, ay1, az1);

                const animRotY = time.mul(animSpeed).mul(animY);
                const aCosY = cos(animRotY); const aSinY = sin(animRotY);
                const arx = pos.x.mul(aCosY).add(pos.z.mul(aSinY));
                const arz = pos.x.mul(aSinY).negate().add(pos.z.mul(aCosY));
                pos = vec3(arx, pos.y, arz);

                const animRotZ = time.mul(animSpeed).mul(animZ);
                const aCosZ = cos(animRotZ); const aSinZ = sin(animRotZ);
                const azrx = pos.x.mul(aCosZ).sub(pos.y.mul(aSinZ));
                const azry = pos.x.mul(aSinZ).add(pos.y.mul(aCosZ));
                pos = vec3(azrx, azry, pos.z);

                // Deformation: Pole attraction
                const pole = vec3(0.0, 1.0, 0.0);
                const toPole = pole.sub(pos);
                const distToPole = pos.distance(pole);
                const poleInfluence = float(1.0).div(distToPole.add(0.5)).mul(ui[`uShape${i}PoleAmount`]);
                pos = pos.add(toPole.mul(poleInfluence));

                // Deformation: Warp
                const warpFreq = ui[`uShape${i}WarpFreq`];
                const warpAmt = ui[`uShape${i}WarpAmount`];
                const warpX = sin(pos.y.mul(warpFreq)).mul(warpAmt);
                const warpY = cos(pos.x.mul(warpFreq)).mul(warpAmt);
                const warpZ = sin(pos.z.mul(warpFreq)).mul(warpAmt);
                pos = pos.add(vec3(warpX, warpY, warpZ));

                // Deformation: Twist around Y
                const twist = pos.y.mul(ui[`uShape${i}TwistAmount`]);
                const cTwist = cos(twist);
                const sTwist = sin(twist);
                const tx = pos.x.mul(cTwist).sub(pos.z.mul(sTwist));
                const tz = pos.x.mul(sTwist).add(pos.z.mul(cTwist));
                pos = vec3(tx, pos.y, tz);

                // --- Transform ---
                // Scale
                const uScale = ui[`uShape${i}Scale`];
                pos = pos.mul(uScale);

                // Rotations

                const rotX = ui[`uShape${i}RotX`];

                const cosX = cos(rotX); const sinX = sin(rotX);
                const y1 = pos.y.mul(cosX).sub(pos.z.mul(sinX));
                const z1 = pos.y.mul(sinX).add(pos.z.mul(cosX));
                pos = vec3(pos.x, y1, z1);

                const rotY = ui[`uShape${i}RotY`];
                const cosY = cos(rotY); const sinY = sin(rotY);
                const rx = pos.x.mul(cosY).add(pos.z.mul(sinY));
                const rz = pos.x.mul(sinY).negate().add(pos.z.mul(cosY));
                pos = vec3(rx, pos.y, rz);

                const rotZ = ui[`uShape${i}RotZ`];
                const cosZ = cos(rotZ); const sinZ = sin(rotZ);
                const zrx = pos.x.mul(cosZ).sub(pos.y.mul(sinZ));
                const zry = pos.x.mul(sinZ).add(pos.y.mul(cosZ));
                pos = vec3(zrx, zry, pos.z);

                // Translation
                const translatedPos = pos.add(vec3(ui[`uShape${i}PosX`], ui[`uShape${i}PosY`], ui[`uShape${i}PosZ`]));

                return translatedPos;
            })();

            // TSL position logic for the invisible solid proxy mesh (deforms identical to edges)
            proxyMat.positionNode = Fn(() => {
                let pos = positionLocal; // regular vertex of the shape

                // --- Local Animation Rotation (Before Deformation) ---
                const animRotX = time.mul(animSpeed).mul(animX);
                const aCosX = cos(animRotX); const aSinX = sin(animRotX);
                const ay1 = pos.y.mul(aCosX).sub(pos.z.mul(aSinX));
                const az1 = pos.y.mul(aSinX).add(pos.z.mul(aCosX));
                pos = vec3(pos.x, ay1, az1);

                const animRotY = time.mul(animSpeed).mul(animY);
                const aCosY = cos(animRotY); const aSinY = sin(animRotY);
                const arx = pos.x.mul(aCosY).add(pos.z.mul(aSinY));
                const arz = pos.x.mul(aSinY).negate().add(pos.z.mul(aCosY));
                pos = vec3(arx, pos.y, arz);

                const animRotZ = time.mul(animSpeed).mul(animZ);
                const aCosZ = cos(animRotZ); const aSinZ = sin(animRotZ);
                const azrx = pos.x.mul(aCosZ).sub(pos.y.mul(aSinZ));
                const azry = pos.x.mul(aSinZ).add(pos.y.mul(aCosZ));
                pos = vec3(azrx, azry, pos.z);

                // Deformation: Pole attraction
                const pole = vec3(0.0, 1.0, 0.0);
                const toPole = pole.sub(pos);
                const distToPole = pos.distance(pole);
                const poleInfluence = float(1.0).div(distToPole.add(0.5)).mul(ui[`uShape${i}PoleAmount`]);
                pos = pos.add(toPole.mul(poleInfluence));

                // Deformation: Warp
                const warpFreq = ui[`uShape${i}WarpFreq`];
                const warpAmt = ui[`uShape${i}WarpAmount`];
                const warpX = sin(pos.y.mul(warpFreq)).mul(warpAmt);
                const warpY = cos(pos.x.mul(warpFreq)).mul(warpAmt);
                const warpZ = sin(pos.z.mul(warpFreq)).mul(warpAmt);
                pos = pos.add(vec3(warpX, warpY, warpZ));

                // Deformation: Twist around Y
                const twist = pos.y.mul(ui[`uShape${i}TwistAmount`]);
                const cTwist = cos(twist);
                const sTwist = sin(twist);
                const tx = pos.x.mul(cTwist).sub(pos.z.mul(sTwist));
                const tz = pos.x.mul(sTwist).add(pos.z.mul(cTwist));
                pos = vec3(tx, pos.y, tz);

                // --- Transform ---
                // Scale
                const uScale = ui[`uShape${i}Scale`];
                pos = pos.mul(uScale);

                // Rotations

                const rotX = ui[`uShape${i}RotX`];

                const cosX = cos(rotX); const sinX = sin(rotX);
                const y1 = pos.y.mul(cosX).sub(pos.z.mul(sinX));
                const z1 = pos.y.mul(sinX).add(pos.z.mul(cosX));
                pos = vec3(pos.x, y1, z1);

                const rotY = ui[`uShape${i}RotY`];
                const cosY = cos(rotY); const sinY = sin(rotY);
                const rx = pos.x.mul(cosY).add(pos.z.mul(sinY));
                const rz = pos.x.mul(sinY).negate().add(pos.z.mul(cosY));
                pos = vec3(rx, pos.y, rz);

                const rotZ = ui[`uShape${i}RotZ`];
                const cosZ = cos(rotZ); const sinZ = sin(rotZ);
                const zrx = pos.x.mul(cosZ).sub(pos.y.mul(sinZ));
                const zry = pos.x.mul(sinZ).add(pos.y.mul(cosZ));
                pos = vec3(zrx, zry, pos.z);

                // Translation
                const translatedPos = pos.add(vec3(ui[`uShape${i}PosX`], ui[`uShape${i}PosY`], ui[`uShape${i}PosZ`]));

                // --- Transform Normal ---
                let norm = attribute('normal', 'vec3');

                // Deformation: Twist around Y for normal
                const nTwist = positionLocal.y.mul(ui[`uShape${i}TwistAmount`]);
                const nCTwist = cos(nTwist);
                const nSTwist = sin(nTwist);
                const ntx = norm.x.mul(nCTwist).sub(norm.z.mul(nSTwist));
                const ntz = norm.x.mul(nSTwist).add(norm.z.mul(nCTwist));
                norm = vec3(ntx, norm.y, ntz);

                // --- Local Animation Rotation for Normal ---
                const nAy1 = norm.y.mul(aCosX).sub(norm.z.mul(aSinX));
                const nAz1 = norm.y.mul(aSinX).add(norm.z.mul(aCosX));
                norm = vec3(norm.x, nAy1, nAz1);

                const nArx = norm.x.mul(aCosY).add(norm.z.mul(aSinY));
                const nArz = norm.x.mul(aSinY).negate().add(norm.z.mul(aCosY));
                norm = vec3(nArx, norm.y, nArz);

                const nAzrx = norm.x.mul(aCosZ).sub(norm.y.mul(aSinZ));
                const nAzry = norm.x.mul(aSinZ).add(norm.y.mul(aCosZ));
                norm = vec3(nAzrx, nAzry, norm.z);

                // Rotations for normal
                const nRotX = ui[`uShape${i}RotX`];
                const nCosX = cos(nRotX); const nSinX = sin(nRotX);
                const ny1 = norm.y.mul(nCosX).sub(norm.z.mul(nSinX));
                const nz1 = norm.y.mul(nSinX).add(norm.z.mul(nCosX));
                norm = vec3(norm.x, ny1, nz1);

                const nRotY = ui[`uShape${i}RotY`];
                const nCosY = cos(nRotY); const nSinY = sin(nRotY);
                const nrx = norm.x.mul(nCosY).add(norm.z.mul(nSinY));
                const nrz = norm.x.mul(nSinY).negate().add(norm.z.mul(nCosY));
                norm = vec3(nrx, norm.y, nrz);

                const nRotZ = ui[`uShape${i}RotZ`];
                const nCosZ = cos(nRotZ); const nSinZ = sin(nRotZ);
                const nnzrx = norm.x.mul(nCosZ).sub(norm.y.mul(nSinZ));
                const nnzry = norm.x.mul(nSinZ).add(norm.y.mul(nCosZ));
                norm = vec3(nnzrx, nnzry, norm.z);

                norm = norm.normalize();

                // Push proxy slightly INSIDE the surface to avoid clipping the thickness of front cylinders
                // We must account for the shape scale since cylinders are scaled after thickness application
                const offsetAmt = ui[`uShape${i}Thickness`].mul(uScale).mul(0.8);
                const adjustedPos = translatedPos.sub(norm.mul(offsetAmt));

                return adjustedPos;
            })();

            // TSL position logic for the silhouette mesh
            silhouetteMat.positionNode = Fn(() => {
                let pos = positionLocal;
                let norm = normalLocal;

                // --- Local Animation Rotation (Before Deformation) ---
                const animRotX = time.mul(animSpeed).mul(animX);
                const aCosX = cos(animRotX); const aSinX = sin(animRotX);
                const ay1 = pos.y.mul(aCosX).sub(pos.z.mul(aSinX));
                const az1 = pos.y.mul(aSinX).add(pos.z.mul(aCosX));
                pos = vec3(pos.x, ay1, az1);

                const nAy1 = norm.y.mul(aCosX).sub(norm.z.mul(aSinX));
                const nAz1 = norm.y.mul(aSinX).add(norm.z.mul(aCosX));
                norm = vec3(norm.x, nAy1, nAz1);

                const animRotY = time.mul(animSpeed).mul(animY);
                const aCosY = cos(animRotY); const aSinY = sin(animRotY);
                const arx = pos.x.mul(aCosY).add(pos.z.mul(aSinY));
                const arz = pos.x.mul(aSinY).negate().add(pos.z.mul(aCosY));
                pos = vec3(arx, pos.y, arz);

                const nArx = norm.x.mul(aCosY).add(norm.z.mul(aSinY));
                const nArz = norm.x.mul(aSinY).negate().add(norm.z.mul(aCosY));
                norm = vec3(nArx, norm.y, nArz);

                const animRotZ = time.mul(animSpeed).mul(animZ);
                const aCosZ = cos(animRotZ); const aSinZ = sin(animRotZ);
                const azrx = pos.x.mul(aCosZ).sub(pos.y.mul(aSinZ));
                const azry = pos.x.mul(aSinZ).add(pos.y.mul(aCosZ));
                pos = vec3(azrx, azry, pos.z);

                const nAzrx = norm.x.mul(aCosZ).sub(norm.y.mul(aSinZ));
                const nAzry = norm.x.mul(aSinZ).add(norm.y.mul(aCosZ));
                norm = vec3(nAzrx, nAzry, norm.z);

                // Deformation: Pole attraction
                const pole = vec3(0.0, 1.0, 0.0);
                const toPole = pole.sub(pos);
                const distToPole = pos.distance(pole);
                const poleInfluence = float(1.0).div(distToPole.add(0.5)).mul(ui[`uShape${i}PoleAmount`]);
                pos = pos.add(toPole.mul(poleInfluence));

                // Deformation: Warp
                const warpFreq = ui[`uShape${i}WarpFreq`];
                const warpAmt = ui[`uShape${i}WarpAmount`];
                const warpX = sin(pos.y.mul(warpFreq)).mul(warpAmt);
                const warpY = cos(pos.x.mul(warpFreq)).mul(warpAmt);
                const warpZ = sin(pos.z.mul(warpFreq)).mul(warpAmt);
                pos = pos.add(vec3(warpX, warpY, warpZ));

                // Deformation: Twist around Y
                const twist = pos.y.mul(ui[`uShape${i}TwistAmount`]);
                const cTwist = cos(twist);
                const sTwist = sin(twist);

                const tx = pos.x.mul(cTwist).sub(pos.z.mul(sTwist));
                const tz = pos.x.mul(sTwist).add(pos.z.mul(cTwist));
                pos = vec3(tx, pos.y, tz);

                const ntx = norm.x.mul(cTwist).sub(norm.z.mul(sTwist));
                const ntz = norm.x.mul(sTwist).add(norm.z.mul(cTwist));
                norm = vec3(ntx, norm.y, ntz);

                // --- Transform ---
                // Scale
                const uScale = ui[`uShape${i}Scale`];
                pos = pos.mul(uScale);

                // Rotations
                const rotX = ui[`uShape${i}RotX`];
                const cosX = cos(rotX); const sinX = sin(rotX);
                const y1 = pos.y.mul(cosX).sub(pos.z.mul(sinX));
                const z1 = pos.y.mul(sinX).add(pos.z.mul(cosX));
                pos = vec3(pos.x, y1, z1);

                const ny1 = norm.y.mul(cosX).sub(norm.z.mul(sinX));
                const nz1 = norm.y.mul(sinX).add(norm.z.mul(cosX));
                norm = vec3(norm.x, ny1, nz1);

                const rotY = ui[`uShape${i}RotY`];
                const cosY = cos(rotY); const sinY = sin(rotY);
                const rx = pos.x.mul(cosY).add(pos.z.mul(sinY));
                const rz = pos.x.mul(sinY).negate().add(pos.z.mul(cosY));
                pos = vec3(rx, pos.y, rz);

                const nrx = norm.x.mul(cosY).add(norm.z.mul(sinY));
                const nrz = norm.x.mul(sinY).negate().add(norm.z.mul(cosY));
                norm = vec3(nrx, norm.y, nrz);

                const rotZ = ui[`uShape${i}RotZ`];
                const cosZ = cos(rotZ); const sinZ = sin(rotZ);
                const zrx = pos.x.mul(cosZ).sub(pos.y.mul(sinZ));
                const zry = pos.x.mul(sinZ).add(pos.y.mul(cosZ));
                pos = vec3(zrx, zry, pos.z);

                const nzrx = norm.x.mul(cosZ).sub(norm.y.mul(sinZ));
                const nzry = norm.x.mul(sinZ).add(norm.y.mul(cosZ));
                norm = vec3(nzrx, nzry, norm.z);

                // Translation
                const translatedPos = pos.add(vec3(ui[`uShape${i}PosX`], ui[`uShape${i}PosY`], ui[`uShape${i}PosZ`]));

                // Normal-based expansion for silhouette
                norm = norm.normalize();
                const adjustedPos = translatedPos.add(norm.mul(ui[`uShape${i}SilhouetteThickness`]));

                return adjustedPos;
            })();

            this.updateShapeGeometry(i);
        }
    }

    updateShapeGeometry(i) {
        if (!this.meshInitialized) return;
        const type = this.params[`wireframeShape${i}Type`];
        const density = Math.max(1, Math.floor(this.params[`wireframeShape${i}Density`]));
        const lineDensity = this.params[`wireframeShape${i}LineDensity`] ?? 1.0;

        let dummyGeo;
        if (type === 'Sphere') dummyGeo = new THREE.SphereGeometry(1, density * 4, density * 4);
        else if (type === 'Cube') dummyGeo = new THREE.BoxGeometry(1, 1, 1, density, density, density);
        else if (type === 'Tetrahedron') dummyGeo = new THREE.TetrahedronGeometry(1, density);
        else if (type === 'Torus') dummyGeo = new THREE.TorusGeometry(1, 0.4, density * 2, density * 4);
        else dummyGeo = new THREE.IcosahedronGeometry(1, density);

        const edgesGeo = new THREE.EdgesGeometry(dummyGeo);
        // We defer extraction until we know if it's parametric or polygon
        const shape = this.shapes[i];
        const instGeo = shape.mesh.geometry;

        if (shape.proxyMesh.geometry) {
            shape.proxyMesh.geometry.dispose();
        }
        shape.proxyMesh.geometry = dummyGeo;
        shape.silhouetteMesh.geometry = dummyGeo;

        const startAttr = instGeo.getAttribute('edgeStart');
        const endAttr = instGeo.getAttribute('edgeEnd');

        let finalRenderCount = 0;

        if (type === 'Sphere' || type === 'Torus') {
            const flatEdges = [];
            if (type === 'Sphere') {
                const widthSegments = Math.floor(density * 4);
                const heightSegments = Math.floor(density * 4);
                const radius = 1;

                const targetHRings = Math.floor((heightSegments - 1) * lineDensity);
                if (targetHRings > 0) {
                    const stepH = (heightSegments - 1) / targetHRings;
                    for (let n = 0; n < targetHRings; n++) {
                        const ringIdx = Math.floor(n * stepH) + 1;
                        const v = ringIdx / heightSegments;
                        const theta = v * Math.PI;
                        const y = radius * Math.cos(theta);
                        const sinTheta = Math.sin(theta);
                        for (let j = 0; j < widthSegments; j++) {
                            const u1 = j / widthSegments; const u2 = (j + 1) / widthSegments;
                            const phi1 = u1 * 2 * Math.PI; const phi2 = u2 * 2 * Math.PI;
                            flatEdges.push(
                                -radius * Math.cos(phi1) * sinTheta, y, radius * Math.sin(phi1) * sinTheta,
                                -radius * Math.cos(phi2) * sinTheta, y, radius * Math.sin(phi2) * sinTheta
                            );
                        }
                    }
                }
                const targetVRings = Math.floor(widthSegments * lineDensity);
                if (targetVRings > 0) {
                    const stepV = widthSegments / targetVRings;
                    for (let n = 0; n < targetVRings; n++) {
                        const j = Math.floor(n * stepV);
                        const u = j / widthSegments;
                        const phi = u * 2 * Math.PI;
                        const cosPhi = -radius * Math.cos(phi);
                        const sinPhi = radius * Math.sin(phi);
                        for (let k = 0; k < heightSegments; k++) {
                            const v1 = k / heightSegments; const v2 = (k + 1) / heightSegments;
                            const theta1 = v1 * Math.PI; const theta2 = v2 * Math.PI;
                            flatEdges.push(
                                cosPhi * Math.sin(theta1), radius * Math.cos(theta1), sinPhi * Math.sin(theta1),
                                cosPhi * Math.sin(theta2), radius * Math.cos(theta2), sinPhi * Math.sin(theta2)
                            );
                        }
                    }
                }
            } else if (type === 'Torus') {
                const radius = 1; const tube = 0.4;
                const radialSegments = Math.floor(density * 2);
                const tubularSegments = Math.floor(density * 4);

                const targetMainRings = Math.floor(radialSegments * lineDensity);
                if (targetMainRings > 0) {
                    const stepM = radialSegments / targetMainRings;
                    for (let n = 0; n < targetMainRings; n++) {
                        const vIdx = Math.floor(n * stepM);
                        const v = vIdx / radialSegments * Math.PI * 2;
                        const rParam = radius + tube * Math.cos(v);
                        const zParam = tube * Math.sin(v);
                        for (let j = 0; j < tubularSegments; j++) {
                            const u1 = j / tubularSegments * Math.PI * 2;
                            const u2 = (j + 1) / tubularSegments * Math.PI * 2;
                            flatEdges.push(
                                rParam * Math.cos(u1), rParam * Math.sin(u1), zParam,
                                rParam * Math.cos(u2), rParam * Math.sin(u2), zParam
                            );
                        }
                    }
                }
                const targetTubeRings = Math.floor(tubularSegments * lineDensity);
                if (targetTubeRings > 0) {
                    const stepT = tubularSegments / targetTubeRings;
                    for (let n = 0; n < targetTubeRings; n++) {
                        const uIdx = Math.floor(n * stepT);
                        const u = uIdx / tubularSegments * Math.PI * 2;
                        const cosU = Math.cos(u); const sinU = Math.sin(u);
                        for (let j = 0; j < radialSegments; j++) {
                            const v1 = j / radialSegments * Math.PI * 2;
                            const v2 = (j + 1) / radialSegments * Math.PI * 2;
                            const rp1 = radius + tube * Math.cos(v1); const z1 = tube * Math.sin(v1);
                            const rp2 = radius + tube * Math.cos(v2); const z2 = tube * Math.sin(v2);
                            flatEdges.push(
                                rp1 * cosU, rp1 * sinU, z1,
                                rp2 * cosU, rp2 * sinU, z2
                            );
                        }
                    }
                }
            }

            finalRenderCount = Math.min(flatEdges.length / 6, this.maxEdges);
            for (let j = 0; j < finalRenderCount; j++) {
                startAttr.setXYZ(j, flatEdges[j * 6], flatEdges[j * 6 + 1], flatEdges[j * 6 + 2]);
                endAttr.setXYZ(j, flatEdges[j * 6 + 3], flatEdges[j * 6 + 4], flatEdges[j * 6 + 5]);
            }
            edgesGeo.dispose();
        } else {
            const positions = edgesGeo.attributes.position.array;
            const validCount = Math.min(edgesGeo.attributes.position.count / 2, this.maxEdges);
            edgesGeo.dispose();

            let startObj = new THREE.Vector3(); let endObj = new THREE.Vector3();
            const lineGroups = new Map();
            for (let j = 0; j < validCount; j++) {
                startObj.set(positions[j * 6], positions[j * 6 + 1], positions[j * 6 + 2]);
                endObj.set(positions[j * 6 + 3], positions[j * 6 + 4], positions[j * 6 + 5]);
                let axisGroup, indexValue;

                if (type === 'Cube' || type === 'Tetrahedron') {
                    const dx = endObj.x - startObj.x; const dy = endObj.y - startObj.y; const dz = endObj.z - startObj.z;
                    const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    let dirX = dx / dLen; let dirY = dy / dLen; let dirZ = dz / dLen;
                    if (dirX < -0.001 || (Math.abs(dirX) <= 0.001 && dirY < -0.001) || (Math.abs(dirX) <= 0.001 && Math.abs(dirY) <= 0.001 && dirZ < -0.001)) {
                        dirX = -dirX; dirY = -dirY; dirZ = -dirZ;
                    }
                    const pDotD = startObj.x * dirX + startObj.y * dirY + startObj.z * dirZ;
                    const cx = startObj.x - pDotD * dirX; const cy = startObj.y - pDotD * dirY; const cz = startObj.z - pDotD * dirZ;
                    axisGroup = `${type}_${Math.round(dirX * 10)}_${Math.round(dirY * 10)}_${Math.round(dirZ * 10)}`;
                    indexValue = Math.round((cx * 1.3 + cy * 1.7 + cz * 2.3) * 100);
                } else {
                    const nx = startObj.y * endObj.z - startObj.z * endObj.y;
                    const ny = startObj.z * endObj.x - startObj.x * endObj.z;
                    const nz = startObj.x * endObj.y - startObj.y * endObj.x;
                    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
                    if (nLen < 0.0001) {
                        axisGroup = 'Icosa_Edge'; indexValue = j;
                    } else {
                        let nX = nx / nLen; let nY = ny / nLen; let nZ = nz / nLen;
                        if (nX < -0.001 || (Math.abs(nX) <= 0.001 && nY < -0.001) || (Math.abs(nX) <= 0.001 && Math.abs(nY) <= 0.001 && nZ < -0.001)) {
                            nX = -nX; nY = -nY; nZ = -nZ;
                        }
                        axisGroup = 'Icosa';
                        indexValue = Math.round((nX * 1.3 + nY * 1.7 + nZ * 2.3) * 100);
                    }
                }
                const lineID = `${axisGroup}|${indexValue}`;
                if (!lineGroups.has(lineID)) lineGroups.set(lineID, { group: axisGroup, val: indexValue, edges: [] });
                lineGroups.get(lineID).edges.push(j);
            }
            const axisGroups = new Map();
            for (const data of lineGroups.values()) {
                if (!axisGroups.has(data.group)) axisGroups.set(data.group, []);
                axisGroups.get(data.group).push(data);
            }
            const renderedIndices = [];
            for (const items of axisGroups.values()) {
                items.sort((a, b) => a.val - b.val);
                const targetCount = Math.floor(items.length * lineDensity);
                if (targetCount > 0) {
                    const step = items.length / targetCount;
                    for (let n = 0; n < targetCount; n++) {
                        const idx = Math.floor(n * step);
                        for (const e of items[idx].edges) renderedIndices.push(e);
                    }
                }
            }
            finalRenderCount = Math.min(renderedIndices.length, this.maxEdges);
            for (let j = 0; j < finalRenderCount; j++) {
                const origIndex = renderedIndices[j];
                startAttr.setXYZ(j, positions[origIndex * 6], positions[origIndex * 6 + 1], positions[origIndex * 6 + 2]);
                endAttr.setXYZ(j, positions[origIndex * 6 + 3], positions[origIndex * 6 + 4], positions[origIndex * 6 + 5]);
            }
        }

        startAttr.needsUpdate = true;
        endAttr.needsUpdate = true;

        if (startAttr.updateRange) startAttr.updateRange.count = finalRenderCount * 3;
        if (endAttr.updateRange) endAttr.updateRange.count = finalRenderCount * 3;

        instGeo.instanceCount = finalRenderCount;
    }

    updateMeshVisibility() {
        if (!this.meshInitialized) return;
        for (let i = 0; i < this.maxPrimitives; i++) {
            const isVisible = this.params[`wireframeShape${i}Enabled`] && this.params[`wireframeShape${i}Visible`];
            this.shapes[i].mesh.visible = isVisible;
            this.shapes[i].proxyMesh.visible = isVisible && this.params[`wireframeShape${i}OccludeBack`];
            this.shapes[i].silhouetteMesh.visible = isVisible && this.params[`wireframeShape${i}SilhouetteEnabled`];
        }
    }

    setupGUI(parentFolder) {
        const folder = parentFolder.addFolder('Wireframe Shapes');
        const p = this.params;
        const u = this.uniforms;

        folder.add(p, 'wireframeShapesEnabled').name('Mod Enabled').onChange(v => {
            u.uWireframeShapesEnabled.value = v ? 1 : 0;
            if (v && !this.meshInitialized) {
                this.setupMesh();
                this.updateMaterials();
            }
            if (this.meshInitialized) {
                if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
            }
        }).listen();

        folder.add(p, 'wireframeShapesCameraType', ['Perspective', 'Orthographic']).name('Camera Type').onChange(v => {
            if (this.camera) {
                const aspect = this.sketch.width / this.sketch.height;
                if (v === 'Orthographic') {
                    const size = p.wireframeShapesCameraSize || 5.0;
                    this.camera = new THREE.OrthographicCamera(size * aspect / -2, size * aspect / 2, size / 2, size / -2, 0.1, 100);
                } else {
                    this.camera = new THREE.PerspectiveCamera(p.wireframeShapesCameraFov || 75, aspect, 0.1, 100);
                }
                this.camera.position.z = 2;
                this.passNode = pass(this.scene, this.camera);
                if (this.updateCameraControlsVisibility) this.updateCameraControlsVisibility();
                if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
            }
        }).listen();

        this.fovCtrl = folder.add(p, 'wireframeShapesCameraFov', 10, 150, 1).name('Camera FOV').onChange(v => {
            if (this.camera && this.camera.isPerspectiveCamera) {
                this.camera.fov = v;
                this.camera.updateProjectionMatrix();
                if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
            }
        }).listen();

        this.sizeCtrl = folder.add(p, 'wireframeShapesCameraSize', 1.0, 20.0, 0.1).name('Camera Size').onChange(v => {
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
            const isPersp = p.wireframeShapesCameraType !== 'Orthographic';
            if (this.fovCtrl && typeof this.fovCtrl.show === 'function') this.fovCtrl.show(isPersp);
            if (this.sizeCtrl && typeof this.sizeCtrl.show === 'function') this.sizeCtrl.show(!isPersp);
        };
        setTimeout(this.updateCameraControlsVisibility, 0);

        this.shapeFolders = [];
        this.primitivesFolder = folder.addFolder('Primitives');

        const addBtn = {
            addPrimitive: () => {
                // Auto-enable mod when adding a primitive
                if (!p.wireframeShapesEnabled) {
                    p.wireframeShapesEnabled = true;
                    u.uWireframeShapesEnabled.value = 1;
                    if (!this.meshInitialized) {
                        this.setupMesh();
                        this.updateMaterials();
                    }
                }

                // Find first disabled shape
                for (let i = 0; i < this.maxPrimitives; i++) {
                    if (!p[`wireframeShape${i}Enabled`]) {
                        p[`wireframeShape${i}Enabled`] = true;
                        p[`wireframeShape${i}Visible`] = true;
                        p[`wireframeShape${i}Type`] = 'Sphere';
                        u[`uShape${i}Enabled`].value = 1;
                        u[`uShape${i}Visible`].value = 1;
                        this.updateShapeGeometry(i);
                        this.updateMeshVisibility();
                        this.buildPrimitivesGUI();
                        if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
                        return;
                    }
                }
            }
        };

        this.addBtnController = folder.add(addBtn, 'addPrimitive').name('Add Primitive +');

        this.buildPrimitivesGUI();

        return folder;
    }

    buildPrimitivesGUI() {
        const p = this.params;
        const u = this.uniforms;

        // Remove existing folders
        while (this.shapeFolders.length > 0) {
            const f = this.shapeFolders.pop();
            f.destroy();
        }

        let activeCount = 0;

        for (let i = 0; i < this.maxPrimitives; i++) {
            if (p[`wireframeShape${i}Enabled`]) {
                activeCount++;
                const sFolder = this.primitivesFolder.addFolder(`Shape ${i + 1}`);
                this.shapeFolders.push(sFolder);

                sFolder.add(p, `wireframeShape${i}Visible`).name('Visible').onChange(v => {
                    u[`uShape${i}Visible`].value = v ? 1 : 0;
                    this.updateMeshVisibility();
                    if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
                }).listen();

                sFolder.add(p, `wireframeShape${i}Type`, ['Sphere', 'Cube', 'Tetrahedron', 'Torus']).name('Type').onChange(() => {
                    this.updateShapeGeometry(i);
                }).listen();

                sFolder.add(p, `wireframeShape${i}Density`, 1, 30, 1).name('Geometry Density').onChange(() => {
                    this.updateShapeGeometry(i);
                }).listen();
                sFolder.add(p, `wireframeShape${i}LineDensity`, 0.01, 1, 0.01).name('Line Density').onChange(() => {
                    this.updateShapeGeometry(i);
                }).listen();
                sFolder.add(p, `wireframeShape${i}Thickness`, 0.001, 0.1).name('Thickness').onChange(v => u[`uShape${i}Thickness`].value = v).listen();
                sFolder.add(p, `wireframeShape${i}OccludeBack`).name('Occlude Back Lines').onChange(() => {
                    this.updateMeshVisibility();
                    if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
                }).listen();

                sFolder.add(p, `wireframeShape${i}SilhouetteEnabled`).name('Silhouette').onChange(v => {
                    u[`uShape${i}SilhouetteEnabled`].value = v ? 1 : 0;
                    this.updateMeshVisibility();
                    if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
                }).listen();
                sFolder.add(p, `wireframeShape${i}SilhouetteThickness`, 0.0, 0.5).name('Silhouette Thickness').onChange(v => u[`uShape${i}SilhouetteThickness`].value = v).listen();

                sFolder.addColor(p, `wireframeShape${i}Color`).name('Color').onChange(v => u[`uShape${i}Color`].value.set(v)).listen();
                
                const blendModes = ['mix', 'add', 'screen', 'multiply', 'overlay', 'difference'];
                sFolder.add(p, `wireframeShape${i}BlendMode`, blendModes).name('Blend Mode').onChange(v => {
                    u[`uShape${i}BlendMode`].value = this.getBlendModeIndex(v);
                    if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
                }).listen();

                sFolder.add(p, `wireframeShape${i}Scale`, 0.1, 5).name('Scale').onChange(v => u[`uShape${i}Scale`].value = v).listen();

                const posFolder = sFolder.addFolder('Position & Rotation');
                posFolder.add(p, `wireframeShape${i}PosX`, -5, 5).name('Pos X').onChange(v => u[`uShape${i}PosX`].value = v).listen();
                posFolder.add(p, `wireframeShape${i}PosY`, -5, 5).name('Pos Y').onChange(v => u[`uShape${i}PosY`].value = v).listen();
                posFolder.add(p, `wireframeShape${i}PosZ`, -5, 5).name('Pos Z').onChange(v => u[`uShape${i}PosZ`].value = v).listen();
                posFolder.add(p, `wireframeShape${i}RotX`, -180, 180).name('Rot X').onChange(v => {
                    u[`uShape${i}RotX`].value = v * (Math.PI / 180);
                }).listen();
                posFolder.add(p, `wireframeShape${i}RotY`, -180, 180).name('Rot Y').onChange(v => {
                    u[`uShape${i}RotY`].value = v * (Math.PI / 180);
                }).listen();
                posFolder.add(p, `wireframeShape${i}RotZ`, -180, 180).name('Rot Z').onChange(v => {
                    u[`uShape${i}RotZ`].value = v * (Math.PI / 180);
                }).listen();

                const animFolder = sFolder.addFolder('Rotation Animation');
                animFolder.add(p, `wireframeShape${i}AnimRotX`).name('Anim Rot X').onChange(v => u[`uShape${i}AnimRotX`].value = v ? 1 : 0).listen();
                animFolder.add(p, `wireframeShape${i}AnimRotY`).name('Anim Rot Y').onChange(v => u[`uShape${i}AnimRotY`].value = v ? 1 : 0).listen();
                animFolder.add(p, `wireframeShape${i}AnimRotZ`).name('Anim Rot Z').onChange(v => u[`uShape${i}AnimRotZ`].value = v ? 1 : 0).listen();
                animFolder.add(p, `wireframeShape${i}AnimSpeed`, 0, 5).name('Anim Speed').onChange(v => {
                    if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
                }).listen();

                const defFolder = sFolder.addFolder('Deformation');
                defFolder.add(p, `wireframeShape${i}WarpAmount`, 0, 2).name('Warp Amount').onChange(v => u[`uShape${i}WarpAmount`].value = v).listen();
                defFolder.add(p, `wireframeShape${i}WarpFreq`, 0.1, 10).name('Warp Freq').onChange(v => u[`uShape${i}WarpFreq`].value = v).listen();
                defFolder.add(p, `wireframeShape${i}TwistAmount`, -5, 5).name('Twist').onChange(v => u[`uShape${i}TwistAmount`].value = v).listen();
                defFolder.add(p, `wireframeShape${i}PoleAmount`, -2, 2).name('Pole Attraction').onChange(v => u[`uShape${i}PoleAmount`].value = v).listen();

                const removeBtn = {
                    remove: () => {
                        p[`wireframeShape${i}Enabled`] = false;
                        u[`uShape${i}Enabled`].value = 0;
                        this.updateMeshVisibility();
                        this.buildPrimitivesGUI();
                        if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
                    }
                };
                sFolder.add(removeBtn, 'remove').name('Remove Primitive');
            }
        }

        if (activeCount >= this.maxPrimitives) {
            this.addBtnController.domElement.style.opacity = '0.5';
            this.addBtnController.domElement.style.pointerEvents = 'none';
            this.addBtnController.name('Max Primitives Reached');
        } else {
            this.addBtnController.domElement.style.opacity = '1';
            this.addBtnController.domElement.style.pointerEvents = 'auto';
            this.addBtnController.name('Add Primitive +');
        }
    }

    refreshGUI() {
        if (this.shapeFolders) {
            this.buildPrimitivesGUI();
        }
    }

    updateSpeeds(isPerfectLoop, duration, quantizeFn) {
        if (!this.uniforms) return;
        for (let i = 0; i < this.maxPrimitives; i++) {
            const uSpeed = this.uniforms[`uShape${i}AnimSpeed`];
            if (uSpeed) {
                uSpeed.value = isPerfectLoop
                    ? quantizeFn(this.params[`wireframeShape${i}AnimSpeed`], duration)
                    : this.params[`wireframeShape${i}AnimSpeed`];
            }
        }
    }

    update(delta, time) {
        if (this.uniforms && this.uniforms.uTime) {
            this.uniforms.uTime.value = time;
        }
    }

    updateUniforms(params) {
        const u = this.uniforms;
        if (params.wireframeShapesEnabled && !this.meshInitialized) {
            this.setupMesh();
            this.updateMaterials();
        }

        u.uWireframeShapesEnabled.value = params.wireframeShapesEnabled ? 1 : 0;

        if (this.camera) {
            let cameraChanged = false;
            const wantsOrtho = params.wireframeShapesCameraType === 'Orthographic';
            const isOrtho = this.camera.isOrthographicCamera;

            if (isOrtho !== wantsOrtho) {
                const aspect = this.sketch.width / this.sketch.height;
                if (wantsOrtho) {
                    const size = params.wireframeShapesCameraSize || 5.0;
                    this.camera = new THREE.OrthographicCamera(size * aspect / -2, size * aspect / 2, size / 2, size / -2, 0.1, 100);
                } else {
                    this.camera = new THREE.PerspectiveCamera(params.wireframeShapesCameraFov || 75, aspect, 0.1, 100);
                }
                this.camera.position.z = 2;
                this.passNode = pass(this.scene, this.camera);
                cameraChanged = true;
                if (this.updateCameraControlsVisibility) this.updateCameraControlsVisibility();
            } else {
                if (this.camera.isPerspectiveCamera && params.wireframeShapesCameraFov !== undefined && this.camera.fov !== params.wireframeShapesCameraFov) {
                    this.camera.fov = params.wireframeShapesCameraFov;
                    this.camera.updateProjectionMatrix();
                    cameraChanged = true;
                } else if (this.camera.isOrthographicCamera && params.wireframeShapesCameraSize !== undefined) {
                    const aspect = this.sketch.width / this.sketch.height;
                    const size = params.wireframeShapesCameraSize;
                    this.camera.left = size * aspect / -2;
                    this.camera.right = size * aspect / 2;
                    this.camera.top = size / 2;
                    this.camera.bottom = size / -2;
                    this.camera.updateProjectionMatrix();
                    cameraChanged = true;
                }
            }

            if (cameraChanged && this.sketch.updatePostProcessing) {
                // Not calling sketch.updatePostProcessing directly here normally, but let's signal it
                this.sketch.updatePostProcessing();
            }
        }
        for (let i = 0; i < this.maxPrimitives; i++) {
            u[`uShape${i}Enabled`].value = params[`wireframeShape${i}Enabled`] ? 1 : 0;
            u[`uShape${i}PosX`].value = params[`wireframeShape${i}PosX`];
            u[`uShape${i}PosY`].value = params[`wireframeShape${i}PosY`];
            u[`uShape${i}PosZ`].value = params[`wireframeShape${i}PosZ`];
            u[`uShape${i}RotX`].value = params[`wireframeShape${i}RotX`] * (Math.PI / 180);
            u[`uShape${i}RotY`].value = params[`wireframeShape${i}RotY`] * (Math.PI / 180);
            u[`uShape${i}RotZ`].value = params[`wireframeShape${i}RotZ`] * (Math.PI / 180);
            u[`uShape${i}Scale`].value = params[`wireframeShape${i}Scale`];

            u[`uShape${i}Thickness`].value = params[`wireframeShape${i}Thickness`];

            u[`uShape${i}SilhouetteEnabled`].value = params[`wireframeShape${i}SilhouetteEnabled`] ? 1 : 0;
            u[`uShape${i}SilhouetteThickness`].value = params[`wireframeShape${i}SilhouetteThickness`];

            u[`uShape${i}WarpAmount`].value = params[`wireframeShape${i}WarpAmount`];
            u[`uShape${i}WarpFreq`].value = params[`wireframeShape${i}WarpFreq`];
            u[`uShape${i}TwistAmount`].value = params[`wireframeShape${i}TwistAmount`];
            u[`uShape${i}PoleAmount`].value = params[`wireframeShape${i}PoleAmount`];

            u[`uShape${i}AnimRotX`].value = params[`wireframeShape${i}AnimRotX`] ? 1 : 0;
            u[`uShape${i}AnimRotY`].value = params[`wireframeShape${i}AnimRotY`] ? 1 : 0;
            u[`uShape${i}AnimRotZ`].value = params[`wireframeShape${i}AnimRotZ`] ? 1 : 0;
            u[`uShape${i}AnimSpeed`].value = params[`wireframeShape${i}AnimSpeed`];

            u[`uShape${i}Color`].value.set(params[`wireframeShape${i}Color`]);
            u[`uShape${i}BlendMode`].value = this.getBlendModeIndex(params[`wireframeShape${i}BlendMode`]);

            // Rebuild geometry to reflect any theme changes to type/density/lineDensity
            this.updateShapeGeometry(i);
        }

        this.updateMeshVisibility();
    }

    resize(width, height) {
        if (this.camera) {
            const aspect = width / height;
            if (this.camera.isPerspectiveCamera) {
                this.camera.aspect = aspect;
            } else if (this.camera.isOrthographicCamera) {
                const size = this.params.wireframeShapesCameraSize || 5.0;
                this.camera.left = size * aspect / -2;
                this.camera.right = size * aspect / 2;
                this.camera.top = size / 2;
                this.camera.bottom = size / -2;
            }
            this.camera.updateProjectionMatrix();
        }
    }

    dispose() {
        if (this.shapes) {
            for (const shape of this.shapes) {
                if (shape.mesh) {
                    if (shape.mesh.geometry) shape.mesh.geometry.dispose();
                    if (shape.proxyMesh && shape.proxyMesh.geometry) shape.proxyMesh.geometry.dispose();
                    if (shape.mesh.material) shape.mesh.material.dispose();
                    if (shape.proxyMaterial) shape.proxyMaterial.dispose();
                    if (shape.silhouetteMaterial) shape.silhouetteMaterial.dispose();
                }
            }
        }
    }

    getBlendModeIndex(mode) {
        const modes = ['mix', 'add', 'screen', 'multiply', 'overlay', 'difference'];
        return modes.indexOf(mode || 'mix');
    }

    buildNode(inputColorNode, uvNode) {
        if (!this.params.wireframeShapesEnabled) return inputColorNode;
        if (!this.meshInitialized) {
            this.setupMesh();
            this.updateMaterials();
        }

        return Fn(() => {
            const finalColor = vec4(inputColorNode).toVar();

            for (let i = 0; i < this.maxPrimitives; i++) {
                const isEnabled = this.uniforms[`uShape${i}Enabled`].mul(this.uniforms[`uShape${i}Visible`]);
                
                // If shape is effectively disabled, skip pass processing in the loop if possible
                // However, TSL loops with pass() might be tricky. 
                // We'll use the pass result and mix it.
                
                const pColorNode = this.passNodes[i].getTextureNode('output');
                const shapeAlpha = pColorNode.a.mul(isEnabled).mul(this.uniforms.uWireframeShapesEnabled);
                
                const baseColor = finalColor.rgb;
                const c = pColorNode.rgb;
                const blendMode = this.uniforms[`uShape${i}BlendMode`];

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

                finalColor.rgb.assign(mix(baseColor, blendResult, shapeAlpha));
            }

            return finalColor;
        })();
    }
}
