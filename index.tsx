/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';
import './audio-reactive-orb';
import {GroundingResult, GroundingService} from './grounding-service';
import {ORB_THEMES} from './audio-reactive-orb';

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
  time: string;
}

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  // Live API States
  @state() isRecording = false;
  @state() status = 'Initializing gemini-3.8-live...';
  @state() error = '';
  @state() visualizerMode: 'reactive-orb' | 'classic-3d' = 'reactive-orb';
  @state() selectedVoice = 'Zephyr';
  @state() isConnected = false;
  @state() transcripts: ChatMessage[] = [];

  // Orb customization state
  @state() orbTheme = 'nebula';
  @state() orbShapeMode = 0;
  @state() orbSensitivity = 1.2;
  @state() orbAutoRotate = true;
  @state() orbDemoMode = false;

  // Audio reactive metrics for Control Panel
  @state() private audioBass = 0;
  @state() private audioMid = 0;
  @state() private audioTreble = 0;
  @state() private audioVolume = 0;
  @state() private isInputAudioActive = false;
  @state() private isOutputAudioActive = false;

  // Header and Drawer UI States
  @state() isOverflowMenuOpen = false;
  @state() isGroundingDrawerOpen = false;
  @state() activeGroundingTab: 'search' | 'maps' | 'customize' | 'settings' | 'transcripts' = 'search';
  @state() isGroundingLoading = false;
  @state() groundingQuery = '';
  @state() groundingResult: GroundingResult | null = null;
  @state() groundingError = '';
  @state() isSpeakingGrounding = false;

  private client: GoogleGenAI;
  private session: Session;
  private groundingService = new GroundingService();

  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});

  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private speechUtterance: SpeechSynthesisUtterance | null = null;
  private ttsOscillator: OscillatorNode | null = null;

  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      position: relative;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #fff;
      background: #06030c;
    }

    /* ==========================================================================
       Clean Professional Header
       ========================================================================== */
    .app-header {
      position: absolute;
      top: 0.9rem;
      left: 1.25rem;
      right: 1.25rem;
      height: 48px;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0 0.85rem;
      background: rgba(14, 10, 26, 0.78);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      pointer-events: auto;
      user-select: none;
      box-sizing: border-box;
      max-width: calc(100vw - 2.5rem);
      margin: 0 auto;
    }

    /* Left: Logo + Name + Status */
    .header-left {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      flex-shrink: 0;
    }

    .brand-link {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      text-decoration: none;
      color: #fff;
    }

    .brand-icon {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #38bdf8, #6c2bd9 75%);
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.55);
      flex-shrink: 0;
      position: relative;
    }

    .brand-icon::after {
      content: '';
      position: absolute;
      inset: 3px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.35);
      filter: blur(2px);
    }

    .brand-name {
      font-weight: 600;
      font-size: 0.88rem;
      letter-spacing: -0.01em;
      color: #f8fafc;
      white-space: nowrap;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.38rem;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.72rem;
      font-weight: 500;
      color: #cbd5e1;
      white-space: nowrap;
    }

    .status-badge .dot {
      width: 6.5px;
      height: 6.5px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      flex-shrink: 0;
    }

    .status-badge.connecting .dot {
      background: #f59e0b;
      box-shadow: 0 0 8px #f59e0b;
    }

    .status-badge.recording .dot {
      background: #f43f5e;
      box-shadow: 0 0 10px #f43f5e;
      animation: pulse-dot 1s infinite alternate;
    }

    @keyframes pulse-dot {
      from { transform: scale(0.9); opacity: 0.7; }
      to { transform: scale(1.3); opacity: 1; }
    }

    /* Center: Current Mode / Status */
    .header-center {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      padding: 0 0.5rem;
      min-width: 0;
    }

    .mode-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 0.28rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.72rem;
      color: #94a3b8;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mode-pill strong {
      color: #e2e8f0;
      font-weight: 500;
    }

    /* Right: Actions */
    .header-right {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      flex-shrink: 0;
    }

    .header-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
      padding: 0.32rem 0.65rem;
      border-radius: 8px;
      font-size: 0.74rem;
      font-weight: 500;
      cursor: pointer;
      backdrop-filter: blur(12px);
      transition: all 0.18s ease;
      white-space: nowrap;
      outline: none;
      flex-shrink: 0;
    }

    .header-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(56, 189, 248, 0.4);
      color: #fff;
      transform: translateY(-1px);
    }

    .header-btn:active {
      transform: translateY(0);
    }

    .header-btn.active {
      background: rgba(56, 189, 248, 0.18);
      border-color: rgba(56, 189, 248, 0.55);
      color: #38bdf8;
    }

    .header-btn svg {
      flex-shrink: 0;
    }

    /* Mobile / Responsive Overflow Toggle */
    .menu-toggle-btn {
      display: none;
      align-items: center;
      gap: 0.35rem;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #e2e8f0;
      padding: 0.32rem 0.65rem;
      border-radius: 8px;
      font-size: 0.74rem;
      font-weight: 500;
      cursor: pointer;
      outline: none;
      transition: all 0.18s;
      flex-shrink: 0;
    }

    .menu-toggle-btn:hover,
    .menu-toggle-btn.active {
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
    }

    /* Overflow Dropdown Menu */
    .overflow-menu {
      position: absolute;
      top: 56px;
      right: 1.25rem;
      background: rgba(18, 14, 34, 0.95);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 12px;
      padding: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      width: 220px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
      z-index: 60;
      animation: menu-appear 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes menu-appear {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .menu-item-btn {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      background: transparent;
      border: none;
      color: #cbd5e1;
      padding: 0.55rem 0.75rem;
      border-radius: 8px;
      font-size: 0.8rem;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s;
      width: 100%;
    }

    .menu-item-btn:hover {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
    }

    .menu-item-btn.active {
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      font-weight: 500;
    }

    .menu-divider {
      height: 1px;
      background: rgba(255, 255, 255, 0.08);
      margin: 0.2rem 0;
    }

    /* Responsive Breakpoints */
    @media (max-width: 980px) {
      .header-center {
        display: none;
      }
    }

    @media (max-width: 840px) {
      .desktop-only {
        display: none !important;
      }
      .menu-toggle-btn {
        display: inline-flex;
      }
    }

    @media (max-width: 560px) {
      .brand-name {
        display: none;
      }
      .app-header {
        left: 0.6rem;
        right: 0.6rem;
        top: 0.6rem;
        padding: 0 0.6rem;
        height: 44px;
        max-width: calc(100vw - 1.2rem);
      }
      .header-btn {
        padding: 0.32rem 0.5rem;
        font-size: 0.7rem;
      }
    }

    @media (max-width: 440px) {
      .header-btn span {
        display: none;
      }
      .header-btn {
        padding: 0.35rem 0.45rem;
      }
      .status-badge {
        font-size: 0.68rem;
        padding: 0.2rem 0.45rem;
      }
    }

    /* ==========================================================================
       Two-Row Control Panel (Audio Metrics + Action Controls)
       ========================================================================== */
    .control-panel {
      position: absolute;
      bottom: 3.1rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      z-index: 30;
      pointer-events: auto;
      width: max-content;
      max-width: 95vw;
    }

    /* ROW 1 — Audio Category Indicators (Equal-width Grid Columns) */
    .audio-metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(55px, 1fr));
      align-items: center;
      justify-items: center;
      gap: 12px;
      width: min(360px, 90vw);
      background: rgba(12, 8, 22, 0.78);
      border: 1px solid rgba(255, 255, 255, 0.11);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      padding: 0.38rem 0.95rem 0.45rem;
      border-radius: 9999px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.42);
      box-sizing: border-box;
      user-select: none;
    }

    .metric {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      width: 100%;
      text-align: center;
    }

    .metric-label {
      font-size: 0.69rem;
      font-weight: 600;
      color: #cbd5e1;
      letter-spacing: 0.04em;
      line-height: 1.2;
      white-space: nowrap;
    }

    .metric-label.gemini {
      color: #38bdf8;
    }

    .metric-label.user {
      color: #fb7185;
    }

    .metric-label.idle {
      color: #64748b;
    }

    .metric-bar {
      width: 100%;
      max-width: 44px;
      height: 3.5px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 9999px;
      overflow: hidden;
      position: relative;
    }

    .metric-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.08s ease-out;
    }

    .metric-fill.bass {
      background: #f43f5e;
      box-shadow: 0 0 6px rgba(244, 63, 94, 0.5);
    }

    .metric-fill.mid {
      background: #a855f7;
      box-shadow: 0 0 6px rgba(168, 85, 247, 0.5);
    }

    .metric-fill.treble {
      background: #00f0ff;
      box-shadow: 0 0 6px rgba(0, 240, 255, 0.5);
    }

    .metric-fill.idle {
      background: #475569;
    }

    .metric-fill.idle.gemini {
      background: #38bdf8;
      box-shadow: 0 0 6px rgba(56, 189, 248, 0.5);
    }

    .metric-fill.idle.user {
      background: #f43f5e;
      box-shadow: 0 0 6px rgba(244, 63, 94, 0.5);
    }

    /* ROW 2 — Action Controls */
    .action-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
    }

    .ctrl-btn {
      outline: none;
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: white;
      border-radius: 9999px;
      background: rgba(16, 12, 30, 0.75);
      backdrop-filter: blur(16px);
      width: 48px;
      height: 48px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      margin: 0;
      flex-shrink: 0;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    }

    .ctrl-btn:hover:not([disabled]) {
      background: rgba(45, 35, 75, 0.85);
      border-color: rgba(255, 255, 255, 0.35);
      transform: translateY(-2px);
    }

    .ctrl-btn:active:not([disabled]) {
      transform: translateY(0);
    }

    .ctrl-btn[disabled] {
      opacity: 0.35;
      cursor: not-allowed;
      pointer-events: none;
    }

    .mic-btn {
      width: 60px;
      height: 60px;
      background: rgba(239, 68, 68, 0.2);
      border: 1.5px solid rgba(239, 68, 68, 0.6);
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.25);
      flex-shrink: 0;
    }

    .mic-btn:hover:not([disabled]) {
      background: rgba(239, 68, 68, 0.35);
      border-color: rgba(239, 68, 68, 0.9);
    }

    .mic-btn.recording {
      background: rgba(239, 68, 68, 0.85);
      border-color: #ef4444;
      animation: mic-pulse 1.8s infinite;
    }

    @keyframes mic-pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
      }
      70% {
        box-shadow: 0 0 0 14px rgba(239, 68, 68, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
      }
    }

    .view-switch-btn {
      outline: none;
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: rgba(255, 255, 255, 0.85);
      border-radius: 9999px;
      background: rgba(16, 12, 30, 0.75);
      backdrop-filter: blur(16px);
      height: 40px;
      padding: 0 13px;
      font-size: 0.74rem;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      transition: all 0.2s ease;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    }

    .view-switch-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.35);
      color: white;
    }

    @media (max-width: 600px) {
      .control-panel {
        bottom: 2.75rem;
        gap: 9px;
      }
      .audio-metrics {
        width: min(320px, 90vw);
        gap: 8px;
        padding: 0.32rem 0.65rem 0.38rem;
      }
      .metric-label {
        font-size: 0.64rem;
      }
      .metric-bar {
        max-width: 36px;
        height: 3px;
      }
      .action-controls {
        gap: 10px;
      }
      .ctrl-btn {
        width: 42px;
        height: 42px;
      }
      .mic-btn {
        width: 52px;
        height: 52px;
      }
      .view-switch-btn {
        height: 36px;
        padding: 0 10px;
        font-size: 0.7rem;
      }
      .subtle-status-bar {
        bottom: 0.6rem;
        font-size: 0.68rem;
        padding: 0.22rem 0.75rem;
        gap: 0.45rem;
      }
    }

    /* Subtle Bottom Status Bar - Clean, refined, legible */
    .subtle-status-bar {
      position: absolute;
      bottom: 0.85rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 25;
      display: inline-flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.30rem 0.95rem;
      background: rgba(11, 8, 20, 0.78);
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 9999px;
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      font-size: 0.74rem;
      font-weight: 500;
      color: #94a3b8;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.40);
      transition: all 0.3s ease;
      user-select: none;
      letter-spacing: 0.02em;
    }

    .status-live-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.14rem 0.52rem;
      border-radius: 9999px;
      font-size: 0.70rem;
      font-weight: 600;
      letter-spacing: 0.03em;
      background: rgba(16, 185, 129, 0.16);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.32);
    }

    .status-live-chip.connecting {
      background: rgba(245, 158, 11, 0.16);
      color: #fbbf24;
      border-color: rgba(245, 158, 11, 0.32);
    }

    .status-live-chip.recording {
      background: rgba(239, 68, 68, 0.22);
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.42);
    }

    .status-live-chip .live-dot {
      width: 5.5px;
      height: 5.5px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 6px currentColor;
    }

    .status-live-chip.recording .live-dot {
      animation: dot-pulse 1s infinite alternate;
    }

    @keyframes dot-pulse {
      from { opacity: 0.5; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1.3); }
    }

    .status-main-info {
      color: #e2e8f0;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    .status-separator {
      color: rgba(255, 255, 255, 0.22);
      font-size: 0.70rem;
    }

    .status-hint-info {
      color: #94a3b8;
      font-weight: 400;
      letter-spacing: 0.02em;
    }

    @media (max-width: 600px) {
      .subtle-status-bar {
        font-size: 0.68rem;
        gap: 0.4rem;
        padding: 0.22rem 0.7rem;
        bottom: 0.65rem;
      }
      .status-hint-info,
      .status-separator {
        display: none;
      }
    }

    /* ==========================================================================
       Grounding & Knowledge Slide-over Drawer
       ========================================================================== */
    .grounding-drawer {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 440px;
      max-width: 90vw;
      background: rgba(14, 10, 26, 0.9);
      border-left: 1px solid rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      z-index: 55;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: -10px 0 40px rgba(0, 0, 0, 0.65);
    }

    .grounding-drawer.open {
      transform: translateX(0);
    }

    .drawer-header {
      padding: 1.15rem 1.4rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .drawer-title {
      font-size: 0.95rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #f8fafc;
    }

    .drawer-close-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .drawer-close-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }

    .drawer-tabs {
      display: flex;
      background: rgba(255, 255, 255, 0.03);
      padding: 0.4rem 1rem;
      gap: 0.4rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      overflow-x: auto;
    }

    .tab-btn {
      flex: 1 0 auto;
      padding: 0.45rem 0.65rem;
      text-align: center;
      font-size: 0.76rem;
      font-weight: 500;
      color: #94a3b8;
      background: transparent;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .tab-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.06);
    }

    .tab-btn.active {
      background: rgba(56, 189, 248, 0.18);
      color: #38bdf8;
    }

    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 1.25rem 1.4rem;
      display: flex;
      flex-direction: column;
      gap: 1.2rem;
    }

    .query-input-box {
      display: flex;
      gap: 0.5rem;
      position: relative;
    }

    .query-input {
      flex: 1;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #fff;
      border-radius: 10px;
      padding: 0.65rem 0.9rem;
      font-size: 0.85rem;
      outline: none;
      transition: all 0.2s;
    }

    .query-input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
    }

    .query-submit-btn {
      background: #0284c7;
      border: none;
      color: #fff;
      border-radius: 10px;
      padding: 0 1rem;
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .query-submit-btn:hover {
      background: #0369a1;
    }

    .query-submit-btn[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .suggested-chips {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .chips-label {
      font-size: 0.72rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .chip {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 0.35rem 0.7rem;
      border-radius: 9999px;
      font-size: 0.74rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .chip:hover {
      background: rgba(56, 189, 248, 0.15);
      border-color: rgba(56, 189, 248, 0.4);
      color: #38bdf8;
    }

    .result-card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 1.1rem;
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
    }

    .result-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .model-tag {
      font-size: 0.72rem;
      color: #10b981;
      background: rgba(16, 185, 129, 0.12);
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      font-weight: 500;
    }

    .speak-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #f1f5f9;
      padding: 0.3rem 0.6rem;
      border-radius: 6px;
      font-size: 0.74rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      transition: all 0.2s;
    }

    .speak-btn:hover {
      background: rgba(56, 189, 248, 0.2);
      border-color: #38bdf8;
      color: #38bdf8;
    }

    .result-text {
      font-size: 0.84rem;
      line-height: 1.55;
      color: #e2e8f0;
      white-space: pre-wrap;
    }

    .sources-container {
      margin-top: 0.4rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .sources-title {
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .source-item {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 0.6rem 0.8rem;
      text-decoration: none;
      color: inherit;
      transition: all 0.2s;
    }

    .source-item:hover {
      background: rgba(56, 189, 248, 0.1);
      border-color: rgba(56, 189, 248, 0.4);
    }

    .source-title {
      font-size: 0.8rem;
      font-weight: 500;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .source-url {
      font-size: 0.7rem;
      color: #64748b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .source-snippet {
      font-size: 0.72rem;
      color: #94a3b8;
      margin-top: 0.2rem;
    }

    /* Customize Panel Styles inside Drawer */
    .customizer-section {
      display: flex;
      flex-direction: column;
      gap: 1.1rem;
    }

    .custom-row {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .custom-label {
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }

    .custom-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.4rem;
    }

    .custom-choice {
      padding: 0.5rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #cbd5e1;
      font-size: 0.78rem;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s;
    }

    .custom-choice:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }

    .custom-choice.active {
      background: rgba(56, 189, 248, 0.2);
      border-color: #38bdf8;
      color: #38bdf8;
      font-weight: 500;
    }

    input[type='range'] {
      -webkit-appearance: none;
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }

    input[type='range']::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #38bdf8;
      cursor: pointer;
      box-shadow: 0 0 8px #38bdf8;
      transition: transform 0.1s;
    }

    .transcripts-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .transcript-item {
      padding: 0.75rem;
      border-radius: 10px;
      font-size: 0.82rem;
      line-height: 1.45;
    }

    .transcript-item.user {
      background: rgba(244, 63, 94, 0.12);
      border: 1px solid rgba(244, 63, 94, 0.3);
      align-self: flex-end;
      color: #fecdd3;
    }

    .transcript-item.model {
      background: rgba(0, 240, 255, 0.1);
      border: 1px solid rgba(0, 240, 255, 0.25);
      align-self: flex-start;
      color: #e0f2fe;
    }

    .transcript-role {
      font-size: 0.68rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
      opacity: 0.75;
    }

    .loading-pulse {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 2rem;
      color: #38bdf8;
      font-size: 0.85rem;
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(56, 189, 248, 0.2);
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  constructor() {
    super();
    this.initClient();
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('click', this.handleGlobalClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('click', this.handleGlobalClick);
  }

  private handleGlobalClick = (e: MouseEvent) => {
    // Close overflow menu if clicked outside
    const path = e.composedPath();
    const isInsideMenu = path.some(
      (el: any) =>
        el.classList &&
        (el.classList.contains('overflow-menu') || el.classList.contains('menu-toggle-btn')),
    );
    if (!isInsideMenu && this.isOverflowMenuOpen) {
      this.isOverflowMenuOpen = false;
    }
  };

  private handleAudioMetrics = (e: CustomEvent) => {
    const d = e.detail || {};
    this.audioBass = d.bass || 0;
    this.audioMid = d.mid || 0;
    this.audioTreble = d.treble || 0;
    this.audioVolume = d.volume || 0;
    this.isInputAudioActive = !!d.inputActive;
    this.isOutputAudioActive = !!d.outputActive;
  };

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  /**
   * Initializes Live API session using gemini-3.8-live
   */
  private async initSession() {
    const model = 'gemini-3.8-live';

    try {
      this.updateStatus('Connecting to gemini-3.8-live...');

      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.isConnected = true;
            this.updateStatus('Connected to gemini-3.8-live');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
                this.requestUpdate();
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
              this.requestUpdate();
            }

            const textPart = message.serverContent?.modelTurn?.parts?.find(
              (p: any) => p.text,
            );
            if (textPart && textPart.text) {
              this.addTranscript('model', textPart.text);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
              this.requestUpdate();
            }
          },
          onerror: (e: any) => {
            this.updateError(e?.message || 'Live session encountered an issue.');
          },
          onclose: (e: CloseEvent) => {
            this.isConnected = false;
            this.updateStatus(e.reason ? `Session closed: ${e.reason}` : 'Session closed');
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {voiceName: this.selectedVoice},
            },
          },
          systemInstruction:
            'You are an intelligent, engaging voice assistant in the Remix Audio Orb. Keep your responses natural, expressive, concise, and conversational.',
        },
      });
    } catch (e: any) {
      console.error('Session connection error:', e);
      this.updateError(e?.message || 'Unable to connect to Live API.');
    }
  }

  private addTranscript(role: 'user' | 'model' | 'system', text: string) {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    this.transcripts = [...this.transcripts, {role, text, time}];
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    if (!this.isConnected) {
      await this.initSession();
    }

    this.inputAudioContext.resume();
    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Listening with gemini-3.8-live...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording || !this.session) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);
        const blob = createBlob(pcmData);

        this.session.sendRealtimeInput({
          audio: {data: blob.data, mimeType: 'audio/pcm;rate=16000'},
        });
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.addTranscript('system', 'Microphone active — speak to the orb.');
    } catch (err: any) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Mic error: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.updateStatus('Microphone stopped. Click mic to speak again.');
  }

  private reset() {
    this.session?.close();
    this.initSession();
    this.updateStatus('Session reset with gemini-3.8-live.');
  }

  private handleVoiceChange(voice: string) {
    this.selectedVoice = voice;
    this.reset();
  }

  private openDrawer(tab: 'search' | 'maps' | 'customize' | 'settings' | 'transcripts') {
    this.activeGroundingTab = tab;
    this.isGroundingDrawerOpen = true;
    this.isOverflowMenuOpen = false;
  }

  private async handleSearchGrounding(queryText?: string) {
    const q = queryText || this.groundingQuery;
    if (!q.trim()) return;

    this.isGroundingLoading = true;
    this.groundingError = '';
    this.groundingResult = null;

    try {
      const result = await this.groundingService.searchWithGrounding(q);
      this.groundingResult = result;
      this.addTranscript('user', `[Search] ${q}`);
      this.addTranscript('model', result.text);
    } catch (err: any) {
      console.error('Search grounding error:', err);
      this.groundingError = err?.message || 'Search grounding request failed.';
    } finally {
      this.isGroundingLoading = false;
    }
  }

  private async handleMapsGrounding(queryText?: string) {
    const q = queryText || this.groundingQuery;
    if (!q.trim()) return;

    this.isGroundingLoading = true;
    this.groundingError = '';
    this.groundingResult = null;

    let coords: {latitude: number; longitude: number} | undefined = undefined;
    if (navigator.geolocation) {
      try {
        coords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              }),
            () => resolve(undefined),
            {timeout: 3000},
          );
        });
      } catch (e) {}
    }

    try {
      const result = await this.groundingService.mapsWithGrounding(q, coords);
      this.groundingResult = result;
      this.addTranscript('user', `[Maps] ${q}`);
      this.addTranscript('model', result.text);
    } catch (err: any) {
      console.error('Maps grounding error:', err);
      this.groundingError = err?.message || 'Maps grounding request failed.';
    } finally {
      this.isGroundingLoading = false;
    }
  }

  private speakGroundedAnswer() {
    if (!this.groundingResult || !window.speechSynthesis) return;

    if (this.isSpeakingGrounding) {
      window.speechSynthesis.cancel();
      this.stopTtsAudioFeedback();
      this.isSpeakingGrounding = false;
      return;
    }

    const cleanText = this.groundingResult.text
      .replace(/[#*`_]/g, '')
      .slice(0, 500);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    this.startTtsAudioFeedback();

    utterance.onend = () => {
      this.stopTtsAudioFeedback();
      this.isSpeakingGrounding = false;
    };

    utterance.onerror = () => {
      this.stopTtsAudioFeedback();
      this.isSpeakingGrounding = false;
    };

    this.speechUtterance = utterance;
    this.isSpeakingGrounding = true;
    window.speechSynthesis.speak(utterance);
  }

  private startTtsAudioFeedback() {
    try {
      this.outputAudioContext.resume();
      const osc = this.outputAudioContext.createOscillator();
      const gain = this.outputAudioContext.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, this.outputAudioContext.currentTime);
      gain.gain.setValueAtTime(0.08, this.outputAudioContext.currentTime);

      osc.connect(gain);
      gain.connect(this.outputNode);

      osc.start();
      this.ttsOscillator = osc;
    } catch (e) {
      console.warn('TTS oscillator tap error:', e);
    }
  }

  private stopTtsAudioFeedback() {
    if (this.ttsOscillator) {
      try {
        this.ttsOscillator.stop();
        this.ttsOscillator.disconnect();
      } catch (e) {}
      this.ttsOscillator = null;
    }
  }

  render() {
    const isGeminiSpeaking = this.sources.size > 0;

    return html`
      <div>
        <!-- ================================================================
             Clean Professional Header
             ================================================================ -->
        <header class="app-header">
          <!-- Left: Application Name/Logo and Status -->
          <div class="header-left">
            <a href="#" class="brand-link" @click=${(e: Event) => e.preventDefault()}>
              <div class="brand-icon"></div>
              <span class="brand-name">Remix Audio Orb</span>
            </a>

            <div
              class="status-badge ${this.isRecording
                ? 'recording'
                : this.isConnected
                ? 'connected'
                : 'connecting'}"
              title="Live API Model: gemini-3.8-live"
            >
              <span class="dot"></span>
              <span>${this.isConnected ? 'gemini-3.8-live' : 'Connecting'}</span>
            </div>
          </div>

          <!-- Center: Optional Current Mode / Audio Status -->
          <div class="header-center">
            <div class="mode-pill">
              ${this.isRecording
                ? html`🔴 <strong>Microphone Capturing</strong>`
                : isGeminiSpeaking
                ? html`⚡ <strong>Gemini Voice Active</strong>`
                : html`✨ <strong>Reactive Orb</strong> • ${this.selectedVoice} Voice`}
            </div>
          </div>

          <!-- Right: Search Data, Maps Places, Customize & Settings -->
          <div class="header-right">
            <!-- Search Data Action -->
            <button
              class="header-btn ${this.isGroundingDrawerOpen && this.activeGroundingTab === 'search'
                ? 'active'
                : ''}"
              title="Google Search Grounding (gemini-3.5-flash)"
              @click=${() => this.openDrawer('search')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span>Search Data</span>
            </button>

            <!-- Maps Places Action -->
            <button
              class="header-btn ${this.isGroundingDrawerOpen && this.activeGroundingTab === 'maps'
                ? 'active'
                : ''}"
              title="Google Maps Grounding (gemini-3.5-flash)"
              @click=${() => this.openDrawer('maps')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>Maps Places</span>
            </button>

            <!-- User Settings Action (Desktop) -->
            <button
              class="header-btn desktop-only ${this.isGroundingDrawerOpen && this.activeGroundingTab === 'settings'
                ? 'active'
                : ''}"
              title="User Settings (Voice: ${this.selectedVoice})"
              @click=${() => this.openDrawer('settings')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>User Settings</span>
            </button>

            <!-- Customize Action (Desktop) -->
            <button
              class="header-btn desktop-only ${this.isGroundingDrawerOpen && this.activeGroundingTab === 'customize'
                ? 'active'
                : ''}"
              title="Customize 3D Orb Appearance & Reactivity"
              @click=${() => this.openDrawer('customize')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="m4.93 4.93 4.24 4.24"></path>
                <path d="m14.83 9.17 4.24-4.24"></path>
                <path d="m14.83 14.83 4.24 4.24"></path>
                <path d="m9.17 14.83-4.24 4.24"></path>
              </svg>
              <span>Customize</span>
            </button>

            <!-- Overflow / Responsive Mobile Menu Toggle -->
            <button
              class="menu-toggle-btn"
              title="Menu Options"
              @click=${(e: Event) => {
                e.stopPropagation();
                this.isOverflowMenuOpen = !this.isOverflowMenuOpen;
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1.5"></circle>
                <circle cx="19" cy="12" r="1.5"></circle>
                <circle cx="5" cy="12" r="1.5"></circle>
              </svg>
              <span>Menu</span>
            </button>
          </div>
        </header>

        <!-- Responsive Overflow Dropdown Menu -->
        ${this.isOverflowMenuOpen
          ? html`
              <div class="overflow-menu">
                <button
                  class="menu-item-btn"
                  @click=${() => this.openDrawer('search')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  Search Data
                </button>
                <button
                  class="menu-item-btn"
                  @click=${() => this.openDrawer('maps')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  Maps Places
                </button>
                <button
                  class="menu-item-btn"
                  @click=${() => this.openDrawer('settings')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  User Settings
                </button>
                <button
                  class="menu-item-btn"
                  @click=${() => this.openDrawer('customize')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                  </svg>
                  Customize Orb
                </button>
                <button
                  class="menu-item-btn"
                  @click=${() => this.openDrawer('transcripts')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  Live Transcripts
                </button>
                <div class="menu-divider"></div>
                <button
                  class="menu-item-btn"
                  @click=${() => {
                    this.isOverflowMenuOpen = false;
                    this.reset();
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                    <path d="M21 3v5h-5"></path>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                    <path d="M8 16H3v5"></path>
                  </svg>
                  Reset Session
                </button>
              </div>
            `
          : ''}

        <!-- Two-Row Responsive Audio Control Panel -->
        <div class="control-panel">
          <!-- Row 1: Audio Category Indicators (Equal-width Grid Columns) -->
          <div class="audio-metrics">
            <div class="metric bass">
              <span class="metric-label">BASS</span>
              <div class="metric-bar">
                <div class="metric-fill bass" style="width: ${this.audioBass}%"></div>
              </div>
            </div>
            <div class="metric mid">
              <span class="metric-label">MID</span>
              <div class="metric-bar">
                <div class="metric-fill mid" style="width: ${this.audioMid}%"></div>
              </div>
            </div>
            <div class="metric treble">
              <span class="metric-label">TREBLE</span>
              <div class="metric-bar">
                <div class="metric-fill treble" style="width: ${this.audioTreble}%"></div>
              </div>
            </div>
            <div class="metric idle">
              <span class="metric-label ${this.isOutputAudioActive ? 'gemini' : this.isInputAudioActive || this.isRecording ? 'user' : 'idle'}">
                ${this.isOutputAudioActive ? '● GEMINI' : this.isInputAudioActive || this.isRecording ? '● MIC' : 'IDLE'}
              </span>
              <div class="metric-bar">
                <div
                  class="metric-fill idle ${this.isOutputAudioActive ? 'gemini' : this.isInputAudioActive || this.isRecording ? 'user' : 'idle'}"
                  style="width: ${this.isOutputAudioActive ? Math.max(30, this.audioVolume) + '%' : (this.isInputAudioActive || this.isRecording) ? Math.max(30, this.audioVolume) + '%' : '15%'}"
                ></div>
              </div>
            </div>
          </div>

          <!-- Row 2: Action Controls (Refresh, Microphone, 3D Reactive Orb) -->
          <div class="action-controls">
            <!-- Reset Session Button -->
            <button
              class="ctrl-btn"
              id="resetButton"
              title="Reset Live Session"
              @click=${this.reset}
              ?disabled=${this.isRecording}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="22px"
                viewBox="0 -960 960 960"
                width="22px"
                fill="#ffffff"
              >
                <path
                  d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"
                />
              </svg>
            </button>

            <!-- Main Microphone Record / Stop Button (Centered) -->
            ${!this.isRecording
              ? html`
                  <button
                    class="ctrl-btn mic-btn"
                    id="startButton"
                    title="Speak to gemini-3.8-live"
                    @click=${this.startRecording}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="26px"
                      height="26px"
                      fill="none"
                      stroke="#ffffff"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                      <line x1="12" y1="19" x2="12" y2="22"></line>
                    </svg>
                  </button>
                `
              : html`
                  <button
                    class="ctrl-btn mic-btn recording"
                    id="stopButton"
                    title="Stop Microphone"
                    @click=${this.stopRecording}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="22px"
                      height="22px"
                      fill="#ffffff"
                    >
                      <rect x="5" y="5" width="14" height="14" rx="3" />
                    </svg>
                  </button>
                `}

            <!-- Visualizer Switcher Button -->
            <button
              class="view-switch-btn"
              title="Toggle Visualizer Mode"
              @click=${() => {
                this.visualizerMode =
                  this.visualizerMode === 'reactive-orb' ? 'classic-3d' : 'reactive-orb';
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m21 16-4 4-4-4" />
                <path d="M17 20V4" />
                <path d="m3 8 4-4 4 4" />
                <path d="M7 4v16" />
              </svg>
              ${this.visualizerMode === 'reactive-orb' ? '3D Reactive Orb' : 'Classic View'}
            </button>
          </div>
        </div>

        <!-- Subtle Bottom Status Bar -->
        <div class="subtle-status-bar">
          <div
            class="status-live-chip ${this.isRecording
              ? 'recording'
              : this.isConnected
              ? 'live'
              : 'connecting'}"
          >
            <span class="live-dot"></span>
            <span>${this.isRecording ? 'Recording' : this.isConnected ? 'Live' : 'Connecting'}</span>
          </div>

          <span class="status-main-info">
            ${this.error ? `⚠️ ${this.error}` : 'Connected to Gemini'}
          </span>

          <span class="status-separator">•</span>
          <span class="status-hint-info">Drag to rotate • Audio reactive</span>
        </div>

        <!-- 3D Audio-Reactive Orb Main View -->
        ${this.visualizerMode === 'reactive-orb'
          ? html`
              <audio-reactive-orb
                .inputNode=${this.inputNode}
                .outputNode=${this.outputNode}
                .theme=${this.orbTheme}
                .shapeMode=${this.orbShapeMode}
                .sensitivity=${this.orbSensitivity}
                .autoRotate=${this.orbAutoRotate}
                .demoMode=${this.orbDemoMode}
                @audiometrics=${this.handleAudioMetrics}
              ></audio-reactive-orb>
            `
          : html`
              <gdm-live-audio-visuals-3d
                .inputNode=${this.inputNode}
                .outputNode=${this.outputNode}
              ></gdm-live-audio-visuals-3d>
            `}

        <!-- ================================================================
             Knowledge & Intelligence Drawer (Search, Maps, Customize, Settings, Transcripts)
             ================================================================ -->
        <div class="grounding-drawer ${this.isGroundingDrawerOpen ? 'open' : ''}">
          <div class="drawer-header">
            <span class="drawer-title">
              ${this.activeGroundingTab === 'search'
                ? html`🔍 Google Search Grounding`
                : this.activeGroundingTab === 'maps'
                ? html`📍 Google Maps Places`
                : this.activeGroundingTab === 'customize'
                ? html`🎨 Customize 3D Orb`
                : this.activeGroundingTab === 'settings'
                ? html`⚙️ Voice & Audio Settings`
                : html`🎙️ Live Transcripts`}
            </span>
            <button
              class="drawer-close-btn"
              title="Close Panel"
              @click=${() => (this.isGroundingDrawerOpen = false)}
            >
              ✕
            </button>
          </div>

          <div class="drawer-tabs">
            <button
              class="tab-btn ${this.activeGroundingTab === 'search' ? 'active' : ''}"
              @click=${() => (this.activeGroundingTab = 'search')}
            >
              🔍 Search
            </button>
            <button
              class="tab-btn ${this.activeGroundingTab === 'maps' ? 'active' : ''}"
              @click=${() => (this.activeGroundingTab = 'maps')}
            >
              📍 Maps
            </button>
            <button
              class="tab-btn ${this.activeGroundingTab === 'customize' ? 'active' : ''}"
              @click=${() => (this.activeGroundingTab = 'customize')}
            >
              🎨 Customize
            </button>
            <button
              class="tab-btn ${this.activeGroundingTab === 'settings' ? 'active' : ''}"
              @click=${() => (this.activeGroundingTab = 'settings')}
            >
              ⚙️ Voice
            </button>
            <button
              class="tab-btn ${this.activeGroundingTab === 'transcripts' ? 'active' : ''}"
              @click=${() => (this.activeGroundingTab = 'transcripts')}
            >
              💬 History
            </button>
          </div>

          <div class="drawer-body">
            <!-- TAB 1 & 2: Search & Maps Grounding -->
            ${this.activeGroundingTab === 'search' || this.activeGroundingTab === 'maps'
              ? html`
                  <div class="query-input-box">
                    <input
                      type="text"
                      class="query-input"
                      placeholder=${this.activeGroundingTab === 'search'
                        ? 'Ask Search: e.g. Latest science discoveries...'
                        : 'Ask Maps: e.g. Best local coffee shops nearby...'}
                      .value=${this.groundingQuery}
                      @input=${(e: Event) =>
                        (this.groundingQuery = (e.target as HTMLInputElement).value)}
                      @keydown=${(e: KeyboardEvent) => {
                        if (e.key === 'Enter') {
                          if (this.activeGroundingTab === 'search') {
                            this.handleSearchGrounding();
                          } else {
                            this.handleMapsGrounding();
                          }
                        }
                      }}
                    />
                    <button
                      class="query-submit-btn"
                      ?disabled=${this.isGroundingLoading || !this.groundingQuery.trim()}
                      @click=${() => {
                        if (this.activeGroundingTab === 'search') {
                          this.handleSearchGrounding();
                        } else {
                          this.handleMapsGrounding();
                        }
                      }}
                    >
                      ${this.isGroundingLoading ? '...' : 'Ask'}
                    </button>
                  </div>

                  <div class="suggested-chips">
                    <span class="chips-label">
                      ${this.activeGroundingTab === 'search'
                        ? 'Google Search Suggestions (gemini-3.5-flash)'
                        : 'Google Maps Suggestions (gemini-3.5-flash)'}
                    </span>
                    <div class="chip-list">
                      ${this.activeGroundingTab === 'search'
                        ? html`
                            <button
                              class="chip"
                              @click=${() => {
                                this.groundingQuery = 'Latest breaking world tech news today';
                                this.handleSearchGrounding('Latest breaking world tech news today');
                              }}
                            >
                              Tech News
                            </button>
                            <button
                              class="chip"
                              @click=${() => {
                                this.groundingQuery = 'What are the current top astronomy discoveries?';
                                this.handleSearchGrounding('What are the current top astronomy discoveries?');
                              }}
                            >
                              Astronomy Discoveries
                            </button>
                            <button
                              class="chip"
                              @click=${() => {
                                this.groundingQuery = 'Recent advances in quantum computing';
                                this.handleSearchGrounding('Recent advances in quantum computing');
                              }}
                            >
                              Quantum Computing
                            </button>
                          `
                        : html`
                            <button
                              class="chip"
                              @click=${() => {
                                this.groundingQuery = 'Find top-rated specialty coffee shops nearby';
                                this.handleMapsGrounding('Find top-rated specialty coffee shops nearby');
                              }}
                            >
                              Coffee Nearby
                            </button>
                            <button
                              class="chip"
                              @click=${() => {
                                this.groundingQuery = 'Scenic nature viewpoints and botanical gardens';
                                this.handleMapsGrounding('Scenic nature viewpoints and botanical gardens');
                              }}
                            >
                              Scenic Gardens
                            </button>
                            <button
                              class="chip"
                              @click=${() => {
                                this.groundingQuery = 'Top historic landmarks and museums to visit';
                                this.handleMapsGrounding('Top historic landmarks and museums to visit');
                              }}
                            >
                              Landmarks & Museums
                            </button>
                          `}
                    </div>
                  </div>

                  ${this.isGroundingLoading
                    ? html`
                        <div class="loading-pulse">
                          <div class="spinner"></div>
                          <span>
                            Grounded via
                            ${this.activeGroundingTab === 'search' ? 'Google Search' : 'Google Maps'}
                            (gemini-3.5-flash)...
                          </span>
                        </div>
                      `
                    : ''}

                  ${this.groundingError
                    ? html`
                        <div style="color: #f87171; font-size: 0.8rem; padding: 0.5rem; background: rgba(239, 68, 68, 0.1); border-radius: 8px;">
                          ⚠️ ${this.groundingError}
                        </div>
                      `
                    : ''}

                  ${this.groundingResult
                    ? html`
                        <div class="result-card">
                          <div class="result-header">
                            <span class="model-tag">
                              ${this.groundingResult.type === 'search'
                                ? 'Google Search Grounded • gemini-3.5-flash'
                                : 'Google Maps Grounded • gemini-3.5-flash'}
                            </span>
                            <button
                              class="speak-btn"
                              title="Read answer aloud to make the 3D orb dance"
                              @click=${this.speakGroundedAnswer}
                            >
                              ${this.isSpeakingGrounding ? '⏹ Stop' : '🔊 Speak to Orb'}
                            </button>
                          </div>

                          <div class="result-text">${this.groundingResult.text}</div>

                          ${this.groundingResult.searchQueries &&
                          this.groundingResult.searchQueries.length > 0
                            ? html`
                                <div style="font-size: 0.72rem; color: #94a3b8;">
                                  Searched:
                                  ${this.groundingResult.searchQueries.map(
                                    (sq) => html`<span style="color: #38bdf8; margin-right: 6px;">"${sq}"</span>`,
                                  )}
                                </div>
                              `
                            : ''}

                          ${this.groundingResult.sources &&
                          this.groundingResult.sources.length > 0
                            ? html`
                                <div class="sources-container">
                                  <div class="sources-title">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                    </svg>
                                    ${this.groundingResult.type === 'search'
                                      ? 'Web Sources'
                                      : 'Google Maps Places'}
                                  </div>

                                  ${this.groundingResult.sources.map(
                                    (src) => html`
                                      <a
                                        href=${src.uri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="source-item"
                                      >
                                        <div class="source-title">
                                          ${src.type === 'maps' ? '📍' : '🔗'}
                                          ${src.title}
                                        </div>
                                        <div class="source-url">${src.uri}</div>
                                        ${src.snippet
                                          ? html`<div class="source-snippet">${src.snippet}</div>`
                                          : ''}
                                      </a>
                                    `,
                                  )}
                                </div>
                              `
                            : ''}
                        </div>
                      `
                    : ''}
                `
              : this.activeGroundingTab === 'customize'
              ? html`
                  <!-- TAB 3: Customize 3D Orb -->
                  <div class="customizer-section">
                    <div class="custom-row">
                      <span class="custom-label">Visual Theme</span>
                      <div class="custom-grid">
                        ${Object.values(ORB_THEMES).map(
                          (t) => html`
                            <button
                              class="custom-choice ${this.orbTheme === t.id ? 'active' : ''}"
                              @click=${() => (this.orbTheme = t.id)}
                            >
                              ${t.name}
                            </button>
                          `,
                        )}
                      </div>
                    </div>

                    <div class="custom-row">
                      <span class="custom-label">Shape Deformation Mode</span>
                      <div class="custom-grid">
                        <button
                          class="custom-choice ${this.orbShapeMode === 0 ? 'active' : ''}"
                          @click=${() => (this.orbShapeMode = 0)}
                        >
                          Harmonic Pulse
                        </button>
                        <button
                          class="custom-choice ${this.orbShapeMode === 1 ? 'active' : ''}"
                          @click=${() => (this.orbShapeMode = 1)}
                        >
                          Resonance Spikes
                        </button>
                        <button
                          class="custom-choice ${this.orbShapeMode === 2 ? 'active' : ''}"
                          @click=${() => (this.orbShapeMode = 2)}
                        >
                          Fluid Waves
                        </button>
                        <button
                          class="custom-choice ${this.orbShapeMode === 3 ? 'active' : ''}"
                          @click=${() => (this.orbShapeMode = 3)}
                        >
                          Wireframe Mesh
                        </button>
                      </div>
                    </div>

                    <div class="custom-row">
                      <div class="custom-label">
                        <span>Audio Sensitivity</span>
                        <span>${this.orbSensitivity.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.5"
                        step="0.1"
                        .value=${this.orbSensitivity.toString()}
                        @input=${(e: Event) =>
                          (this.orbSensitivity = parseFloat(
                            (e.target as HTMLInputElement).value,
                          ))}
                      />
                    </div>

                    <div class="custom-row">
                      <span class="custom-label">Auto-Rotation</span>
                      <button
                        class="custom-choice ${this.orbAutoRotate ? 'active' : ''}"
                        @click=${() => (this.orbAutoRotate = !this.orbAutoRotate)}
                      >
                        ${this.orbAutoRotate ? 'Auto-Rotate ON' : 'Rotation Paused'}
                      </button>
                    </div>

                    <div class="custom-row">
                      <span class="custom-label">Test Simulated Audio</span>
                      <button
                        class="custom-choice ${this.orbDemoMode ? 'active' : ''}"
                        @click=${() => (this.orbDemoMode = !this.orbDemoMode)}
                      >
                        ${this.orbDemoMode ? 'Simulated Audio: ACTIVE' : 'Simulated Audio: OFF'}
                      </button>
                    </div>
                  </div>
                `
              : this.activeGroundingTab === 'settings'
              ? html`
                  <!-- TAB 4: Voice & Audio Settings -->
                  <div class="customizer-section">
                    <div class="custom-row">
                      <span class="custom-label">Gemini Live Voice Persona</span>
                      <div class="custom-grid">
                        ${['Zephyr', 'Kore', 'Puck', 'Fenrir', 'Charon', 'Orus'].map(
                          (voice) => html`
                            <button
                              class="custom-choice ${this.selectedVoice === voice ? 'active' : ''}"
                              @click=${() => this.handleVoiceChange(voice)}
                            >
                              ${voice}
                            </button>
                          `,
                        )}
                      </div>
                    </div>

                    <div class="result-card">
                      <div style="font-size: 0.82rem; font-weight: 600; color: #f1f5f9;">
                        Audio Engine Specifications
                      </div>
                      <div style="font-size: 0.74rem; color: #94a3b8; display: flex; flex-direction: column; gap: 0.35rem;">
                        <div>• Model: <span style="color: #38bdf8;">gemini-3.8-live</span></div>
                        <div>• Input Mic Sample Rate: <span style="color: #e2e8f0;">16,000 Hz PCM</span></div>
                        <div>• Output Voice Sample Rate: <span style="color: #e2e8f0;">24,000 Hz PCM</span></div>
                        <div>• Spectral Analysis: <span style="color: #e2e8f0;">64-band FFT (Bass, Mid, Treble)</span></div>
                        <div>• Grounding Model: <span style="color: #10b981;">gemini-3.5-flash</span></div>
                      </div>
                    </div>
                  </div>
                `
              : html`
                  <!-- TAB 5: Live Transcripts -->
                  <div class="transcripts-list">
                    <div style="font-size: 0.75rem; color: #94a3b8; display: flex; justify-content: space-between;">
                      <span>Model: gemini-3.8-live</span>
                      <span>Voice: ${this.selectedVoice}</span>
                    </div>

                    ${this.transcripts.length === 0
                      ? html`
                          <div style="text-align: center; color: #64748b; padding: 2rem; font-size: 0.8rem;">
                            No conversation turns yet. Click the red microphone button below to talk with gemini-3.8-live!
                          </div>
                        `
                      : this.transcripts.map(
                          (t) => html`
                            <div class="transcript-item ${t.role}">
                              <div class="transcript-role">${t.role} • ${t.time}</div>
                              <div>${t.text}</div>
                            </div>
                          `,
                        )}
                  </div>
                `}
          </div>
        </div>
      </div>
    `;
  }
}
