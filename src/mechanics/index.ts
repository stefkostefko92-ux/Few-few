import type { Mechanic } from '../config/chapters.ts';
import type { MechanicFactory } from './types.ts';
import { createTutorialMechanic } from './tutorial.ts';
import { createCeremonyMechanic } from './ceremony.ts';
import { createTimingMechanic } from './timing.ts';
import { createProtectMechanic } from './protect.ts';
import { createDefenseMechanic } from './defense.ts';
import { createMarchMechanic } from './march.ts';
import { createAssaultMechanic } from './assault.ts';
import { createEpilogueMechanic } from './epilogue.ts';

// Регистър: свързва ключа на механиката от данните с нейната фабрика.
export const MECHANIC_FACTORIES: Record<Mechanic, MechanicFactory> = {
  tutorial: createTutorialMechanic,
  ceremony: createCeremonyMechanic,
  timing: createTimingMechanic,
  protect: createProtectMechanic,
  defense: createDefenseMechanic,
  march: createMarchMechanic,
  assault: createAssaultMechanic,
  epilogue: createEpilogueMechanic,
};
