/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  /**
   * Search Grounding via server endpoint (/api/grounding/search)
   */
  async searchWithGrounding(query: string): Promise<GroundingResult> {
    const response = await fetch('/api/grounding/search', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query}),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Search grounding request failed (${response.status}).`);
    }

    return data as GroundingResult;
  }

  /**
   * Maps Grounding via server endpoint (/api/grounding/maps)
   */
  async mapsWithGrounding(
    query: string,
    coords?: {latitude: number; longitude: number},
  ): Promise<GroundingResult> {
    const response = await fetch('/api/grounding/maps', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query, coords}),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Maps grounding request failed (${response.status}).`);
    }

    return data as GroundingResult;
  }
}
