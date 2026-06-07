import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, fontSize, minTouch, radius, spacing } from '@/theme/theme';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** По-голям бутон за главния екран. */
  large?: boolean;
  tone?: 'primary' | 'danger';
};

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  large,
  tone = 'primary',
}: PrimaryButtonProps) {
  const isBlocked = disabled || loading;
  const background = tone === 'danger' ? colors.danger : colors.primary;

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    onPress();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(isBlocked) }}
      disabled={isBlocked}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        large && styles.large,
        { backgroundColor: background },
        pressed && !isBlocked ? styles.pressed : null,
        isBlocked ? styles.blocked : null,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={colors.textInverse} /> : null}
        <Text style={[styles.label, large && styles.labelLarge]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: {
    minHeight: 96,
    borderRadius: radius.lg,
  },
  pressed: {
    opacity: 0.85,
  },
  blocked: {
    backgroundColor: colors.surfaceMuted,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    color: colors.textInverse,
    fontSize: fontSize.lead,
    fontWeight: '700',
  },
  labelLarge: {
    fontSize: fontSize.title,
  },
});
