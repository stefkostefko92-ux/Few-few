import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { StepHeader } from '@/components/StepHeader';
import { settlements } from '@/data/settlements';
import { strings } from '@/i18n/strings';
import { getCurrentLocation } from '@/location/getLocation';
import { useDraftStore } from '@/store/draftStore';
import { colors, fontSize, minTouch, radius, spacing } from '@/theme/theme';

type LocationStatus = 'idle' | 'locating' | 'located' | 'denied' | 'failed';

export default function LocationScreen() {
  const router = useRouter();
  const location = useDraftStore((s) => s.draft.location);
  const settlementSlug = useDraftStore((s) => s.draft.settlementSlug);
  const setLocation = useDraftStore((s) => s.setLocation);
  const setSettlement = useDraftStore((s) => s.setSettlement);

  const [status, setStatus] = useState<LocationStatus>('idle');
  const [pickerOpen, setPickerOpen] = useState(false);

  const settlement = settlements.find((s) => s.slug === settlementSlug) ?? null;

  async function locate() {
    setStatus('locating');
    const outcome = await getCurrentLocation();
    if (outcome.status === 'ok') {
      setLocation(outcome.point);
      setStatus('located');
    } else {
      setLocation(null);
      setStatus(outcome.status);
    }
  }

  useEffect(() => {
    if (status === 'idle' && !location) {
      void locate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen
      footer={
        <PrimaryButton
          label={strings.steps.next}
          onPress={() => router.push('/report/details')}
          disabled={!settlementSlug}
        />
      }
    >
      <StepHeader
        step={3}
        total={4}
        title={strings.location.title}
        subtitle={strings.location.subtitle}
      />

      <View style={styles.statusCard}>
        <MaterialCommunityIcons
          name={location ? 'map-marker-check' : 'map-marker-alert-outline'}
          size={32}
          color={location ? colors.success : colors.accent}
        />
        <Text style={styles.statusText}>
          {status === 'locating'
            ? strings.location.locating
            : location
              ? strings.location.located
              : status === 'denied'
                ? strings.location.permissionLocation
                : strings.location.noLocation}
        </Text>
        {!location && status !== 'locating' ? (
          <SecondaryButton
            label={strings.location.retryLocation}
            icon="crosshairs-gps"
            onPress={() => void locate()}
          />
        ) : null}
      </View>

      <Text style={styles.label}>{strings.location.settlementLabel}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.location.settlementLabel}
        onPress={() => setPickerOpen(true)}
        style={({ pressed }) => [styles.select, pressed ? styles.selectPressed : null]}
      >
        <Text style={settlement ? styles.selectValue : styles.selectPlaceholder}>
          {settlement ? settlement.nameBg : strings.location.settlementPlaceholder}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={28} color={colors.textMuted} />
      </Pressable>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{strings.location.settlementPlaceholder}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Затвори"
              onPress={() => setPickerOpen(false)}
              style={styles.modalClose}
            >
              <MaterialCommunityIcons name="close" size={28} color={colors.text} />
            </Pressable>
          </View>
          <FlatList
            data={settlements}
            keyExtractor={(item) => item.slug}
            contentContainerStyle={styles.modalList}
            renderItem={({ item }) => {
              const selected = item.slug === settlementSlug;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.nameBg}
                  onPress={() => {
                    setSettlement(item.slug);
                    setPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    pressed ? styles.optionPressed : null,
                  ]}
                >
                  <Text style={styles.optionText}>
                    {item.nameBg}
                    {item.isTown ? '  (град)' : ''}
                  </Text>
                  {selected ? (
                    <MaterialCommunityIcons name="check" size={26} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statusText: {
    fontSize: fontSize.body,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 26,
  },
  label: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  select: {
    minHeight: minTouch,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  selectValue: {
    fontSize: fontSize.lead,
    color: colors.text,
    fontWeight: '600',
  },
  selectPlaceholder: {
    fontSize: fontSize.lead,
    color: colors.textMuted,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.text,
  },
  modalClose: {
    padding: spacing.xs,
  },
  modalList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  option: {
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  optionText: {
    fontSize: fontSize.lead,
    color: colors.text,
  },
});
