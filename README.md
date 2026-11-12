# Remix Audio Orb

An interactive, full-stack real-time voice application powered by the **Google Gemini Live API** (`gemini-3.8-live`), **Gemini Grounding** (`gemini-4-hydrogen`), **Google Maps Platform**, and an audio-reactive **3D WebGL/Three.js** visualizer. Speak naturally to Gemini through a server-side WebSocket bridge and watch the plasma orb and volumetric particle field react in real time to both your microphone input and Gemini's spoken responses.

---

## Key Features

### 1. Server-Proxied Gemini Live Audio (`WS /api/live`)
- **Bidirectional Voice Streaming**: Real-time audio bridged through the Express/WebSocket server (`server.ts`) to `@google/genai` (`v1beta` Live API) with `16 kHz` microphone PCM capture and `24 kHz` model audio playback.
- **Keep Keys Server-Side**: All Gemini API calls—Live API sessions, Search grounding, and Maps grounding—execute on the Node.js server using `GEMINI_API_KEY` so the app works for every visitor without exposing API keys in the browser.
- **Voice Personas**: Choose between **Zephyr**, **Kore**, **Puck**, **Fenrir**, **Charon**, and **Orus** in the Settings drawer.
- **Live Transcripts**: Real-time conversation history drawer recording user/model turns, grounding queries, and timestamps.

### 2. Audio-Reactive 3D Plasma Orb & Classic 3D Visualizer
- **Frequency-Decomposed Dynamics**:
  - **Bass**: Core expansion, low-frequency geometric displacement, and particle dispersion.
  - **Mid**: Surface wave ripples and internal plasma turbulence.
  - **Treble**: Perimeter shimmer and high-frequency energy highlights.
- **5 Color Themes**: **Cosmic Nebula**, **Solar Plasma**, **Cyber Aurora**, **Amethyst Quartz**, and **Ocean Abyss**.
- **4 Shape Deformation Modes**: **Harmonic Pulse**, **Resonance Spikes**, **Fluid Waves**, and **Wireframe Mesh**.
- **Interactive Controls**: Drag with mouse or touch to orbit the orb, adjust audio sensitivity (`0.5x–2.5x`), toggle auto-rotation or simulated demo audio, or switch between the **3D Reactive Orb** and **Classic 3D** sphere shader visualizer.

### 3. Google Search & Maps Explorer Drawer
- **Search Grounding**: Query current information via `POST /api/grounding/search` (`gemini-4-hydrogen` with `googleSearch`), complete with source citations and optional text-to-speech playback.
- **Interactive Google Maps Explorer (`<maps-explorer>`)**: Search real-world places backed by `@googlemaps/js-api-loader`, Dark-mode `Map` (`DEMO_MAP_ID`), `AdvancedMarkerElement`, `PinElement`, browser geolocation bias, and server-proxied **Places API (New)** (`POST /api/maps/places`), alongside Gemini Maps Grounding (`POST /api/grounding/maps`).

### 4. Responsive Control Panel & Zen Mode
- **Two-Row Control Dock**:
  - **Row 1 (Audio Metrics)**: Real-time meters for `BASS`, `MID`, `TREBLE`, and `IDLE / MIC / GEMINI` state.
  - **Row 2 (Action Controls)**: Centered microphone toggle, session reset, and visualizer mode switch.
- **Zen Mode**: Collapse or expand the bottom control dock anytime using the **Zen Mode** toggle or pressing **`H`** on the keyboard for an unobstructed full-screen 3D view.

---

## Tech Stack

