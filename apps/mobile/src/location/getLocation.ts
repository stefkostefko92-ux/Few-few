import * as Location from 'expo-location';

import { config } from '@/config';
import type { GeoPoint } from '@/types';

export type LocationOutcome =
  | { status: 'ok'; point: GeoPoint }
  | { status: 'denied' }
  | { status: 'failed' };

/**
 * Взема текущото местоположение с точност, подходяща за уличен сигнал.
 * Местоположението е по желание — гражданинът винаги може да избере село ръчно.
 */
export async function getCurrentLocation(): Promise<LocationOutcome> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    return { status: 'denied' };
  }
  try {
    const reading = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), config.locationTimeoutMs),
      ),
    ]);
    if (!reading) {
      return { status: 'failed' };
    }
    return {
      status: 'ok',
      point: { lat: reading.coords.latitude, lng: reading.coords.longitude },
    };
  } catch {
    return { status: 'failed' };
  }
}
