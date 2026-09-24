// Interface: loader, slate, technique captions, chapter cards, transport controls, three languages.
const TERMS = { vomTag: 'Vom Tag', zornhau: 'Zornhau', zwerch: 'Zwerchhau', bash: 'Schildstoß', krone: 'Krone', winden: 'Winden', stich: 'Stich aus dem Ochsen', hengen: 'Hengen', final: 'Zornhau' };

const STR = {
  en: {
    eyebrow: 'Ravenhold · Anno 1417',
    title: 'Duel at Ravenhold',
    tagline: 'A real-time medieval duel rendered in your browser: forged plate, fire, rain and steel.',
    ch1: 'I · The Challenge',
    ch2: 'II · The Exchange',
    ch3: 'III · The Last Stand',
    fighters: 'Ser Aldric of the Azure Cross · The Black Warden',
    endLine: 'Every plate, flame and raindrop is generated live. No video, no images.',
    load_forge: 'Forging the steel',
    load_cobbles: 'Laying the cobblestones',
    load_walls: 'Raising the walls',
    load_fire: 'Lighting the braziers',
    load_shaders: 'Tempering the shaders',
    load_ready: 'Ready',
    play: 'Play',
    pause: 'Pause',
    speed: 'Speed',
    camera: 'Camera',
    director: 'Director',
    free: 'Free',
    sound: 'Sound',
    on: 'On',
    off: 'Off',
    quality: 'Quality',
    auto: 'Auto',
    low: 'Low',
    high: 'High',
    ultra: 'Ultra',
    timeline: 'Timeline',
    language: 'Language',
    hintFree: 'Drag to orbit · scroll or pinch to zoom',
    shot: 'Shot',
    stats: 'Stats',
    fatal: 'WebGL 2 is not available in this browser. Open the page in a current Chrome, Edge, Firefox or Safari.',
    g_vomTag: 'the roof guard',
    g_zornhau: 'the wrath strike',
    g_zwerch: 'the crosswise strike',
    g_bash: 'shield bash',
    g_krone: 'the crown parry',
    g_winden: 'winding in the bind',
    g_stich: 'thrust from the ox guard',
    g_hengen: 'the hanging parry',
    g_final: 'the blow that ends it',
    canvas: 'Animated 3D scene: two armoured knights duel with sword and shield in a rain-soaked castle courtyard at night.',
  },
  bg: {
    eyebrow: 'Рейвънхолд · Anno 1417',
    title: 'Двубой в Рейвънхолд',
    tagline: 'Средновековен двубой в реално време в браузъра ви: кована броня, огън, дъжд и стомана.',
    ch1: 'I · Предизвикателството',
    ch2: 'II · Размяната',
    ch3: 'III · Последният отпор',
    fighters: 'Сър Алдрик от Лазурния кръст · Черният страж',
    endLine: 'Всяка плоча, пламък и капка дъжд се генерират на живо. Без видео, без изображения.',
    load_forge: 'Коване на стоманата',
    load_cobbles: 'Редене на калдъръма',
    load_walls: 'Издигане на стените',
    load_fire: 'Палене на мангалите',
    load_shaders: 'Закаляване на шейдърите',
    load_ready: 'Готово',
    play: 'Пусни',
    pause: 'Пауза',
    speed: 'Скорост',
    camera: 'Камера',
    director: 'Режисьор',
    free: 'Свободна',
    sound: 'Звук',
    on: 'Вкл.',
    off: 'Изкл.',
    quality: 'Качество',
    auto: 'Авто',
    low: 'Ниско',
    high: 'Високо',
    ultra: 'Ултра',
    timeline: 'Времева линия',
    language: 'Език',
    hintFree: 'Влачете за орбита · скрол или щипване за приближаване',
    shot: 'Кадър',
    stats: 'Статистика',
    fatal: 'WebGL 2 не е наличен в този браузър. Отворете страницата в актуален Chrome, Edge, Firefox или Safari.',
    g_vomTag: 'покривна стойка',
    g_zornhau: 'удар на гнева',
    g_zwerch: 'напречен удар',
    g_bash: 'удар с щита',
    g_krone: 'короната — висок блок',
    g_winden: 'навиване в свръзката',
    g_stich: 'мушкане от стойка „вол“',
    g_hengen: 'висящ блок',
    g_final: 'ударът, който слага край',
    canvas: 'Анимирана 3D сцена: двама рицари в броня се бият с меч и щит в мокър от дъжда замъчен двор през нощта.',
  },
  it: {
    eyebrow: 'Ravenhold · Anno 1417',
    title: 'Duello a Ravenhold',
    tagline: 'Un duello medievale in tempo reale nel tuo browser: armature forgiate, fuoco, pioggia e acciaio.',
    ch1: 'I · La sfida',
    ch2: 'II · Lo scambio',
    ch3: "III · L'ultima difesa",
    fighters: 'Ser Aldric della Croce Azzurra · Il Guardiano Nero',
    endLine: 'Ogni piastra, fiamma e goccia di pioggia è generata dal vivo. Niente video, niente immagini.',
    load_forge: "Forgiatura dell'acciaio",
    load_cobbles: 'Posa del selciato',
    load_walls: 'Erezione delle mura',
    load_fire: 'Accensione dei bracieri',
    load_shaders: 'Tempra degli shader',
    load_ready: 'Pronto',
    play: 'Riproduci',
    pause: 'Pausa',
    speed: 'Velocità',
    camera: 'Camera',
    director: 'Regia',
    free: 'Libera',
    sound: 'Audio',
    on: 'Sì',
    off: 'No',
    quality: 'Qualità',
    auto: 'Auto',
    low: 'Bassa',
    high: 'Alta',
    ultra: 'Ultra',
    timeline: 'Linea temporale',
    language: 'Lingua',
    hintFree: 'Trascina per orbitare · scorri o pizzica per lo zoom',
    shot: 'Inquadratura',
    stats: 'Statistiche',
    fatal: 'WebGL 2 non è disponibile in questo browser. Apri la pagina con Chrome, Edge, Firefox o Safari aggiornati.',
    g_vomTag: 'la guardia del tetto',
    g_zornhau: "il colpo dell'ira",
    g_zwerch: 'il colpo traverso',
    g_bash: 'colpo di scudo',
    g_krone: 'la parata della corona',
    g_winden: "l'avvolgimento nel legamento",
    g_stich: 'affondo dalla guardia del bue',
    g_hengen: 'la parata appesa',
    g_final: 'il colpo che chiude il duello',
    canvas: 'Scena 3D animata: due cavalieri in armatura si sfidano con spada e scudo nel cortile di un castello, di notte, sotto la pioggia.',
  },
};

