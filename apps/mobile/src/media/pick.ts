import * as ImagePicker from 'expo-image-picker';

import type { MediaAsset } from '@/types';

export type PickOutcome =
  | { status: 'ok'; asset: MediaAsset }
  | { status: 'cancelled' }
  | { status: 'denied' };

function toAsset(asset: ImagePicker.ImagePickerAsset): MediaAsset {
  const kind: MediaAsset['kind'] = asset.type === 'video' ? 'video' : 'image';
  const fallbackName = asset.uri.split('/').pop() ?? `media-${Date.now()}`;
  const mimeType =
    asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  return {
    uri: asset.uri,
    kind,
    mimeType,
    fileName: asset.fileName ?? fallbackName,
  };
}

export async function takePhoto(): Promise<PickOutcome> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { status: 'denied' };
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  });
  if (result.canceled || !result.assets[0]) {
    return { status: 'cancelled' };
  }
  return { status: 'ok', asset: toAsset(result.assets[0]) };
}

export async function recordVideo(): Promise<PickOutcome> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { status: 'denied' };
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    quality: 0.7,
    videoMaxDuration: 30,
  });
  if (result.canceled || !result.assets[0]) {
    return { status: 'cancelled' };
  }
  return { status: 'ok', asset: toAsset(result.assets[0]) };
}

export async function pickFromGallery(): Promise<PickOutcome> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { status: 'denied' };
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  });
  if (result.canceled || !result.assets[0]) {
    return { status: 'cancelled' };
  }
  return { status: 'ok', asset: toAsset(result.assets[0]) };
}
