/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import * as THREE from 'three';

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
      // Harmonic Pulse (Subtle, organic luxury sphere)
      disp = idleMotion + bassSwell + midWaves + trebleRipples;
    } else if (uShapeMode == 1) {
      // Resonance Spikes (Refined crystalline facet ridges)
      float ridge = abs(sin(dir.x * 7.5 + t) * sin(dir.y * 7.5 + t) * sin(dir.z * 7.5));
      disp = idleMotion + ridge * (uVolume * s * 0.15 + 0.018) + bassSwell * 0.75 + trebleRipples;
    } else if (uShapeMode == 2) {
      // Fluid Waves (Silky liquid mercury ripple)
      float wave = sin(dir.x * 3.8 + t * 2.2 + uBass * 1.8) * cos(dir.y * 3.8 - t * 1.8 + uMid * 1.8);
      disp = idleMotion + wave * (uVolume * s * 0.12 + 0.02) + trebleRipples * 0.8;
    } else {
      // Wireframe Geodesic mode
      float facet = snoise(dir * 2.4 + t * 0.9);
      disp = idleMotion + facet * (uVolume * s * 0.1) + trebleRipples;
    }

    vDisplacement = disp;
    vWavePhase = bassSwell + midWaves;
    vRimActivity = trebleRipples * 8.0;

    // Displace vertex along outward surface normal with responsive fidelity
    vec3 displacedPosition = position + normal * disp;

    vec4 worldPos = modelMatrix * vec4(displacedPosition, 1.0);
    vWorldPosition = worldPos.xyz;

    vec4 mvPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Outer Glass Shell Fragment Shader (Sophisticated Glass & Refractive Cyan Rim)
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
    
    // Controlled Fresnel rim reflection (power 3.2 gives a delicate, crisp glass contour)
    float fresnel = pow(1.0 - NdotV, 3.2);

    // Deep crystal body: deep obsidian blue gemstone undertone blending into rich cyan/indigo
    float depthFactor = smoothstep(0.0, 0.82, NdotV);
    vec3 crystalCore = mix(uAccentColor * 0.38, uBaseColor, depthFactor);

    // Mid-frequency internal energy illumination & light scattering
    float lightScattering = (0.18 + uMid * uSensitivity * 0.32) * (1.0 - depthFactor * 0.6);
    vec3 surfaceColor = mix(crystalCore, uAccentColor, lightScattering);

    // Controlled Cyan Rim Light with subtle audio energy boost
    vec3 cyanRim = vec3(0.0, 0.88, 1.0);
    vec3 rimLight = mix(uAccentColor, mix(uPeakColor, cyanRim, 0.45), fresnel);
    
    // Treble creates fine edge highlights and active rim micro-energy
    float edgeActivity = abs(vRimActivity) + uTreble * 0.15;
    rimLight += cyanRim * edgeActivity * fresnel * 0.35;

    // Controlled speaker voice reaction (subtle tinting, preserves deep glass identity)
    float userIntensity = clamp(uInputVolume * 1.1, 0.0, 0.42);
    float geminiIntensity = clamp(uOutputVolume * 1.15, 0.0, 0.45);
    surfaceColor = mix(surfaceColor, uUserColor, userIntensity);
    surfaceColor = mix(surfaceColor, uGeminiColor, geminiIntensity);
    rimLight = mix(rimLight, uGeminiColor, geminiIntensity * 0.55);
    rimLight = mix(rimLight, uUserColor, userIntensity * 0.55);

    // Dual specular reflections (key light + fill sheen)
    vec3 keyLight = normalize(vec3(1.5, 2.0, 2.2));
    vec3 halfKey = normalize(keyLight + viewDir);
    float specPin = pow(max(dot(normal, halfKey), 0.0), 50.0) * (0.65 + uTreble * 0.35);
    float specSheen = pow(max(dot(normal, halfKey), 0.0), 9.0) * 0.1;

    // Treble micro-scintillation shimmer along glass highlights
    float shimmer = sin(uTime * 3.5 + vPosition.x * 14.0) * sin(vPosition.y * 14.0) * uTreble * 0.09;

    // Combine glass core, delicate cyan rim light, and crisp specular highlights
    vec3 finalColor = surfaceColor + rimLight * fresnel * 1.05 + (specPin + specSheen + shimmer) * vec3(0.92, 0.96, 1.0);

    // Glass translucency with realistic depth
    float alpha = 0.91 + fresnel * 0.08;
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// Inner Plasma Core Vertex & Fragment Shader (Controlled Soft Glowing Core)
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

    // MID frequency drives harmonic internal plasma swirl
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
    // Soft radial internal plasma gradient
    float dist = length(vPosition);
    float corePulse = (0.24 + uMid * 0.44) * (1.0 - smoothstep(0.04, 0.32, dist));
    
    vec3 color = mix(uAccentColor, uPeakColor, dist * 2.0);
    color = mix(color, uGeminiColor, clamp(uOutputVolume * 1.0, 0.0, 0.5));

    // Controlled soft internal glow
    float opacity = clamp(corePulse * 0.34 + uBass * 0.12, 0.06, 0.40);
    gl_FragColor = vec4(color, opacity);
  }
