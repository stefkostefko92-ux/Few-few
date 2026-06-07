import { StyleSheet, Text, View } from 'react-native';

import { strings } from '@/i18n/strings';
import { colors, fontSize, radius, spacing } from '@/theme/theme';

type StepHeaderProps = {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
};

export function StepHeader({ step, total, title, subtitle }: StepHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.dots} accessibilityLabel={strings.steps.of(step, total)}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i < step ? styles.dotActive : null]}
          />
        ))}
      </View>
      <Text style={styles.stepLabel}>{strings.steps.of(step, total)}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  dot: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  stepLabel: {
    color: colors.accent,
    fontSize: fontSize.small,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.body,
  },
});
