import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fontSize, minTouch, radius, spacing } from '@/theme/theme';

type SecondaryButtonProps = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  disabled?: boolean;
};

export function SecondaryButton({
  label,
  onPress,
  icon,
  disabled,
}: SecondaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {icon ? (
        <MaterialCommunityIcons name={icon} size={24} color={colors.primary} />
      ) : null}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  pressed: {
    backgroundColor: colors.primarySoft,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: colors.primary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
});
