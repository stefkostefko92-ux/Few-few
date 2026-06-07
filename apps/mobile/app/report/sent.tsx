import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { strings } from '@/i18n/strings';
import { useDraftStore } from '@/store/draftStore';
import { colors, fontSize, radius, spacing } from '@/theme/theme';

export default function SentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; code?: string }>();
  const resetDraft = useDraftStore((s) => s.reset);

  const queued = params.mode === 'queued';
  const code = typeof params.code === 'string' ? params.code : '';

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
  }, []);

  function goHome() {
    router.replace('/');
  }

  function another() {
    resetDraft();
    router.replace('/report/category');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <View style={[styles.badge, queued ? styles.badgeQueued : styles.badgeOk]}>
          <MaterialCommunityIcons
            name={queued ? 'cloud-clock-outline' : 'check-bold'}
            size={72}
            color={colors.textInverse}
          />
        </View>
        <Text style={styles.title}>
          {queued ? strings.success.queuedTitle : strings.success.title}
        </Text>
        <Text style={styles.body}>
          {queued ? strings.success.queuedBody : strings.success.body}
        </Text>

        {!queued && code ? (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>{strings.success.codeLabel}</Text>
            <Text style={styles.code}>{code}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <PrimaryButton label={strings.success.done} onPress={goHome} />
        <SecondaryButton
          label={strings.success.another}
          icon="plus"
          onPress={another}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  badge: {
    width: 128,
    height: 128,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  badgeOk: {
    backgroundColor: colors.success,
  },
  badgeQueued: {
    backgroundColor: colors.accent,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: spacing.md,
  },
  codeCard: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  codeLabel: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    fontWeight: '700',
  },
  code: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
  },
  footer: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
});
