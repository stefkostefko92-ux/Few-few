import React from 'react';
import BoyDuelStage from '../combat/engine/BoyDuelStage';

/**
 * QA харнес за новия боен двигател (Nexus Fase 4a) — порт на boy/
 * ("Двубой в Рейвънхолд"). Стъпка 4a.1: показва ОРИГИНАЛНАТА фиксирана
 * хореография на boy (28.5s филм), плоски материали (без изпечени
 * текстури на този етап). Data-driven хореография от реални рундове идва
 * в 4a.2 — старият спрайт/CombatScene3D конвейер остава недокоснат до 4a.3.
 *
 * Достъпен само през /demo/combat (dev или ?debug=1) — виж App.tsx.
 */
export default function CombatDemo(): React.ReactElement {
  return <BoyDuelStage />;
}
