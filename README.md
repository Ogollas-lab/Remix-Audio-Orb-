# Remix Audio Orb 🎙️✨

An interactive, real-time voice experience powered by the **Google Gemini Live API** (`gemini-3.8-live`) and an audio-reactive **3D WebGL/Three.js** visualizer. Speak naturally to Gemini, and watch the plasma orb and volumetric particle field deform, ripple, and illuminate in real time to your voice and Gemini's speech.

---

## 🌟 Key Features

### 1. Real-Time Gemini Live Audio
- **Bidirectional Streaming**: Low-latency voice streaming using `@google/genai` and Web Audio API (`16 kHz` microphone input, `24 kHz` model output).
- **Voice Customization**: Select from multiple voice personalities (Zephyr, Puck, Charon, Aoede, Fenrir).
- **Live Transcriptions**: Dynamic real-time transcription history drawer with speaker attribution and timestamps.

### 2. Audio-Reactive 3D Plasma Orb
- **Frequency-Decomposed Dynamics**:
  - **Bass**: Large-scale geometric deformation, core expansion, and volumetric particle dispersion.
  - **Mid**: Surface wave ripples and internal plasma turbulence.
  - **Treble**: Fine edge highlights, perimeter shimmer, and high-frequency sparkle.
- **Volumetric Particle Field**: A dynamic 3D field of particles that breathe, expand, and scatter in response to audio energy.
- **Interactive 3D Controls**: Inertial mouse and touch rotation with smooth damping.
- **Customizable Themes**: Nebula (deep cyan & violet), Cyberpunk, Solar Flare, Emerald Aurora, and Void.
- **Alternative Visualizer**: Switch smoothly between the **3D Reactive Orb** and the **Classic 3D Visualizer**.

### 3. Google Search & Maps Grounding
- **Real-Time Knowledge**: Integrated Google Search and Google Maps grounding drawer to look up current facts and discover nearby locations during conversation.
- **Interactive Drawer**: Dedicated side panels for Grounding, Settings, Customization, and Transcripts.

### 4. Professional Responsive UI & Two-Row Control Panel
- **Non-Overlapping Layout**: Distinct two-row control panel with:
  - **Row 1 (Audio Metrics)**: Equal-width grid indicators for `BASS`, `MID`, `TREBLE`, and `IDLE / MIC / GEMINI` with live level meters.
  - **Row 2 (Action Controls)**: Centered microphone record/stop button, session reset, and visualizer mode toggle.
- **Responsive Across All Screens**: Tailored viewport scaling and collapsible header menus for desktop, tablet, and mobile devices.
- **Subtle Status Bar**: Bottom glassmorphic indicator displaying live connection state and interactive hints.

---

## 🛠️ Tech Stack

- **Framework & Components**: [Lit 3](https://lit.dev/) (Web Components)
- **3D Graphics & Shaders**: [Three.js](https://threejs.org/) (GLSL Shaders, Postprocessing Bloom)
- **AI & Real-Time Audio**: [@google/genai](https://www.npmjs.com/package/@google/genai) (Gemini Live API)
- **Audio Processing**: Web Audio API (`AudioContext`, `AnalyserNode`, `ScriptProcessorNode`)
- **Build Tooling**: [Vite](https://vitejs.dev/) & [TypeScript](https://www.typescriptlang.org/)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- A Gemini API Key with access to the Live API (`gemini-3.8-live`)

### Installation

1. Clone or download the project repository.
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set your Gemini API key in an `.env` or environment configuration:
   ```env
   GEMINI_API_KEY="your_api_key_here"
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser at `http://localhost:3000` (or the port specified by Vite).

---

## 📜 Available Scripts

- `npm run dev`: Runs Vite development server.
- `npm run build`: Compiles TypeScript and builds the production bundle with Vite.
- `npm run preview`: Previews the production build locally.
- `npm run lint`: Performs static type checking with `tsc --noEmit`.

---

## 🎙️ How to Use

1. **Connect & Speak**: Click the central red **Microphone** button to start streaming your voice to Gemini.
2. **Observe Reactivity**: Watch the orb react instantly:
   - Your speech lights up the user frequencies and meters.
   - Gemini's audio responses trigger radiant cyan and purple plasma pulses.
3. **Orbit the Orb**: Click and drag (or touch and drag) anywhere on the orb visualization to inspect it in 3D.
4. **Customize Appearance**: Open the **Customize Orb** option in the header menu to adjust theme presets, shape modes, and rotation speed.
5. **Explore Grounding**: Use the **Search Data** or **Maps Places** tools in the header to view grounded search answers.
6. **Toggle Mode**: Click the **3D Reactive Orb / Classic View** button on the bottom dock to alternate visual styles.

---

## 📄 License

Apache-2.0
