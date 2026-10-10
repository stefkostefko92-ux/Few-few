// MACRO ПАС: височина + биомни параметри за целия свят (еднократно, в текстури)
#define NR 25
uniform vec2 uWorld;
uniform vec2 uRes;
uniform vec4 uSeg[NR];
uniform vec4 uRB[NR];   // R, land, hOff, mtn
uniform vec4 uRC[NR];   // rough, forest, snow, ash
uniform vec4 uRD[NR];   // lava, crystal, violet, urban
uniform vec4 uRE[NR];   // salt, ice, cyan, fog
uniform vec4 uRF[NR];   // moist, feat, fr, fa
uniform vec4 uRG[NR];   // fh, active
uniform float uSeed;
uniform vec4 uPad[24];   // x, z, радиус, височина — равни площадки за структурите
uniform int uNP;

layout(location=0) out vec4 o0;   // H, river, moist, mtn
layout(location=1) out vec4 o1;   // forest, snow, ash, lava
layout(location=2) out vec4 o2;   // crystal, violet, urban, salt
layout(location=3) out vec4 o3;   // ice, cyan, fog, rough

float segDist(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0., 1.);
  return length(pa - ba * h);
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = vec2(fc.x / uRes.x * uWorld.x, (1. - fc.y / uRes.y) * uWorld.y);
  vec2 sp = p + uSeed * 13.7;

  // огъване на домейна — естествени, неправилни граници
  vec2 wp = vec2(fbm(sp * 0.035, 5), fbm(sp * 0.035 + 9.1, 5)) - .5;
  vec2 pw = p + wp * 24.;

  // --- суша ---
  float keepWater = 1.;
  for (int i = 0; i < NR; i++){
    vec4 s = uSeg[i];
    float d = segDist(pw, s.xy, s.zw);
    float land = uRB[i].y;
    float l = exp(-pow(d / land, 2.2));
    keepWater *= 1. - l * 0.97;
  }
  float L = 1. - keepWater;
  float coast = (fbm(sp * 0.055 + 3., 5) - .5) * 0.55 + (fbm(sp * 0.16 + 8., 5) - .5) * 0.26 + (fbm(sp * 0.5, 4) - .5) * 0.07;
  L += coast - .03 + (fbm(sp * .21 + 50., 5) - .5) * .45 * (1. - smoothstep(.8, 1., L));

  // --- тегла на биомите ---
  // меки тегла за релефа (плавни височини), остри за материалите (ясни биоми)
  float swS = 0.0001, swB = 0.0001;
  vec4 sB = vec4(0), sC = vec4(0);
  vec4 pB = vec4(0), pC = vec4(0), pD = vec4(0), pE = vec4(0), pF = vec4(0);
  for (int i = 0; i < NR; i++){
    if (uRG[i].y < .5) continue;
    vec4 s = uSeg[i];
    float d = segDist(pw, s.xy, s.zw);
    float R = uRB[i].x;
    float ws = 1. / pow(1. + pow(d / R, 2.), 2.6);
    float wb = exp(-pow(d / (R * 1.05), 3.4));
    swS += ws; swB += wb;
    sB += ws * uRB[i]; sC += ws * uRC[i];
    pC += wb * uRC[i]; pD += wb * uRD[i]; pE += wb * uRE[i]; pF += wb * uRF[i];
  }
  float bgw = 0.045;
  vec4 bgB = vec4(0., 0., 0.9, 0.18), bgC = vec4(.4, .25, 0., 0.), bgE = vec4(0., 0., 0., .3), bgF = vec4(.5, 0., 0., 0.);
  float twS = swS + bgw, twB = swB + .06;
  sB = (sB + bgw * bgB) / twS; sC = (sC + bgw * bgC) / twS;
  pC = (pC + .06 * bgC) / twB; pD = pD / twB; pE = (pE + .06 * bgE) / twB; pF = (pF + .06 * bgF) / twB;
  float hOff = sB.z, mtn = sB.w;
  float rough = sC.x, forest = pC.y, snow = pC.z, ash = pC.w;
  float lava = pD.x, crystal = pD.y, violet = pD.z, urban = pD.w;
  float salt = pE.x, ice = pE.y, cyan = pE.z, fog = pE.w;
  float moist = pF.x;

  float inland = smoothstep(.5, .95, L);
  inland = inland * inland * (3. - 2. * inland);

  // --- релеф ---
  float hills = (fbm(sp * 0.06 + 40., 6) - .45) * 1.6;
  vec2 mq = sp * 0.046 + wp * 3.2;
  float rg = ridged(mq + 2., 9);
  float er = erode(mq * 1.25 + 11., 9);
  float m = mix(er * .85, rg * 1.35, clamp(.25 + mtn * .5, 0., .85));
  float mt = mtn * 5.4 * pow(max(m, 0.), 1.7) * inland;
  float landH = (0.12 + hOff * inland * .8 + hills * (0.25 + rough * .7) * inland) + mt * .78;
  float seaH = -2.2 * (1. - smoothstep(.12, .5, L));
  float ramp = smoothstep(.5, .74, L);
  float H = seaH + ramp * landH + smoothstep(.46, .5, L) * .05;

  // --- специални форми ---
  for (int i = 0; i < NR; i++){
    if (uRG[i].y < .5) continue;
    float feat = uRF[i].y;
    if (feat < .5) continue;
    vec4 s = uSeg[i];
    vec2 c = s.xy;
    float fr = uRF[i].z, fa = uRF[i].w, fh = uRG[i].x;
    float d = length(pw - c);
    if (feat < 1.5){            // вулкан
      float k = max(0., 1. - d / fr);
      H += fa * pow(k, 1.55) * (.92 + .16 * vnoise(sp * .7));
      H -= fa * .30 * exp(-pow(d / (fr * .17), 2.));
    } else if (feat < 2.5){      // бездна
      float k = exp(-pow(d / fr, 3.));
      H = mix(H, H - fa, smoothstep(0., 1., k));
      H += .55 * exp(-pow((d - fr * 1.12) / 1.3, 2.));
    } else if (feat < 3.5){      // кратер
      float k = exp(-pow(d / fr, 2.));
      H -= fa * k * (1. - .45 * exp(-pow(d / (fr * .22), 2.)));
      H += .8 * exp(-pow((d - fr * 1.05) / 1.1, 2.));
    } else if (feat < 4.5){      // лунна цепнатина
      float dd = abs(pw.y - c.y + 2.2 * sin(pw.x * .45));
      float k = exp(-pow(dd / .75, 2.)) * smoothstep(fr, fr * .35, abs(pw.x - c.x));
      H -= fa * k;
    } else if (feat < 5.5){      // планински проход
      float dd = abs(pw.y - c.y + 2.6 * sin(pw.x * .38 + 1.));
      float k = exp(-pow(dd / 1.9, 2.)) * smoothstep(fr * 1.9, fr * .7, abs(pw.x - c.x));
      H = mix(H, 1.7 + .35 * vnoise(sp * .5), k);
    } else {                     // плато
      float k = smoothstep(fr, fr * .5, d);
      H = mix(H, fh + .04 * vnoise(sp * 1.1), k);
    }
  }

  // --- площадки под структурите ---
  float padK = 0.;
  for (int i = 0; i < 24; i++){
    if (i >= uNP) break;
    vec4 pd = uPad[i];
    float d = length(p - pd.xy);
    float k = smoothstep(pd.z * 1.7, pd.z * .85, d);
    H = mix(H, pd.w + .03 * vnoise(sp * 1.3), k);
    padK = max(padK, k);
  }

  // --- реки и езера (контурни линии на шум) ---
  float rn = fbm(sp * 0.045 + 77. + wp * 4., 5);
  float rw = (0.013 + 0.02 * (1. - inland) + 0.03 * salt + 0.012 * moist) * (1. - smoothstep(.35, .9, mtn));
  float river = (1. - smoothstep(0., rw, abs(rn - .5))) * smoothstep(.1, .5, H + .35) * step(.0, H - .02);
  river *= smoothstep(4.5, 2.2, H) * (1. - padK);
  H -= river * .32;
  // солени езера
  float pools = smoothstep(.6, .66, fbm(sp * .22 + 5., 4)) * salt * step(.05, H) * (1. - padK);
  H -= pools * .25;
  river = max(river, pools);

  // ръбът на света — винаги море
  vec2 q = p / uWorld;
  float edge = smoothstep(0., .035, min(min(q.x, 1. - q.x), min(q.y, 1. - q.y)));
  H = mix(-2.2, H, edge);

  o0 = vec4(H, river, moist, mtn);
  o1 = vec4(forest, snow, ash, lava);
  o2 = vec4(crystal, violet, urban, salt);
  o3 = vec4(ice, cyan, fog, rough);
}
