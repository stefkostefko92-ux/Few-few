/**
 * Категориите сигнали, подбрани спрямо реалните комунални компетенции на
 * община Бобов дол. `slug` е стабилен ключ, който се изпраща към API-то;
 * backend-ът го свързва със своя запис (модел Category).
 *
 * `icon` са имена от MaterialCommunityIcons (@expo/vector-icons).
 */

export type Category = {
  slug: string;
  nameBg: string;
  hint: string;
  icon: string;
  tint: string;
};

export const categories: readonly Category[] = [
  {
    slug: 'bokluk',
    nameBg: 'Боклук',
    hint: 'Нерегламентирано сметище, струпан боклук',
    icon: 'trash-can-outline',
    tint: '#7A8B3A',
  },
  {
    slug: 'dupki',
    nameBg: 'Дупки по пътя',
    hint: 'Дупки и щети по пътната настилка',
    icon: 'road-variant',
    tint: '#6B6258',
  },
  {
    slug: 'osvetlenie',
    nameBg: 'Осветление',
    hint: 'Неработещо улично осветление',
    icon: 'lightbulb-outline',
    tint: '#C9A227',
  },
  {
    slug: 'vik',
    nameBg: 'ВиК',
    hint: 'Течове, аварии, запушени шахти',
    icon: 'water-outline',
    tint: '#2F7DA6',
  },
  {
    slug: 'zelenina',
    nameBg: 'Зеленина и дървета',
    hint: 'Зелени площи и опасни дървета',
    icon: 'tree-outline',
    tint: '#2E7D5B',
  },
  {
    slug: 'jivotni',
    nameBg: 'Бездомни животни',
    hint: 'Безстопанствени животни',
    icon: 'paw-outline',
    tint: '#9B5B3A',
  },
  {
    slug: 'nezakonno',
    nameBg: 'Незаконно',
    hint: 'Незаконно строителство или сметосъбиране',
    icon: 'home-alert-outline',
    tint: '#A6453A',
  },
  {
    slug: 'drugo',
    nameBg: 'Друго',
    hint: 'Нещо, което не е в списъка',
    icon: 'dots-horizontal-circle-outline',
    tint: '#5B6159',
  },
] as const;

export function categoryBySlug(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}
