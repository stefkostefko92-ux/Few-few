// Жив 3D щит за popup-а — собствен WebGL2, без библиотека (три.js е само в билд инструмента).
//
// Какво прави: статичният кадър (два WebP слоя от tools/popup_shield3d.mjs) е в CSS и се
// рисува веднага. След първото рисуване този файл, САМО ако е евтино, слага върху него canvas,
// който преосветява същите слоеве по картите на нормалите: светлината и лекият наклон следват
// курсора, острието („тикът“) е по-напред → паралакс. При отваряне — кратко „заключване“, после покой.
//
// Без WebGL2 / софтуерен рендер (failIfMajorPerformanceCaveat) / reduced-motion / reduced-data →
// остава статичният кадър, без грешка. Rendering спира в покой и при скрит popup.
// Чете `data-state` на #hero (protected | paused | off | allowed) — пише го popup.js.
(function () {
  "use strict";
  var hero = document.getElementById("hero");
  var stage = document.getElementById("stage");
  var cv = document.getElementById("shGl");
  if (!hero || !stage || !cv) return;

  var SPRITE = { protected: "ok", paused: "pause", off: "off", allowed: "off" };
  // цвят на отблясъка по състояние
  var GLINT = { protected: [0.55, 1.0, 1.0], paused: [1.0, 0.82, 0.5], off: [0.8, 0.83, 0.88], allowed: [0.8, 0.83, 0.88] };
  var L0 = [-0.45, 0.62, 0.66]; // светлината, с която са рендерирани слоевете

  // Без localStorage: първият достъп до него в страница на разширението струва ~40 ms (измерено).
  // Първият кадър е „защитено“ (най-честото); popup.js го поправя в рамките на отговора на SW.

  // popup.js изобщо не зарежда файла при reduced-motion / reduced-data / автоматизация; пазим и тук
  // същия гейт, за да е безопасен и сам (статичният кадър е пълноценният вариант).
  if (matchMedia("(prefers-reduced-motion: reduce), (prefers-reduced-data: reduce)").matches) return;

  var gl = null, prog, U = {}, tex = {}, W = 112, dpr = 1;
  var cur = { yaw: 0, pitch: 0, lx: L0[0], ly: L0[1], lz: L0[2] };
  var tgt = { yaw: 0, pitch: 0, lx: L0[0], ly: L0[1], lz: L0[2] };
  var t0 = 0, intro = 0, raf = 0, last = 0;
  // popup.js поправя data-state, щом SW отговори → зареждаме съответния кадър и „заключваме“
  new MutationObserver(function () { if (gl) swap(); }).observe(hero, { attributes: true, attributeFilter: ["data-state"] });

  var VS = "#version 300 es\nin vec2 p;uniform vec2 r;uniform float z;out vec2 v;" +
    "void main(){v=vec2(p.x,-p.y)*.5+.5;vec3 q=vec3(p,z);" +
    "float cy=cos(r.x),sy=sin(r.x),cx=cos(r.y),sx=sin(r.y);" +
    "q=vec3(q.x*cy+q.z*sy,q.y,-q.x*sy+q.z*cy);q=vec3(q.x,q.y*cx-q.z*sx,q.y*sx+q.z*cx);" +
    "gl_Position=vec4(q.xy,0.,1.-(q.z-z)*.22);}";
  var FS = "#version 300 es\nprecision mediump float;uniform sampler2D c,n;uniform vec3 L,L0,g;in vec2 v;out vec4 o;" +
    "void main(){vec4 s=texture(c,v);vec3 N=normalize(texture(n,v).xyz*2.-1.);" +
    "vec3 l=normalize(L),m=normalize(L0),V=vec3(0.,0.,1.);" +
    "float d=max(dot(N,l),0.)-max(dot(N,m),0.);" +
    "float h=pow(max(dot(N,normalize(l+V)),0.),34.)-pow(max(dot(N,normalize(m+V)),0.),34.);" +
    "float e=pow(1.-N.z,1.6)*(max(dot(N.xy,l.xy),0.)-max(dot(N.xy,m.xy),0.));" +
    "o=vec4(max(s.rgb*(1.+.42*d)+s.a*g*(.34*h+.26*e),0.),s.a);}";

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader");
    return s;
  }
  function load(src) {
    return new Promise(function (ok, no) {
      var im = new Image(); im.onload = function () { ok(im); }; im.onerror = no; im.src = src;
    });
  }
  function upload(im, premul) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function sprites(state) {
    var k = SPRITE[state] || "ok";
    return Promise.all([load("img/shield-" + k + "-bg.webp"), load("img/shield-" + k + "-fg.webp")]);
  }

  function draw() {
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    var g = GLINT[hero.dataset.state] || GLINT.protected;
    gl.uniform3f(U.L, cur.lx, cur.ly, cur.lz); gl.uniform3f(U.g, g[0], g[1], g[2]);
    // слой 0: щит, слой 1: острие — по-напред (z), затова се измества повече при наклон
    var layers = [[tex.bg, tex.nbg, 0], [tex.fg, tex.nfg, 0.3]];
    for (var i = 0; i < 2; i++) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, layers[i][0]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, layers[i][1]);
      gl.uniform2f(U.r, cur.yaw, cur.pitch); gl.uniform1f(U.z, layers[i][2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  function frame(now) {
    raf = 0;
    if (!gl || document.hidden) return;
    var dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    var k = 1 - Math.exp(-dt * 9), busy = false;
    for (var key in cur) { var d = tgt[key] - cur[key]; cur[key] += d * k; if (Math.abs(d) > 0.0008) busy = true; }
    var yaw = cur.yaw, lx = cur.lx;
    if (intro) { // „заключване“: затихващо люлеене + светлинен преход, после покой
      var t = (now - t0) / 1000;
      if (t > 1.1) intro = 0; else {
        var a = Math.exp(-4.5 * t) * Math.sin(15 * t);
        cur.yaw += 0.34 * a; cur.lx += 1.1 * (1 - t / 1.1) * Math.sin(t * 7); busy = true;
        draw(); cur.yaw = yaw; cur.lx = lx; schedule(); return;
      }
    }
    draw();
    if (busy) schedule();
  }
  function schedule() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
  function lock() { if (!gl) return; intro = 1; t0 = performance.now(); last = 0; schedule(); }

  function swap() {
    var st = hero.dataset.state;
    sprites(st).then(function (im) {
      if (!gl) return;
      gl.deleteTexture(tex.bg); gl.deleteTexture(tex.fg);
      tex.bg = upload(im[0], true); tex.fg = upload(im[1], true);
      lock();
    }, function () {});
  }

  function aim(e) {
    var r = stage.getBoundingClientRect();
    var x = (e.clientX - (r.left + r.width / 2)) / 160, y = (e.clientY - (r.top + r.height / 2)) / 160;
    x = Math.max(-1.4, Math.min(1.4, x)); y = Math.max(-1.4, Math.min(1.4, y));
    tgt.yaw = x * 0.2; tgt.pitch = y * 0.15;
    tgt.lx = x * 1.1 - 0.1; tgt.ly = -y * 1.0 + 0.25; tgt.lz = 0.62;
    schedule();
  }
  function rest() { tgt.yaw = tgt.pitch = 0; tgt.lx = L0[0]; tgt.ly = L0[1]; tgt.lz = L0[2]; schedule(); }

  function init() {
    try {
      var ctx = cv.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
        powerPreference: "low-power", failIfMajorPerformanceCaveat: true });
      if (!ctx) return;
      // софтуерен рендер (SwiftShader/llvmpipe) → по-евтино и по-тихо е статичният кадър
      var dbg = ctx.getExtension("WEBGL_debug_renderer_info");
      if (dbg && /swiftshader|llvmpipe|software|basic render/i.test(String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)))) { ctx.getExtension("WEBGL_lose_context") && ctx.getExtension("WEBGL_lose_context").loseContext(); return; }
      gl = ctx;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = cv.height = Math.round(W * dpr);
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.bindAttribLocation(prog, 0, "p"); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
      gl.useProgram(prog);
      ["r", "z", "L", "L0", "g"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
      gl.uniform1i(gl.getUniformLocation(prog, "c"), 0); gl.uniform1i(gl.getUniformLocation(prog, "n"), 1);
      gl.uniform3f(U.L0, L0[0], L0[1], L0[2]);
      var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); off(); });
      Promise.all([sprites(hero.dataset.state), load("img/shield-bg-n.webp"), load("img/shield-fg-n.webp")]).then(function (a) {
        if (!gl) return;
        tex.bg = upload(a[0][0], true); tex.fg = upload(a[0][1], true);
        tex.nbg = upload(a[1], false); tex.nfg = upload(a[2], false);
        draw();
        cv.hidden = false; stage.classList.add("gl"); // статичният кадър отдолу е идентичен — няма трепване
        document.addEventListener("pointermove", aim, { passive: true });
        document.documentElement.addEventListener("pointerleave", rest);
        document.addEventListener("visibilitychange", function () { if (!document.hidden) { last = 0; schedule(); } });
        lock();
      }).catch(off);
    } catch (e) { off(); }
  }
  function off() { // връщаме се към статичния кадър, мълчаливо
    gl = null; cv.hidden = true; stage.classList.remove("gl");
    document.removeEventListener("pointermove", aim);
  }

  init(); // зареден е СЛЕД първото рисуване (виж края на popup.js) — 3D никога не бави първия кадър
})();
