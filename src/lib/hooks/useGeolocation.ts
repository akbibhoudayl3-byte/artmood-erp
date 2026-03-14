'use client';

import { useState, useCallback } from 'react';

export interface GeolocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
  timestamp: number | null;
}

export interface UseGeolocationReturn extends GeolocationState {
  /** Request the device's current GPS position */
  getCurrentPosition: () => Promise<GeolocationCoordinates | null>;
  /** Clear any error state */
  reset: () => void;
}

const DEFAULT_STATE: GeolocationState = {
  lat: null, lng: null, accuracy: null,
  loading: false, error: null, timestamp: null,
};

/**
 * useGeolocation — Mobile-ready GPS hook
 *
 * Usage:
 *   const { lat, lng, accuracy, loading, error, getCurrentPosition } = useGeolocation();
 *
 *   const coords = await getCurrentPosition();
 *   if (coords) { ...action with coords.latitude, coords.longitude }
 */
export function useGeolocation(): UseGeolocationReturn {
  const [state, setState] = useState<GeolocationState>(DEFAULT_STATE);

  const getCurrentPosition = useCallback((): Promise<GeolocationCoordinates | null> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !navigator.geolocation) {
        setState(s => ({
          ...s,
          error: 'GPS is not available on this device.',
          loading: false,
        }));
        resolve(null);
        return;
      }

      setState(s => ({ ...s, loading: true, error: null }));

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          setState({
            lat: latitude,
            lng: longitude,
            accuracy,
            loading: false,
            error: null,
            timestamp: position.timestamp,
          });
          resolve(position.coords);
        },
        (err) => {
          let message: string;
          switch (err.code) {
            case 1:  message = 'Location permission denied. Please enable GPS in your browser settings.'; break;
            case 2:  message = 'GPS signal unavailable. Please move to an open area.'; break;
            case 3:  message = 'GPS request timed out. Please try again.'; break;
            default: message = 'Failed to obtain GPS location.';
          }
          setState(s => ({ ...s, loading: false, error: message }));
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 30_000,
        }
      );
    });
  }, []);

  const reset = useCallback(() => setState(DEFAULT_STATE), []);

  return { ...state, getCurrentPosition, reset };
}
