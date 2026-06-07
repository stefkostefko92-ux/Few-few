import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getReportStatus } from '@/api/reports';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { strings } from '@/i18n/strings';
import { colors, fontSize, minTouch, radius, spacing } from '@/theme/theme';
import type { ReportStatusResult } from '@/types';

type StatusVisual = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
};

/** Иконка и цвят според състоянието — бърз визуален сигнал за гражданина. */
function statusVisual(status: string): StatusVisual {
  switch (status) {
    case 'APPROVED':
    case 'SENT':
      return { icon: 'email-check-outline', color: colors.primary };
    case 'RESOLVED':
      return { icon: 'check-circle-outline', color: colors.success };
    case 'REJECTED':
      return { icon: 'close-circle-outline', color: colors.danger };
    default:
      return { icon: 'clock-outline', color: colors.accent };
  }
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function StatusScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportStatusResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    const trimmed = code.trim();
    if (!trimmed) {
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    setResult(null);
    setNotFound(false);
    try {
      const found = await getReportStatus(trimmed);
      if (found) {
        setResult(found);
      } else {
        setNotFound(true);
      }
    } catch {
      setError(strings.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  const visual = result ? statusVisual(result.status) : null;

  return (
    <Screen
      footer={
        <PrimaryButton
          label={loading ? strings.status.checking : strings.status.check}
          onPress={() => void check()}
          loading={loading}
          disabled={code.trim().length === 0}
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
          <Text style={styles.subtitle}>{strings.status.subtitle}</Text>

          <Text style={styles.label}>{strings.status.inputLabel}</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder={strings.status.placeholder}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => void check()}
            maxLength={20}
          />

          {result && visual ? (
            <View style={styles.card}>
              <View style={styles.statusHeader}>
                <MaterialCommunityIcons
                  name={visual.icon}
                  size={40}
                  color={visual.color}
                />
                <View style={styles.statusHeaderText}>
                  <Text style={styles.statusHeading}>{strings.status.heading}</Text>
                  <Text style={[styles.statusLabel, { color: visual.color }]}>
                    {result.statusLabel}
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              <Row label={strings.status.category} value={result.category.nameBg} />
              <Row
                label={strings.status.settlement}
                value={result.settlement.nameBg}
              />
              <Row
                label={strings.status.submittedAt}
                value={formatDateTime(result.createdAt)}
              />
              <Row
                label={strings.status.updatedAt}
                value={formatDateTime(result.updatedAt)}
              />
            </View>
          ) : null}

          {notFound ? (
            <View style={[styles.message, styles.messageMuted]}>
              <MaterialCommunityIcons
                name="magnify-close"
                size={28}
                color={colors.textMuted}
              />
              <Text style={styles.messageText}>{strings.status.notFound}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={[styles.message, styles.messageError]}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={28}
                color={colors.danger}
              />
              <Text style={styles.messageText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  subtitle: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    marginTop: spacing.md,
    lineHeight: 26,
  },
  label: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
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
    fontSize: fontSize.title,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.text,
  },
  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  statusHeading: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    fontWeight: '700',
  },
  statusLabel: {
    fontSize: fontSize.lead,
    fontWeight: '800',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
  rowValue: {
    fontSize: fontSize.body,
    color: colors.text,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  message: {
    marginTop: spacing.xl,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  messageMuted: {
    backgroundColor: colors.surfaceMuted,
  },
  messageError: {
    backgroundColor: colors.dangerSoft,
  },
  messageText: {
    flex: 1,
    fontSize: fontSize.body,
    color: colors.text,
    lineHeight: 24,
  },
});