function storedLang() {
  try {
    const v = localStorage.getItem('ravenhold-lang');
    if (v && STR[v]) return v;
  } catch {
    /* storage unavailable: fall back to the browser language */
  }
  const nav = (navigator.language || 'en').slice(0, 2);
  return STR[nav] ? nav : 'en';
}

export function createHud(h) {
  const $ = (id) => document.getElementById(id);
  let lang = storedLang();
  let scrubbing = false;
  let captionKey = '';
  let chapterKey = '';
  const s = (k) => STR[lang][k] ?? STR.en[k] ?? k;

  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = s(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', s(el.dataset.i18nAria)));
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    $('view').setAttribute('aria-label', s('canvas'));
    document.title = s('title');
    captionKey = '';
    chapterKey = '';
    h.onLang?.();
  }

  $('play').addEventListener('click', () => h.togglePlay());
  $('scrub').addEventListener('pointerdown', () => (scrubbing = true));
  window.addEventListener('pointerup', () => (scrubbing = false));
  $('scrub').addEventListener('input', (e) => h.seek(Number(e.target.value) / 1000));
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => h.setSpeed(Number(b.dataset.speed))));
  $('cam').addEventListener('click', () => h.toggleCamera());
  $('sound').addEventListener('click', () => h.toggleSound());
  $('stats-btn').addEventListener('click', () => h.toggleStats());
  $('quality').addEventListener('change', (e) => h.setQuality(e.target.value));
  document.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => {
      lang = b.dataset.lang;
      try {
        localStorage.setItem('ravenhold-lang', lang);
      } catch {
        /* storage unavailable: the choice lasts for this visit */
      }
      applyLang();
    }),
  );
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      h.togglePlay();
    } else if (e.key === 'c' || e.key === 'C') h.toggleCamera();
    else if (e.key === 'm' || e.key === 'M') h.toggleSound();
    else if (e.key === 's' || e.key === 'S') h.toggleStats();
  });
  applyLang();

  const fmt = (sec) => {
    const m = Math.floor(sec / 60);
    const r = sec - m * 60;
    return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`;
  };

  return {
    t: s,
    loading(stepKey, frac) {
      $('load-step').textContent = s(stepKey);
      $('load-fill').style.width = `${Math.round(frac * 100)}%`;
    },
    ready() {
      $('loader').classList.add('done');
      $('loader').setAttribute('aria-hidden', 'true');
    },
    fatal() {
      $('load-step').textContent = s('fatal');
      $('load-fill').style.width = '0%';
    },
    setPlaying(p) {
      $('play').setAttribute('aria-label', s(p ? 'pause' : 'play'));
      $('play').dataset.state = p ? 'playing' : 'paused';
    },
    setSpeed(v) {
      document.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === v)));
    },
    setCamera(free) {
      $('cam-state').textContent = s(free ? 'free' : 'director');
      $('cam').setAttribute('aria-pressed', String(free));
      $('hint').hidden = !free;
    },
    setSound(on) {
      $('sound-state').textContent = s(on ? 'on' : 'off');
      $('sound').setAttribute('aria-pressed', String(on));
    },
    setQuality(v) {
      $('quality').value = v;
    },
    setStats(on) {
      $('stats-btn').setAttribute('aria-pressed', String(on));
      $('stats').hidden = !on;
    },
    stats(st) {
      $('st-fps').textContent = `${Math.round(st.fps)} fps · ${st.ms.toFixed(1)} ms`;
      $('st-res').textContent = `${st.w}×${st.h} · ${st.pct}%`;
      $('st-draw').textContent = `${st.calls} draws · ${(st.tris / 1e6).toFixed(2)} M tris`;
      $('st-tier').textContent = st.tier;
    },
    setTicks(list) {
      const box = $('ticks');
      box.textContent = '';
      for (const [pos, label] of list) {
        const i = document.createElement('i');
        i.style.left = `${Math.max(1.5, pos * 100)}%`;
        i.textContent = label;
        box.append(i);
      }
    },
    update(st) {
      if (!scrubbing) {
        $('scrub').value = String(Math.round(st.progress * 1000));
        $('scrub').style.setProperty('--p', `${(st.progress * 100).toFixed(2)}%`);
      }
      $('tc').textContent = fmt(st.realTime);
      $('slate-shot').textContent = `${s('shot')} ${String(st.shot + 1).padStart(2, '0')}/${st.shotCount}`;
      $('slate-lens').textContent = `${Math.round(st.lens)} mm · f/${st.fstop.toFixed(1)}`;
      $('slate-speed').textContent = `${(st.timeScale * st.speed).toFixed(2)}× · ${Math.round(st.fps)} fps`;
      if (st.caption !== captionKey) {
        captionKey = st.caption;
        const el = $('caption');
        if (st.caption) {
          $('cap-term').textContent = TERMS[st.caption];
          $('cap-gloss').textContent = s(`g_${st.caption}`);
          el.classList.add('on');
        } else el.classList.remove('on');
      }
      if (st.chapter !== chapterKey) {
        chapterKey = st.chapter;
        $('chapter').textContent = s(st.chapter);
      }
      $('endcard').classList.toggle('on', st.end);
    },
  };
}
