// Reguły nawierzchni dla różnych typów rowerów
export const bikeSurfaceRules = {
  miejski: ['asphalt', 'paving_stones', 'concrete'],
  trekkingowy: ['asphalt', 'concrete', 'gravel'],
  górski: ['asphalt', 'concrete', 'gravel', 'dirt', 'ground', 'sand'],
  szosowy: ['asphalt', 'concrete']
};

// Nazwy typów rowerów
export const bikeTypes = ['miejski', 'trekkingowy', 'górski', 'szosowy'];

// Funkcja sprawdzająca czy nawierzchnia jest odpowiednia dla danego typu roweru
export function isSurfaceAllowed(surface, bikeType) {
  if (!surface || surface === 'unknown') return null; // Brak danych
  
  const allowed = bikeSurfaceRules[bikeType];
  if (!allowed) return null;
  
  // Obsługa list nawierzchni
  if (Array.isArray(surface)) {
    return surface.some(s => allowed.includes(s));
  }
  
  return allowed.includes(surface);
}

// Funkcja oceniająca trasę pod kątem nawierzchni
export function evaluateRoute(surfaces, bikeType) {
  const uniqueSurfaces = new Set(surfaces);
  const allowed = bikeSurfaceRules[bikeType];
  
  // Jeśli wszystkie nawierzchnie to "unknown"
  if (uniqueSurfaces.size === 1 && uniqueSurfaces.has('unknown')) {
    return {
      suitable: null,
      status: 'warning',
      message: '⚠️ Trasa może być nieodpowiednia. Brak danych o nawierzchni.',
      unknownSurfaces: surfaces.filter(s => s === 'unknown').length,
      totalSegments: surfaces.length
    };
  }
  
  // Sprawdź niedozwolone nawierzchnie
  const notAllowed = Array.from(uniqueSurfaces)
    .filter(s => s !== 'unknown' && !allowed.includes(s));
  
  if (notAllowed.length > 0) {
    return {
      suitable: false,
      status: 'error',
      message: `❌ Trasa NIE jest odpowiednia dla roweru typu: ${bikeType}`,
      notAllowedSurfaces: notAllowed,
      allSurfaces: Array.from(uniqueSurfaces)
    };
  }
  
  return {
    suitable: true,
    status: 'success',
    message: `✅ Trasa jest odpowiednia dla roweru typu: ${bikeType}`,
    allSurfaces: Array.from(uniqueSurfaces)
  };
}