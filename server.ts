/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Modality} from '@google/genai';
import type {LiveServerMessage, Session} from '@google/genai';
import express from 'express';
import type {NextFunction, Request, Response} from 'express';
import {WebSocket, WebSocketServer} from 'ws';
import {
  formatGeminiError,
  getGeminiClient,
  getGeminiLiveClient,
  mapsWithGrounding,
  searchWithGrounding,
} from './server/gemini.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_VOICES = new Set(['Zephyr', 'Kore', 'Puck', 'Fenrir', 'Charon', 'Orus']);

function sendWsJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '2mb'}));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ok: true});
  });

  app.post('/api/grounding/search', async (req: Request, res: Response) => {
    try {
      const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
      if (!query) {
        res.status(400).json({error: 'Query is required.'});
        return;
      }

      const result = await searchWithGrounding(query);
      res.json(result);
    } catch (err) {
      console.error('Search grounding error:', err);
      const {status, message} = formatGeminiError(err);
      res.status(status).json({error: message});
    }
  });

  app.post('/api/grounding/maps', async (req: Request, res: Response) => {
    try {
      const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
      if (!query) {
        res.status(400).json({error: 'Query is required.'});
        return;
      }

      const rawCoords = req.body?.coords;
      const coords =
        rawCoords &&
        typeof rawCoords.latitude === 'number' &&
        typeof rawCoords.longitude === 'number'
          ? {latitude: rawCoords.latitude, longitude: rawCoords.longitude}
          : undefined;

      const result = await mapsWithGrounding(query, coords);
      res.json(result);
    } catch (err) {
      console.error('Maps grounding error:', err);
      const {status, message} = formatGeminiError(err);
      res.status(status).json({error: message});
    }
  });

  app.get('/api/maps/config', (_req: Request, res: Response) => {
    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
    res.json({configured: Boolean(apiKey), apiKey});
  });

  app.post('/api/maps/places', async (req: Request, res: Response) => {
    try {
      const apiKey =
        process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
      if (!apiKey) {
        res.status(503).json({
          error: 'Google Maps Platform API key is not configured on the server.',
        });
        return;
      }

      const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
      if (!query) {
        res.status(400).json({error: 'Search query is required.'});
        return;
      }

      const rawCoords = req.body?.coords;
      const bodyPayload: Record<string, unknown> = {
        textQuery: query,
        pageSize: 8,
      };

      if (
        rawCoords &&
        typeof rawCoords.latitude === 'number' &&
        typeof rawCoords.longitude === 'number' &&
        Number.isFinite(rawCoords.latitude) &&
        Number.isFinite(rawCoords.longitude)
      ) {
        bodyPayload.locationBias = {
          circle: {
            center: {
              latitude: rawCoords.latitude,
              longitude: rawCoords.longitude,
            },
            radius: 15000.0,
          },
        };
      }

      const upstream = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.googleMapsUri,places.currentOpeningHours.openNow',
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
        body: JSON.stringify(bodyPayload),
      });

      const data = (await upstream.json().catch(() => ({}))) as {
        places?: Array<{
          id?: string;
          displayName?: {text?: string};
          formattedAddress?: string;
          location?: {latitude?: number; longitude?: number};
          rating?: number;
          userRatingCount?: number;
          primaryTypeDisplayName?: {text?: string};
          googleMapsUri?: string;
          currentOpeningHours?: {openNow?: boolean};
        }>;
        error?: {status?: string; message?: string; code?: number};
      };

      const errStatus = data?.error?.status || '';
      const errMsg = data?.error?.message || '';
      if (
        upstream.status === 429 ||
        errStatus === 'RESOURCE_EXHAUSTED' ||
        errMsg.includes('OVER_QUERY_LIMIT') ||
        errMsg.includes('Quota')
      ) {
        res.status(429).json({
          error: errMsg || 'Google Maps Platform quota reached.',
          quotaExceeded: true,
        });
        return;
      }

      if (!upstream.ok) {
        res.status(upstream.status).json({
          error: errMsg || `Places search failed (${upstream.status}).`,
        });
        return;
      }

      const places = (data.places ?? [])
        .filter(
          (p) =>
            typeof p.location?.latitude === 'number' &&
            typeof p.location?.longitude === 'number',
        )
        .map((p) => ({
          id: p.id || '',
          name: p.displayName?.text || 'Unnamed Place',
          address: p.formattedAddress || '',
          lat: p.location!.latitude!,
          lng: p.location!.longitude!,
          rating: typeof p.rating === 'number' ? p.rating : null,
          userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
          category: p.primaryTypeDisplayName?.text || '',
          googleMapsUri: p.googleMapsUri || '',
          openNow:
            typeof p.currentOpeningHours?.openNow === 'boolean'
              ? p.currentOpeningHours.openNow
              : null,
        }));

      res.json({places});
    } catch (err) {
      console.error('Places search proxy error:', err);
      res.status(500).json({error: 'Unable to reach Places API (New).'});
    }
  });

  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (process.env.NODE_ENV !== 'development' &&
      fs.existsSync(path.join(__dirname, 'dist', 'index.html')));

  if (isProduction) {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({noServer: true});

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || `localhost:${PORT}`;
      const url = new URL(request.url || '/', `http://${host}`);

      if (url.pathname === '/api/live') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request, url);
        });
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', async (clientWs: WebSocket, _request: http.IncomingMessage, url: URL) => {
    const requestedVoice = url?.searchParams?.get('voice') || 'Zephyr';
    const voiceName = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : 'Zephyr';

    let session: Session | null = null;
    let isClientClosed = false;

    clientWs.on('close', () => {
      isClientClosed = true;
      try {
        session?.close();
      } catch {
        // Ignore close errors on disconnected socket
      }
      session = null;
    });

    clientWs.on('message', (raw) => {
      if (!session || isClientClosed) return;

      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          data?: string;
          mimeType?: string;
        };

        if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
          session.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: msg.mimeType || 'audio/pcm;rate=16000',
            },
          });
        }
      } catch (err) {
        console.error('Error forwarding Live API audio input:', err);
      }
    });

    try {
      const client = getGeminiLiveClient();

      const liveSession = await client.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {voiceName},
            },
          },
          systemInstruction:
            'You are an intelligent, engaging voice assistant in the Remix Audio Orb. Keep your responses natural, expressive, concise, and conversational.',
        },
        callbacks: {
          onopen: () => {
            // Wait for setupComplete (when live.connect resolves) before signaling open
          },
          onmessage: (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                sendWsJson(clientWs, {
                  type: 'audio',
                  data: part.inlineData.data,
                });
              }
              if (part.text) {
                sendWsJson(clientWs, {
                  type: 'text',
                  text: part.text,
                });
              }
            }

            if (message.serverContent?.interrupted) {
              sendWsJson(clientWs, {type: 'interrupted'});
            }
          },
          onerror: (e: unknown) => {
            const msg =
              e && typeof e === 'object' && 'message' in e && typeof (e as {message: unknown}).message === 'string'
                ? (e as {message: string}).message
                : 'Live session encountered an issue.';
            sendWsJson(clientWs, {type: 'error', message: msg});
          },
          onclose: (e: {reason?: string}) => {
            sendWsJson(clientWs, {
              type: 'close',
              reason: e?.reason || '',
            });
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close();
            }
          },
        },
      });

      if (isClientClosed) {
        liveSession.close();
        return;
      }

      session = liveSession;
      sendWsJson(clientWs, {type: 'open'});
    } catch (err) {
      console.error('Live API connection error:', err);
      const {message} = formatGeminiError(err);
      sendWsJson(clientWs, {type: 'error', message});
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
