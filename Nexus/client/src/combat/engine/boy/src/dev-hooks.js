// 4a.3-fix (Nexus порт, НЕ част от оригиналния boy) — DEV-само кука за ДЕТЕРМИНИСТИЧНО
// заснемане: софтуерният рендер (SwiftShader) е твърде бавен за надежден wall-clock screenshot
// (моментите пропускат кадъра). window.__duel.seek(storyT) скача точно на секундата, без да
// чакаш реално време — следващият requestAnimationFrame рисува точно нея.
export function installDevHooks(clock, events, getEvents, camera, A, B) {
  if (!import.meta.env.DEV) return;
  window.__duel = {
    /** QA диагностика на кадрирането (fov/aspect/позиция/NDC на героевата глава) — виж
     * shot-builder.js бележката за камерен наклон при нисък противник. */
    camInfo() {
      if (!camera) return null;
      const headWorld = A?.rig?.w?.head;
      let headNdc = null;
      if (headWorld) {
        const v = headWorld.clone().project(camera);
        headNdc = { x: v.x, y: v.y, z: v.z };
      }
      return { fov: camera.fov, aspect: camera.aspect, pos: camera.position.toArray(), headWorld: headWorld?.toArray(), headNdc };
    },
    seek(storyT) {
      clock.playing = false;
      clock.T = Math.max(0, storyT);
      clock.jumped = true;
      // frame() пропуска firing на EVENTS при jump кадър (иначе целият бой би прозвучал
      // наведнъж при "прескочи") — но за DEV снимка искаме ТОЧНО този миг да гръмне (число на
      // щетата, искри), затова го firing-ваме ръчно тук, извън jump пътя.
      events.step(storyT - 0.02, storyT + 0.02, 1, false);
    },
    pause() { clock.playing = false; },
    play() { clock.playing = true; },
    /** roundmark/strike/helm времена от ЖИВАТА хореография — за точно seek() към удар. */
    events() { return getEvents(); },
  };
}
