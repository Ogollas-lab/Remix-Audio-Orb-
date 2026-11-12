/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import * as THREE from 'three';
import {
  afterDraw,
  createSoftParticleTexture,
  createStudioEnvironment,
  detectSoftwareGl,
} from './three-utils';

/**
 * Visual Color Palettes for the Glass/Plasma Orb
 */
export interface OrbTheme {
  name: string;
  id: string;
  baseColor: THREE.Color;
  accentColor: THREE.Color;
  peakColor: THREE.Color;
  geminiColor: THREE.Color;
  userColor: THREE.Color;
  particleColor: THREE.Color;
  ambientGlowColor: string;
}

export const ORB_THEMES: Record<string, OrbTheme> = {
  nebula: {
    name: 'Cosmic Nebula',
    id: 'nebula',
    baseColor: new THREE.Color('#0b0716'),
    accentColor: new THREE.Color('#5b21b6'),
    peakColor: new THREE.Color('#38bdf8'),
    geminiColor: new THREE.Color('#06b6d4'),
    userColor: new THREE.Color('#e11d48'),
    particleColor: new THREE.Color('#c084fc'),
    ambientGlowColor: 'rgba(109, 40, 217, 0.22)',
  },
  solar: {
    name: 'Solar Plasma',
    id: 'solar',
    baseColor: new THREE.Color('#140703'),
    accentColor: new THREE.Color('#b91c1c'),
    peakColor: new THREE.Color('#fbbf24'),
    geminiColor: new THREE.Color('#d97706'),
    userColor: new THREE.Color('#dc2626'),
    particleColor: new THREE.Color('#fb923c'),
    ambientGlowColor: 'rgba(185, 28, 28, 0.2)',
  },
  aurora: {
    name: 'Cyber Aurora',
    id: 'aurora',
    baseColor: new THREE.Color('#021415'),
    accentColor: new THREE.Color('#047857'),
    peakColor: new THREE.Color('#22d3ee'),
    geminiColor: new THREE.Color('#10b981'),
    userColor: new THREE.Color('#7c3aed'),
    particleColor: new THREE.Color('#34d399'),
    ambientGlowColor: 'rgba(4, 120, 87, 0.2)',
  },
  amethyst: {
    name: 'Amethyst Quartz',
    id: 'amethyst',
    baseColor: new THREE.Color('#11051b'),
    accentColor: new THREE.Color('#7e22ce'),
    peakColor: new THREE.Color('#f472b6'),
    geminiColor: new THREE.Color('#a855f7'),
    userColor: new THREE.Color('#f43f5e'),
    particleColor: new THREE.Color('#e879f9'),
    ambientGlowColor: 'rgba(126, 34, 206, 0.22)',
  },
  abyss: {
    name: 'Ocean Abyss',
    id: 'abyss',
    baseColor: new THREE.Color('#020f1c'),
    accentColor: new THREE.Color('#0369a1'),
    peakColor: new THREE.Color('#38bdf8'),
    geminiColor: new THREE.Color('#0ea5e9'),
    userColor: new THREE.Color('#0d9488'),
    particleColor: new THREE.Color('#67e8f9'),
    ambientGlowColor: 'rgba(3, 105, 161, 0.2)',
  },
};

// Module-scope scratch math helpers (zero per-frame GC allocations)
const _dummy = new THREE.Object3D();
const _vec3 = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _tmpColor = new THREE.Color();