`;

/**
 * Refined 3D Audio-Reactive Glass/Plasma Orb Component
 */
@customElement('audio-reactive-orb')
export class AudioReactiveOrb extends LitElement {
  // Input (Microphone) Audio Node
  private _inputNode: AudioNode | null = null;
  @property({attribute: false})
  set inputNode(node: AudioNode | null) {
    this._inputNode = node;
    this.setupInputAnalyser(node);
  }
  get inputNode() {
    return this._inputNode;
  }

  // Output (Gemini Live Audio) Audio Node
  private _outputNode: AudioNode | null = null;
  @property({attribute: false})
  set outputNode(node: AudioNode | null) {
    this._outputNode = node;
    this.setupOutputAnalyser(node);
  }
  get outputNode() {
    return this._outputNode;
  }

  // Visual Theme Palette
  @property({type: String}) theme: string = 'nebula';

  // Shape deformation mode: 0: Harmonic, 1: Spikes, 2: Fluid, 3: Wireframe
  @property({type: Number}) shapeMode: number = 0;

  // Reactivity sensitivity multiplier (0.5 to 2.5)
  @property({type: Number}) sensitivity: number = 1.2;

  // Auto-rotation toggle
  @property({type: Boolean}) autoRotate: boolean = true;

  // Quick simulated audio testing mode
  @property({type: Boolean}) demoMode: boolean = false;

  // Internal reactive states for the frequency meters
  @state() private currentBass: number = 0;
  @state() private currentMid: number = 0;
  @state() private currentTreble: number = 0;
  @state() private currentVolume: number = 0;
  @state() private isInputActive: boolean = false;
  @state() private isOutputActive: boolean = false;

  // Web Audio Analysers
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private inputFreqData: Uint8Array = new Uint8Array(64);
  private outputFreqData: Uint8Array = new Uint8Array(64);

  // Smooth lerped audio parameters
  private smoothBass = 0;
  private smoothMid = 0;
  private smoothTreble = 0;
  private smoothVolume = 0;
  private smoothInputVol = 0;
  private smoothOutputVol = 0;

  // Three.js instances
  private canvasContainer!: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private orbMesh!: THREE.Mesh;
  private orbMaterial!: THREE.ShaderMaterial;
  private innerCoreMesh!: THREE.Mesh;
  private innerCoreMaterial!: THREE.ShaderMaterial;
  private particlesMesh!: THREE.Points;
  private particlesGeometry!: THREE.BufferGeometry;
  private particlePositions!: Float32Array;
  private particleBasePositions!: Float32Array;
  private particleSpeeds!: Float32Array;
  private particleLayers!: Float32Array;
  private animationFrameId: number = 0;
  private clock: THREE.Clock = new THREE.Clock();

  // Smooth inertial drag interaction
  private isDragging = false;
  private previousMousePosition = {x: 0, y: 0};
  private targetRotation = new THREE.Vector2(0, 0);
  private currentRotation = new THREE.Vector2(0, 0);
  private lastMetricDispatch = 0;

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

    /* Soft atmospheric ambient glow behind the orb (controlled, subtle aura) */
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
    window.addEventListener('resize', this.handleResize);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.handleResize);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
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

    // 1. Scene
    this.scene = new THREE.Scene();

    // 2. Camera centered with comfortable breathing space & viewport scaling
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 1000);
    const zDist = aspect < 1.0 ? 5.8 / Math.max(0.55, aspect * 1.15) : 5.8;
    this.camera.position.set(0, 0, zDist);
    this.camera.lookAt(0, 0, 0);

    // 3. WebGL Renderer with filmic tone mapping
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.canvasContainer.appendChild(this.renderer.domElement);

    const theme = ORB_THEMES[this.theme] || ORB_THEMES.nebula;

    // 4. Outer Glass Orb (Increased by ~20% from 0.50 to 0.60, keeping comfortable spacing around it)
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
      depthWrite: true,
    });

    this.orbMesh = new THREE.Mesh(orbGeometry, this.orbMaterial);
    this.orbMesh.position.set(0, 0, 0);
    this.scene.add(this.orbMesh);

    // 5. Inner Floating Plasma Core (radius 0.31, proportional depth)
    const coreGeometry = new THREE.IcosahedronGeometry(0.31, 32);
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
    this.scene.add(this.innerCoreMesh);

    // 6. Volumetric 3D Spherical Particle Field (not a flat circular ring)
    // Particles emanate from the orb with 3D depth, varying shell depths and speeds
    const particleCount = 420;
    this.particlesGeometry = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(particleCount * 3);
    this.particleBasePositions = new Float32Array(particleCount * 3);
    this.particleSpeeds = new Float32Array(particleCount);
    this.particleLayers = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      // Natural volumetric distribution around the orb (radius 0.78 to 1.55)
      // Cube root of random gives a natural volumetric density distribution
      const rRatio = Math.pow(Math.random(), 0.65);
      const radius = 0.78 + rRatio * 0.75;
      
      // True 3D spherical coordinates (Fibonacci-like random spherical distribution)
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

      // Unique frequency response speed and radial layer
      this.particleSpeeds[i] = 0.5 + Math.random() * 1.5;
      this.particleLayers[i] = radius;
    }

    this.particlesGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePositions, 3),
    );

    const particleMaterial = new THREE.PointsMaterial({
      color: theme.particleColor,
      size: 0.022,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particlesMesh = new THREE.Points(this.particlesGeometry, particleMaterial);
    this.scene.add(this.particlesMesh);
  }

  private setupMouseEvents() {
    const el = this.canvasContainer;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      this.isDragging = true;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      this.previousMousePosition = {x: clientX, y: clientY};
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!this.isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - this.previousMousePosition.x;
      const deltaY = clientY - this.previousMousePosition.y;

      // Subtle, refined drag sensitivity
      this.targetRotation.y += deltaX * 0.0028;
      this.targetRotation.x += deltaY * 0.0028;

      this.previousMousePosition = {x: clientX, y: clientY};
    };

    const onPointerUp = () => {
      this.isDragging = false;
    };

    el.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    el.addEventListener('touchstart', onPointerDown, {passive: true});
    window.addEventListener('touchmove', onPointerMove, {passive: true});
    window.addEventListener('touchend', onPointerUp);
  }

  private handleResize = () => {
    if (!this.renderer || !this.camera || !this.canvasContainer) return;
    const width = this.canvasContainer.clientWidth || window.innerWidth;
    const height = this.canvasContainer.clientHeight || window.innerHeight;
    const aspect = width / height;

    this.camera.aspect = aspect;
    if (aspect < 1.0) {
      this.camera.position.z = 5.8 / Math.max(0.55, aspect * 1.15);
    } else {
      this.camera.position.z = 5.8;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private updateAudioMetrics() {
    let rawBass = 0;
    let rawMid = 0;
    let rawTreble = 0;
    let rawInputVol = 0;
    let rawOutputVol = 0;

    // Process user input audio (Microphone)
    if (this.inputAnalyser) {
      this.inputAnalyser.getByteFrequencyData(this.inputFreqData);
      let sum = 0;
      for (let i = 0; i < this.inputFreqData.length; i++) {
        sum += this.inputFreqData[i];
      }
      rawInputVol = sum / (this.inputFreqData.length * 255);
    }

    // Process Gemini Live model output audio
    if (this.outputAnalyser) {
      this.outputAnalyser.getByteFrequencyData(this.outputFreqData);
      let sum = 0;
      for (let i = 0; i < this.outputFreqData.length; i++) {
        sum += this.outputFreqData[i];
      }
      rawOutputVol = sum / (this.outputFreqData.length * 255);
    }

    // Frequency band extraction
    const maxFreqCount = Math.max(this.inputFreqData.length, this.outputFreqData.length);
    if (maxFreqCount > 0) {
      // BASS: bins 1 to 4 (~60Hz - 350Hz) -> Low-frequency movement
      let bassSum = 0;
      let bassCount = 0;
      for (let i = 1; i <= 4; i++) {
        bassSum += (this.inputFreqData[i] || 0) + (this.outputFreqData[i] || 0) * 1.2;
        bassCount++;
      }
      rawBass = bassSum / (bassCount * 255);

      // MID: bins 5 to 16 (~400Hz - 2000Hz) -> Internal plasma motion
      let midSum = 0;
      let midCount = 0;
      for (let i = 5; i <= 16; i++) {
        midSum += (this.inputFreqData[i] || 0) + (this.outputFreqData[i] || 0) * 1.2;
        midCount++;
      }
      rawMid = midSum / (midCount * 255);

      // TREBLE: bins 17 to 32 (~2000Hz - 6000Hz) -> Fine particles & shimmer
      let trebleSum = 0;
      let trebleCount = 0;
      for (let i = 17; i <= 32; i++) {
        trebleSum += (this.inputFreqData[i] || 0) + (this.outputFreqData[i] || 0) * 1.2;
        trebleCount++;
      }
      rawTreble = trebleSum / (trebleCount * 255);
    }

    // Synthesized demo audio pulse mode for quick testing
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

    // Smooth lerping with snappy attack and smooth organic decay
    const attack = 0.32;
    const release = 0.07;

    this.smoothBass += (rawBass - this.smoothBass) * (rawBass > this.smoothBass ? attack : release);
    this.smoothMid += (rawMid - this.smoothMid) * (rawMid > this.smoothMid ? attack : release);
    this.smoothTreble += (rawTreble - this.smoothTreble) * (rawTreble > this.smoothTreble ? attack : release);

    const totalRawVol = Math.max(rawInputVol, rawOutputVol * 1.1);
    this.smoothVolume += (totalRawVol - this.smoothVolume) * (totalRawVol > this.smoothVolume ? attack : release);
    this.smoothInputVol += (rawInputVol - this.smoothInputVol) * 0.2;
    this.smoothOutputVol += (rawOutputVol - this.smoothOutputVol) * 0.2;

    // Update HUD metrics and emit reactive audio metrics event for control panel
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

  private runRenderLoop = () => {
    this.animationFrameId = requestAnimationFrame(this.runRenderLoop);

    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();

    this.updateAudioMetrics();

    // Subtle, smooth auto-rotation
    if (this.autoRotate && !this.isDragging) {
      this.targetRotation.y += delta * (0.12 + this.smoothVolume * 0.18);
      this.targetRotation.x = Math.sin(elapsedTime * 0.35) * 0.08;
    }

    // Silky damping inertia
    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.05;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.05;

    if (this.orbMesh) {
      this.orbMesh.rotation.x = this.currentRotation.x;
      this.orbMesh.rotation.y = this.currentRotation.y;

      // Update glass outer shell uniforms
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

      // BASS gently influences low-frequency radial scale breathing
      const scaleMultiplier = 1.0 + this.smoothBass * this.sensitivity * 0.09 + this.smoothVolume * 0.04;
      this.orbMesh.scale.setScalar(scaleMultiplier);

      // MID directly influences internal plasma core motion & lighting
      if (this.innerCoreMesh && this.innerCoreMaterial) {
        this.innerCoreMesh.rotation.x = -this.currentRotation.x * 0.8 + elapsedTime * 0.2;
        this.innerCoreMesh.rotation.y = -this.currentRotation.y * 0.8 + elapsedTime * (0.35 + this.smoothMid * 0.4);

        const cu = this.innerCoreMaterial.uniforms;
        cu.uTime.value = elapsedTime;
        cu.uMid.value = this.smoothMid;
        cu.uBass.value = this.smoothBass;
        cu.uOutputVolume.value = this.smoothOutputVol;
        cu.uSensitivity.value = this.sensitivity;

        // Core gently expands with mid-frequency energy
        this.innerCoreMesh.scale.setScalar(scaleMultiplier * (0.92 + this.smoothMid * 0.12));
      }

      // TREBLE, BASS & MID physics on volumetric stardust particles:
      // - Particles exist in a subtle 3D volumetric field generated by the orb's energy
      // - Bass: particles expand outward
      // - Mid: particles create subtle flowing waves
      // - Treble: smaller particles become active and energetic
      // - Quiet audio: particles contract toward the orb
      // - Loud audio: particles disperse further into the environment
      if (this.particlesMesh && this.particlePositions) {
        this.particlesMesh.rotation.y = -elapsedTime * (0.07 + this.smoothTreble * 0.12);
        this.particlesMesh.rotation.x = Math.cos(elapsedTime * 0.18) * 0.06;

        const positions = this.particlesGeometry.attributes.position.array as Float32Array;
        const count = positions.length / 3;

        // Base contraction when quiet (contracts towards the orb ~0.88), expands with volume & bass up to 1.35
        const loudnessFactor = this.smoothVolume * this.sensitivity;
        const bassExpansion = this.smoothBass * this.sensitivity * 0.28;
        const contractionBase = 0.90 + loudnessFactor * 0.32;

        for (let i = 0; i < count; i++) {
          const idx = i * 3;
          const speed = this.particleSpeeds[i] || 1.0;
          const bx = this.particleBasePositions[idx];
          const by = this.particleBasePositions[idx + 1];
          const bz = this.particleBasePositions[idx + 2];

          // Mid flowing harmonic wave along particle trajectory
          const midWave = Math.sin(elapsedTime * (1.5 * speed) + bx * 2.5 + by * 2.5) * (this.smoothMid * 0.06);

          // Treble high-frequency agitation and micro-dispersion
          const trebleJitter = Math.cos(elapsedTime * (4.0 * speed) + bz * 4.0) * (this.smoothTreble * 0.04);

          // Radial expansion calculation
          const radialMultiplier = contractionBase + bassExpansion * (0.8 + 0.4 * speed) + midWave + trebleJitter;

          positions[idx] = bx * radialMultiplier;
          positions[idx + 1] = by * radialMultiplier;
          positions[idx + 2] = bz * radialMultiplier;
        }
        this.particlesGeometry.attributes.position.needsUpdate = true;
      }
    }

    this.renderer.render(this.scene, this.camera);
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

    // Atmospheric backdrop glow (soft, controlled, not blinding)
    const glowOpacity = 0.22 + this.currentVolume * 0.0035 + this.smoothBass * 0.14;

    return html`
      <!-- Soft atmospheric glow behind the orb -->
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
