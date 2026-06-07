import { useMutation } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { categoryBySlug } from '@/data/categories';
import { settlementBySlug } from '@/data/settlements';
import { strings } from '@/i18n/strings';
import { useDraftStore } from '@/store/draftStore';
import { useQueueStore } from '@/store/queueStore';
import { colors, fontSize, radius, spacing } from '@/theme/theme';

export default function ReviewScreen() {
  const router = useRouter();
  const draft = useDraftStore((s) => s.draft);
  const resetDraft = useDraftStore((s) => s.reset);
  const enqueueFromDraft = useQueueStore((s) => s.enqueueFromDraft);
  const trySend = useQueueStore((s) => s.trySend);

  const category = draft.categorySlug ? categoryBySlug(draft.categorySlug) : undefined;
  const settlement = draft.settlementSlug
    ? settlementBySlug(draft.settlementSlug)
    : undefined;

  const mutation = useMutation({
    mutationFn: async () => {
      const id = await enqueueFromDraft(draft);
      return trySend(id);
    },
    onSuccess: (result) => {
      resetDraft();
      router.replace({
        pathname: '/report/sent',
        params: {
          mode: result ? 'sent' : 'queued',
          code: result?.publicCode ?? '',
        },
      });
    },
    onError: () => {
      Alert.alert(strings.appName, strings.errors.saveFailed);
    },
  });

  const photoCount = draft.media.filter((m) => m.kind === 'image').length;
  const hasVideo = draft.media.some((m) => m.kind === 'video');
  const mediaSummary = hasVideo
    ? strings.capture.videoAttached
    : `${photoCount} снимки`;

  const contactSummary = [draft.reporterName.trim(), draft.reporterPhone.trim()]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen
      footer={
        <PrimaryButton
          label={mutation.isPending ? strings.review.sending : strings.review.send}
          onPress={() => mutation.mutate()}
          loading={mutation.isPending}
        />
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        <Text style={styles.title}>{strings.review.title}</Text>

        <Row icon="shape-outline" label={strings.review.category} value={category?.nameBg ?? strings.review.none} />
        <Row icon="map-marker-outline" label={strings.review.settlement} value={settlement?.nameBg ?? strings.review.none} />
        <Row
          icon="crosshairs-gps"
          label={strings.review.location}
          value={
            draft.location
              ? `${draft.location.lat.toFixed(5)}, ${draft.location.lng.toFixed(5)}`
              : strings.review.none
          }
        />
        <Row icon="image-multiple-outline" label={strings.review.media} value={mediaSummary} />
        <Row
          icon="text-box-outline"
          label={strings.review.description}
          value={draft.description.trim() || strings.review.none}
        />
        <Row
          icon="account-outline"
          label={strings.review.contact}
          value={contactSummary || strings.review.none}
        />

        <View style={styles.offlineNote}>
          <Text style={styles.offlineText}>{strings.review.offlineNote}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons name={icon} size={26} color={colors.primary} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    fontWeight: '700',
  },
  rowValue: {
    fontSize: fontSize.lead,
    color: colors.text,
  },
  offlineNote: {
    marginTop: spacing.md,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  offlineText: {
    fontSize: fontSize.small,
    color: colors.text,
    lineHeight: 22,
  },
});