// Outer Glass Shell Vertex Shader
const glassVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uVolume;
  uniform float uInputVolume;
  uniform float uOutputVolume;
  uniform float uSensitivity;
  uniform int uShapeMode; // 0: Harmonic, 1: Spikes, 2: Fluid, 3: Wireframe

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying float vDisplacement;
  varying float vWavePhase;
  varying float vRimActivity;

  // Simplex 3D noise
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0 );
    vec4 p = permute( permute( permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    vec3 dir = normalize(position);
    float t = uTime * 0.7;
    float disp = 0.0;
    float s = uSensitivity;

    // Organic idle breathing motion - very gentle and calm when audio is quiet
    float idleMotion = sin(t * 1.2 + position.y * 2.2) * 0.016 + cos(t * 0.9 + position.x * 2.2) * 0.012;

    // 1. BASS: large-scale smooth volumetric expansion & low-frequency swelling deformation
    float bassSwell = snoise(dir * 1.4 + vec3(0.0, 0.0, t * 0.8)) * (uBass * s * 0.16);

    // 2. MID: flowing waves & harmonic ripples across the orb surface
    float midWaves = snoise(dir * 2.8 + vec3(t * 1.3, t * 0.4, 0.0)) * (uMid * s * 0.09)
                   + sin(dir.x * 4.5 + dir.y * 4.0 + t * 2.2) * (uMid * s * 0.035);

    // 3. TREBLE: fine high-frequency ripples, edge activity, and micro-shimmer
    float trebleRipples = sin(dir.y * 18.0 + dir.z * 12.0 + t * 4.5) * (uTreble * s * 0.025)
                        + snoise(dir * 8.0 + vec3(0.0, t * 3.0, 0.0)) * (uTreble * s * 0.015);

    if (uShapeMode == 0) {
      disp = idleMotion + bassSwell + midWaves + trebleRipples;
    } else if (uShapeMode == 1) {
      float ridge = abs(sin(dir.x * 7.5 + t) * sin(dir.y * 7.5 + t) * sin(dir.z * 7.5));
      disp = idleMotion + ridge * (uVolume * s * 0.15 + 0.018) + bassSwell * 0.75 + trebleRipples;
    } else if (uShapeMode == 2) {
      float wave = sin(dir.x * 3.8 + t * 2.2 + uBass * 1.8) * cos(dir.y * 3.8 - t * 1.8 + uMid * 1.8);
      disp = idleMotion + wave * (uVolume * s * 0.12 + 0.02) + trebleRipples * 0.8;
    } else {
      float facet = snoise(dir * 2.4 + t * 0.9);
      disp = idleMotion + facet * (uVolume * s * 0.1) + trebleRipples;
    }

    vDisplacement = disp;
    vWavePhase = bassSwell + midWaves;
    vRimActivity = trebleRipples * 8.0;

    vec3 displacedPosition = position + normal * disp;

    vec4 worldPos = modelMatrix * vec4(displacedPosition, 1.0);
    vWorldPosition = worldPos.xyz;

    vec4 mvPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Outer Glass Shell Fragment Shader
const glassFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uVolume;
  uniform float uInputVolume;
  uniform float uOutputVolume;
  uniform vec3 uBaseColor;
  uniform vec3 uAccentColor;
  uniform vec3 uPeakColor;
  uniform vec3 uGeminiColor;
  uniform vec3 uUserColor;
  uniform float uSensitivity;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying float vDisplacement;
  varying float vWavePhase;
  varying float vRimActivity;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    float NdotV = max(dot(normal, viewDir), 0.0);
    float fresnel = pow(1.0 - NdotV, 3.2);

    float depthFactor = smoothstep(0.0, 0.82, NdotV);
    vec3 crystalCore = mix(uAccentColor * 0.38, uBaseColor, depthFactor);

    float lightScattering = (0.18 + uMid * uSensitivity * 0.32) * (1.0 - depthFactor * 0.6);
    vec3 surfaceColor = mix(crystalCore, uAccentColor, lightScattering);

    vec3 cyanRim = vec3(0.0, 0.88, 1.0);
    vec3 rimLight = mix(uAccentColor, mix(uPeakColor, cyanRim, 0.45), fresnel);

    float edgeActivity = abs(vRimActivity) + uTreble * 0.15;
    rimLight += cyanRim * edgeActivity * fresnel * 0.35;

    float userIntensity = clamp(uInputVolume * 1.1, 0.0, 0.42);
    float geminiIntensity = clamp(uOutputVolume * 1.15, 0.0, 0.45);
    surfaceColor = mix(surfaceColor, uUserColor, userIntensity);
    surfaceColor = mix(surfaceColor, uGeminiColor, geminiIntensity);
    rimLight = mix(rimLight, uGeminiColor, geminiIntensity * 0.55);
    rimLight = mix(rimLight, uUserColor, userIntensity * 0.55);

    vec3 keyLight = normalize(vec3(1.5, 2.0, 2.2));
    vec3 halfKey = normalize(keyLight + viewDir);
    float specPin = pow(max(dot(normal, halfKey), 0.0), 50.0) * (0.65 + uTreble * 0.35);
    float specSheen = pow(max(dot(normal, halfKey), 0.0), 9.0) * 0.1;

    float shimmer = sin(uTime * 3.5 + vPosition.x * 14.0) * sin(vPosition.y * 14.0) * uTreble * 0.09;

    vec3 finalColor = surfaceColor + rimLight * fresnel * 1.05 + (specPin + specSheen + shimmer) * vec3(0.92, 0.96, 1.0);

    float alpha = 0.88 + fresnel * 0.10;
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// Inner Plasma Core Shaders
const coreVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMid;
  uniform float uBass;
  uniform float uSensitivity;

  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    float swirl = sin(position.x * 4.5 + uTime * 2.2) * cos(position.y * 4.5 - uTime * 2.0) * (uMid * uSensitivity * 0.09 + 0.015);
    vec3 displaced = position + normal * swirl;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const coreFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uMid;
  uniform float uBass;
  uniform vec3 uAccentColor;
  uniform vec3 uPeakColor;
  uniform vec3 uGeminiColor;
  uniform float uOutputVolume;

  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    float dist = length(vPosition);
    float corePulse = (0.24 + uMid * 0.44) * (1.0 - smoothstep(0.04, 0.32, dist));

    vec3 color = mix(uAccentColor, uPeakColor, dist * 2.0);
    color = mix(color, uGeminiColor, clamp(uOutputVolume * 1.0, 0.0, 0.5));

    float opacity = clamp(corePulse * 0.34 + uBass * 0.12, 0.06, 0.42);
    gl_FragColor = vec4(color, opacity);
  }
`;

/**
 * Refined 3D Audio-Reactive Glass/Plasma Orb Component
 * Features a 6-part composite procedural assembly with studio RoomEnvironment PBR reflections
 * and software-WebGL frame pacing.
 */
@customElement('audio-reactive-orb')
export class AudioReactiveOrb extends LitElement {
  private _inputNode: AudioNode | null = null;
  @property({attribute: false})
  set inputNode(node: AudioNode | null) {
    this._inputNode = node;
    this.setupInputAnalyser(node);
  }
  get inputNode() {
    return this._inputNode;
  }

  private _outputNode: AudioNode | null = null;
  @property({attribute: false})
  set outputNode(node: AudioNode | null) {
    this._outputNode = node;
    this.setupOutputAnalyser(node);
  }
  get outputNode() {
    return this._outputNode;
  }

  @property({type: String}) theme: string = 'nebula';
  @property({type: Number}) shapeMode: number = 0;
  @property({type: Number}) sensitivity: number = 1.2;
  @property({type: Boolean}) autoRotate: boolean = true;
  @property({type: Boolean}) demoMode: boolean = false;

  @state() private currentBass: number = 0;
  @state() private currentMid: number = 0;
  @state() private currentTreble: number = 0;
  @state() private currentVolume: number = 0;
  @state() private isInputActive: boolean = false;
  @state() private isOutputActive: boolean = false;

  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private inputFreqData: Uint8Array<ArrayBuffer> = new Uint8Array(64);
  private outputFreqData: Uint8Array<ArrayBuffer> = new Uint8Array(64);

  private smoothBass = 0;
  private smoothMid = 0;
  private smoothTreble = 0;
  private smoothVolume = 0;
  private smoothInputVol = 0;
  private smoothOutputVol = 0;

  private canvasContainer!: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private envMapTexture: THREE.Texture | null = null;
  private particleSpriteTexture: THREE.CanvasTexture | null = null;
  private isSoftwareGl = false;

  // Composite 6-Part Procedural Assembly
  private orbAssemblyGroup!: THREE.Group;
  private orbMesh!: THREE.Mesh;
  private orbMaterial!: THREE.ShaderMaterial;
  private innerCoreMesh!: THREE.Mesh;
  private innerCoreMaterial!: THREE.ShaderMaterial;
  private collarMesh!: THREE.Mesh;
  private collarMaterial!: THREE.MeshPhysicalMaterial;
  private gyroRingMesh!: THREE.Mesh;
  private gyroMaterial!: THREE.MeshPhysicalMaterial;
  private arcMeshA!: THREE.Mesh;
  private arcMeshB!: THREE.Mesh;
  private arcMaterial!: THREE.MeshPhysicalMaterial;
  private resonatorInstancedMesh!: THREE.InstancedMesh;
  private resonatorMaterial!: THREE.MeshPhysicalMaterial;
  private resonatorBaseDirs: Float32Array = new Float32Array(0);
  private resonatorPhases: Float32Array = new Float32Array(0);

  // Volumetric 3D particle field
  private particlesMesh!: THREE.Points;
  private particlesGeometry!: THREE.BufferGeometry;
  private particlePositions!: Float32Array;
  private particleBasePositions!: Float32Array;
  private particleSpeeds!: Float32Array;

  private animationFrameId: number = 0;
  private timerIds = new Set<number>();
  private isDisposed = false;
  private clock: THREE.Clock = new THREE.Clock();

  private isDragging = false;
  private previousMousePosition = {x: 0, y: 0};
  private targetRotation = new THREE.Vector2(0, 0);
  private currentRotation = new THREE.Vector2(0, 0);
  private lastMetricDispatch = 0;

  private pointerDownHandler?: (e: MouseEvent | TouchEvent) => void;
  private pointerMoveHandler?: (e: MouseEvent | TouchEvent) => void;
  private pointerUpHandler?: () => void;

  static styles = css`
    :host {
      display: block;
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      user-select: none;
      background: radial-gradient(circle at center, #0b0716 0%, #030206 100%);
    }

    .canvas-container {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      touch-action: none;
    }

    canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
    }

    .ambient-glow {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 320px;
      height: 320px;
      max-width: 52vw;
      max-height: 52vh;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(109, 40, 217, 0.16) 0%, rgba(6, 182, 212, 0.05) 50%, transparent 70%);
      pointer-events: none;
      filter: blur(65px);
      transition: background 0.8s ease, opacity 0.5s ease;
      z-index: 1;
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

    if (this.canvasContainer && this.pointerDownHandler) {
      this.canvasContainer.removeEventListener('mousedown', this.pointerDownHandler);
      this.canvasContainer.removeEventListener('touchstart', this.pointerDownHandler);
    }
    if (this.pointerMoveHandler) {
      window.removeEventListener('mousemove', this.pointerMoveHandler);
      window.removeEventListener('touchmove', this.pointerMoveHandler);
    }
    if (this.pointerUpHandler) {
      window.removeEventListener('mouseup', this.pointerUpHandler);
      window.removeEventListener('touchend', this.pointerUpHandler);
    }

    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
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
    this.particleSpriteTexture?.dispose();
    if (this.renderer) {
      this.renderer.dispose();
    }
  }

  protected firstUpdated() {
    this.canvasContainer = this.shadowRoot!.querySelector('.canvas-container') as HTMLDivElement;
    this.initThree();
    this.setupMouseEvents();
    this.runRenderLoop();
  }

  protected updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);
    if (changedProperties.has('theme')) {
      this.setTheme(this.theme);
    }
    if (changedProperties.has('shapeMode')) {
      this.setShapeMode(this.shapeMode);
    }
    if (changedProperties.has('sensitivity') && this.orbMaterial) {
      this.orbMaterial.uniforms.uSensitivity.value = this.sensitivity;
      if (this.innerCoreMaterial) {
        this.innerCoreMaterial.uniforms.uSensitivity.value = this.sensitivity;
      }
    }
  }

  private setupInputAnalyser(node: AudioNode | null) {
    if (!node) {
      this.inputAnalyser = null;
      return;
    }
    try {
      this.inputAnalyser = node.context.createAnalyser();
      this.inputAnalyser.fftSize = 128;
      this.inputAnalyser.smoothingTimeConstant = 0.8;
      this.inputFreqData = new Uint8Array(this.inputAnalyser.frequencyBinCount);
      node.connect(this.inputAnalyser);
    } catch (e) {
      console.warn('Could not connect input analyser:', e);
    }
  }

  private setupOutputAnalyser(node: AudioNode | null) {
    if (!node) {
      this.outputAnalyser = null;
      return;
    }
    try {
      this.outputAnalyser = node.context.createAnalyser();
      this.outputAnalyser.fftSize = 128;
      this.outputAnalyser.smoothingTimeConstant = 0.8;
      this.outputFreqData = new Uint8Array(this.outputAnalyser.frequencyBinCount);
      node.connect(this.outputAnalyser);
    } catch (e) {
      console.warn('Could not connect output analyser:', e);
    }
  }

  private initThree() {
    const width = this.canvasContainer.clientWidth || window.innerWidth;
    const height = this.canvasContainer.clientHeight || window.innerHeight;
    const aspect = width / height;

    this.isSoftwareGl = detectSoftwareGl();

    // 1. Scene + Horizon-Matched Atmospheric Fog
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05030b, 0.055);

    // 2. Camera centered with comfortable breathing space & viewport scaling
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 1000);
    const zDist = aspect < 1.0 ? 5.8 / Math.max(0.55, aspect * 1.15) : 5.8;
    this.camera.position.set(0, 0, zDist);
    this.camera.lookAt(0, 0, 0);

    // 3. WebGL Renderer with Software-WebGL guard and ACES Filmic Color Pipeline
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvasContainer.appendChild(this.renderer.domElement);

    // 4. Studio Environment Map & Warm/Cool 3-Point Lighting Rig
    this.envMapTexture = createStudioEnvironment(this.renderer);
    this.scene.environment = this.envMapTexture;

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x090616, 0.9);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.85);
    keyLight.position.set(3.2, 4.0, 3.6);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.camera.left = -2.2;
    keyLight.shadow.camera.right = 2.2;
    keyLight.shadow.camera.top = 2.2;
    keyLight.shadow.camera.bottom = -2.2;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x8b5cf6, 1.05);
    rimLight.position.set(-3.5, -2.0, -3.2);
    this.scene.add(rimLight);

    const theme = ORB_THEMES[this.theme] || ORB_THEMES.nebula;

    // 5. Composite 6-Part Procedural Orb Assembly (THREE.Group)
    this.orbAssemblyGroup = new THREE.Group();
    this.scene.add(this.orbAssemblyGroup);

    // Part 1: Outer Glass/Plasma Shell (primary silhouette)
    const orbGeometry = new THREE.IcosahedronGeometry(0.60, 48);
    this.orbMaterial = new THREE.ShaderMaterial({
      vertexShader: glassVertexShader,
      fragmentShader: glassFragmentShader,
      uniforms: {
        uTime: {value: 0},
        uBass: {value: 0},
        uMid: {value: 0},
        uTreble: {value: 0},
        uVolume: {value: 0},
        uInputVolume: {value: 0},
        uOutputVolume: {value: 0},
        uSensitivity: {value: this.sensitivity},
        uShapeMode: {value: this.shapeMode},
        uBaseColor: {value: theme.baseColor.clone()},
        uAccentColor: {value: theme.accentColor.clone()},
        uPeakColor: {value: theme.peakColor.clone()},
        uGeminiColor: {value: theme.geminiColor.clone()},
        uUserColor: {value: theme.userColor.clone()},
      },
      wireframe: this.shapeMode === 3,
      transparent: true,
      depthWrite: false,
    });
    this.orbMesh = new THREE.Mesh(orbGeometry, this.orbMaterial);
    this.orbMesh.renderOrder = 2;
    this.orbAssemblyGroup.add(this.orbMesh);

    // Part 2: Inner Floating Plasma Core
    const coreGeometry = new THREE.IcosahedronGeometry(0.30, 32);
    this.innerCoreMaterial = new THREE.ShaderMaterial({
      vertexShader: coreVertexShader,
      fragmentShader: coreFragmentShader,
      uniforms: {
        uTime: {value: 0},
        uMid: {value: 0},
        uBass: {value: 0},
        uSensitivity: {value: this.sensitivity},
        uAccentColor: {value: theme.accentColor.clone()},
        uPeakColor: {value: theme.peakColor.clone()},
        uGeminiColor: {value: theme.geminiColor.clone()},
        uOutputVolume: {value: 0},
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.innerCoreMesh = new THREE.Mesh(coreGeometry, this.innerCoreMaterial);
    this.innerCoreMesh.renderOrder = 1;
    this.orbAssemblyGroup.add(this.innerCoreMesh);

    // Part 3: Sculpted Acoustic Lens Collar (LatheGeometry, matte-satin contrast)
    const lathePoints = [
      new THREE.Vector2(0.34, -0.025),
      new THREE.Vector2(0.39, -0.032),
      new THREE.Vector2(0.415, -0.012),
      new THREE.Vector2(0.415, 0.012),
      new THREE.Vector2(0.39, 0.032),
      new THREE.Vector2(0.34, 0.025),
    ];
    const collarGeometry = new THREE.LatheGeometry(lathePoints, 48);
    this.collarMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.baseColor.clone().lerp(theme.accentColor, 0.45),
      metalness: 0.35,
      roughness: 0.62,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
    });
    this.collarMesh = new THREE.Mesh(collarGeometry, this.collarMaterial);
    this.collarMesh.rotation.x = Math.PI * 0.14;
    this.orbAssemblyGroup.add(this.collarMesh);

    // Part 4: Brushed Titanium Equatorial Gyro Ring (distinct high metalness / low roughness)
    const gyroGeometry = new THREE.TorusGeometry(0.76, 0.012, 16, 96);
    this.gyroMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      metalness: 0.92,
      roughness: 0.22,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      emissive: theme.peakColor.clone(),
      emissiveIntensity: 0.14,
    });
    this.gyroRingMesh = new THREE.Mesh(gyroGeometry, this.gyroMaterial);
    this.gyroRingMesh.rotation.x = Math.PI * 0.44;
    this.gyroRingMesh.rotation.y = Math.PI * 0.12;
    this.orbAssemblyGroup.add(this.gyroRingMesh);

    // Part 5: Dual Inclined Harmonic Resonance Arcs (TubeGeometry along 3D CatmullRomCurve3)
    const buildOrbitalArc = (radius: number, tilt: number) => {
      const pts: THREE.Vector3[] = [];
      const segments = 24;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const wobble = Math.sin(angle * 3) * 0.025;
        pts.push(
          new THREE.Vector3(
            Math.cos(angle) * (radius + wobble),
            Math.sin(angle) * Math.sin(tilt) * (radius * 0.36),
            Math.sin(angle) * (radius + wobble),
          ),
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts, true);
      return new THREE.TubeGeometry(curve, 96, 0.0065, 10, true);
    };
    this.arcMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.peakColor.clone().lerp(new THREE.Color('#e2e8f0'), 0.45),
      metalness: 0.85,
      roughness: 0.28,
      emissive: theme.accentColor.clone(),
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.72,
    });
    this.arcMeshA = new THREE.Mesh(buildOrbitalArc(0.84, 0.65), this.arcMaterial);
    this.arcMeshA.rotation.z = 0.48;
    this.arcMeshB = new THREE.Mesh(buildOrbitalArc(0.89, -0.58), this.arcMaterial);
    this.arcMeshB.rotation.z = -0.62;
    this.orbAssemblyGroup.add(this.arcMeshA, this.arcMeshB);

    // Part 6: Instanced Beveled Crystal Resonator Fins (ExtrudeGeometry + InstancedMesh, 24 nodes)
    const finShape = new THREE.Shape();
    finShape.moveTo(0, -0.024);
    finShape.lineTo(0.011, 0);
    finShape.lineTo(0, 0.024);
    finShape.lineTo(-0.011, 0);
    finShape.closePath();

    const finGeometry = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.014,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
    });
    finGeometry.center();

    this.resonatorMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.76,
      roughness: 0.34,
      clearcoat: 0.75,
      emissive: theme.peakColor.clone(),
      emissiveIntensity: 0.16,
    });

    const nodeCount = 24;
    this.resonatorInstancedMesh = new THREE.InstancedMesh(
      finGeometry,
      this.resonatorMaterial,
      nodeCount,
    );
    this.resonatorInstancedMesh.frustumCulled = false;
    this.resonatorBaseDirs = new Float32Array(nodeCount * 3);
    this.resonatorPhases = new Float32Array(nodeCount);

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < nodeCount; i++) {
      const y = 1 - (i / (nodeCount - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      const dx = Math.cos(theta) * r;
      const dy = y;
      const dz = Math.sin(theta) * r;

      this.resonatorBaseDirs[i * 3] = dx;
      this.resonatorBaseDirs[i * 3 + 1] = dy;
      this.resonatorBaseDirs[i * 3 + 2] = dz;
      this.resonatorPhases[i] = i * 0.42;

      _vec3.set(dx, dy, dz).multiplyScalar(0.86);
      _dummy.position.copy(_vec3);
      _quat.setFromUnitVectors(_upVec, _vec3.clone().normalize());
      _dummy.quaternion.copy(_quat);
      const scaleJitter = 0.85 + ((i * 7) % 5) * 0.07;
      _dummy.scale.setScalar(scaleJitter);
      _dummy.updateMatrix();
      this.resonatorInstancedMesh.setMatrixAt(i, _dummy.matrix);

      _tmpColor.copy(theme.peakColor).lerp(theme.accentColor, (i % 4) * 0.2);
      this.resonatorInstancedMesh.setColorAt(i, _tmpColor);
    }
    this.resonatorInstancedMesh.instanceMatrix.needsUpdate = true;
    if (this.resonatorInstancedMesh.instanceColor) {
      this.resonatorInstancedMesh.instanceColor.needsUpdate = true;
    }
    this.resonatorInstancedMesh.computeBoundingSphere();
    this.orbAssemblyGroup.add(this.resonatorInstancedMesh);

    // 7. Volumetric 3D Spherical Particle Field with Procedural Radial Soft Texture
    const particleCount = 420;
    this.particlesGeometry = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(particleCount * 3);
    this.particleBasePositions = new Float32Array(particleCount * 3);
    this.particleSpeeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const rRatio = Math.pow(Math.random(), 0.65);
      const radius = 0.80 + rRatio * 0.78;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const sinPhi = Math.sin(phi);

      const x = radius * sinPhi * Math.cos(theta);
      const y = radius * sinPhi * Math.sin(theta);
      const z = radius * Math.cos(phi);

      this.particleBasePositions[i * 3] = x;
      this.particleBasePositions[i * 3 + 1] = y;
      this.particleBasePositions[i * 3 + 2] = z;

      this.particlePositions[i * 3] = x;
      this.particlePositions[i * 3 + 1] = y;
      this.particlePositions[i * 3 + 2] = z;

      this.particleSpeeds[i] = 0.5 + Math.random() * 1.5;
    }

    this.particlesGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePositions, 3),
    );

    this.particleSpriteTexture = createSoftParticleTexture(this.renderer);
    const particleMaterial = new THREE.PointsMaterial({
      color: theme.particleColor,
      map: this.particleSpriteTexture,
      size: 0.044,
      transparent: true,
      opacity: 0.72,
      alphaTest: 0.01,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particlesMesh = new THREE.Points(this.particlesGeometry, particleMaterial);
    this.scene.add(this.particlesMesh);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private setupMouseEvents() {
    const el = this.canvasContainer;

    this.pointerDownHandler = (e: MouseEvent | TouchEvent) => {
      this.isDragging = true;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      this.previousMousePosition = {x: clientX, y: clientY};
    };

    this.pointerMoveHandler = (e: MouseEvent | TouchEvent) => {
      if (!this.isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - this.previousMousePosition.x;
      const deltaY = clientY - this.previousMousePosition.y;

      this.targetRotation.y += deltaX * 0.0028;
      this.targetRotation.x += deltaY * 0.0028;

      this.previousMousePosition = {x: clientX, y: clientY};
    };

    this.pointerUpHandler = () => {
      this.isDragging = false;
    };

    el.addEventListener('mousedown', this.pointerDownHandler);
    window.addEventListener('mousemove', this.pointerMoveHandler);
    window.addEventListener('mouseup', this.pointerUpHandler);

    el.addEventListener('touchstart', this.pointerDownHandler, {passive: true});
    window.addEventListener('touchmove', this.pointerMoveHandler, {passive: true});
    window.addEventListener('touchend', this.pointerUpHandler);
  }

  private handleResize = () => {
    if (!this.renderer || !this.camera || !this.canvasContainer) return;
    const width = this.canvasContainer.clientWidth || window.innerWidth;
    const height = this.canvasContainer.clientHeight || window.innerHeight;
    const aspect = width / height;

    this.camera.aspect = aspect;
    this.camera.position.z = aspect < 1.0 ? 5.8 / Math.max(0.55, aspect * 1.15) : 5.8;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private updateAudioMetrics(delta: number) {
    let rawBass = 0;
    let rawMid = 0;
    let rawTreble = 0;
    let rawInputVol = 0;
    let rawOutputVol = 0;

    if (this.inputAnalyser) {
      this.inputAnalyser.getByteFrequencyData(this.inputFreqData);
      let sum = 0;
      for (let i = 0; i < this.inputFreqData.length; i++) {
        sum += this.inputFreqData[i];
      }
      rawInputVol = sum / (this.inputFreqData.length * 255);
    }

    if (this.outputAnalyser) {
      this.outputAnalyser.getByteFrequencyData(this.outputFreqData);
      let sum = 0;
      for (let i = 0; i < this.outputFreqData.length; i++) {
        sum += this.outputFreqData[i];
      }
      rawOutputVol = sum / (this.outputFreqData.length * 255);
    }

    const maxFreqCount = Math.max(this.inputFreqData.length, this.outputFreqData.length);
    if (maxFreqCount > 0) {
      let bassSum = 0;
      for (let i = 1; i <= 4; i++) {
        bassSum += (this.inputFreqData[i] || 0) + (this.outputFreqData[i] || 0) * 1.2;
      }
      rawBass = bassSum / (4 * 255);

      let midSum = 0;
      for (let i = 5; i <= 16; i++) {
        midSum += (this.inputFreqData[i] || 0) + (this.outputFreqData[i] || 0) * 1.2;
      }
      rawMid = midSum / (12 * 255);

      let trebleSum = 0;
      for (let i = 17; i <= 32; i++) {
        trebleSum += (this.inputFreqData[i] || 0) + (this.outputFreqData[i] || 0) * 1.2;
      }
      rawTreble = trebleSum / (16 * 255);
    }

    if (this.demoMode) {
      const now = performance.now() * 0.003;
      const beat = Math.pow(Math.max(0, Math.sin(now * 3.2)), 3.5);
      const voice = (Math.sin(now * 5.5) * 0.5 + 0.5) * (Math.sin(now * 1.6) * 0.5 + 0.5);
      const shimmer = Math.pow(Math.max(0, Math.cos(now * 6.8)), 4) * 0.6;

      rawBass = Math.max(rawBass, beat * 0.75);
      rawMid = Math.max(rawMid, voice * 0.65);
      rawTreble = Math.max(rawTreble, shimmer * 0.55);
      rawOutputVol = Math.max(rawOutputVol, (beat * 0.35 + voice * 0.65) * 0.7);
    }

    // Frame-rate independent exponential smoothing
    const dt = Math.min(delta, 0.1);
    const attackAlpha = 1 - Math.exp(-18 * dt);
    const releaseAlpha = 1 - Math.exp(-4.2 * dt);

    this.smoothBass += (rawBass - this.smoothBass) * (rawBass > this.smoothBass ? attackAlpha : releaseAlpha);
    this.smoothMid += (rawMid - this.smoothMid) * (rawMid > this.smoothMid ? attackAlpha : releaseAlpha);
    this.smoothTreble += (rawTreble - this.smoothTreble) * (rawTreble > this.smoothTreble ? attackAlpha : releaseAlpha);

    const totalRawVol = Math.max(rawInputVol, rawOutputVol * 1.1);
    this.smoothVolume += (totalRawVol - this.smoothVolume) * (totalRawVol > this.smoothVolume ? attackAlpha : releaseAlpha);
    const voiceAlpha = 1 - Math.exp(-10 * dt);
    this.smoothInputVol += (rawInputVol - this.smoothInputVol) * voiceAlpha;
    this.smoothOutputVol += (rawOutputVol - this.smoothOutputVol) * voiceAlpha;

    const nowMs = performance.now();
    if (nowMs - this.lastMetricDispatch > 35) {
      this.lastMetricDispatch = nowMs;
      this.currentBass = Math.min(100, Math.round(this.smoothBass * 100));
      this.currentMid = Math.min(100, Math.round(this.smoothMid * 100));
      this.currentTreble = Math.min(100, Math.round(this.smoothTreble * 100));
      this.currentVolume = Math.min(100, Math.round(this.smoothVolume * 100));
      this.isInputActive = this.smoothInputVol > 0.04;
      this.isOutputActive = this.smoothOutputVol > 0.04;

      this.dispatchEvent(
        new CustomEvent('audiometrics', {
          bubbles: true,
          composed: true,
          detail: {
            bass: this.currentBass,
            mid: this.currentMid,
            treble: this.currentTreble,
            volume: this.currentVolume,
            inputActive: this.isInputActive,
            outputActive: this.isOutputActive,
          },
        }),
      );
    }
  }

  private scheduleNextFrame() {
    if (this.isDisposed) return;
    if (this.isSoftwareGl) {
      afterDraw(this.renderer, this.runRenderLoop, (id) => {
        this.timerIds.add(id);
      });
    } else {
      this.animationFrameId = requestAnimationFrame(this.runRenderLoop);
    }
  }

  private runRenderLoop = () => {
    if (this.isDisposed) return;

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    this.updateAudioMetrics(delta);

    if (this.autoRotate && !this.isDragging) {
      this.targetRotation.y += delta * (0.12 + this.smoothVolume * 0.18);
      this.targetRotation.x = Math.sin(elapsedTime * 0.35) * 0.08;
    }

    // Frame-rate independent exponential damping for rotation inertia
    const dampAlpha = 1 - Math.exp(-5.5 * delta);
    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * dampAlpha;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * dampAlpha;

    if (this.orbAssemblyGroup && this.orbMesh) {
      this.orbAssemblyGroup.rotation.x = this.currentRotation.x;
      this.orbAssemblyGroup.rotation.y = this.currentRotation.y;

      const u = this.orbMaterial.uniforms;
      u.uTime.value = elapsedTime;
      u.uBass.value = this.smoothBass;
      u.uMid.value = this.smoothMid;
      u.uTreble.value = this.smoothTreble;
      u.uVolume.value = this.smoothVolume;
      u.uInputVolume.value = this.smoothInputVol;
      u.uOutputVolume.value = this.smoothOutputVol;
      u.uSensitivity.value = this.sensitivity;
      u.uShapeMode.value = this.shapeMode;

      const scaleMultiplier =
        1.0 + this.smoothBass * this.sensitivity * 0.09 + this.smoothVolume * 0.04;
      this.orbMesh.scale.setScalar(scaleMultiplier);

      if (this.innerCoreMesh && this.innerCoreMaterial) {
        this.innerCoreMesh.rotation.x = elapsedTime * 0.22;
        this.innerCoreMesh.rotation.y = elapsedTime * (0.35 + this.smoothMid * 0.4);

        const cu = this.innerCoreMaterial.uniforms;
        cu.uTime.value = elapsedTime;
        cu.uMid.value = this.smoothMid;
        cu.uBass.value = this.smoothBass;
        cu.uOutputVolume.value = this.smoothOutputVol;
        cu.uSensitivity.value = this.sensitivity;

        this.innerCoreMesh.scale.setScalar(scaleMultiplier * (0.92 + this.smoothMid * 0.12));
      }

      if (this.collarMesh) {
        this.collarMesh.rotation.y = elapsedTime * (0.28 + this.smoothMid * 0.35);
      }

      if (this.gyroRingMesh) {
        this.gyroRingMesh.rotation.z = elapsedTime * (0.2 + this.smoothBass * 0.45);
        this.gyroRingMesh.scale.setScalar(1.0 + this.smoothBass * 0.06);
      }

      if (this.arcMeshA && this.arcMeshB) {
        this.arcMeshA.rotation.y = elapsedTime * (0.18 + this.smoothMid * 0.3);
        this.arcMeshB.rotation.y = -elapsedTime * (0.22 + this.smoothTreble * 0.35);
      }

      if (this.resonatorInstancedMesh) {
        const count = this.resonatorInstancedMesh.count;
        const bassRadial = this.smoothBass * this.sensitivity * 0.12;
        for (let i = 0; i < count; i++) {
          const dx = this.resonatorBaseDirs[i * 3];
          const dy = this.resonatorBaseDirs[i * 3 + 1];
          const dz = this.resonatorBaseDirs[i * 3 + 2];
          const phase = this.resonatorPhases[i];
          const wave = Math.sin(elapsedTime * 2.2 + phase) * (0.015 + this.smoothMid * 0.045);
          const dist = 0.86 + bassRadial + wave;

          _vec3.set(dx, dy, dz);
          _dummy.position.copy(_vec3).multiplyScalar(dist);
          _quat.setFromUnitVectors(_upVec, _vec3);
          _dummy.quaternion.copy(_quat);
          const nodeScale = 0.85 + this.smoothTreble * 0.45 + ((i * 7) % 5) * 0.04;
          _dummy.scale.setScalar(nodeScale);
          _dummy.updateMatrix();
          this.resonatorInstancedMesh.setMatrixAt(i, _dummy.matrix);
        }
        this.resonatorInstancedMesh.instanceMatrix.needsUpdate = true;
      }

      if (this.particlesMesh && this.particlePositions) {
        this.particlesMesh.rotation.y = -elapsedTime * (0.07 + this.smoothTreble * 0.12);
        this.particlesMesh.rotation.x = Math.cos(elapsedTime * 0.18) * 0.06;

        const positions = this.particlesGeometry.attributes.position.array as Float32Array;
        const count = positions.length / 3;

        const loudnessFactor = this.smoothVolume * this.sensitivity;
        const bassExpansion = this.smoothBass * this.sensitivity * 0.28;
        const contractionBase = 0.90 + loudnessFactor * 0.32;

        for (let i = 0; i < count; i++) {
          const idx = i * 3;
          const speed = this.particleSpeeds[i] || 1.0;
          const bx = this.particleBasePositions[idx];
          const by = this.particleBasePositions[idx + 1];
          const bz = this.particleBasePositions[idx + 2];

          const midWave = Math.sin(elapsedTime * (1.5 * speed) + bx * 2.5 + by * 2.5) * (this.smoothMid * 0.06);
          const trebleJitter = Math.cos(elapsedTime * (4.0 * speed) + bz * 4.0) * (this.smoothTreble * 0.04);
          const radialMultiplier = contractionBase + bassExpansion * (0.8 + 0.4 * speed) + midWave + trebleJitter;

          positions[idx] = bx * radialMultiplier;
          positions[idx + 1] = by * radialMultiplier;
          positions[idx + 2] = bz * radialMultiplier;
        }
        this.particlesGeometry.attributes.position.needsUpdate = true;
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  };

  public setTheme(themeId: string) {
    if (!ORB_THEMES[themeId]) return;
    this.theme = themeId;
    const t = ORB_THEMES[themeId];
    if (this.orbMaterial) {
      this.orbMaterial.uniforms.uBaseColor.value.copy(t.baseColor);
      this.orbMaterial.uniforms.uAccentColor.value.copy(t.accentColor);
      this.orbMaterial.uniforms.uPeakColor.value.copy(t.peakColor);
      this.orbMaterial.uniforms.uGeminiColor.value.copy(t.geminiColor);
      this.orbMaterial.uniforms.uUserColor.value.copy(t.userColor);
    }
    if (this.innerCoreMaterial) {
      this.innerCoreMaterial.uniforms.uAccentColor.value.copy(t.accentColor);
      this.innerCoreMaterial.uniforms.uPeakColor.value.copy(t.peakColor);
      this.innerCoreMaterial.uniforms.uGeminiColor.value.copy(t.geminiColor);
    }
    if (this.collarMaterial) {
      this.collarMaterial.color.copy(t.baseColor).lerp(t.accentColor, 0.45);
    }
    if (this.gyroMaterial) {
      this.gyroMaterial.emissive.copy(t.peakColor);
    }
    if (this.arcMaterial) {
      this.arcMaterial.color.copy(t.peakColor).lerp(_tmpColor.set('#e2e8f0'), 0.45);
      this.arcMaterial.emissive.copy(t.accentColor);
    }
    if (this.resonatorMaterial) {
      this.resonatorMaterial.emissive.copy(t.peakColor);
    }
    if (this.resonatorInstancedMesh) {
      for (let i = 0; i < this.resonatorInstancedMesh.count; i++) {
        _tmpColor.copy(t.peakColor).lerp(t.accentColor, (i % 4) * 0.2);
        this.resonatorInstancedMesh.setColorAt(i, _tmpColor);
      }
      if (this.resonatorInstancedMesh.instanceColor) {
        this.resonatorInstancedMesh.instanceColor.needsUpdate = true;
      }
    }
    if (this.particlesMesh) {
      (this.particlesMesh.material as THREE.PointsMaterial).color.copy(t.particleColor);
    }
  }

  public setShapeMode(mode: number) {
    this.shapeMode = mode;
    if (this.orbMaterial) {
      this.orbMaterial.uniforms.uShapeMode.value = mode;
      this.orbMaterial.wireframe = mode === 3;
    }
  }

  render() {
    const currentTheme = ORB_THEMES[this.theme] || ORB_THEMES.nebula;
    const glowOpacity = 0.22 + this.currentVolume * 0.0035 + this.smoothBass * 0.14;

    return html`
      <div
        class="ambient-glow"
        style="background: radial-gradient(circle, ${currentTheme.ambientGlowColor} 0%, transparent 68%); opacity: ${glowOpacity};"
      ></div>

      <div class="canvas-container"></div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'audio-reactive-orb': AudioReactiveOrb;
  }
}
