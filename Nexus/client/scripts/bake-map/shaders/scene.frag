// СЦЕНА: raymarch на macro терена + детайл, небе/луна, море, мъгла, структури
uniform sampler2D tM0, tM1, tM2, tM3;
uniform vec2 uWorld;
uniform vec2 uRes;
uniform vec2 uJit;
uniform vec3 uCamPos, uCamTarget;
uniform float uFov;
uniform float uSeed;
uniform float uWeight;
uniform float uSampleF;     // k/N — равномерно разпределен джитър      // 1/N за акумулацията
uniform float uQuality;     // 0.5 чернова .. 1 финал

// настроение (по кадър)
uniform vec3 uMoonDir;
uniform vec3 uMoonCol;
uniform vec3 uAmbSky;       // околна светлина отгоре
uniform vec3 uAmbGround;
uniform vec3 uFogCol;
uniform float uFogMul;      // множител на мъглата
uniform float uMistMul;     // нискоживееща мъгла
uniform float uCloud;       // 0..1 облаци
uniform float uMoonSize;
uniform float uWarm;        // сила на топлите светлини
uniform float uCyanMul;     // сила на магическата светлина
uniform float uExposure;
uniform int uSkyMode;       // 0 нощ, 1 аврора, 2 затъмнение, 3 зора, 4 звездопад, 5 буря
uniform vec4 uMoteCol;      // rgb + плътност на искри/светулки/сняг
uniform float uMoteSize;
uniform float uBolt;        // азимут на светкавицата (rad), <-9 = няма

uniform vec4 uStructA[24];  // x,y,z,type
uniform vec4 uStructB[24];  // radius, scale, rotation, seed
uniform int uNS;
uniform vec4 uGlowA[24];
uniform vec4 uGlowB[24];
uniform int uNG;
uniform int uDebug;

out vec4 fragColor;

const float HMAX = 15.0;
const float WATER = 0.0;

// ------------------------------------------------------------ macro достъп
vec2 muv(vec2 xz){ return vec2(xz.x / uWorld.x, 1. - xz.y / uWorld.y); }

float bicubicH(vec2 uv){
  vec2 ts = vec2(textureSize(tM0, 0));
  vec2 x = uv * ts - .5;
  vec2 f = fract(x);
  vec2 i = x - f;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1. - f) * (1. - f) * (1. - f) / 6.;
  vec2 w1 = (4. - 6. * f2 + 3. * f3) / 6.;
  vec2 w2 = (1. + 3. * f + 3. * f2 - 3. * f3) / 6.;
  vec2 w3 = f3 / 6.;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 p0 = (i - 1. + w1 / g0 + .5) / ts;
  vec2 p1 = (i + 1. + w3 / g1 + .5) / ts;
  float a = texture(tM0, vec2(p0.x, p0.y)).x, b = texture(tM0, vec2(p1.x, p0.y)).x;
  float c = texture(tM0, vec2(p0.x, p1.y)).x, d = texture(tM0, vec2(p1.x, p1.y)).x;
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}

// ------------------------------------------------------------ вегетация / релефни елементи в тънък слой
// връща височина на дърветата/кристалите над земята + id
vec3 vegLayer(vec2 xz, float forest, float rock, float dead){
  float best = 0., seed = 0., kind = 0.;
  // иглолистна гора — гъсти конуси
  if (forest > .06){
    float cs = .34;
    vec2 gi = floor(xz / cs);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      vec2 c = gi + vec2(float(i), float(j));
      float present = step(hash12(c + 9.), forest * 1.05);
      vec2 pc = (c + .2 + .6 * hash22(c)) * cs;
      float tr = .13 + .08 * hash12(c + 2.);
      float th = (.28 + .36 * hash12(c + 5.)) * (.7 + .5 * forest);
      float d = length(xz - pc) / tr;
      float prof = th * (1. - d);
      prof *= .88 + .12 * sin(prof * 70.);
      prof = max(prof, 0.) * present;
      if (prof > best){ best = prof; seed = hash12(c + 21.); kind = 1.; }
    }
  }
  // камъни и валуни
  if (rock > .02){
    float cs = .5;
    vec2 gi = floor(xz / cs);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      vec2 c = gi + vec2(float(i), float(j));
      float present = step(hash12(c + 31.), rock * .5);
      vec2 pc = (c + .25 + .5 * hash22(c + 7.)) * cs;
      float rad = .09 + .17 * hash12(c + 4.);
      float hgt = rad * (.55 + .9 * hash12(c + 8.));
      vec2 dv = (xz - pc) / vec2(1., .7 + .5 * hash12(c + 2.));
      float d2 = dot(dv, dv) / (rad * rad);
      float prof = hgt * sqrt(max(1. - d2, 0.)) * (.8 + .4 * vnoise(xz * 11. + c)) * present;
      if (prof > best){ best = prof; seed = hash12(c + 12.); kind = 0.; }
    }
  }
  // мъртви дървета — тънки черни шипове
  if (dead > .05){
    float cs = .75;
    vec2 gi = floor(xz / cs);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      vec2 c = gi + vec2(float(i), float(j));
      float present = step(hash12(c + 51.), dead * .55);
      vec2 pc = (c + .2 + .6 * hash22(c + 17.)) * cs;
      float ht = .45 + .6 * hash12(c + 6.);
      float d = length(xz - pc) / (.045 + .02 * hash12(c));
      float prof = ht * (1. - d) * present;
      if (prof > best){ best = prof; seed = hash12(c + 22.); kind = 2.; }
    }
  }
  return vec3(best, seed, kind);
}

