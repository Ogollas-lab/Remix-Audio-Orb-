/// <reference types="google.maps" />
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {importLibrary, setOptions} from '@googlemaps/js-api-loader';

export interface MapPlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingCount: number | null;
  category: string;
  googleMapsUri: string;
  openNow: boolean | null;
}

let mapsLoaderConfigured = false;

/**
 * Interactive Google Maps Platform explorer component using @googlemaps/js-api-loader,
 * AdvancedMarkerElement, PinElement, and server-proxied Places API (New).
 */
@customElement('maps-explorer')
export class MapsExplorer extends LitElement {
  @state() private query = '';
  @state() private isLoading = false;
  @state() private mapReady = false;
  @state() private errorMsg = '';
  @state() private places: MapPlaceResult[] = [];
  @state() private selectedPlaceId = '';
  @state() private userCoords: {latitude: number; longitude: number} | null = null;

  private mapEl?: HTMLDivElement;
  private map: google.maps.Map | null = null;
  private infoWindow: google.maps.InfoWindow | null = null;
  private markers: google.maps.marker.AdvancedMarkerElement[] = [];
  private AdvancedMarkerCtor: typeof google.maps.marker.AdvancedMarkerElement | null = null;
  private PinElementCtor: typeof google.maps.marker.PinElement | null = null;
  private LatLngBoundsCtor: typeof google.maps.LatLngBounds | null = null;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      width: 100%;
    }

    .query-row {
      display: flex;
      gap: 0.5rem;
    }

    .query-input {
      flex: 1;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #ffffff;
      border-radius: 10px;
      padding: 0.6rem 0.85rem;
      font-size: 0.84rem;
      outline: none;
    }

    .query-input:focus {
      border-color: #38bdf8;
    }

    .btn-primary {
      background: #0284c7;
      border: none;
      color: #ffffff;
      border-radius: 10px;
      padding: 0 0.95rem;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
    }

    .btn-primary:hover:not([disabled]) {
      background: #0369a1;
    }

    .btn-primary[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-locate {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #e2e8f0;
      border-radius: 10px;
      padding: 0 0.7rem;
      font-size: 0.78rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .btn-locate:hover {
      background: rgba(56, 189, 248, 0.16);
      border-color: rgba(56, 189, 248, 0.45);
      color: #38bdf8;
    }

    .chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .chip {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      padding: 0.32rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.72rem;
      cursor: pointer;
    }

    .chip:hover {
      background: rgba(56, 189, 248, 0.16);
      border-color: rgba(56, 189, 248, 0.45);
      color: #38bdf8;
    }

    /* Explicit map height prevents 0x0 collapse (CF2) */
    .map-shell {
      position: relative;
      width: 100%;
      height: 250px;
      min-height: 250px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: #0b1120;
    }

    .map-canvas {
      width: 100%;
      height: 100%;
    }

    .map-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 1rem;
      font-size: 0.78rem;
      color: #94a3b8;
      background: rgba(11, 17, 32, 0.92);
    }

    .error-box {
      color: #fca5a5;
      font-size: 0.78rem;
      padding: 0.55rem 0.75rem;
      background: rgba(239, 68, 68, 0.14);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
    }

    .places-list {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }

    .place-card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 0.65rem 0.8rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.22rem;
      text-align: left;
      color: inherit;
    }

    .place-card:hover,
    .place-card.selected {
      background: rgba(56, 189, 248, 0.12);
      border-color: rgba(56, 189, 248, 0.48);
    }

    .place-top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
    }

    .place-name {
      font-size: 0.82rem;
      font-weight: 600;
      color: #f8fafc;
    }

    .place-rating {
      font-size: 0.72rem;
      color: #fbbf24;
      white-space: nowrap;
    }

    .place-meta {
      font-size: 0.72rem;
      color: #94a3b8;
    }

    .place-links {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 0.15rem;
      font-size: 0.7rem;
    }

    .open-badge {
      color: #34d399;
      font-weight: 500;
    }

    .closed-badge {
      color: #f87171;
      font-weight: 500;
    }

    .maps-link {
      color: #38bdf8;
      text-decoration: none;
    }

    .maps-link:hover {
      text-decoration: underline;
    }
  `;

  protected firstUpdated() {
    this.mapEl = this.shadowRoot!.querySelector('.map-canvas') as HTMLDivElement;
    void this.initMap();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.clearMarkers();
    this.infoWindow?.close();
  }

  private triggerQuotaExceeded() {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }

  private async resolveApiKey(): Promise<string> {
    const envKey = (import.meta as unknown as {env?: Record<string, string>}).env
      ?.VITE_GOOGLE_MAPS_API_KEY;
    if (envKey) return envKey;

    try {
      const res = await fetch('/api/maps/config');
      if (res.ok) {
        const data = (await res.json()) as {apiKey?: string};
        if (data.apiKey) return data.apiKey;
      }
    } catch {
      // Ignore config fetch failure; handled below
    }
    return '';
  }

  private async initMap() {
    if (!this.mapEl || this.map) return;

    const apiKey = await this.resolveApiKey();
    if (!apiKey) {
      this.errorMsg =
        'Google Maps API key is not configured. Check Settings > Secrets to enable the interactive map.';
      return;
    }

    try {
      if (!mapsLoaderConfigured) {
        setOptions({
          key: apiKey,
          v: 'weekly',
          language: 'en',
          region: 'US',
        });
        mapsLoaderConfigured = true;
      }

      const [mapsLib, markerLib, coreLib] = await Promise.all([
        importLibrary('maps'),
        importLibrary('marker'),
        importLibrary('core'),
      ]);

      this.AdvancedMarkerCtor = markerLib.AdvancedMarkerElement;
      this.PinElementCtor = markerLib.PinElement;
      this.LatLngBoundsCtor = coreLib.LatLngBounds;

      const initialCenter = this.userCoords
        ? {lat: this.userCoords.latitude, lng: this.userCoords.longitude}
        : {lat: 37.7749, lng: -122.4194};

      this.map = new mapsLib.Map(this.mapEl, {
        center: initialCenter,
        zoom: 12,
        mapId: 'DEMO_MAP_ID',
        colorScheme: coreLib.ColorScheme.DARK,
        gestureHandling: 'greedy',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
      });

      this.infoWindow = new mapsLib.InfoWindow();
      this.mapReady = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('OverQuotaMapError') ||
        msg.includes('QuotaExceededError') ||
        msg.includes('OVER_QUERY_LIMIT')
      ) {
        this.triggerQuotaExceeded();
      }
      this.errorMsg = 'Unable to load the interactive Google Map right now.';
    }
  }

  private clearMarkers() {
    for (const marker of this.markers) {
      marker.map = null;
    }
    this.markers = [];
  }

  private buildInfoWindowContent(place: MapPlaceResult): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.color = '#0f172a';
    wrapper.style.maxWidth = '220px';
    wrapper.style.fontFamily = 'system-ui, sans-serif';

    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.style.fontSize = '13px';
    title.style.marginBottom = '3px';
    title.textContent = place.name;
    wrapper.appendChild(title);

    if (place.category || place.rating !== null) {
      const sub = document.createElement('div');
      sub.style.fontSize = '11px';
      sub.style.color = '#475569';
      sub.style.marginBottom = '4px';
      const ratingPart =
        place.rating !== null
          ? `★ ${place.rating.toFixed(1)}${place.userRatingCount ? ` (${place.userRatingCount})` : ''}`
          : '';
      sub.textContent = [place.category, ratingPart].filter(Boolean).join(' • ');
      wrapper.appendChild(sub);
    }

    if (place.address) {
      const addr = document.createElement('div');
      addr.style.fontSize = '11px';
      addr.style.color = '#334155';
      addr.style.marginBottom = '6px';
      addr.textContent = place.address;
      wrapper.appendChild(addr);
    }

    if (place.googleMapsUri) {
      const link = document.createElement('a');
      link.href = place.googleMapsUri;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.fontSize = '11px';
      link.style.fontWeight = '600';
      link.style.color = '#0284c7';
      link.textContent = 'Open in Google Maps →';
      wrapper.appendChild(link);
    }

    return wrapper;
  }

  private renderMarkers() {
    if (!this.map || !this.AdvancedMarkerCtor || !this.PinElementCtor || !this.LatLngBoundsCtor) {
      return;
    }

    this.clearMarkers();
    this.infoWindow?.close();

    if (this.places.length === 0) return;

    const bounds = new this.LatLngBoundsCtor();

    this.places.forEach((place, idx) => {
      const position = {lat: place.lat, lng: place.lng};
      bounds.extend(position);

      const pin = new this.PinElementCtor!({
        background: '#0284c7',
        borderColor: '#38bdf8',
        glyphColor: '#ffffff',
        glyphText: String(idx + 1),
        scale: 0.95,
      });

      const marker = new this.AdvancedMarkerCtor!({
        map: this.map!,
        position,
        title: place.name,
        content: pin,
      });

      marker.addListener('click', () => {
        this.focusPlace(place, marker);
      });

      this.markers.push(marker);
    });

    if (this.places.length === 1) {
      this.map.setCenter({lat: this.places[0].lat, lng: this.places[0].lng});
      this.map.setZoom(14);
    } else {
      this.map.fitBounds(bounds, 36);
    }
  }

  private focusPlace(
    place: MapPlaceResult,
    marker?: google.maps.marker.AdvancedMarkerElement,
  ) {
    this.selectedPlaceId = place.id;
    if (!this.map || !this.infoWindow) return;

    const idx = this.places.findIndex((p) => p.id === place.id);
    const targetMarker = marker || (idx >= 0 ? this.markers[idx] : undefined);

    this.map.panTo({lat: place.lat, lng: place.lng});
    if ((this.map.getZoom() ?? 0) < 14) {
      this.map.setZoom(14);
    }

    this.infoWindow.setContent(this.buildInfoWindowContent(place));
    if (targetMarker) {
      this.infoWindow.open({map: this.map, anchor: targetMarker});
    }
  }

  private async centerOnUserLocation() {
    if (!navigator.geolocation) {
      this.errorMsg = 'Geolocation is not supported in this browser.';
      return;
    }

    this.errorMsg = '';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.userCoords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        if (this.map) {
          this.map.panTo({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          this.map.setZoom(13);
        }
      },
      () => {
        this.errorMsg = 'Location permission denied. You can still search any city or place.';
      },
      {timeout: 5000},
    );
  }

  public async searchPlaces(overrideQuery?: string) {
    const q = (overrideQuery ?? this.query).trim();
    if (!q) return;
    if (overrideQuery) this.query = overrideQuery;

    this.isLoading = true;
    this.errorMsg = '';

    try {
      const res = await fetch('/api/maps/places', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          query: q,
          coords: this.userCoords || undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        places?: MapPlaceResult[];
        error?: string;
        quotaExceeded?: boolean;
      };

      if (res.status === 429 || data.quotaExceeded) {
        this.triggerQuotaExceeded();
        this.errorMsg = data.error || 'Google Maps Platform quota reached.';
        return;
      }

      if (!res.ok) {
        this.errorMsg = data.error || `Places search failed (${res.status}).`;
        return;
      }

      this.places = data.places ?? [];
      this.selectedPlaceId = this.places[0]?.id || '';
      this.renderMarkers();

      this.dispatchEvent(
        new CustomEvent('placessearched', {
          bubbles: true,
          composed: true,
          detail: {query: q, count: this.places.length, topName: this.places[0]?.name || ''},
        }),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
        this.triggerQuotaExceeded();
      }
      this.errorMsg = 'Unable to search places right now.';
    } finally {
      this.isLoading = false;
    }
  }

  render() {
    return html`
      <div class="query-row">
        <input
          type="text"
          class="query-input"
          placeholder="Search places, coffee, landmarks..."
          .value=${this.query}
          @input=${(e: Event) => (this.query = (e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter') void this.searchPlaces();
          }}
        />
        <button
          class="btn-locate"
          title="Center map on my current location"
          @click=${() => void this.centerOnUserLocation()}
        >
          📍
        </button>
        <button
          class="btn-primary"
          ?disabled=${this.isLoading || !this.query.trim()}
          @click=${() => void this.searchPlaces()}
        >
          ${this.isLoading ? '...' : 'Find'}
        </button>
      </div>

      <div class="chip-list">
        <button
          class="chip"
          @click=${() => void this.searchPlaces('Specialty coffee shops near San Francisco')}
        >
          Specialty Coffee
        </button>
        <button
          class="chip"
          @click=${() => void this.searchPlaces('Jazz clubs and live music venues')}
        >
          Live Music
        </button>
        <button
          class="chip"
          @click=${() => void this.searchPlaces('Botanical gardens and scenic viewpoints')}
        >
          Scenic Viewpoints
        </button>
        <button
          class="chip"
          @click=${() => void this.searchPlaces('Historic museums and landmarks')}
        >
          Museums
        </button>
      </div>

      <div class="map-shell">
        <div class="map-canvas"></div>
        ${!this.mapReady && !this.errorMsg
          ? html`<div class="map-placeholder">Loading interactive Google Map...</div>`
          : ''}
      </div>

      ${this.errorMsg ? html`<div class="error-box">⚠️ ${this.errorMsg}</div>` : ''}

      ${this.places.length > 0
        ? html`
            <div class="places-list">
              ${this.places.map(
                (place, idx) => html`
                  <div
                    class="place-card ${this.selectedPlaceId === place.id ? 'selected' : ''}"
                    @click=${() => this.focusPlace(place)}
                  >
                    <div class="place-top">
                      <span class="place-name">${idx + 1}. ${place.name}</span>
                      ${place.rating !== null
                        ? html`<span class="place-rating">★ ${place.rating.toFixed(1)}</span>`
                        : ''}
                    </div>
                    <div class="place-meta">
                      ${[place.category, place.address].filter(Boolean).join(' • ')}
                    </div>
                    <div class="place-links">
                      ${place.openNow === true
                        ? html`<span class="open-badge">Open now</span>`
                        : place.openNow === false
                        ? html`<span class="closed-badge">Closed</span>`
                        : html`<span></span>`}
                      ${place.googleMapsUri
                        ? html`
                            <a
                              class="maps-link"
                              href=${place.googleMapsUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              @click=${(e: Event) => e.stopPropagation()}
                            >
                              Directions ↗
                            </a>
                          `
                        : ''}
                    </div>
                  </div>
                `,
              )}
            </div>
          `
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'maps-explorer': MapsExplorer;
  }
}
