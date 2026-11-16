/* cs-live.js — „жива“ фотореалистична сцена без видео (Carbon Stealth).
 *
 * Blender рендерира ЕДИН кадър, разделен на светлинни слоеве (marketing/blender, --live):
 *   base   — сцената под постоянното студийно осветление;
 *   sweep  — K положения на подвижен софтбокс, наредени едно под друго в една картина;
 *   flood  — как всяка точка отговаря на светлина от посоката на лазерния проектор (със сенките);
 *   pos    — за всеки пиксел: позицията му по нормалата на лазерния лист (16 бита в R,G) и
 *            кръгът на разсейване на обектива (B);
 *   glow   — (по избор) светещите елементи на сцената и светлината им върху околното.
 * Тук ги смесваме: отражението на софтбокса се плъзга по карбона и фаските, а лазерната линия е
 * flood × тясна лента по позиция — затова изкачва стените и хлътва в отворите вярно, и отива там,
 * където сочи курсорът.
 *
 * Достъпност и скорост (умение motion-a11y):
 *  - при prefers-reduced-motion НЕ се стартира изобщо — остава неподвижният кадър под платното;
 *  - платното е aria-hidden и не лови събития; нищо не мига (всички промени са плавни, най-бързият
 *    цикъл е няколко секунди — далеч под 3 проблясъка в секунда, WCAG 2.3.1);
 *  - WCAG 2.2.2: режим auto:"intro" се движи сам най-много introSeconds (≤ 5 s) и спира — в края
 *    подвижната светлина вече е извън кадъра и се нулира, без обратен ход; после сцената реагира само на
 *    курсора. Режим auto:"loop" (hero) върви постоянно и ЗАТОВА страницата дава бутон за пауза
 *    (api.pause / api.resume). Времето е натрупано (не стенен часовник): встъплението не „изтича“ в
 *    таб на заден план;
 *  - подвижната светлина и лазерът имат таван на скоростта (PHI_MAX, S_FAST), „успокояват“ се при мятане
 *    на мишката (calm) и по построение лазерът обръща посоката си най-много два пъти в секунда (hold):
 *    измерва се кадър по кадър при 0.5–8 Hz, включително влизане/излизане на курсора и скокове между
 *    краищата (прагът на WCAG 2.3.1 е 3 проблясъка в секунда върху четвърт от поле 10°);
 *  - cfg.pointer:false — сцената не следи курсора (само автоматичното движение);
 *  - рисува само докато е на екрана и табът е видим; при слаб графичен процесор първо сваля
 *    резолюцията, после се изключва и остава неподвижният кадър;
 *  - зарежда се след събитието load — LCP е на неподвижния кадър.
 */
