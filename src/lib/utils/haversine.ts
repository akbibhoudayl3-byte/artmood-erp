/**
 * Haversine distance formula — client-side implementation
 * Mirrors the server-side PostgreSQL function for UI pre-checks.
 *
 * Returns distance in metres between two GPS points.
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true if the user is within `radiusMetres` of the target.
 */
export function isWithinRadius(
  userLat: number, userLon: number,
  targetLat: number, targetLon: number,
  radiusMetres = 150
): boolean {
  return haversineDistance(userLat, userLon, targetLat, targetLon) <= radiusMetres;
}