float vegParams(vec2 uv, out float forest, out float rock, out float dead){
  vec4 m1 = texture(tM1, uv), m2 = texture(tM2, uv), m3 = texture(tM3, uv);
  float mtn = texture(tM0, uv).w;
  forest = m1.x;
  float urban = m2.z;
  rock = (1. - forest) * clamp(.18 + m3.w * .6 + mtn * .25, 0., 1.) * (1. - urban * .8) * (1. - m1.y * .3);
  dead = clamp(m2.y * .55 + m1.z * .4 + m2.w * .25, 0., 1.) * (1. - forest);
  return 0.;
}

// ------------------------------------------------------------ терен
float detailAt(vec2 xz, float H, float rough, float mtn, int oct){
  if (oct <= 0) return 0.;
  float amp = (.02 + .075 * rough) * (1. + 1.2 * mtn);
  vec2 q = xz * 2.4 + 31.3;
  float e = erode(q, oct);
  float r = ridged(q * .9, oct) ;
  float d = mix(e - .52, (r - .45) * 1.1, clamp(mtn * .7, 0., .8));
  return d * amp * smoothstep(-.02, .25, H);
}

int octFor(float fp){
  return int(clamp(log2(.5 / (2. * fp)) + 1., 0., 8.) * uQuality + .5);
}

// височина (стойността е кастната на морското равнище — сушата + равна вода)
float terrainH(vec2 xz, float fp){
  vec2 uv = muv(xz);
  float H = bicubicH(uv);
  int oct = octFor(fp);
  if (oct > 0 && H > -.06){
    float rough = texture(tM3, uv).w;
    float mtn = texture(tM0, uv).w;
    H += detailAt(xz, H, rough, mtn, oct);
    if (fp < .03 && H > .05){
      float forest, rock, dead;
      vegParams(uv, forest, rock, dead);
      H += vegLayer(xz, forest, rock, dead).x;
    }
  }
  return max(H, WATER);
}
float terrainHc(vec2 xz, float fp){   // евтина версия (сенки/отражения)
  vec2 uv = muv(xz);
  float H = bicubicH(uv);
  int oct = min(octFor(fp), 2);
  if (oct > 0 && H > -.06){
    H += detailAt(xz, H, texture(tM3, uv).w, texture(tM0, uv).w, oct);
  }
  return max(H, WATER);
}

// ------------------------------------------------------------ структури (пълнят се от structs.glsl)
float mapS(vec3 p, out float mat);

