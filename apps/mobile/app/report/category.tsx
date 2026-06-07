import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { categories, type Category } from '@/data/categories';
import { strings } from '@/i18n/strings';
import { useDraftStore } from '@/store/draftStore';
import { colors, fontSize, radius, shadow, spacing } from '@/theme/theme';

export default function CategoryScreen() {
  const router = useRouter();
  const setCategory = useDraftStore((s) => s.setCategory);

  function choose(category: Category) {
    setCategory(category.slug);
    router.push('/report/capture');
  }

  return (
    <Screen>
      <FlatList
        data={categories}
        keyExtractor={(item) => item.slug}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={
          <StepHeader
            step={1}
            total={4}
            title={strings.category.title}
            subtitle={strings.category.subtitle}
          />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.nameBg}
            onPress={() => choose(item)}
            style={({ pressed }) => [
              styles.card,
              pressed ? styles.cardPressed : null,
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${item.tint}22` }]}>
              <MaterialCommunityIcons
                name={item.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                size={40}
                color={item.tint}
              />
            </View>
            <Text style={styles.name}>{item.nameBg}</Text>
            <Text style={styles.hint} numberOfLines={2}>
              {item.hint}
            </Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: spacing.xl,
  },
  row: {
    gap: spacing.md,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 168,
    ...shadow.card,
  },
  cardPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  name: {
    fontSize: fontSize.lead,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  hint: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
