import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { strings } from '@/i18n/strings';
import { useDraftStore } from '@/store/draftStore';
import { colors, fontSize, minTouch, radius, spacing } from '@/theme/theme';

export default function DetailsScreen() {
  const router = useRouter();
  const description = useDraftStore((s) => s.draft.description);
  const reporterName = useDraftStore((s) => s.draft.reporterName);
  const reporterPhone = useDraftStore((s) => s.draft.reporterPhone);
  const setDescription = useDraftStore((s) => s.setDescription);
  const setReporterName = useDraftStore((s) => s.setReporterName);
  const setReporterPhone = useDraftStore((s) => s.setReporterPhone);

  return (
    <Screen
      footer={
        <PrimaryButton
          label={strings.steps.next}
          onPress={() => router.push('/report/review')}
        />
      }
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <StepHeader
            step={4}
            total={4}
            title={strings.details.title}
            subtitle={strings.details.subtitle}
          />

          <Text style={styles.label}>{strings.details.descriptionLabel}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder={strings.details.descriptionPlaceholder}
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={1000}
          />

          <Text style={styles.label}>{strings.details.nameLabel}</Text>
          <TextInput
            style={styles.input}
            value={reporterName}
            onChangeText={setReporterName}
            placeholder={strings.details.namePlaceholder}
            placeholderTextColor={colors.textMuted}
            maxLength={120}
          />

          <Text style={styles.label}>{strings.details.phoneLabel}</Text>
          <TextInput
            style={styles.input}
            value={reporterPhone}
            onChangeText={setReporterPhone}
            placeholder={strings.details.phonePlaceholder}
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            maxLength={30}
          />

          <View style={styles.note}>
            <Text style={styles.noteText}>{strings.details.contactNote}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  label: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: minTouch,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.lead,
    color: colors.text,
  },
  textArea: {
    minHeight: 120,
  },
  note: {
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noteText: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
