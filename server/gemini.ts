/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI} from '@google/genai';

export interface GroundingSource {
  title: string;
  uri: string;
  type: 'web' | 'maps';
  snippet?: string;
}

export interface GroundingResult {
  text: string;
  sources: GroundingSource[];
  searchQueries?: string[];
  type: 'search' | 'maps';
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets.',
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function getGeminiLiveClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets.',
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function formatGeminiError(err: unknown): {status: number; message: string} {
  const rawMessage =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown Gemini API error';

  let parsedMessage = rawMessage;
  let parsedStatus = '';
  let parsedCode = 0;

  try {
    const trimmed = rawMessage.trim();
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed) as {
        error?: {code?: number; message?: string; status?: string};
        message?: string;
        status?: string;
      };
      const inner = parsed.error ?? parsed;
      if (typeof inner.message === 'string' && inner.message.trim()) {
        parsedMessage = inner.message.trim();
      }
      if (typeof inner.status === 'string') {
        parsedStatus = inner.status;
      }
      if (typeof parsed.error?.code === 'number') {
        parsedCode = parsed.error.code;
      }
    }
  } catch {
    // Keep rawMessage if it is not JSON
  }

  if (rawMessage.includes('PROXY_GENERATION_DISABLED')) {
    return {
      status: 403,
      message:
        'This feature requires a Gemini API key attached in Settings > Secrets. Add your key there to enable generateContent.',
    };
  }

  let status = parsedCode >= 400 && parsedCode < 600 ? parsedCode : 500;
  if (rawMessage.includes('400') || rawMessage.includes('API_KEY_INVALID') || parsedStatus === 'INVALID_ARGUMENT') {
    status = 400;
  } else if (rawMessage.includes('403') || rawMessage.includes('PERMISSION_DENIED') || parsedStatus === 'PERMISSION_DENIED') {
    status = 403;
    parsedMessage =
      'Gemini API access was denied. Please check your API key in Settings > Secrets.';
  } else if (rawMessage.includes('404') || rawMessage.includes('NOT_FOUND') || parsedStatus === 'NOT_FOUND') {
    status = 404;
  } else if (
    rawMessage.includes('429') ||
    rawMessage.includes('RESOURCE_EXHAUSTED') ||
    parsedStatus === 'RESOURCE_EXHAUSTED'
  ) {
    status = 429;
    parsedMessage =
      'Gemini API quota reached for this request. Please wait a moment and try again, or verify your plan in Settings > Secrets.';
  }

  return {status, message: parsedMessage};
}

/**
 * Search Grounding using gemini-4-hydrogen with googleSearch tool
 */
export async function searchWithGrounding(query: string): Promise<GroundingResult> {
  const client = getGeminiClient();

  const response = await client.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: query,
    config: {
      systemInstruction:
        'You are an intelligent knowledge assistant providing accurate, up-to-date information grounded by Google Search. Provide insightful, structured answers and cite references clearly.',
      tools: [{googleSearch: {}}],
    },
  });

  const text = response.text || 'No response generated.';
  const sources: GroundingSource[] = [];
  const searchQueries: string[] = [];

  const metadata = response.candidates?.[0]?.groundingMetadata;

  if (metadata?.webSearchQueries) {
    searchQueries.push(...metadata.webSearchQueries);
  }

  if (metadata?.groundingChunks) {
    for (const chunk of metadata.groundingChunks as Array<{
      web?: {uri?: string; title?: string};
    }>) {
      if (chunk.web?.uri) {
        sources.push({
          title: chunk.web.title || chunk.web.uri,
          uri: chunk.web.uri,
          type: 'web',
        });
      }
    }
  }

  return {
    text,
    sources,
    searchQueries,
    type: 'search',
  };
}

/**
 * Maps Grounding using gemini-4-hydrogen with googleMaps tool
 */
export async function mapsWithGrounding(
  query: string,
  coords?: {latitude: number; longitude: number},
): Promise<GroundingResult> {
  const client = getGeminiClient();

  const config: {
    systemInstruction: string;
    tools: Array<{googleMaps: Record<string, never>}>;
    toolConfig?: {
      retrievalConfig: {
        latLng: {latitude: number; longitude: number};
      };
    };
  } = {
    systemInstruction:
      'You are an expert geographical and local guide. Provide clear recommendations with specific details about places, venues, atmosphere, and practical tips. Highlight key locations.',
    tools: [{googleMaps: {}}],
  };

  if (
    coords &&
    typeof coords.latitude === 'number' &&
    typeof coords.longitude === 'number' &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude)
  ) {
    config.toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: coords.latitude,
          longitude: coords.longitude,
        },
      },
    };
  }

  const response = await client.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: query,
    config,
  });

  const text = response.text || 'No location details found.';
  const sources: GroundingSource[] = [];

  const metadata = response.candidates?.[0]?.groundingMetadata;

  if (metadata?.groundingChunks) {
    for (const chunk of metadata.groundingChunks as Array<{
      maps?: {
        uri?: string;
        title?: string;
        placeAnswerSources?: {
          reviewSnippets?: Array<string | {content?: string}>;
        };
      };
    }>) {
      if (chunk.maps?.uri) {
        const rawSnippet = chunk.maps.placeAnswerSources?.reviewSnippets?.[0];
        const snippet =
          typeof rawSnippet === 'string'
            ? rawSnippet
            : rawSnippet && typeof rawSnippet.content === 'string'
            ? rawSnippet.content
            : undefined;

        sources.push({
          title: chunk.maps.title || 'Google Maps Location',
          uri: chunk.maps.uri,
          type: 'maps',
          snippet,
        });
      }
    }
  }

  return {
    text,
    sources,
    type: 'maps',
  };
}