// ------------------------------------------------------------ небе
vec3 skyCol(vec3 rd, bool moon, bool stars){
  float y = max(rd.y, 0.);
  vec3 hor = uFogCol * .85;
  vec3 zen = uAmbSky * .22;
  vec3 col = mix(hor, zen, pow(y, .45));
  // луната
  float md = dot(rd, uMoonDir);
  float halo = exp(-(1. - md) * 90.) * .22 + exp(-(1. - md) * 1400.) * .8;
  col += uMoonCol * halo * .5;
  // облаци — две дълбочини, проектирани върху равнина
  float cl = 0.;
  vec3 cloudCol = vec3(0.);
  if (rd.y > -.02){
    vec2 cp = rd.xz / (rd.y + .22);
    vec2 w = vec2(fbm(cp * .6 + 3.1, 4), fbm(cp * .6 + 8.7, 4));
    float c1 = fbm(cp * .9 + w * 1.6 + uSeed, 6);
    float dens = smoothstep(.62 - uCloud * .22, .86 - uCloud * .08, c1);
    float c2 = fbm(cp * 2.2 + w * 2.5 + 5., 5);
    dens *= .65 + .5 * c2;
    dens = clamp(dens, 0., 1.);
    dens *= smoothstep(-.02, .12, rd.y);
    float lit = pow(max(md, 0.), 6.) * .9 + .06;
    // сребърен ръб откъм луната
    float edge = clamp(dens * (1. - dens) * 4., 0., 1.);
    cloudCol = mix(vec3(.012, .017, .028), vec3(.07, .09, .12), c2) + uMoonCol * (lit * (.25 + edge * 1.4)) * (.5 + .5 * c2);
    cl = dens;
  }
  if (moon && md > .975){
    vec3 r = normalize(cross(uMoonDir, vec3(0, 1, 0)));
    vec3 u = cross(r, uMoonDir);
    vec2 mp = vec2(dot(rd, r), dot(rd, u)) / uMoonSize;
    float rr = length(mp);
    if (uSkyMode == 2){                       // затъмнение: тъмен диск и виолетова корона
      float cor = exp(-max(rr - 1., 0.) * 4.5) * (rr > 1. ? 1. : 0.) + exp(-max(rr - 1., 0.) * 22.) * 3.;
      col += vec3(.45, .2, 1.) * cor * .9;
      if (rr < 1.) col = vec3(.0, .0, .004);
    } else if (uSkyMode == 3){                // слънце на зората
      float sun = smoothstep(1.05, .95, rr);
      col += vec3(1., .7, .38) * (sun * 9. + exp(-rr * .9) * .9);
    } else if (rr < 1.){
      float z = sqrt(1. - rr * rr);
      float cr = fbm(mp * 3.2 + 40., 6);
      float mar = fbm(mp * 1.3 + 7., 4);
      vec3 mc = mix(vec3(.55, .6, .68), vec3(.95, .97, 1.), smoothstep(.35, .7, cr));
      mc *= .65 + .5 * mar;
      mc *= .55 + .55 * z;
      col = mix(col, mc * 3.2, smoothstep(1., .97, rr));
    }
  }
  if (uSkyMode == 1 && rd.y > .02){           // аврора
    float az = atan(rd.x, -rd.z);
    float el = rd.y;
    float band = smoothstep(.04, .22, el) * smoothstep(.95, .35, el);
    float w1 = fbm(vec2(az * 2.2, el * 3.), 3);
    float curtain = pow(fbm(vec2(az * 5. + w1 * 3., el * 1.4 + 2.), 4), 2.4);
    float rays = .6 + .4 * vnoise(vec2(az * 60., 0.));
    vec3 ac = mix(vec3(.1, 1., .55), vec3(.45, .35, 1.), smoothstep(.15, .7, el));
    col += ac * band * curtain * rays * 1.6;
  }
  if (uSkyMode == 4 && rd.y > .03){           // звездопад
    float az = atan(rd.x, -rd.z), el = rd.y;
    for (int k = 0; k < 6; k++){
      float fk = float(k);
      vec2 a0 = vec2(-1.3 + fk * .55 + hash12(vec2(fk, 1.)) * .3, .5 + hash12(vec2(fk, 2.)) * .5);
      vec2 dir = normalize(vec2(.55, -.35 - hash12(vec2(fk, 3.)) * .3));
      float len = .22 + .2 * hash12(vec2(fk, 4.));
      vec2 pq = vec2(az, el) - a0;
      float tt = clamp(dot(pq, dir) / len, 0., 1.);
      float d = length(pq - dir * tt * len);
      col += vec3(.7, .8, 1.) * exp(-d * d / (2e-6 + tt * 6e-6)) * pow(1. - tt, 1.5) * (.3 + 1.2 * step(.0, tt)) * 2.2;
    }
  }
  // звезди
  if (stars && rd.y > .05){
    vec2 sp = rd.xz / (rd.y + 1.) * 420.;
    vec2 ip = floor(sp);
    float h = hash12(ip);
    vec2 o = hash22(ip + 3.) - .5;
    float s = smoothstep(.96, 1., h) * smoothstep(.25, 0., length(fract(sp) - .5 - o * .6));
    col += s * vec3(.7, .8, 1.) * .8 * (1. - cl);
  }
  if (uSkyMode == 5 && uBolt > -9.){
    float az = atan(rd.x, -rd.z), el = rd.y;
    float d0 = abs(mod(az - uBolt + 3.14159, 6.28318) - 3.14159);
    float path = uBolt + .018 * sin(el * 55.) + .012 * sin(el * 130. + 2.) + (.04 * (fbm(vec2(el * 20., 4.), 3) - .5));
    float dd = abs(mod(az - path + 3.14159, 6.28318) - 3.14159);
    float bolt = smoothstep(.0035, .0, dd) * smoothstep(.0, .05, el) * smoothstep(.62, .45, el);
    float flash = exp(-d0 * d0 * 14.) * smoothstep(.0, .2, el) * (1. - cl * .3);
    cloudCol += vec3(.55, .65, 1.) * flash * .9 * cl;
    col += vec3(.7, .8, 1.) * (bolt * 14. + flash * .12);
  }
  return mix(col, cloudCol + col * .05, cl);
}

// ------------------------------------------------------------ вода (само сушата има различни височини)
float waveH(vec2 p, float fp){
  float s = 0.;
  float a = .5, f = 1.6;
  for (int i = 0; i < 4; i++){
    vec3 n = noised(p * f + vec2(float(i) * 17., float(i) * 5.));
    s += a * (n.x - .5);
    p = M2 * p;
    a *= .5; f *= 2.1;
    if (f * fp > .35) break;
  }
  return s;
}

