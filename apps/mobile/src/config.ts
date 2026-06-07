import Constants from 'expo-constants';

/**
 * Базовият адрес на API-то идва от env (EXPO_PUBLIC_API_BASE_URL) или от
 * `extra.apiBaseUrl` в app.json. Никога не се кодира твърдо в кода.
 */
function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  const fromExtra = Constants.expoConfig?.extra?.apiBaseUrl;
  const value = fromEnv ?? (typeof fromExtra === 'string' ? fromExtra : undefined);
  if (!value) {
    throw new Error(
      'Липсва API адрес. Задай EXPO_PUBLIC_API_BASE_URL или extra.apiBaseUrl в app.json.',
    );
  }
  return value.replace(/\/+$/, '');
}

export const config = {
  apiBaseUrl: resolveApiBaseUrl(),
  maxPhotos: 3,
  /** Времеви лимит за вземане на GPS координати. */
  locationTimeoutMs: 12_000,
} as const;
