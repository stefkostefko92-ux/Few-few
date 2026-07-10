// Споделено състояние на курсора (нормализирано -1..1, център на екрана = 0).
// Лек модул без зависимости — четат го и Cursor, и hero WebGL сцената,
// без да влачат three chunk-а в main bundle.

export const pointer = {
  nx: 0, // -1..1 хоризонтално
  ny: 0, // -1..1 вертикално (нагоре = +)
  x: 0, // px
  y: 0, // px
  down: false,
};

export function updatePointer(clientX: number, clientY: number): void {
  pointer.x = clientX;
  pointer.y = clientY;
  pointer.nx = (clientX / window.innerWidth) * 2 - 1;
  pointer.ny = -((clientY / window.innerHeight) * 2 - 1);
}
