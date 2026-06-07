import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { StepHeader } from '@/components/StepHeader';
import { config } from '@/config';
import { strings } from '@/i18n/strings';
import { pickFromGallery, recordVideo, takePhoto, type PickOutcome } from '@/media/pick';
import { useDraftStore } from '@/store/draftStore';
import { colors, fontSize, radius, spacing } from '@/theme/theme';

export default function CaptureScreen() {
  const router = useRouter();
  const media = useDraftStore((s) => s.draft.media);
  const addMedia = useDraftStore((s) => s.addMedia);
  const removeMedia = useDraftStore((s) => s.removeMedia);
  const [busy, setBusy] = useState(false);

  const hasVideo = media.some((m) => m.kind === 'video');
  const photoCount = media.filter((m) => m.kind === 'image').length;
  const photosFull = photoCount >= config.maxPhotos;

  async function run(action: () => Promise<PickOutcome>, deniedMessage: string) {
    setBusy(true);
    try {
      const outcome = await action();
      if (outcome.status === 'denied') {
        Alert.alert(strings.appName, deniedMessage);
      } else if (outcome.status === 'ok') {
        addMedia(outcome.asset);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <PrimaryButton
          label={strings.steps.next}
          onPress={() => router.push('/report/location')}
          disabled={media.length === 0}
        />
      }
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <StepHeader
          step={2}
          total={4}
          title={strings.capture.title}
          subtitle={strings.capture.subtitle}
        />

        {media.length > 0 ? (
          <View style={styles.thumbs}>
            {media.map((asset) => (
              <View key={asset.uri} style={styles.thumb}>
                {asset.kind === 'image' ? (
                  <Image source={{ uri: asset.uri }} style={styles.thumbImage} />
                ) : (
                  <View style={[styles.thumbImage, styles.videoThumb]}>
                    <MaterialCommunityIcons
                      name="play-circle-outline"
                      size={40}
                      color={colors.textInverse}
                    />
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.capture.remove}
                  onPress={() => removeMedia(asset.uri)}
                  style={styles.removeBadge}
                >
                  <MaterialCommunityIcons name="close" size={20} color={colors.textInverse} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {media.length > 0 ? (
          <Text style={styles.count}>
            {hasVideo ? strings.capture.videoAttached : strings.capture.photoCount(photoCount)}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {!hasVideo ? (
            <SecondaryButton
              label={strings.capture.takePhoto}
              icon="camera-outline"
              disabled={busy || photosFull}
              onPress={() => void run(takePhoto, strings.capture.permissionCamera)}
            />
          ) : null}
          {!hasVideo ? (
            <SecondaryButton
              label={strings.capture.fromGallery}
              icon="image-outline"
              disabled={busy || photosFull}
              onPress={() => void run(pickFromGallery, strings.capture.permissionGallery)}
            />
          ) : null}
          {photoCount === 0 ? (
            <SecondaryButton
              label={strings.capture.recordVideo}
              icon="video-outline"
              disabled={busy || hasVideo}
              onPress={() => void run(recordVideo, strings.capture.permissionCamera)}
            />
          ) : null}
        </View>

        {media.length === 0 ? (
          <Text style={styles.help}>{strings.capture.needOne}</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  thumb: {
    width: 104,
    height: 104,
  },
  thumbImage: {
    width: 104,
    height: 104,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  videoThumb: {
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  help: {
    marginTop: spacing.lg,
    fontSize: fontSize.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 26,
  },
});
