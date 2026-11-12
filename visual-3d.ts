/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {fs as backdropFS, vs as backdropVS} from './backdrop-shader';
import {vs as sphereVS} from './sphere-shader';
import {
  afterDraw,
  createContactShadowTexture,
  createStudioEnvironment,
  detectSoftwareGl,
} from './three-utils';

// Module-scope scratch math helpers (zero per-frame GC allocations)
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _vec3 = new THREE.Vector3();

/**
 * 3D live audio visual (Classic composite procedural scene).
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private camera!: THREE.PerspectiveCamera;
  private scene!: THREE.Scene;
  private renderer!: THREE.WebGLRenderer;
  private backdrop!: THREE.Mesh;
  private composer: EffectComposer | null = null;
  private visualGroup!: THREE.Group;
  private sphere!: THREE.Mesh;
  private collarMesh!: THREE.Mesh;
  private orbitalWaveMesh!: THREE.Mesh;
  private envMapTexture: THREE.Texture | null = null;
  private shadowTexture: THREE.CanvasTexture | null = null;
  private isSoftwareGl = false;
  private animationFrameId = 0;
  private timerIds = new Set<number>();
  private isDisposed = false;
  private clock = new THREE.Clock();
  private rotation = new THREE.Vector3(0, 0, 0);

  private _outputNode!: AudioNode;

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode!: AudioNode;

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  private canvas!: HTMLCanvasElement;

  static styles = css`
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.isDisposed = false;
    window.addEventListener('resize', this.handleResize);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.isDisposed = true;
    window.removeEventListener('resize', this.handleResize);

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
    for (const id of this.timerIds) {
      window.clearTimeout(id);
    }
    this.timerIds.clear();

    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
    }
    this.envMapTexture?.dispose();
    this.shadowTexture?.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
  }

  private init() {
    this.isSoftwareGl = detectSoftwareGl();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100c14);
    scene.fog = new THREE.FogExp2(0x100c14, 0.045);
    this.scene = scene;

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: {value: new THREE.Vector2(1, 1)},
          rand: {value: 0},
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      }),
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);
    this.backdrop = backdrop;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(2, -1.2, 5);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !this.isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    // Zero-dependency procedural studio environment & balanced 3-point warm/cool lighting
    this.envMapTexture = createStudioEnvironment(renderer);
    scene.environment = this.envMapTexture;

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x100c14, 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.9);
    keyLight.position.set(3.5, 4.5, 3.5);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.camera.left = -3;
    keyLight.shadow.camera.right = 3;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6366f1, 1.1);
    rimLight.position.set(-4, -2, -3);
    scene.add(rimLight);

    // Composite 4-Part Procedural Model (THREE.Group)
    this.visualGroup = new THREE.Group();
    scene.add(this.visualGroup);

    // Part 1: Audio-Reactive Displaced Core Sphere
    const geometry = new THREE.IcosahedronGeometry(1, 10);
    const sphereMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x091326,
      metalness: 0.72,
      roughness: 0.16,
      clearcoat: 0.85,
      clearcoatRoughness: 0.1,
      emissive: 0x0b1a3a,
      emissiveIntensity: 0.9,
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = {value: 0};
      shader.uniforms.inputData = {value: new THREE.Vector4()};
      shader.uniforms.outputData = {value: new THREE.Vector4()};
      sphereMaterial.userData.shader = shader;
      shader.vertexShader = sphereVS;
    };

    const sphere = new THREE.Mesh(geometry, sphereMaterial);
    sphere.castShadow = !this.isSoftwareGl;
    this.visualGroup.add(sphere);
    this.sphere = sphere;

    // Part 2: Sculpted Acoustic Ring Collar (LatheGeometry, higher matte roughness)
    const lathePoints = [
      new THREE.Vector2(1.22, -0.045),
      new THREE.Vector2(1.34, -0.06),
      new THREE.Vector2(1.38, 0),
      new THREE.Vector2(1.34, 0.06),
      new THREE.Vector2(1.22, 0.045),
    ];
    const collarGeo = new THREE.LatheGeometry(lathePoints, 48);
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      metalness: 0.35,
      roughness: 0.58,
    });
    this.collarMesh = new THREE.Mesh(collarGeo, collarMat);
    this.collarMesh.rotation.x = Math.PI * 0.18;
    this.visualGroup.add(this.collarMesh);

    // Part 3: Brushed Metallic Harmonic Wave Loop (TubeGeometry along 3D curve)
    const wavePts: THREE.Vector3[] = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      wavePts.push(
        new THREE.Vector3(
          Math.cos(a) * 1.52,
          Math.sin(a * 3) * 0.16,
          Math.sin(a) * 1.52,
        ),
      );
    }
    const waveGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wavePts, true), 96, 0.02, 12, true);
    const waveMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.88,
      roughness: 0.24,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
    });
    this.orbitalWaveMesh = new THREE.Mesh(waveGeo, waveMat);
    this.orbitalWaveMesh.rotation.z = -0.35;
    this.visualGroup.add(this.orbitalWaveMesh);

    // Part 4: Grounding Contact Shadow Plane beneath assembly
    this.shadowTexture = createContactShadowTexture(renderer);
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 3.8),
      new THREE.MeshBasicMaterial({
        map: this.shadowTexture,
        transparent: true,
        depthWrite: false,
        opacity: 0.42,
      }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.75;
    scene.add(shadowPlane);

    // Skip multi-pass EffectComposer on software WebGL to avoid CPU frame stalls
    if (!this.isSoftwareGl) {
      const renderPass = new RenderPass(scene, camera);
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.35,
        0.45,
        0.2,
      );
      const composer = new EffectComposer(renderer);
      composer.addPass(renderPass);
      composer.addPass(bloomPass);
      this.composer = composer;
      renderer.compile(scene, camera);
    }

    this.handleResize();
    this.animation();
  }

  private handleResize = () => {
    if (!this.renderer || !this.camera || !this.backdrop) return;
    const dPR = this.renderer.getPixelRatio();
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    (this.backdrop.material as THREE.RawShaderMaterial).uniforms.resolution.value.set(
      w * dPR,
      h * dPR,
    );
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  };

  private scheduleNextFrame() {
    if (this.isDisposed) return;
    if (this.isSoftwareGl) {
      afterDraw(this.renderer, this.animation, (id) => {
        this.timerIds.add(id);
      });
    } else {
      this.animationFrameId = requestAnimationFrame(this.animation);
    }
  }

  private animation = () => {
    if (this.isDisposed) return;

    if (this.inputAnalyser) this.inputAnalyser.update();
    if (this.outputAnalyser) this.outputAnalyser.update();

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const dt = delta * 60;
    const backdropMaterial = this.backdrop.material as THREE.RawShaderMaterial;
    const sphereMaterial = this.sphere.material as THREE.MeshPhysicalMaterial;

    backdropMaterial.uniforms.rand.value = Math.random() * 10000;

    const in0 = (this.inputAnalyser?.data?.[0] ?? 0) / 255;
    const in1 = (this.inputAnalyser?.data?.[1] ?? 0) / 255;
    const in2 = (this.inputAnalyser?.data?.[2] ?? 0) / 255;
    const out0 = (this.outputAnalyser?.data?.[0] ?? 0) / 255;
    const out1 = (this.outputAnalyser?.data?.[1] ?? 0) / 255;
    const out2 = (this.outputAnalyser?.data?.[2] ?? 0) / 255;

    if (sphereMaterial.userData.shader) {
      this.sphere.scale.setScalar(1 + 0.2 * out1);

      const f = 0.001;
      this.rotation.x += dt * f * (0.2 + 0.5 * out1);
      this.rotation.z += dt * f * 0.5 * in1;
      this.rotation.y += dt * f * (0.25 + 0.25 * (in2 + out2));

      _euler.set(this.rotation.x, this.rotation.y, this.rotation.z);
      _quat.setFromEuler(_euler);
      _vec3.set(0, 0, 5).applyQuaternion(_quat);
      this.camera.position.copy(_vec3);
      this.camera.lookAt(this.visualGroup.position);

      this.collarMesh.rotation.y += delta * (0.35 + out1 * 0.8);
      this.orbitalWaveMesh.rotation.y -= delta * (0.45 + in1 * 0.9);

      sphereMaterial.userData.shader.uniforms.time.value += dt * (0.015 + 0.1 * out0);
      sphereMaterial.userData.shader.uniforms.inputData.value.set(in0, 0.1 * in1, 10 * in2, 0);
      sphereMaterial.userData.shader.uniforms.outputData.value.set(2 * out0, 0.1 * out1, 10 * out2, 0);
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    this.scheduleNextFrame();
  };

  protected firstUpdated() {
    this.canvas = this.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-3d': GdmLiveAudioVisuals3D;
  }
}
