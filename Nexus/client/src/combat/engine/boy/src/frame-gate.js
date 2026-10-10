// Кога кадърът си струва GPU работата. Двигателят рисуваше с пълна сила и когато дуелът е
// извън екрана, и след края (loop:false) — вграден в лендинга, това задавяше цялата страница,
// включително скрола. Сега: canvas-ът не се вижда или часовникът стои → нула рендер, само
// евтин callback; при връщане кадрите тръгват от там, където са спрели (боят чака зрителя).
const SETTLE_MS = 600; // няколко кадъра след пауза/край — да се допишат fade и последните искри

export function createFrameGate(canvas, clock, isFree) {
  let visible = true;
  let idleSince = 0;
  const io = typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; });
  io?.observe(canvas);
  return {
    /** true → рисувай този кадър. */
    shouldRender(now) {
      if (!visible || document.hidden) return false;
      if (clock.playing || clock.jumped || isFree()) {
        idleSince = 0;
        return true;
      }
      if (!idleSince) idleSince = now;
      return now - idleSince < SETTLE_MS;
    },
    dispose() {
      io?.disconnect();
    },
  };
}
