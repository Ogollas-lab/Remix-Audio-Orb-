/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

/**
 * Detect software WebGL renderers (SwiftShader, llvmpipe, WARP) via the
 * WebGL2 renderer string so rendering cost can be tuned without altering scene content.
 */
export function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

/**
 * Pace continuous render loops on software WebGL using a GPU fence sync
 * followed by an 80ms breather so the main thread and UI stay responsive.
 */
export function afterDraw(
  renderer: THREE.WebGLRenderer,
  cb: () => void,
  registerTimer: (id: number) => void,
): void {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  if (!gl || gl.isContextLost?.() || typeof gl.fenceSync !== 'function') {
    registerTimer(window.setTimeout(cb, 80));
    return;
  }

  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();

  const poll = () => {
    if (gl.isContextLost?.()) {
      if (sync) gl.deleteSync(sync);
      return;
    }
    const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
    if (state === gl.UNSIGNALED) {
      registerTimer(window.setTimeout(poll, 5));
    } else {
      if (sync) gl.deleteSync(sync);
      registerTimer(window.setTimeout(cb, 80));
    }
  };

  registerTimer(window.setTimeout(poll, 5));
}

/**
 * Generate a zero-dependency procedural RoomEnvironment reflection map.
 */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envRoom = new RoomEnvironment();
  const renderTarget = pmremGenerator.fromScene(envRoom, 0.04);
  envRoom.dispose();
  pmremGenerator.dispose();
  return renderTarget.texture;
}

/**
 * Generate a procedural soft radial glow texture for volumetric particles.
 */
export function createSoftParticleTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.28, 'rgba(224, 242, 254, 0.82)');
    gradient.addColorStop(0.62, 'rgba(125, 211, 252, 0.25)');
    gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generate a procedural soft radial contact shadow texture for grounded assemblies.
 */
export function createContactShadowTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 2, half, half, half);
    gradient.addColorStop(0.0, 'rgba(0, 0, 0, 0.72)');
    gradient.addColorStop(0.45, 'rgba(0, 0, 0, 0.34)');
    gradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.08)');
    gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}
