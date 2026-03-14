'use client';

import { useState, useCallback } from 'react';
import { useGeolocation } from './useGeolocation';

export interface GeoGateResult {
  allowed: boolean;
  distance_meters?: number;
  radius_meters?: number;
  reason: string;
  missing_gps?: boolean;
}

export interface UseInstallationGeogateReturn {
  /** Run the geo-gate check before performing an installation action */
  geoGate: (projectId: string, actionType: string, installationId?: string) => Promise<GeoGateResult>;
  loading: boolean;
  lastResult: GeoGateResult | null;
  gpsError: string | null;
}

/**
 * useInstallationGeogate — Geo-gate hook for installer actions
 *
 * Wraps useGeolocation + the /api/installation/geo-gate endpoint.
 * Always enforces the server-side Postgres RPC, which is the
 * authoritative check. Client-side GPS is only used to obtain coords.
 *
 * Usage:
 *   const { geoGate, loading, lastResult } = useInstallationGeogate();
 *
 *   async function handleStartInstallation() {
 *     const result = await geoGate(projectId, 'start_installation', installationId);
 *     if (!result.allowed) {
 *       alert(result.reason);
 *       return;
 *     }
 *     // Proceed with action
 *   }
 */
export function useInstallationGeogate(): UseInstallationGeogateReturn {
  const { getCurrentPosition, error: gpsError } = useGeolocation();
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<GeoGateResult | null>(null);

  const geoGate = useCallback(async (
    projectId: string,
    actionType: string,
    installationId?: string
  ): Promise<GeoGateResult> => {
    setLoading(true);

    // 1. Get device GPS
    const coords = await getCurrentPosition();
    if (!coords) {
      const result: GeoGateResult = {
        allowed: false,
        reason: gpsError || 'Could not obtain GPS location. Please enable location services.',
      };
      setLastResult(result);
      setLoading(false);
      return result;
    }

    // 2. Call server-side enforcement
    try {
      const res = await fetch('/api/installation/geo-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:      projectId,
          action_type:     actionType,
          user_lat:        coords.latitude,
          user_lng:        coords.longitude,
          accuracy_m:      coords.accuracy,
          installation_id: installationId,
          device_info:     navigator.userAgent,
        }),
      });

      const data = await res.json();

      const result: GeoGateResult = {
        allowed:          data.allowed ?? false,
        distance_meters:  data.distance_meters,
        radius_meters:    data.radius_meters,
        reason:           data.reason ?? data.error ?? 'Unknown error',
        missing_gps:      data.missing_gps ?? false,
      };

      setLastResult(result);
      setLoading(false);
      return result;

    } catch (err) {
      const result: GeoGateResult = {
        allowed: false,
        reason: 'Network error. Please check your connection and try again.',
      };
      setLastResult(result);
      setLoading(false);
      return result;
    }
  }, [getCurrentPosition, gpsError]);

  return { geoGate, loading, lastResult, gpsError };
}
