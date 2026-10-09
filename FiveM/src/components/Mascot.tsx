'use client';

// Маскотът ползва `useId`/`useEffect`/`useRef` — затова минава през клиентска
// граница. Копираният компонент няма директива (пакетът е рамково неутрален),
// а редактирането му на ръка е забранено, значи границата живее тук.
export { default as Mascot } from './mascot/JellyMascot';
export type { JellyMascotProps } from './mascot/JellyMascot';
