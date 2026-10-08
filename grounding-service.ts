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

export class GroundingService {
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

  /**
   * Search Grounding using gemini-3.5-flash with googleSearch tool
   */
  async searchWithGrounding(query: string): Promise<GroundingResult> {
    const response = await this.client.models.generateContent({
      model: 'gemini-3.5-flash',
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
      for (const chunk of metadata.groundingChunks as any[]) {
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
   * Maps Grounding using gemini-3.5-flash with googleMaps tool
   */
  async mapsWithGrounding(
    query: string,
    coords?: {latitude: number; longitude: number},
  ): Promise<GroundingResult> {
    const config: any = {
      systemInstruction:
        'You are an expert geographical and local guide. Provide clear recommendations with specific details about places, venues, atmosphere, and practical tips. Highlight key locations.',
      tools: [{googleMaps: {}}],
    };

    if (coords && coords.latitude && coords.longitude) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
        },
      };
    }

    const response = await this.client.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: query,
      config,
    });

    const text = response.text || 'No location details found.';
    const sources: GroundingSource[] = [];

    const metadata = response.candidates?.[0]?.groundingMetadata;

    if (metadata?.groundingChunks) {
      for (const chunk of metadata.groundingChunks as any[]) {
        if (chunk.maps?.uri) {
          sources.push({
            title: chunk.maps.title || 'Google Maps Location',
            uri: chunk.maps.uri,
            type: 'maps',
            snippet:
              chunk.maps.placeAnswerSources?.reviewSnippets?.[0] || undefined,
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
}