- **Frontend**: [Lit 3](https://lit.dev/) Web Components, [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **3D Graphics**: [Three.js](https://threejs.org/) (custom GLSL shaders, studio environment lighting, post-processing bloom)
- **Backend & Real-Time Bridge**: [Express 5](https://expressjs.com/), [ws](https://github.com/websockets/ws), Node.js
- **AI & Maps SDKs**: [@google/genai](https://www.npmjs.com/package/@google/genai), [@googlemaps/js-api-loader](https://www.npmjs.com/package/@googlemaps/js-api-loader)

---

## Project Structure

```text
├── index.html               # HTML shell and entry point
├── index.css                # Global styles
├── index.tsx                # Main <gdm-live-audio> Lit component, audio pipeline & UI drawers
├── audio-reactive-orb.ts    # Primary Three.js plasma orb & particle field visualizer
├── visual-3d.ts             # Classic 3D sphere + backdrop shader visualizer
├── maps-explorer.ts         # <maps-explorer> interactive Google Maps & Places component
├── grounding-service.ts     # Client service calling server /api/grounding/* endpoints
├── analyser.ts              # Web Audio FFT frequency band analyser
├── three-utils.ts           # Three.js studio environment, particle texture & WebGL helpers
├── sphere-shader.ts         # GLSL vertex/fragment shaders for Classic 3D orb
├── backdrop-shader.ts       # GLSL ambient backdrop shader
├── utils.ts                 # PCM audio encoding/decoding helpers
├── server.ts                # Express server, Vite middleware, Places proxy & /api/live WS bridge
├── server/
│   └── gemini.ts            # Server-side @google/genai clients & Search/Maps grounding logic
├── vite.config.ts           # Vite configuration (HMR disabled for iFrame preview stability)
├── tsconfig.json            # TypeScript configuration
└── .env.example             # Environment variable template
```

---

## API & WebSocket Endpoints

| Endpoint | Method / Protocol | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Health check (`{ ok: true }`) |
| `/api/live?voice=Zephyr` | `WebSocket` | Bidirectional PCM audio bridge to `gemini-3.8-live` |
| `/api/grounding/search` | `POST` | Runs `gemini-4-hydrogen` with Google Search grounding |
| `/api/grounding/maps` | `POST` | Runs `gemini-4-hydrogen` with Google Maps grounding |
| `/api/maps/config` | `GET` | Provides client Google Maps loader configuration |
| `/api/maps/places` | `POST` | Proxies Google Places API (New) `searchText` requests |

---

## Getting Started

### Prerequisites
- **Node.js** v20+ (Node v22+ recommended for native TypeScript execution in `server.ts`)
- A **Gemini API Key** (`GEMINI_API_KEY`)
- *(Optional)* A **Google Maps Platform API Key** (`GOOGLE_MAPS_API_KEY`) for the interactive Maps Explorer and Places search

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables (see `.env.example`):
   ```env
   GEMINI_API_KEY="your_gemini_api_key"
   GOOGLE_MAPS_API_KEY="your_google_maps_api_key"
   VITE_GOOGLE_MAPS_API_KEY=""
   PORT=3000
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000` in your browser.

---

## Available Scripts

- `npm run dev` — Starts Express + Vite middleware development server on port `3000`.
- `npm run build` — Bundles the client application into `dist/` with Vite.
- `npm run start` — Starts `server.ts` serving the production `dist/` build and backend APIs.
- `npm run preview` — Previews the static Vite build.
- `npm run lint` — Runs TypeScript static type checking (`tsc --noEmit`).

---

## How to Use

1. **Speak with the Orb**: Click the **Microphone** button in the bottom dock to start streaming audio to `gemini-3.8-live`.
2. **Orbit & Inspect**: Click/touch and drag anywhere on the canvas to rotate the 3D orb; press **`H`** or click **Zen Mode** to hide the control dock.
3. **Customize Visuals**: Open **Customize Orb** in the header menu to switch color themes, deformation modes, audio sensitivity, auto-rotation, or simulated audio mode.
4. **Search & Explore Places**: Open the **Search Data** or **Maps Places** tabs in the drawer to ask grounded web queries or explore locations on the interactive map.
5. **Change Voice**: Open **Settings** in the header menu to switch the Gemini Live voice persona.

---

## License

Apache-2.0