// ------------------------------------------------------------ материал на терена
struct Surf {
  vec3 alb;
  vec3 emis;
  float rough;
  float spec;
  float wet;
  float water;   // 1 = мокра повърхност/вода
  float ao;
};

vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(1., 2. / 3., 1. / 3.)) * 6. - 3.); return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y); }

float lodf(float freq, float fp){ return clamp(1. - freq * fp * 1.6, 0., 1.); }

Surf terrainSurf(vec3 p, vec3 n, float fp, float treeH, float treeSeed, float treeKind){
  Surf s;
  vec2 xz = p.xz;
  vec2 uv = muv(xz);
  vec4 m0 = texture(tM0, uv), m1 = texture(tM1, uv), m2 = texture(tM2, uv), m3 = texture(tM3, uv);
  float H = p.y;
  float forest = m1.x, snow = m1.y, ash = m1.z, lava = m1.w;
  float crystal = m2.x, violet = m2.y, urban = m2.z, salt = m2.w;
  float ice = m3.x, cyan = m3.y, rough = m3.w;
  float moist = m0.z, mtn = m0.w;
  float slope = 1. - n.y;
  // многомащабна вариация (фадва с разстоянието — без шум-пясък)
  float nzL = fbm(xz * .12 + 4., 4);
  float nz1 = fbm(xz * 1.1 + 4., 4);
  float nz2 = mix(.5, fbm(xz * 6. + 11., 3), lodf(6., fp));
  float nz3 = mix(.5, vnoise(xz * 30.), lodf(30., fp));

  // слоеста скала
  float strata = .5 + .5 * sin(H * 9. + nzL * 8. + xz.x * .1);
  vec3 rock = mix(vec3(.11, .10, .10), vec3(.23, .21, .19), strata * .55 + nz1 * .45);
  rock *= .8 + .4 * nz3;
  vec3 alb = rock;

  float flt = smoothstep(.36, .08, slope);
  // суха/планинска трева и тундра
  vec3 dry = mix(vec3(.19, .155, .09), vec3(.12, .115, .08), nz1);
  float hi = smoothstep(1., 4.5, H);
  alb = mix(alb, dry * (.85 + .3 * nz3), flt * .55 * (1. - hi * .6));
  // зелена трева — влажните равнини
  vec3 grass = mix(vec3(.05, .12, .05), vec3(.13, .19, .06), nz1);
  grass = mix(grass, vec3(.075, .12, .07), nzL);
  float grassAmt = flt * smoothstep(3.8, 1.2, H) * (.25 + moist * .85) * (1. - ash) * (1. - lava) * (1. - violet);
  alb = mix(alb, grass * (.8 + .4 * nz3), clamp(grassAmt, 0., 1.));
  // плаж
  float beach = smoothstep(.28, .02, H) * flt;
  alb = mix(alb, mix(vec3(.30, .27, .22), vec3(.20, .19, .17), nz1) * (.85 + .3 * nz3), beach * .9);

  // пепел (изгорена пръст, тъмни петна)
  vec3 ashc = mix(vec3(.16, .15, .145), vec3(.045, .042, .045), smoothstep(.3, .7, nz1 + nzL * .5));
  alb = mix(alb, ashc * (.8 + .4 * nz3), clamp(ash * 1.15, 0., 1.));
  // сенчест домен
  vec3 vio = mix(vec3(.075, .045, .10), vec3(.025, .02, .04), nz1);
  alb = mix(alb, vio, clamp(violet * 1.1, 0., 1.));
  // градски камък
  alb = mix(alb, vec3(.22, .215, .24) * (.8 + .4 * nz3), clamp(urban * 1.2, 0., 1.) * flt);
  // сол
  float crack = (1. - smoothstep(.0, .05, abs(vnoise(xz * 4.) - .5))) * lodf(4., fp);
  alb = mix(alb, mix(vec3(.58, .60, .60), vec3(.30, .32, .34), crack * .8 + nz2 * .3), clamp(salt * 1.3, 0., 1.) * flt);
  // кристална скала
  alb = mix(alb, vec3(.055, .10, .13) * (.8 + nz3), clamp(crystal, 0., 1.) * .6);
  // вулканична скала
  alb = mix(alb, vec3(.04, .035, .035) * (.8 + nz3 * .4), clamp(lava * .9, 0., 1.));

  // сняг: височина, студ, не по стръмното
  float cold = snow * 1.5;
  float snowAlt = smoothstep(4.2 - cold * 2.4, 5.6 - cold * 2.4, H + (nzL - .5) * 2.4 + (nz1 - .5) * .6);
  float snowAmt = clamp(snowAlt * 1.4 + ice * flt * .85, 0., 1.) * smoothstep(.75, .3, slope + (nz2 - .5) * .2) * clamp(snow * 1.6 + ice, 0., 1.);
  vec3 snowCol = mix(vec3(.62, .72, .86), vec3(.9, .95, 1.), nz3);
  alb = mix(alb, snowCol, snowAmt);

  // гора: далечна — плътни петна, близо — геометричните дървета
  float fa = 0.;
  if (forest > .05){
    float canopyPatch = smoothstep(.2, .65, nz1 + nzL * .4 + forest * .35 - .35);
    vec3 canopy = mix(vec3(.016, .045, .033), vec3(.045, .085, .06), clamp(nz1 * .8 + treeSeed * .5, 0., 1.));
    canopy = mix(canopy, vec3(.05, .07, .09), snowAmt * .5);
    fa = clamp(forest * 1.25, 0., 1.) * (fp > .03 ? canopyPatch : (treeKind == 1. ? smoothstep(.0, .05, treeH + .015) : .35)) * (1. - snowAmt * .6) * smoothstep(.62, .3, slope);
    alb = mix(alb, canopy, fa);
    alb = mix(alb, snowCol * .85, snowAmt * fa * .5);
  }

  // валуни и мъртви дървета (близък план)
  if (treeKind == 0.){
    vec3 bc = mix(vec3(.10, .095, .095), vec3(.2, .19, .18), treeSeed) * (.8 + .4 * nz3);
    bc = mix(bc, vec3(.05, .09, .05), moist * .4 * smoothstep(.02, .25, treeH) * (1. - treeSeed));   // мъх
    bc = mix(bc, snowCol, snowAmt * .8);
    alb = mix(alb, bc, .85);
  } else if (treeKind == 2.){
    alb = mix(alb, vec3(.012, .011, .013), .95);
  }

  vec3 emis = vec3(0.);
  float spec = .04, rr = .75, wet = 0.;

  // лава — жили
  if (lava > .1){
    float vein = smoothstep(.74, .9, ridged(xz * .7 + 9., 5) + .1 * nz2) * smoothstep(.25, .8, lava);
    float lava2 = smoothstep(.3, .75, fbm(xz * .5 + 90., 4));
    float hot = vein * (.4 + .6 * lava2);
    emis += vec3(2.6, .75, .12) * hot * 1.5 * uWarm + vec3(1.5, .2, .03) * hot * .8 * uWarm;
    alb = mix(alb, vec3(.012, .01, .01), hot * .8);
  }
  float ley = smoothstep(.78, .94, ridged(xz * .55 + 21., 4)) * clamp(cyan * 1.3, 0., 1.);
  emis += vec3(.04, .8, 1.) * ley * .6 * uCyanMul;
  float vv = smoothstep(.8, .94, ridged(xz * .8 + 61., 4)) * clamp(violet, 0., 1.);
  emis += vec3(.45, .12, 1.) * vv * .5 * uCyanMul;

  wet = clamp(moist * .25 + (1. - smoothstep(.0, .4, H)) * .6, 0., 1.);
  rr = mix(.8, .4, wet);
  spec = mix(.03, .05, wet);
  rr = mix(rr, .2, ice * flt);
  spec = mix(spec, .09, ice * flt);
  rr = mix(rr, .55, snowAmt);

  // огнени точки — селища/огнища
  if ((urban + lava * .25) > .1){
    vec2 g = xz / .6;
    vec2 gi = floor(g);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      vec2 c = gi + vec2(float(i), float(j));
      float h = hash12(c + 77.);
      float want = clamp(urban * .9 + lava * .15, 0., 1.);
      if (h < want * .05){
        vec2 pc = (c + .2 + .6 * hash22(c + 3.)) * .6;
        float d = length(xz - pc);
        float fl = exp(-d * d / (.006 + .012 * hash12(c)));
        emis += vec3(2., .62, .15) * fl * 2.2 * uWarm;
      }
    }
  }
  float river = m0.y;
  float water = 0.;
  if (river > .02){
    water = smoothstep(.1, .6, river);
    alb = mix(alb, vec3(.008, .018, .026), water * .92);
    rr = mix(rr, .04, water);
    spec = mix(spec, .1, water);
  }
  Surf o;
  o.alb = alb; o.emis = emis; o.rough = rr; o.spec = spec; o.wet = wet; o.water = water; o.ao = 1.;
  return o;
}

