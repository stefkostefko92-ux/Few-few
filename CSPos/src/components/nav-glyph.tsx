"use client";

// Иконите на менюто — един речник, за да съвпадат меню, търсачка и заглавие.

import {
  CashRegister,
  Barcode,
  Coins,
  Package,
  Tag,
  Warehouse,
  SquaresFour,
  ChartLineUp,
  ListMagnifyingGlass,
  GearSix,
} from "@phosphor-icons/react";
import type { NavIcon } from "@/lib/nav";

const MAP = {
  register: CashRegister,
  price: Barcode,
  shift: Coins,
  products: Package,
  promotions: Tag,
  inventory: Warehouse,
  dashboard: SquaresFour,
  reports: ChartLineUp,
  journal: ListMagnifyingGlass,
  settings: GearSix,
} satisfies Record<NavIcon, unknown>;

export function NavGlyph({
  icon,
  size = 22,
  active = false,
}: {
  icon: NavIcon;
  size?: number;
  active?: boolean;
}) {
  const Icon = MAP[icon];
  return <Icon size={size} weight={active ? "fill" : "duotone"} aria-hidden />;
}
