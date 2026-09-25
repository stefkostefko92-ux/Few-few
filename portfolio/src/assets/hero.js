// hero.js — героят на хъба в езика на „Двубой в Рейвънхолд" (boy/): ядрото на бранда (кристал-икосаедър,
// вътрешно ядро, два пръстена) в нощна буря — дъжд, издигаща се жарава, студени лунни лъчи с прах, облаци,
// височинна мъгла, мокър под от карбонова тъкан, който отразява ядрото, анаморфна ивица, далечна мълния
// като два импулса и грейдът на boy (window.CSRaven от raven.js). Един фрагментен шейдър, WebGL2, без
// библиотеки; половин резолюция + регулатор за 60 fps; 30 кадъра/с (бавното движение изглежда същото).
// Старт след load (LCP/TBT не се пипат), паралелна компилация, пауза при скрит таб / извън екрана.
// LITE при старта / софтуерен WebGL / без WebGL2 / загубен контекст → CSS кадърът (.hero); LITE по-късно
// („Анимации: стоп", <40 fps) → замразен кадър.
// Безопасност: мълнията е ≤2 импулса в секунда (под прага на WCAG 2.3.1) и я няма при reduced motion.
(function () {
  var R = window.CSRaven, cv = document.getElementById("hero-canvas");
  if (!R || !cv) return;
  var host = cv.parentElement, root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FRAME_MS = 1000 / 30, STILL = 6.4;

  var VERT = "#version 300 es\nin vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}";
  var FRAG = [
    "#version 300 es",
    "precision highp float;",
    "out vec4 outCol;",
    "uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform vec3 uCore;",
    "uniform vec4 uOuter[30]; uniform vec4 uInner[30]; uniform vec4 uRingA; uniform vec4 uRingB;",
    "uniform float uFlash; uniform float uFlashX; uniform float uCoreAmt; uniform float uEmbers; uniform float uRain;",
    "uniform float uExposure; uniform float uGrain;",
    R.GRADE,
    "const vec3 CY = vec3(0.0, 0.78, 1.0);",
    "const vec3 EMB = vec3(1.0, 0.36, 0.08);",
    "const vec3 MOON = vec3(0.52, 0.68, 1.0);",
    "const vec3 FOG = vec3(0.005, 0.009, 0.015);",
    "const float FLOOR = -0.36;",
    "float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(rh(i),rh(i+vec2(1,0)),u.x),mix(rh(i+vec2(0,1)),rh(i+vec2(1,1)),u.x),u.y);}",
    "float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s;}",
    "float seg(vec2 p,vec4 s){vec2 pa=p-s.xy,ba=s.zw-s.xy;float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.,1.);return length(pa-ba*h);}",
    "float ell(vec2 d,vec4 r){float c=cos(r.x),s=sin(r.x);vec2 q=vec2(c*d.x+s*d.y,-s*d.x+c*d.y);return abs(length(q/vec2(r.y,r.z))-1.)*min(r.y,r.z);}",
    // ядрото: радиално сияние + анаморфна ивица (евтино — ползва се и за отражението)
    "vec3 glow(vec2 d,float k){float r2=dot(d,d);return CY*uCoreAmt*k*(.0035/(r2+.005)+.12*exp(-r2*22.)+.16*exp(-d.y*d.y*12000.)*exp(-abs(d.x)*3.2));}",
    // кристалът: обвивка, ядро, пръстени — само близо до ядрото (извън него нула работа)
    "vec3 wire(vec2 q){vec2 d=q-uCore.xy;if(dot(d,d)>uCore.z*uCore.z*9.)return vec3(0);",
    "  float dO=1e3,dI=1e3;for(int i=0;i<30;i++){dO=min(dO,seg(q,uOuter[i]));dI=min(dI,seg(q,uInner[i]));}",
    "  float px=1.6/uRes.y,k=1./(2.*px*px);",
    "  vec3 c=CY*(exp(-dO*dO*k)*.42+exp(-dO*dO*6000.)*.06);",
    "  c+=CY*(exp(-dI*dI*k)*1.0+exp(-dI*dI*4000.)*.16);",
    "  float a=ell(d,uRingA),b=ell(d,uRingB);",
    "  c+=CY*(exp(-a*a*k)*uRingA.w+exp(-b*b*k)*uRingB.w)*.6;",
    "  return c*uCoreAmt;}",
    "float shafts(vec2 q,float A,float t){vec2 S=vec2(-A*.5-.1,.62),D=normalize(vec2(.55,-1.)),N=vec2(-D.y,D.x);float m=0.;",
    "  for(int i=0;i<3;i++){float fi=float(i);vec2 o=S+N*(fi*.3-.04);float al=dot(q-o,D),ac=abs(dot(q-o,N)),w=.03+al*.05;",
    "  m+=smoothstep(w,w*.25,ac)*smoothstep(-.05,.25,al)*exp(-al*1.1)*(.7+.3*vn(vec2(fi*7.,t*.08)));}return m;}",
    "vec3 embers(vec2 q,float t){vec3 acc=vec3(0);vec2 src=vec2(uCore.x,FLOOR+.01);",
    "  for(int i=0;i<16;i++){float fi=float(i);if(fi>=uEmbers)break;",
    "  float h1=rh(vec2(fi,3.1)),h2=rh(vec2(fi+7.,1.3)),h3=rh(vec2(fi*3.1,11.));",
    "  float life=4.+4.*h1,age=fract((t+h2*life)/life);",
    "  vec2 p=src+vec2((h3-.5)*uCore.z*3.+sin(t*.8+fi)*.03*age,age*.75);",
    "  float d=length(q-p);acc+=EMB*exp(-d*d*60000.)*(1.-age)*smoothstep(0.,.06,age)*5.;}return acc;}",
    // дъжд: наклонени колони, всяка клетка — една капка; осветява се от ядрото и мълнията
    "float rain(vec2 q,float t,float sc,float spd,float seed){vec2 p=vec2(q.x+q.y*.14,q.y)*vec2(sc,sc*.22);p.y+=t*spd;",
    "  vec2 id=floor(p),f=fract(p);if(rh(id+seed)>uRain)return 0.;",
    "  float x=.2+.6*rh(id+seed+7.1),len=.3+.4*rh(id+seed+3.3),y0=rh(id+seed+1.9)*(1.-len);",
    "  float w=smoothstep(.09,0.,abs(f.x-x));float s=smoothstep(y0,y0+len*.3,f.y)*smoothstep(y0+len,y0+len*.6,f.y);return w*s;}",
    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/uRes;float A=uRes.x/uRes.y;vec2 q=(gl_FragCoord.xy-.5*uRes)/uRes.y;float t=uTime;",
    "  vec2 dC=q-uCore.xy;float coreFog=.005/(dot(dC,dC)+.08);",
    "  float moon=shafts(q,A,t);vec3 col;",
    "  if(q.y>FLOOR){",
    // небе и облаци: студени, осветяват се отвътре от мълнията
    "    float cl=fbm(vec2(q.x*1.1+t*.012,q.y*2.4-t*.004)*1.6);",
    "    float top=smoothstep(-.05,.5,q.y);",
    "    col=mix(FOG*.8,vec3(.012,.018,.028),cl*top);",
    "    float fl=uFlash*exp(-pow((q.x-uFlashX)*1.4,2.))*top;",
    "    col+=MOON*fl*cl*cl*2.2;",
    "    col+=MOON*moon*.06;",
    "    col+=wire(q)+glow(dC,1.);",
    "  }else{",
    // мокър под: карбонова тъкан 2×2 в перспектива, огледало на ядрото, кръгове от дъжда в локвите
    "    float dz=FLOOR-q.y,z=.2/(dz+.02);",
    "    vec2 fp=vec2((q.x-uMouse.x*.02)*z*2.,z*3.);",
    "    vec2 cp=fp*5.,ci=floor(cp),cf=fract(cp);",
    "    float tw=mod(ci.x+ci.y,4.)<2.?cf.x:cf.y;",
    "    float weave=mix(.8,.62+.38*sin(tw*3.14159),exp(-z*.12));",
    "    float wet=smoothstep(.38,.62,fbm(fp*.45+3.));",
    "    vec3 alb=vec3(.028,.031,.036)*weave;",
    "    col=alb*(vec3(.02,.03,.045)+CY*uCoreAmt*.05/(dot(dC,dC)+.05));",
    "    vec2 rc=fp*1.3,ri=floor(rc),rf=fract(rc)-.5;float ph=fract(t*.9+rh(ri));",
    "    float ring=exp(-pow((length(rf)-ph*.45)*40.,2.))*(1.-ph)*wet*step(rh(ri+2.),.5*uRain+.1);",
    "    float rip=vn(vec2(fp.x*7.,fp.y*7.+t*.4))-.5+ring*.6;",
    "    vec2 mq=vec2(q.x+rip*.014,2.*FLOOR-q.y);vec2 dm=(mq-uCore.xy)*vec2(1.,.38);",
    "    vec3 refl=glow(dm,.55)+MOON*moon*.12+MOON*uFlash*.18;",
    "    col+=refl*mix(.07,.6,wet)*smoothstep(0.,.02,dz)+CY*ring*.05*uCoreAmt;",
    "  }",
    "  col+=embers(q,t);",
    "  float dust=pow(vn(q*150.+vec2(t*.04,-t*.11)),40.);",
    "  col+=MOON*(moon*.025+moon*moon*dust*1.1);",
    "  float r=rain(q,t,46.,5.,1.)*.7+rain(q,t,78.,7.,9.)*.45;",
    "  col+=(vec3(.05,.07,.09)+CY*uCoreAmt*coreFog*.9+MOON*uFlash*.5)*r*uRain*step(FLOOR-.02,q.y);",
    // височинна мъгла: най-гъста при пода, студена; сияе около ядрото
    "  vec3 fogCol=FOG+CY*uCoreAmt*coreFog*.5+MOON*uFlash*.04;",
    "  float fogAmt=.22+.5*smoothstep(FLOOR+.12,FLOOR-.3,q.y)+.12*smoothstep(.2,.6,q.y);",
    "  col=mix(col,fogCol,clamp(fogAmt,0.,.8));",
    "  outCol=vec4(ravenGrade(col*uExposure,uv,A,t,uGrain,.55),1.);",
    "}",
  ].join("\n");

  // --- кристалът на процесора (30 fps, пренебрежимо): икосаедър + вътрешно ядро + два пръстена ---
  var phi = (1 + Math.sqrt(5)) / 2;
  var V = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]].map(function (v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
  var E = []; for (var i = 0; i < 12; i++) for (var j = i + 1; j < 12; j++) if (Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2]) < 1.1) E.push([i, j]);
  function rot(v, ax, ay) { var cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax); var x1 = v[0] * cy - v[2] * sy, z1 = v[0] * sy + v[2] * cy; return [x1, v[1] * cx - z1 * sx, v[1] * sx + z1 * cx]; }
  function edges(out, ax, ay, scale, cx, cy) {
    var P = V.map(function (v) { var r = rot(v, ax, ay), f = 4.4 / (r[2] + 4.4); return [cx + r[0] * scale * f, cy + r[1] * scale * f]; });
    for (var k = 0; k < 30; k++) { var e = E[k]; out[k * 4] = P[e[0]][0]; out[k * 4 + 1] = P[e[0]][1]; out[k * 4 + 2] = P[e[1]][0]; out[k * 4 + 3] = P[e[1]][1]; }
  }

  var gl, prog, U = {}, outer = new Float32Array(120), inner = new Float32Array(120);
  // Регулаторът загрява за 1.2 s (не 3): трябва да свали резолюцията, преди детекторът в site.js (<40 fps две
  // секунди след 4-тата) да обяви слаба машина и да спре анимацията изобщо.
  var gov = R.createGovernor({ warmupMs: 1200, windowSize: 30 }), cap = 0.75, cssW = 0, cssH = 0;
  var mx = 0, my = 0, tmx = 0, tmy = 0, visible = true, raf = 0, last = 0, lastTick = 0, t0 = 0, live = false;
  var nextStrike = 7, strikeAt = -10, flashX = 0;
  function isStill() { return root.classList.contains("lite"); }
  function fail() { root.classList.add("hero-static"); live = false; }

  function resize() {
    if (!gl) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5), k = dpr * cap * gov.scale;
    var w = Math.max(1, Math.round(cssW * k)), h = Math.max(1, Math.round(cssH * k));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h); gl.uniform2f(U.uRes, w, h);
  }

  function draw(t) {
    var A = cssW / Math.max(cssH, 1), wide = cssW > 900;
    var S = Math.min(cssW, cssH) * (wide ? 0.15 : 0.13) / Math.max(cssH, 1);
    mx += (tmx - mx) * 0.08; my += (tmy - my) * 0.08;
    var cx = (wide ? 0.25 * A : 0) + mx * 0.02, cy = (wide ? 0.03 : 0.3) + my * 0.015;
    edges(outer, t * 0.05, t * 0.12, S * 1.6, cx, cy);
    edges(inner, -t * 0.1, t * 0.2, S * (0.95 + Math.sin(t * 1.3) * 0.05), cx, cy);
    gl.uniform4fv(U.uOuter, outer); gl.uniform4fv(U.uInner, inner);
    gl.uniform3f(U.uCore, cx, cy, S);
    gl.uniform4f(U.uRingA, Math.sin(t * 0.21) * 0.25, S * 2.1, S * 2.1 * Math.abs(Math.sin(0.5 - t * 0.1)) + 0.002, 0.32);
    gl.uniform4f(U.uRingB, 0.6 + Math.sin(t * 0.17) * 0.2, S * 2.1, S * 2.1 * Math.abs(Math.sin(1.1 + t * 0.15)) + 0.002, 0.22);
    gl.uniform2f(U.uMouse, mx, my);
    gl.uniform1f(U.uCoreAmt, wide ? 1 : 0.45);
    // мълния: два импулса на 9–16 s; никога при reduced motion, LITE или статичен кадър
    var fl = 0;
    if (!reduce && !isStill() && live) {
      if (t > nextStrike) { strikeAt = t; nextStrike = t + 9 + Math.random() * 7; flashX = (Math.random() - 0.5) * A * 0.8; }
      fl = R.flashAt(t - strikeAt);
    }
    gl.uniform1f(U.uFlash, fl * 0.9); gl.uniform1f(U.uFlashX, flashX);
    gl.uniform1f(U.uTime, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (lastTick && gov.sample(now - lastTick, now)) resize();
    lastTick = now;
    if (now - last < FRAME_MS) return;
    last = now; draw((now - t0) / 1000);
  }
  function start() {
    if (!live || raf || document.hidden || !visible) return;
    if (isStill()) { draw(STILL); return; }
    gov.reset(performance.now()); lastTick = 0; raf = requestAnimationFrame(tick);
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  function init() {
    // Слаба машина (LITE още при старта) → CSS кадърът: компилацията + един кадър на CPU са ~0.4 s блокирана нишка.
    if (isStill()) return fail();
    gl = cv.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) return fail();
    // Софтуерно рисуване (без GPU) → същото: шейдърът на CPU не държи 30 кадъра и блокира главната нишка.
    var dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER)))) return fail();
    var par = gl.getExtension("KHR_parallel_shader_compile");
    var vs = gl.createShader(gl.VERTEX_SHADER), fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vs, VERT); gl.compileShader(vs); gl.shaderSource(fs, FRAG); gl.compileShader(fs);
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    // Паралелна компилация: не блокира главната нишка — чакаме готовността, вместо да я питаме синхронно.
    (function ready() {
      if (par && !gl.getProgramParameter(prog, par.COMPLETION_STATUS_KHR)) return setTimeout(ready, 50);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return fail();
      gl.useProgram(prog);
      var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ["uRes", "uTime", "uMouse", "uCore", "uOuter", "uInner", "uRingA", "uRingB", "uFlash", "uFlashX", "uCoreAmt", "uEmbers", "uRain", "uExposure", "uGrain"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
      var coarse = matchMedia("(pointer: coarse)").matches;
      cap = R.initialPixelCap(coarse, Math.min(screen.width, screen.height));
      gl.uniform1f(U.uEmbers, coarse ? 8 : 14); gl.uniform1f(U.uRain, coarse ? 0.45 : 0.6);
      gl.uniform1f(U.uExposure, 1.45); gl.uniform1f(U.uGrain, 0.035);
      var r = host.getBoundingClientRect(); cssW = r.width; cssH = r.height; resize();
      t0 = performance.now(); live = true;
      draw(isStill() ? STILL : 0.001);
      cv.classList.add("on");
      start();
    })();
  }

  addEventListener("pointermove", function (e) { var r = host.getBoundingClientRect(); tmx = (e.clientX - r.left) / r.width * 2 - 1; tmy = -((e.clientY - r.top) / r.height * 2 - 1); }, { passive: true });
  new ResizeObserver(function (en) { var r = en[0] && en[0].contentRect; if (!r) return; cssW = r.width; cssH = r.height; if (live) { resize(); if (!raf) draw(isStill() ? STILL : (performance.now() - t0) / 1000); } }).observe(host);
  new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); else stop(); }).observe(host);
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
  cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); stop(); fail(); });
  addEventListener("cs-lite", function () { stop(); if (live) draw(STILL); }); // „Анимации: стоп" / слаба машина → един кадър
  // След load и празен ход: шейдърът не се бори с първото рисуване (LCP) и с TBT.
  function later() { (window.requestIdleCallback || function (f) { setTimeout(f, 200); })(init, { timeout: 1500 }); }
  if (document.readyState === "complete") later(); else addEventListener("load", later, { once: true });
})();