float pixAng;
float softShadow(vec3 p, vec3 L, float fp);
vec2 structSpan(vec3 ro, vec3 rd);
struct Hit { float t; vec3 p; int kind; float mat; }; // kind 0=нищо/небе, 1=терен, 2=структура
#include structs
// ------------------------------------------------------------ марш


Hit marchScene(vec3 ro, vec3 rd, float tmax, bool cheap){
  Hit h; h.kind = 0; h.t = tmax; h.mat = 0.; h.p = ro;
  float tTop = (HMAX - ro.y) / min(rd.y, -1e-4);
  float t = rd.y < 0. ? max(0., tTop) : 0.;
  if (ro.y < HMAX) t = 0.;
  vec2 span = uNS > 0 ? structSpan(ro, rd) : vec2(1e9, -1e9);
  int steps = cheap ? 56 : int(260. * (.5 + .5 * uQuality));
  for (int i = 0; i < 400; i++){
    if (i >= steps) break;
    vec3 p = ro + rd * t;
    float fp = pixAng * t + 1e-5;
    float th = cheap ? terrainHc(p.xz, fp) : terrainH(p.xz, fp);
    float dT = p.y - th;
    float dS = 1e9; float mat = 0.;
    float lim = 1e9;
    if (uNS > 0){
      if (t > span.x - .6 && t < span.y + .6) dS = mapS(p, mat);
      else if (t < span.x) lim = span.x - t - .5;
    }
    float d = min(dT * .52, dS);
    d = min(d, max(lim, fp * .5));
    if (dS < dT * .52 && dS < max(fp * .4, .0008)){
      h.kind = 2; h.t = t; h.p = p; h.mat = mat; return h;
    }
    if (dT < fp * .35){
      // уточнение между предишната и сегашната стъпка
      h.kind = 1; h.t = t; h.p = p; return h;
    }
    if (t > tmax) break;
    // над високата граница и гледаме нагоре — небе
    if (p.y > HMAX && rd.y >= 0.) break;
    t += max(d, fp * .12);
  }
  return h;
}