(function () {
  "use strict";
  var VERT = "attribute vec2 p;varying vec2 c;void main(){c=p*.5+.5;c.y=1.-c.y;gl_Position=vec4(p,0.,1.);}";
  var FRAG = [
    "precision highp float;",
    "varying vec2 c;",
    "uniform sampler2D uBase,uSweep,uFlood,uPos,uGlow;",
    "uniform vec2 uPosSize;",
    "uniform vec4 uFit;",                                        // платно → картина: мащаб (xy) и отместване (zw), като object-fit: cover
    "uniform float uK,uPhi,uSweepGain,uS0,uW,uLaser,uGlowK;",
    "float dec(vec4 t){return (t.r*65280.+t.g*255.)/65535.;}",
    "float row(float k,vec2 uv){",
    "  if(k<0.||k>uK-.5)return 0.;",
    "  float h=1./uK;float y=clamp(uv.y,.004,.996);",
    "  return texture2D(uSweep,vec2(uv.x,(k+y)*h)).r;}",
    "float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}",
    "void main(){",
    "  vec2 v=c*uFit.xy+uFit.zw;",
    "  vec3 base=texture2D(uBase,v).rgb;",
    // подвижният софтбокс: преливане между двете съседни положения
    "  float k0=floor(uPhi);float f=uPhi-k0;f=f*f*(3.-2.*f);",
    "  float sw=mix(row(k0,v),row(k0+1.,v),f)*uSweepGain;",
    // позицията: ръчна билинейна интерполация на 16-битовата стойност (байтовете не се интерполират)
    "  vec2 q=v*uPosSize-.5;vec2 i=floor(q);vec2 fr=q-i;vec2 t=1./uPosSize;",
    "  vec4 c00=texture2D(uPos,(i+vec2(.5,.5))*t),c10=texture2D(uPos,(i+vec2(1.5,.5))*t);",
    "  vec4 c01=texture2D(uPos,(i+vec2(.5,1.5))*t),c11=texture2D(uPos,(i+vec2(1.5,1.5))*t);",
    "  float s00=dec(c00),s10=dec(c10),s01=dec(c01),s11=dec(c11);",
    "  float lo=min(min(s00,s10),min(s01,s11)),hi=max(max(s00,s10),max(s01,s11));",
    // на ръб между два предмета (скок в позицията) не интерполираме — иначе линията „светва“ по контура
    "  float s=(hi-lo>.02)?s00:mix(mix(s00,s10,fr.x),mix(s01,s11,fr.x),fr.y);",
    "  float g=length(vec2(s10-s00,s01-s00));",
    "  float coc=c00.b*64.;",
    "  float w=sqrt(uW*uW+pow(coc*g*.45,2.));",                  // извън фокус линията се размива, както и снимката
    "  float d=(s-uS0)/w;",
    "  float fl=texture2D(uFlood,v).r;",
    "  float sp=.84+.32*hash(floor(v*uPosSize*.75));",           // лазерен спекъл: зърно, вързано за повърхността
    "  float core=exp(-d*d)*(uW/w)*sp;",
    "  float halo=exp(-d*d*.03);",
    "  float hit=step(.5/255.,c00.r+c00.g+c00.b);",              // фонът няма позиция → няма линия
    "  float L=pow(fl,.75)*hit*uLaser;",
    "  vec3 las=vec3(0.,.80,1.)*L*(core*3.2+halo*.16)+vec3(1.)*pow(L*core,2.)*2.2;",
    "  vec3 glow=texture2D(uGlow,v).rgb*uGlowK;",
    "  vec3 add=clamp(vec3(sw)+las+glow,0.,1.);",
    "  gl_FragColor=vec4(1.-(1.-base)*(1.-add),1.);",
    "}"
  ].join("\n");

  function img(url) {
    return new Promise(function (ok, bad) {
      var im = new Image();
      im.decoding = "async";
      im.onload = function () { ok(im); };
      im.onerror = function () { bad(new Error("cs-live: " + url)); };
      im.src = url;
    });
  }
  function reduced() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function thrifty() { var n = navigator.connection; return !!(n && (n.saveData || /(^|-)2g$/.test(n.effectiveType || ""))); }

  // cfg: {base, sweep, flood, pos, glow?, w, h, sweeps, sMin, sMax, s0, scan:[a,b], auto:"loop"|"intro",
  //       fit:{x,y}? (фокусна точка за cover; без нея платното е точно върху картината), ...}
  function mount(host, cfg) {
    if (!host || (!cfg.force && (reduced() || thrifty()))) return Promise.resolve(null);

    return Promise.all([img(cfg.base), img(cfg.sweep), img(cfg.flood), img(cfg.pos), cfg.glow ? img(cfg.glow) : null]).then(function (im) {
      var cv = document.createElement("canvas");
      cv.setAttribute("aria-hidden", "true");
      cv.className = "cs-live";
      cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity .9s ease";
      var gl = cv.getContext("webgl", { alpha: false, antialias: false, powerPreference: cfg.auto === "intro" ? "default" : "high-performance", preserveDrawingBuffer: !!cfg.capture });
      if (!gl) return null;
      // слоевете на подвижната светлина са наредени един под друг: на стар телефон може да не се поберат в текстура
      var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      for (var ti = 0; ti < im.length; ti++) if (im[ti] && Math.max(im[ti].naturalWidth, im[ti].naturalHeight) > maxTex) return null;
      host.appendChild(cv);

      function sh(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      }
      var pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(pr, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      function tex(unit, image, nearest) {
        var t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
        var f = nearest ? gl.NEAREST : gl.LINEAR;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      }
      var texs = [tex(0, im[0]), tex(1, im[1]), tex(2, im[2]), tex(3, im[3], true)];
      if (im[4]) texs.push(tex(4, im[4]));
      function U(n) { return gl.getUniformLocation(pr, n); }
      gl.uniform1i(U("uBase"), 0); gl.uniform1i(U("uSweep"), 1); gl.uniform1i(U("uFlood"), 2); gl.uniform1i(U("uPos"), 3);
      gl.uniform1i(U("uGlow"), im[4] ? 4 : 2);
      var baseW = im[0].naturalWidth, hasGlow = !!im[4];
      gl.uniform2f(U("uPosSize"), im[3].naturalWidth, im[3].naturalHeight);
      var K = cfg.sweeps;
      gl.uniform1f(U("uK"), K);
      var uPhi = U("uPhi"), uSweepGain = U("uSweepGain"), uS0 = U("uS0"), uW = U("uW"), uLaser = U("uLaser"), uGlowK = U("uGlowK"), uFit = U("uFit");

      // позицията под курсора: картата се чете веднъж в масив
      var pc = document.createElement("canvas");
      var PW = pc.width = im[3].naturalWidth, PH = pc.height = im[3].naturalHeight;
      var pctx = pc.getContext("2d", { willReadFrequently: true });
      pctx.drawImage(im[3], 0, 0);
      var PD = pctx.getImageData(0, 0, PW, PH).data;
      pc.width = pc.height = 1; pc = pctx = null;
      var iar = im[0].naturalWidth / im[0].naturalHeight;
      im = null;                                               // декодираните картини вече са в текстури — не ги държим
      // Целта е МЕДИАНАТА на околността на курсора (5×5 проби, ±2% от ширината), не един пиксел: малък
      // отвор или ръб под показалеца не мята целта напред-назад — линията отива върху повърхността, която
      // преобладава там. Върху равна повърхност медианата е точно стойността под курсора.
      var SR = Math.max(2, Math.round(PW * 0.01)), sbuf = [];
      function sAt(u, vv) {
        var cx = Math.round(u * PW), cy = Math.round(vv * PH), n = 0;
        for (var b = -2; b <= 2; b++) for (var a = -2; a <= 2; a++) {
          var x = cx + a * SR, y = cy + b * SR;
          if (x < 0 || y < 0 || x >= PW || y >= PH) continue;
          var q = (y * PW + x) * 4;
          if (PD[q] + PD[q + 1] + PD[q + 2] !== 0) sbuf[n++] = PD[q] * 256 + PD[q + 1];
        }
        if (n < 13) return null;                               // под курсора преобладава фонът → автоматичната цел
        sbuf.length = n;
        sbuf.sort(function (m1, m2) { return m1 - m2; });
        return sbuf[n >> 1] / 65535;
      }

      var span = cfg.sMax - cfg.sMin;
      function norm(s) { return (s - cfg.sMin) / span; }
      var W = (cfg.laserWidth || 0.05) / span;
      var scan = cfg.scan || [cfg.s0 - 4, cfg.s0 + 4];        // обхватът на сканирането, в единици на сцената
      var loop = cfg.auto !== "intro", intro = Math.min(cfg.introSeconds || 4.2, 4.4);   // + ~0.4 s уталожване → под 5 s общо
      var rest = cfg.restLaser || 0, PHI_MAX = 1.7, S_FAST = 0.6;
      var sCap = Math.abs(norm(scan[1]) - norm(scan[0])) / S_FAST;
      // phi0: положението на подвижната лампа, от което е сглобен неподвижният кадър — сцената тръгва оттам
      var ph0 = loop && cfg.phi0 != null ? Math.acos(1 - 2 * cfg.phi0 / (K - 1)) : 0;
      var st = { s: norm(scan[0]), phi: loop && cfg.phi0 != null ? cfg.phi0 : -1, laser: 0, clock: 0, lastMove: -1e9, wide: 1 };
      // WCAG 2.3.1 — две защити. Проблясък за един пиксел = линията (или отражението на лампата) минава
      // през него; за повече от три в секунда движението трябва да се обръща напред-назад.
      //
      // (а) „Успокояване“: броим обръщанията на ЕФЕКТИВНАТА цел (с хистерезис, за да не се брои треперене).
      // Всяко трупа „възбуда“, която затихва за ~1.2 s, и колкото е по-голяма, толкова по-лениво следват
      // лазерът и светлината. Броячът върви ВИНАГИ — и когато няма курсор: бързо влизане и излизане през
      // ръба на сцената мята целта между курсора и автоматичното движение и трябва да се брои (иначе се
      // заобикаля — намерено при прегледа, 4 проблясъка/s). CALM_AT не се вдига: при 3 пак е 4/s.
      var CALM_TAU = 1.2, CALM_AT = 1.5, HYS_S = 0.03 * Math.abs(norm(scan[1]) - norm(scan[0])), HYS_U = 0.03;
      var agS = { d: 0, ref: 0, ag: 0 }, agU = { d: 0, ref: 0, ag: 0 };
      function calm(o, x, hys, dt) {
        o.ag *= Math.exp(-dt / CALM_TAU);
        var dx = x - o.ref;
        if (o.d === 0) { if (Math.abs(dx) > hys) { o.d = dx > 0 ? 1 : -1; o.ref = x; } }
        else if (o.d * dx > 0) o.ref = x;
        else if (o.d * dx < -hys) { o.d = -o.d; o.ref = x; o.ag += 1; }
        return 1 / (1 + Math.pow(o.ag / CALM_AT, 2));
      }
      // (б) Твърда граница по построение, каквато и да е траекторията на курсора: самият лазер обръща
      // посоката си най-много ДВА пъти във всеки прозорец от една секунда (WIN_S малко над 1 s). Две
      // обръщания делят секундата на най-много три еднопосочни хода, а един ход минава през всеки пиксел
      // веднъж → най-много три проблясъка в секунда от линията. Обикновен жест (поява на курсора + смяна
      // на посоката) не чака; трето обръщане в същата секунда оставя лазера на място, докато прозорецът
      // изтече. Лампата е фонова светлина: едно обръщане на LOCK_U секунди. Движение в рамките на
      // хистерезиса (трептене на място) е свободно.
      var WIN_S = 1.04, LOCK_U = 1.0, LHYS_S = 1.5 * W, LHYS_U = 0.12;
      var lkS = { d: 0, ext: 0, t1: -1e9, t2: -1e9, x: NaN }, lkU = { d: 0, ext: 0, t1: -1e9, t2: -1e9, x: NaN };
      function hold(o, x, mv, hys, t, lock, win) {             // връща позволеното преместване
        if (o.x !== x) { o.d = 0; o.ext = x; }                 // стойността е сменена отвън (встъпление, нулиране)
        var nx = x + mv;
        if (o.d === 0) { if (Math.abs(nx - o.ext) > hys) { o.d = nx > o.ext ? 1 : -1; o.ext = nx; } }
        else if ((nx - o.ext) * o.d >= 0) o.ext = nx;          // продължава в същата посока
        else if ((o.ext - nx) * o.d > hys) {                   // иска обръщане
          if (t - o.t2 >= lock && t - o.t1 > win) { o.d = -o.d; o.t1 = o.t2; o.t2 = t; o.ext = nx; }
          else { nx = o.ext - o.d * hys; mv = nx - x; }        // още е рано: спира на ръба на хистерезиса
        }
        o.x = x + mv;
        return mv;
      }
      var fit = [1, 1, 0, 0];
      var dprCap = cfg.dpr || 1.5, scale = 1, running = false, raf = 0, dead = false, paused = false, slow = 0, frames = 0, last = 0, resting = false;

      function size() {
        var r = cv.getBoundingClientRect();
        var d = Math.min(window.devicePixelRatio || 1, dprCap) * scale;
        var w = Math.max(2, Math.min(Math.round(r.width * d), Math.round(baseW * 1.25)));
        var h = Math.max(2, Math.round(w * r.height / Math.max(1, r.width)));
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
        if (cfg.fit) {                                         // както object-fit: cover с object-position cfg.fit
          var car = r.width / Math.max(1, r.height);
          if (car > iar) fit = [1, iar / car, 0, (1 - iar / car) * cfg.fit.y];
          else fit = [car / iar, 1, (1 - car / iar) * cfg.fit.x, 0];
        }
        gl.uniform4f(uFit, fit[0], fit[1], fit[2], fit[3]);
      }

      // t — секунди от старта; pointer — {u, v} в координатите на картината, или null. Детерминистично
      // (ползва се и от тестовете).
      function state(t, dt, pointer) {
        var auto = loop || t < intro;
        st.laser += ((auto || pointer ? 1 : rest) - st.laser) * (1 - Math.exp(-dt * 2.4));
        var target, ptarget;
        st.wide = 1;
        if (loop) {
          target = norm(scan[0] + (scan[1] - scan[0]) * (0.5 - 0.5 * Math.cos(t * (2 * Math.PI / (cfg.scanPeriod || 12)))));
          ptarget = (K - 1) * (0.5 - 0.5 * Math.cos(t * (2 * Math.PI / (cfg.sweepPeriod || 19)) + ph0));
        } else if (t < intro) {
          // встъпление: един ход на лазера от единия край до мястото му в неподвижния кадър (пристига широк и
          // мек, „фокусира се“ върху детайла) и едно плъзгане на светлината през кадъра
          var e = t / intro; e = e * e * (3 - 2 * e);
          target = norm(scan[0] + (cfg.s0 - scan[0]) * e);
          st.wide = 1 + 2.2 * (1 - e) * (1 - e);
          st.phi = -1 + (K + 1) * e;                           // точно по кривата: в края е извън кадъра (K)
          ptarget = st.phi;
        } else {
          target = norm(cfg.s0);
          if (st.phi > K - 0.5) st.phi = -1;                   // светлината вече е излязла: нулиране, без обратен ход
          ptarget = -1;
        }
        if (pointer) {
          var sp = sAt(pointer.u, pointer.v);
          if (sp != null) target = sp;
          ptarget = (K - 1) * (cfg.sweepFlip ? 1 - pointer.u : pointer.u);
        }
        // лазерът следва целта, но не по-бързо от цялото сканиране за S_FAST секунди, успокоява се при мятане
        // (calm) и обръща посоката си най-много два пъти в секунда (hold) — мери се с кадрова симулация на 30 fps
        var cS = calm(agS, target, HYS_S, dt), cU = calm(agU, ptarget / Math.max(1, K - 1), HYS_U, dt);
        var ds = (target - st.s) * (1 - Math.exp(-dt * (pointer ? 6.0 : 3.0) * cS)), sc = sCap * dt;
        st.s += hold(lkS, st.s, Math.max(-sc, Math.min(sc, ds)), LHYS_S, t, 0, WIN_S);
        if (loop || t >= intro || pointer) {
          var dp = (ptarget - st.phi) * (1 - Math.exp(-dt * 2.0 * cU)), cap = PHI_MAX * dt;
          st.phi += hold(lkU, st.phi, Math.max(-cap, Math.min(cap, dp)), LHYS_U, t, LOCK_U, 0);
        }
        return auto || !!pointer;
      }
      function draw(t) {
        size();
        gl.uniform1f(uPhi, st.phi);
        gl.uniform1f(uSweepGain, cfg.sweepGain == null ? 1 : cfg.sweepGain);
        gl.uniform1f(uS0, st.s);
        gl.uniform1f(uW, W * st.wide);
        gl.uniform1f(uLaser, st.laser * (cfg.laserGain == null ? 1 : cfg.laserGain));
        // светещите елементи „дишат“: ±glowPulse около 1, един цикъл на glowPeriod секунди (бавно — не е мигане)
        gl.uniform1f(uGlowK, hasGlow ? 1 + (cfg.glowPulse == null ? 0.14 : cfg.glowPulse) * Math.sin(t * (2 * Math.PI / (cfg.glowPeriod || 7))) : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      var pointer = null;
      function onMove(e) {
        if (paused || dead) return;
        var r = cv.getBoundingClientRect();
        var u = (e.clientX - r.left) / r.width, vv = (e.clientY - r.top) / r.height;
        if (u >= 0 && u <= 1 && vv >= -0.1 && vv <= 1.1) {
          vv = Math.max(0, Math.min(1, vv));
          pointer = { u: u * fit[0] + fit[2], v: vv * fit[1] + fit[3] };
          st.lastMove = performance.now();
          if (resting) { resting = false; cv.style.opacity = "1"; start(); }
        } else pointer = null;
      }
      var fine = window.matchMedia && matchMedia("(hover:hover) and (pointer:fine)").matches;
      if (fine && !cfg.capture && cfg.pointer !== false) window.addEventListener("pointermove", onMove, { passive: true });

      var io = null, mqR = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
      function halt() { running = false; cancelAnimationFrame(raf); }
      function kill() {
        if (dead) return;
        halt(); dead = true;
        cv.style.opacity = "0";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVis);
        if (io) io.disconnect();
        if (mqR && mqR.removeEventListener) mqR.removeEventListener("change", onReduce);
        var lose = gl.getExtension("WEBGL_lose_context");
        setTimeout(function () { if (lose) lose.loseContext(); if (cv.parentNode) cv.parentNode.removeChild(cv); }, 950);
        if (cfg.onDead) cfg.onDead();
      }
      function tick(now) {
        if (!running) return;
        var dt = Math.max(0, Math.min(0.1, (now - last) / 1000));   // първият кадър може да дойде с по-ранен печат от last
        last = now;
        st.clock += dt;                                        // натрупано време: върви само докато сцената се рисува
        if (pointer && now - st.lastMove > 2600) pointer = null;      // курсорът е спрял → обратно към покой / автоматичното движение
        var live = state(st.clock, dt, pointer);
        draw(st.clock);
        if (!live && !loop && st.phi < -0.97 && Math.abs(st.s - norm(cfg.s0)) < 0.002 && Math.abs(st.laser - rest) < 0.02) {
          // покой (режим intro): платното се скрива и остава неподвижният кадър; курсорът го събужда
          resting = true; cv.style.opacity = "0"; halt(); return;
        }
        // пазач за кадрите: първо по-ниска резолюция, после изключване (остава неподвижният кадър)
        frames++;
        if (dt > 0.034) slow++;
        if (frames >= 90) {
          if (slow > 45) { if (scale > 0.6) scale *= 0.75; else { kill(); return; } }
          frames = 0; slow = 0;
        }
        raf = requestAnimationFrame(tick);
      }
      function start() {
        if (running || dead || paused) return;
        running = true; last = performance.now();
        raf = requestAnimationFrame(tick);
      }
      cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); kill(); });

      var vis = !document.hidden, onScreen = true;
      function gate() { if (vis && onScreen && !resting) start(); else halt(); }
      function onVis() { vis = !document.hidden; gate(); }
      function onResize() { if (!running && !dead && !resting) draw(st.clock); }   // на пауза: кадърът пак следва размера
      function onReduce() { if (mqR.matches) kill(); }                               // включено „намалено движение“ по време на сесията
      var api = {
        canvas: cv,
        // за тестове и снимки: изчисли и нарисувай точно това състояние
        frame: function (t, ptr, steps) {
          for (var i = 0; i < (steps || 1); i++) state(t, 1 / 30, ptr || null);
          if (steps) st.laser = 1;
          draw(t);
          cv.style.transition = "none"; cv.style.opacity = "1";
        },
        set: function (o) { for (var k in o) st[k] = o[k]; },
        pause: function () { paused = true; halt(); },
        resume: function () { if (paused) { paused = false; gate(); } },
        paused: function () { return paused; },
        dead: function () { return dead; },
        peek: function () { return { s: st.s, phi: st.phi, laser: st.laser, clock: st.clock, resting: resting, running: running }; },
        destroy: function () { kill(); }
      };
      if (cfg.capture) return api;

      draw(0);
      requestAnimationFrame(function () { cv.style.opacity = "1"; });
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("resize", onResize, { passive: true });
      if (mqR && mqR.addEventListener) mqR.addEventListener("change", onReduce);
      if ("IntersectionObserver" in window) {
        io = new IntersectionObserver(function (en) { onScreen = en[0].isIntersecting; gate(); }, { threshold: 0.01 });
        io.observe(cv);
      }
      gate();
      return api;
    }).catch(function () { return null; });
  }

  window.CSLive = { mount: mount, reduced: reduced, thrifty: thrifty };
})();
