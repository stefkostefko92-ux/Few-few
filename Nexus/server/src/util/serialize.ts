import type { Character, Item } from '../types/domain';

export function publicCharacter(ch: Character) {
  const { ...rest } = ch;
  return rest;
}

export function publicItem(it: Item) {
  return it;
}