// ------------------------------------------------------------ осветление
float softShadow(vec3 p, vec3 L, float fp){
  float res = 1.;
  vec2 spn = uNS > 0 ? structSpan(p, L) : vec2(1e9, -1e9);
  float t = .03 + fp * 2. + .02 * hash12(p.xz * 91.);
  for (int i = 0; i < 44; i++){
    vec3 q = p + L * t;
    if (q.y > HMAX) break;
    float th = terrainHc(q.xz, fp + t * .004);
    float h = q.y - th;
    float ds = 1e9; float m = 0.;
    if (uNS > 0 && t > spn.x - .5 && t < spn.y + .5) ds = mapS(q, m);
    h = min(h, ds);
    res = min(res, 9. * h / t);
    if (res < .002) return 0.;
    t += clamp(h * .8, .05 + t * .02, 1.3);
  }
  return clamp(res, 0., 1.);
}

float terrainAO(vec3 p, vec3 n, float fp){
  float occ = 0., sca = 1.;
  for (int i = 0; i < 5; i++){
    float hr = .04 + .22 * float(i) * float(i) * .25 + fp * 3.;
    vec3 q = p + n * hr;
    float d = q.y - terrainHc(q.xz, fp + hr * .3);
    occ += (hr - d) * sca;
    sca *= .72;
  }
  return clamp(1. - .55 * occ / (1. + .2 * occ) , .15, 1.);
}

vec3 aces(vec3 x){
  const float a = 2.51, b = .03, c = 2.43, d = .59, e = .14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0., 1.);
}

// искри / светулки / сняг — звезден прах във въздуха
vec3 motes(vec3 ro, vec3 rd, float T){
  if (uMoteCol.a <= 0.) return vec3(0.);
  vec3 acc = vec3(0.);
  float maxT = min(T, 34.);
  float cell = .5;
  float j = fract(hash12(gl_FragCoord.xy + 9.) + uSampleF);
  for (int i = 0; i < 28; i++){
    float t = (float(i) + j) / 28. * maxT;
    vec3 q = ro + rd * t;
    vec3 g = floor(q / cell);
    float hh = hash13(g);
    float dens = uMoteCol.a * .03;
    if (hh > dens) continue;
    vec3 c = (g + vec3(hash13(g + 1.7), hash13(g + 3.1), hash13(g + 5.3))) * cell;
    c.y += .12 * sin(hh * 40. + c.x);
    float gh = bicubicH(muv(c.xz));
    if (c.y < gh + .03) continue;
    vec3 dv = c - ro;
    float t0 = dot(dv, rd);
    float d = sqrt(max(dot(dv, dv) - t0 * t0, 0.));
    float rad = uMoteSize + t0 * pixAng * .7;
    float v = exp(-d * d / (rad * rad)) * (rad < uMoteSize * 3. ? 1. : uMoteSize * 3. / rad);
    acc += uMoteCol.rgb * v * (.5 + hh / dens) * (1. - t / 40.);
  }
  return acc * maxT / 28. * 1.2 / cell;
}

