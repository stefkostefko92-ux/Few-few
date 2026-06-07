import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { strings } from '@/i18n/strings';
import { useDraftStore } from '@/store/draftStore';
import { useQueueStore } from '@/store/queueStore';
import { colors, fontSize, radius, shadow, spacing } from '@/theme/theme';

export default function HomeScreen() {
  const router = useRouter();
  const resetDraft = useDraftStore((s) => s.reset);
  const pending = useQueueStore((s) => s.items.length);
  const processing = useQueueStore((s) => s.processing);
  const processAll = useQueueStore((s) => s.processAll);

  function startReport() {
    resetDraft();
    router.push('/report/category');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.brand}>{strings.appName}</Text>
        <Text style={styles.tagline}>{strings.tagline}</Text>
      </View>

      <View style={styles.center}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.home.submit}
          onPress={startReport}
          style={({ pressed }) => [
            styles.bigButton,
            pressed ? styles.bigButtonPressed : null,
          ]}
        >
          <MaterialCommunityIcons
            name="bullhorn-variant-outline"
            size={64}
            color={colors.textInverse}
          />
          <Text style={styles.bigLabel}>{strings.home.submit}</Text>
          <Text style={styles.bigHint}>{strings.home.submitHint}</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        {pending > 0 ? (
          <View style={styles.pendingCard}>
            <MaterialCommunityIcons
              name="cloud-upload-outline"
              size={28}
              color={colors.accent}
            />
            <Text style={styles.pendingText}>
              {pending === 1
                ? strings.home.pendingOne
                : strings.home.pendingMany(pending)}
            </Text>
            <PrimaryButton
              label={processing ? strings.home.sending : strings.home.retryNow}
              onPress={() => void processAll()}
              loading={processing}
            />
          </View>
        ) : null}
        <Text style={styles.disclaimer}>{strings.home.disclaimer}</Text>
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
  header: {
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  brand: {
    fontSize: fontSize.display,
    fontWeight: '800',
    color: colors.text,
  },
  tagline: {
    fontSize: fontSize.lead,
    color: colors.textMuted,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigButton: {
    width: '100%',
    aspectRatio: 1.1,
    maxHeight: 320,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadow.card,
  },
  bigButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  bigLabel: {
    color: colors.textInverse,
    fontSize: fontSize.display,
    fontWeight: '800',
  },
  bigHint: {
    color: colors.primarySoft,
    fontSize: fontSize.lead,
  },
  footer: {
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  pendingCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  pendingText: {
    fontSize: fontSize.body,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