// мъгла: височинна + кълбовидни струи
vec3 applyFog(vec3 col, vec3 ro, vec3 rd, float t, bool sea){
  // околосветлинна фонова мъгла (атмосферна перспектива)
  float tt = min(t, 260.);
  float extinct = 1. - exp(-tt * .0012 * uFogMul);
  // нискоживееща мъгла: интеграл по лъча
  float acc = 0.;
  vec3 scat = vec3(0.);
  float T = 1.;
  int N = int(18. * (.5 + .5 * uQuality));
  float j = fract(hash12(gl_FragCoord.xy) + uSampleF);
  for (int i = 0; i < 24; i++){
    if (i >= N) break;
    float s = (float(i) + j) / float(N);
    float ti = tt * s * s;               // гъстота към камерата
    float dt = tt * (2. * s / float(N));
    vec3 q = ro + rd * ti;
    float ground = bicubicH(muv(q.xz));
    float hh = q.y - max(ground, 0.);
    if (hh > 5.5) continue;
    float fogReg = texture(tM3, muv(q.xz)).z;
    float moist = texture(tM0, muv(q.xz)).z;
    float n = vnoise3(vec3(q.x * .55, q.y * 1.7, q.z * .55) + vec3(uSeed)) * .6 + vnoise3(vec3(q.x * 1.7, q.y * 3.1, q.z * 1.7)) * .3
            + vnoise3(vec3(q.x * .18, q.y * .8, q.z * .18)) * .4;
    float dens = exp(-max(hh, 0.) * 1.4) * (.006 + .06 * fogReg + .02 * moist) * uMistMul * .5 * smoothstep(.45, .95, n);
    dens += exp(-max(hh, 0.) * .5) * .0015 * uMistMul * (fogReg + .3);
    float a = 1. - exp(-dens * dt);
    scat += T * a * 1.;
    T *= 1. - a;
    if (T < .02) break;
  }
  float mdot = max(dot(rd, uMoonDir), 0.);
  vec3 fogC = uFogCol * (.55 + .45 * pow(mdot, 3.)) + uMoonCol * pow(mdot, 8.) * .28;
  vec3 mistC = mix(uFogCol * 1.15, uMoonCol * .9, .35 + .5 * pow(mdot, 4.));
  col = col * (1. - extinct) + fogC * extinct;
  col = col * T + mistC * (1. - T);
  return col;
}

vec3 cameraRay(vec2 frag, out float aspect){
  vec2 uv = (frag + uJit) / uRes * 2. - 1.;
  aspect = uRes.x / uRes.y;
  uv.x *= aspect;
  vec3 f = normalize(uCamTarget - uCamPos);
  vec3 r = normalize(cross(f, vec3(0, 1, 0)));
  vec3 u = cross(r, f);
  float tf = tan(radians(uFov) * .5);
  return normalize(f + (uv.x * r + uv.y * u) * tf);
}

vec3 shadeHit(vec3 ro, vec3 rd, Hit h){
  float fp = pixAng * h.t + 1e-5;
  vec3 p = h.p;
  vec3 col;
  if (h.kind == 1){
    // уточняваме по повърхнината и пресмятаме нормала от пълния терен
    float e = max(fp * .7, .0012);
    float hx1 = terrainH(p.xz + vec2(e, 0), fp), hx0 = terrainH(p.xz - vec2(e, 0), fp);
    float hz1 = terrainH(p.xz + vec2(0, e), fp), hz0 = terrainH(p.xz - vec2(0, e), fp);
    float ph = terrainH(p.xz, fp);
    float rawH = bicubicH(muv(p.xz));
    p.y = ph;
    // вегетационен слой (геометрията е в terrainH; тук само цветът)
    float treeH = 0., treeSeed = 0., treeKind = -1.;
    vec2 uv = muv(p.xz);
    if (ph > .05 && fp < .03){
      float forest, rock, dead;
      vegParams(uv, forest, rock, dead);
      vec3 vl = vegLayer(p.xz, forest, rock, dead);
      treeH = vl.x; treeSeed = vl.y; treeKind = treeH > .002 ? vl.z : -1.;
    }
    vec3 n = normalize(vec3(hx0 - hx1, 2. * e, hz0 - hz1));
    // смесване на нормалата към нагоре при дърветата (корони)
    Surf s = terrainSurf(p, n, fp, treeH, treeSeed, treeKind);
    if (rawH <= WATER + .004){
      // морско дъно/вода — обработва се по-долу
    }
    vec3 L = uMoonDir;
    float sh = softShadow(p + n * .01, L, fp);
    sh *= 1. - .55 * uCloud * smoothstep(.5, .72, fbm(p.xz * .035 + vec2(3., 9.) + L.xz * p.y * .5, 4));
    float ao = terrainAO(p, n, fp);
    float ndl = max(dot(n, L), 0.);
    float skyL = .5 + .5 * n.y;
    vec3 amb = mix(uAmbGround, uAmbSky, skyL) * ao;
    vec3 diff = uMoonCol * ndl * sh + amb;
    // отражение (blinn)
    vec3 hv = normalize(L - rd);
    float nh = max(dot(n, hv), 0.);
    float pw = mix(30., 800., 1. - s.rough);
    float sp = pow(nh, pw) * (pw + 8.) / 25.;
    float fr = s.spec + (1. - s.spec) * pow(1. - max(dot(n, -rd), 0.), 5.);
    col = s.alb * diff * (1. + 0. * ao) + uMoonCol * sp * s.spec * 6. * sh * (1.2 - s.rough);
    // небесно отражение по мокрото
    vec3 rf = reflect(rd, n);
    vec3 rsky = skyCol(rf, false, false);
    col += rsky * fr * s.wet * .12 * ao + rsky * s.water * fr * 1.4;
    col += s.emis;
    // небесна „заливка“ срещу самия лъч — rim
    col += uAmbSky * pow(1. - max(dot(n, -rd), 0.), 3.) * .12 * ao * sh;
    return col;
  }
  return vec3(1., 0., 1.);
}

void main(){
  float aspect;
  vec3 rd = cameraRay(gl_FragCoord.xy, aspect);
  vec3 ro = uCamPos;
  pixAng = 2. * tan(radians(uFov) * .5) / uRes.y;

  // водно равнище
  float tSea = rd.y < -1e-4 ? (WATER - ro.y) / rd.y : 1e9;
  float tmax = min(tSea, 700.);
  Hit h = marchScene(ro, rd, tmax, false);

  vec3 col;
  float tHit;
  if (h.kind == 1){
    float rawH = bicubicH(muv(h.p.xz));
    bool isSea = rawH <= WATER + .004;
    if (isSea){
      col = vec3(0.); // дъното ще се оцвети по-долу като вода
      h.kind = 3;
    } else {
      col = shadeHit(ro, rd, h);
      tHit = h.t;
    }
  }
  if (h.kind == 0 && tSea < 1e8 && tSea <= tmax + 1e-3) { h.kind = 3; h.t = tSea; h.p = ro + rd * tSea; }
  if (h.kind == 3){
    vec3 p = ro + rd * ((WATER - ro.y) / rd.y);
    float t = length(p - ro);
    float fp = pixAng * t;
    float e = max(fp * .8, .002);
    float wx = (waveH(p.xz + vec2(e, 0), fp) - waveH(p.xz - vec2(e, 0), fp)) / (2. * e);
    float wz = (waveH(p.xz + vec2(0, e), fp) - waveH(p.xz - vec2(0, e), fp)) / (2. * e);
    float wa = .12 * smoothstep(.6, .02, fp * 6.);
    vec3 n = normalize(vec3(-wx * wa, 1., -wz * wa));
    float depth = -bicubicH(muv(p.xz));
    vec3 rf = reflect(rd, n);
    rf.y = abs(rf.y) + .002;
    // отражение на брега/терена
    Hit rh = marchScene(p + vec3(0, .01, 0), rf, 90., true);
    vec3 refl;
    if (rh.kind == 0) refl = skyCol(rf, true, false);
    else {
      float tt = rh.t;
      pixAng *= 1.; // запазваме ъгъла
      refl = shadeHit(p, rf, rh);
      refl = applyFog(refl, p, rf, tt, false);
    }
    float fr = .02 + .98 * pow(1. - max(dot(n, -rd), 0.), 5.);
    float dep = clamp(depth / 1.6, 0., 1.);
    vec3 shallow = vec3(.004, .022, .030);
    vec3 deepC = vec3(.0008, .003, .008);
    vec3 body = mix(shallow, deepC, smoothstep(0., .8, dep));
    
    // кант от пяна
    float foam = smoothstep(.22, .0, depth) * (.35 + .65 * fbm(p.xz * 5. + 2., 3));
    foam *= smoothstep(-.5, .1, depth);
    col = mix(body, refl, clamp(fr, 0., 1.));
    col += vec3(.45, .6, .72) * foam * .22 * (.3 + uMoonCol.b * .6);
    // магическо сияние на плитчините близо до брега
    float mg = texture(tM3, muv(p.xz)).y;
    col += vec3(.0, .55, .75) * smoothstep(.9, .0, depth) * mg * .14 * uCyanMul;
    tHit = t;
  } else if (h.kind == 2){
    col = shadeStruct(ro, rd, h);
    tHit = h.t;
  } else if (h.kind == 0){
    col = skyCol(rd, true, true);
    tHit = 60.;
  }
  if ((uDebug & 2) == 0) col = addGlows(col, ro, rd, tHit);
  if ((uDebug & 4) == 0) col += motes(ro, rd, tHit);
  if ((uDebug & 1) == 0) col = applyFog(col, ro, rd, tHit, false);

  // изход: линейна HDR радиация
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.);
  col = min(col, vec3(40.));
  fragColor = vec4(col * uWeight, 1.);
}
