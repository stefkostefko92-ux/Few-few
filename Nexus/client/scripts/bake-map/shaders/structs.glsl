// ------------------------------------------------------------ СТРУКТУРИ (SDF комплект: готика, кули, арки, кристали)
float gP;        // част (материал)
vec3 gL;         // локални координати спрямо оста на частта
float gT;        // тип на структурата, на която принадлежи най-близката част
float gS;        // seed на структурата

void U(float d, float part, vec3 loc, inout float b){
  if (d < b){ b = d; gP = part; gL = loc; }
}
vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
float sdOct(vec2 p, float r){ p = abs(p); return max(max(p.x, p.y), (p.x + p.y) * .70711) - r; }
float sdCyl(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float sdTorusX(vec3 p, float R, float r){ vec2 q = vec2(length(p.yz) - R, p.x); return length(q) - r; }
float sdTorusZ(vec3 p, float R, float r){ vec2 q = vec2(length(p.xy) - R, p.z); return length(q) - r; }
vec2 polarRep(vec2 p, float n, out float idx){
  float a = atan(p.y, p.x);
  float sec = 6.2831853 / n;
  idx = floor(a / sec + .5);
  float ca = idx * sec;
  vec2 c = vec2(cos(ca), sin(ca));
  return vec2(c.x * p.x + c.y * p.y, -c.y * p.x + c.x * p.y);
}
float sh1(float n){ return hash12(vec2(n, 3.7)); }

// готическа кула: ствол (1), покрив (2), корниз (3), пинакли (2)
void tower(vec3 p, float r, float h, float sh, float taper, inout float b){
  // тясно ограждане: далеч от кулата не смятаме частите
  vec2 bq = vec2(length(p.xz) - r * 1.6 - .1, max(-p.y, p.y - h - sh));
  float bdist = length(max(bq, 0.)) + min(max(bq.x, bq.y), 0.);
  if (bdist > .35){ if (bdist < b){ b = bdist; gP = 1.; gL = p; } return; }
  float y = p.y;
  float rs = r * (1. - taper * clamp(y / h, 0., 1.));
  U(max(sdOct(p.xz, rs), max(-y, y - h)), 1., p, b);
  if (sh > .01){
    float ys = clamp((y - h) / sh, 0., 1.);
    float rsp = rs * 1.1 * (1. - ys * ys * .35) * (1. - ys);
    U(max(sdOct(p.xz, rsp) * .8, max(h - y - .02, y - h - sh)), 2., p, b);
    vec3 q = vec3(abs(p.x) - rs * .95, p.y - (h - .05), abs(p.z) - rs * .95);
    float pin = max(length(q.xz) - .085 * (1. - clamp(q.y / (sh * .33), 0., 1.)), max(-q.y, q.y - sh * .33));
    U(pin * .8, 2., p, b);
  }
  U(max(sdOct(p.xz, rs * 1.13), abs(y - h) - .045), 3., p, b);
}
// тяло с двускатен покрив
void hall(vec3 p, vec3 hs, float roofH, inout float b){
  U(sdBox(p - vec3(0., hs.y, 0.), hs), 1., p, b);
  vec3 q = p - vec3(0., hs.y * 2., 0.);
  float roof = max(abs(q.x) * roofH / hs.x + q.y - roofH, -q.y);
  roof = max(roof * .75, abs(q.z) - hs.z * 1.04);
  U(roof, 2., q, b);
}
// заострена арка (отвор): отрицателно вътре
float archCut(vec3 p, float w, float h){
  float rect = sdBox(p - vec3(0., h * .5, 0.), vec3(w, h * .5, 1.));
  float ogive = max(length(vec2(p.x - w, p.y - h)) - 2. * w, length(vec2(p.x + w, p.y - h)) - 2. * w);
  return min(rect, max(ogive, abs(p.z) - 1.));
}
float sdHexPrism(vec3 p, float r, float h){
  const vec3 k = vec3(-.8660254, .5, .57735);
  vec3 q = abs(p);
  q.xz -= 2. * min(dot(k.xy, q.xz), 0.) * k.xy;
  vec2 d = vec2(length(q.xz - vec2(clamp(q.x, -k.z * r, k.z * r), r)) * sign(q.z - r), q.y - h);
  return min(max(d.x, d.y), 0.) + length(max(d, 0.));
}

// ------------------------------------------------------------ типове
// 1 Вечният трон — катедрален цитадел
void structThrone(vec3 p, inout float b){
  U(sdBox(p - vec3(0., -.5, 0.), vec3(3.9, .5, 3.4)), 5., p, b);
  U(sdBox(p - vec3(0., -.05, 0.), vec3(3.3, .12, 2.9)), 5., p, b);
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    U(sdBox(p - vec3(0., .05 + fi * .09, 3.0 + .5 - fi * .13), vec3(1.0 - fi * .08, .05, .13)), 5., p, b);
  }
  tower(p - vec3(0., 0., -.2), .95, 4.6, 3.1, .22, b);
  tower(p - vec3(-1.9, 0., -.5), .62, 3.2, 2.0, .18, b);
  tower(p - vec3(1.9, 0., -.5), .62, 3.2, 2.0, .18, b);
  tower(p - vec3(-1.3, 0., -1.8), .5, 3.8, 2.3, .15, b);
  tower(p - vec3(1.3, 0., -1.8), .5, 3.8, 2.3, .15, b);
  tower(p - vec3(-1.35, 0., 2.0), .44, 2.2, 1.4, .1, b);
  tower(p - vec3(1.35, 0., 2.0), .44, 2.2, 1.4, .1, b);
  tower(p - vec3(-2.9, 0., 1.3), .36, 2.0, 1.2, .1, b);
  tower(p - vec3(2.9, 0., 1.3), .36, 2.0, 1.2, .1, b);
  tower(p - vec3(-3.0, 0., -1.5), .4, 2.6, 1.5, .1, b);
  tower(p - vec3(3.0, 0., -1.5), .4, 2.6, 1.5, .1, b);
  hall(p - vec3(0., 0., 1.35), vec3(.85, .85, 1.05), .75, b);
  float wall = sdBox(p - vec3(0., .45, 2.5), vec3(2.4, .45, .13));
  wall = max(wall, -archCut(p - vec3(0., 0., 2.5), .5, .8));
  U(wall, 1., p, b);
  U(sdBox(p - vec3(-2.4, .45, .5), vec3(.13, .45, 2.0)), 1., p, b);
  U(sdBox(p - vec3(2.4, .45, .5), vec3(.13, .45, 2.0)), 1., p, b);
  U(sdBox(p - vec3(0., 2.5, -.4), vec3(1.4, .1, .13)), 3., p, b);
  U(sdBox(p - vec3(0., 3.5, -1.0), vec3(1.0, .09, .12)), 3., p, b);
  U(sdBox(p - vec3(0., .55, 2.4), vec3(.26, .55, .05)), 4., p, b);
  for (int s = 0; s < 2; s++){
    float sg = s == 0 ? -1. : 1.;
    vec3 q = p - vec3(sg * .9, 0., 2.9);
    U(sdCapsule(q, vec3(0., .1, 0.), vec3(0., 1.0, 0.), .14), 6., q, b);
    U(length(q - vec3(0., 1.15, 0.)) - .1, 6., q, b);
  }
}
// 2 Конклав на Аедрик — град на магове
void structConclave(vec3 p, inout float b){
  U(sdCyl(p - vec3(0., -.4, 0.), 3.7, .4), 5., p, b);
  tower(p, .8, 4.2, 2.8, .2, b);
  float idx;
  vec2 q = polarRep(p.xz, 9., idx);
  float hh = 2.0 + 1.9 * sh1(idx + 4.);
  float rr = .38 + .18 * sh1(idx + 9.);
  tower(vec3(q.x - 2.3, p.y, q.y), rr, hh, 1.1 + hh * .35, .15, b);
  float ring = max(abs(length(p.xz) - 3.35) - .14, abs(p.y - .5) - .5);
  U(ring, 1., p, b);
  vec2 q2 = polarRep(p.xz, 18., idx);
  tower(vec3(q2.x - 3.35, p.y, q2.y), .2, .95, .55, .1, b);
  U(length(p - vec3(0., 7.3, 0.)) - .28, 4., p, b);
  U(sdBox(p - vec3(0., 2.2, 0.), vec3(2.3, .06, .09)), 3., p, b);
  U(sdBox(p - vec3(0., 2.8, 0.), vec3(.09, .06, 2.1)), 3., p, b);
}
// 3 Черният шпил
void structSpire(vec3 p, inout float b){
  U(sdCyl(p - vec3(0., -.2, 0.), 2.4, .2), 5., p, b);
  tower(p, .78, 6.2, 3.4, .45, b);
  tower(p - vec3(1.45, 0., .4), .38, 3.2, 1.8, .2, b);
  tower(p - vec3(-1.4, 0., .6), .4, 2.8, 1.7, .2, b);
  tower(p - vec3(.3, 0., -1.5), .36, 3.6, 1.9, .2, b);
  tower(p - vec3(-.6, 0., 1.5), .3, 2.2, 1.3, .15, b);
  float idx;
  vec2 q = polarRep(p.xz, 6., idx);
  vec3 c = vec3(q.x - .85, p.y - 6.0 - .25 * sh1(idx), q.y);
  float spike = max(length(c.xz) - .09 * (1. - clamp(c.y / (1.6 + sh1(idx + 2.)), 0., 1.)), max(-c.y, c.y - 1.8));
  U(spike * .8, 2., p, b);
  U(sdBox(p - vec3(0., 3., 0.), vec3(.9, .06, .9)), 3., p, b);
  U(sdBox(p - vec3(0., 5., 0.), vec3(.74, .05, .74)), 3., p, b);
}
// 4 Короната на нощта — пръстен от шипове
void structCrown(vec3 p, inout float b){
  U(sdCyl(p - vec3(0., -.25, 0.), 2.9, .25), 5., p, b);
  float idx;
  vec2 q = polarRep(p.xz, 7., idx);
  float hh = 2.2 + 2.2 * sh1(idx + 1.);
  vec3 c = vec3(q.x - 2.1 + p.y * .1, p.y, q.y);
  tower(c, .3 + .08 * sh1(idx), hh, 1.8 + hh * .5, .35, b);
  vec2 q2 = polarRep(rot2(p.xz, .4488), 7., idx);
  vec3 c2 = vec3(q2.x - 2.35 + p.y * .06, p.y, q2.y);
  float sp = max(length(c2.xz) - .13 * (1. - clamp(c2.y / 1.9, 0., 1.)), max(-c2.y, c2.y - 1.9));
  U(sp * .8, 2., p, b);
  U(sdCyl(p - vec3(0., .25, 0.), .8, .25), 5., p, b);
  U(length(p - vec3(0., .95, 0.)) - .34, 4., p, b);
}
// 5 Първата светлина — обелиск и светещ пръстен
void structLight(vec3 p, inout float b){
  U(sdCyl(p - vec3(0., -.15, 0.), 2.2, .15), 5., p, b);
  U(sdCyl(p - vec3(0., .02, 0.), 1.7, .06), 5., p, b);
  float ys = clamp((p.y - 4.0) / 1.0, 0., 1.);
  float ob = max(sdOct(p.xz, .36 * (1. - ys) + .02), max(-p.y, p.y - 5.0)) * .85;
  U(ob, 7., p, b);
  U(sdTorusZ(p - vec3(0., 2.4, 0.), 1.85, .07), 4., p, b);
  U(sdTorusZ(p - vec3(0., 2.4, 0.), 1.55, .03), 4., p, b);
  float idx;
  vec2 q = polarRep(p.xz, 5., idx);
  tower(vec3(q.x - 1.9, p.y, q.y), .17, 1.2 + .5 * sh1(idx), .8, .1, b);
}
// 6 Ковачницата на зората
void structForge(vec3 p, inout float b){
  U(sdBox(p - vec3(0., -.3, 0.), vec3(3.6, .3, 2.6)), 5., p, b);
  hall(p - vec3(0., 0., .3), vec3(2.0, .8, 1.1), 1.0, b);
  U(sdCyl(p - vec3(-1.4, 1.7, -1.1), .34, 1.7), 1., p - vec3(-1.4, 0., -1.1), b);
  U(sdCyl(p - vec3(0., 1.9, -1.2), .3, 1.9), 1., p - vec3(0., 0., -1.2), b);
  U(sdCyl(p - vec3(1.5, 1.4, -1.0), .3, 1.4), 1., p - vec3(1.5, 0., -1.0), b);
  U(sdBox(p - vec3(2.8, .45, 1.3), vec3(.5, .22, .28)), 6., p, b);
  U(sdBox(p - vec3(2.8, .1, 1.3), vec3(.25, .12, .2)), 6., p, b);
  U(sdBox(p - vec3(0., .02, 1.9), vec3(.18, .04, 1.5)), 4., p, b);
  tower(p - vec3(-2.9, 0., 1.0), .42, 2.4, 1.3, .1, b);
  tower(p - vec3(3.0, 0., -1.2), .38, 2.0, 1.2, .1, b);
}
// 7 Проход Хамърхенд — крепостна порта
void structGate(vec3 p, inout float b){
  tower(p - vec3(0., 0., -1.7), .62, 3.2, 1.6, .15, b);
  tower(p - vec3(0., 0., 1.7), .62, 3.2, 1.6, .15, b);
  float wall = sdBox(p - vec3(0., .95, 0.), vec3(.35, .95, 3.3));
  wall = max(wall, -archCut(vec3(p.z, p.y, p.x), .9, 1.5));
  U(wall, 1., p, b);
  U(sdBox(p - vec3(0., 2.0, 0.), vec3(.5, .07, 3.3)), 3., p, b);
  U(sdBox(p - vec3(0., .85, -3.9), vec3(.3, .85, .8)), 1., p, b);
  U(sdBox(p - vec3(0., .85, 3.9), vec3(.3, .85, .8)), 1., p, b);
  tower(p - vec3(-.5, 0., 5.0), .3, 1.4, .9, .1, b);
  tower(p - vec3(-.5, 0., -5.0), .3, 1.4, .9, .1, b);
  U(sdBox(p - vec3(-.45, 1.35, -1.05), vec3(.02, .5, .26)), 6., p, b);
  U(sdBox(p - vec3(-.45, 1.35, 1.05), vec3(.02, .5, .26)), 6., p, b);
}
// 8 Лунна люлка — кръг от камъни и лунна врата
void structMoon(vec3 p, inout float b){
  float idx;
  vec2 q = polarRep(p.xz, 8., idx);
  float hh = 1.6 + 1.0 * sh1(idx);
  vec3 c = vec3(q.x - 2.7, p.y, q.y);
  U(sdBox(c - vec3(0., hh, 0.), vec3(.26 - c.y * .04, hh, .17)), 1., c, b);
  U(sdBox(vec3(abs(p.x) - 1.0, p.y - 1.8, p.z), vec3(.28, 1.8, .26)), 1., p, b);
  U(sdBox(p - vec3(0., 3.75, 0.), vec3(1.5, .3, .3)), 3., p, b);
  U(sdCyl(p - vec3(0., -.1, 0.), 3.4, .1), 5., p, b);
  U(sdTorusZ(p - vec3(0., 3.6, 0.), .55, .035), 4., p, b);
}
// 9 Солени блата — потънали, наклонени кули
void structSunken(vec3 p, inout float b){
  vec3 a = p - vec3(-1.2, 0., .3);
  a.x += a.y * .18;
  tower(a, .5, 2.4, 0., .1, b);
  vec3 c = p - vec3(1.3, 0., -.6);
  c.x -= c.y * .12; c.z += c.y * .08;
  tower(c, .42, 1.6, 1.1, .12, b);
  vec3 d = p - vec3(.2, 0., 1.6);
  d.z += d.y * .22;
  tower(d, .32, 1.3, 0., .1, b);
  U(sdBox(p - vec3(0., .12, 0.), vec3(1.9, .12, .12)), 3., p, b);
  U(sdBox(p - vec3(.2, .25, -.1), vec3(.6, .25, .6)), 1., p, b);
}
// 10 Селце (Шепнещи гори)
void structHamlet(vec3 p, inout float b){
  hall(p - vec3(-.9, 0., 0.), vec3(.5, .4, .4), .45, b);
  hall(p - vec3(.6, 0., .5), vec3(.4, .35, .3), .4, b);
  hall(p - vec3(.2, 0., -.9), vec3(.35, .3, .45), .4, b);
  hall(p - vec3(1.5, 0., -.6), vec3(.3, .28, .28), .35, b);
  tower(p - vec3(-.4, 0., 1.2), .22, 1.3, .8, .1, b);
  U(sdBox(p - vec3(.9, .2, 1.1), vec3(.04, .2, .04)), 6., p, b);
}
// 11 Кула-стражар (Мистмур)
void structWatch(vec3 p, inout float b){
  tower(p, .55, 2.2, 0., .08, b);
  U(sdCyl(p - vec3(0., 2.3, 0.), .72, .08), 3., p, b);
  float wall = max(abs(length(p.xz - vec2(1., 0.)) - 1.9) - .1, abs(p.y - .35) - .35);
  wall = max(wall, p.x - 1.9);
  U(wall, 1., p, b);
  float idx;
  vec2 q = polarRep(p.xz, 5., idx);
  U(sdBox(vec3(q.x - 2.8, p.y - .7, q.y), vec3(.1, .7 + .2 * sh1(idx), .1)), 1., p, b);
}
// 12 Ребрата на дракон (Пепелни пустоши)
void structRibs(vec3 p, inout float b){
  U(sdCapsule(p, vec3(-3.2, .5, 0.), vec3(3.2, .45, 0.), .17), 1., p, b);
  for (int i = 0; i < 7; i++){
    float x = -2.6 + float(i) * .87;
    float sz = 1. - abs(float(i) - 3.) * .12;
    vec3 q = vec3(p.x - x, p.y, abs(p.z));
    float r = 1.7 * sz;
    float rib = abs(length(vec2(q.y - .5, q.z)) - r) - .09;
    rib = max(rib, -(q.y - .5));
    rib = max(rib, abs(q.x) - .09);
    U(rib, 1., p, b);
  }
  U(length(p - vec3(3.9, .6, 0.)) - .55, 1., p, b);
}
// 13 Разрушена катедрала (Сенчестия)
void structChapel(vec3 p, inout float b){
  float wallL = sdBox(p - vec3(-1.0, .9, 0.), vec3(.12, .9, 2.2));
  wallL = max(wallL, -sdBox(p - vec3(-1.0, 1.0, 0.), vec3(.5, .55, .3)));
  float wallR = sdBox(p - vec3(1.0, .7, 0.), vec3(.12, .7 + .35 * vnoise(p.zz * 3.), 2.2));
  U(wallL, 1., p, b);
  U(wallR, 1., p, b);
  U(sdBox(p - vec3(0., 1.3, -2.3), vec3(1.1, 1.3, .12)), 1., p, b);
  tower(p - vec3(-1.0, 0., 2.4), .5, 3.4, 0., .1, b);
  tower(p - vec3(1.0, 0., 2.5), .5, 2.0, 1.2, .15, b);
  U(sdBox(p - vec3(0., .05, 0.), vec3(1.0, .05, 2.2)), 5., p, b);
  U(sdTorusZ(p - vec3(0., 1.9, -2.3), .85, .06), 3., p, b);
}
// 14 Плаващи отломки (Войдшейд)
void structShards(vec3 p, inout float b){
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    float a = fi * 1.047 + .3;
    vec3 c = vec3(cos(a) * (2.7 + .6 * sh1(fi)), 1.3 + 1.6 * sh1(fi + 3.), sin(a) * (2.7 + .6 * sh1(fi + 5.)));
    vec3 q = p - c;
    float s = .45 + .45 * sh1(fi + 8.);
    float d = sdHexPrism(q, s * .55, s) * .8;
    d += .06 * (vnoise3(q * 3.) - .5);
    U(d, 1., q, b);
  }
  U(sdTorusX(p - vec3(0., 2.3, 0.), 1.6, .04), 4., p, b);
}
// 15 Връх-кула (Гръбнак на света)
void structPeak(vec3 p, inout float b){
  tower(p, .5, 3.4, 2.2, .35, b);
  tower(p - vec3(.9, -.4, .3), .3, 2.0, 1.2, .2, b);
  U(sdBox(p - vec3(0., 1.6, 0.), vec3(.9, .05, .12)), 3., p, b);
  U(length(p - vec3(0., 6.6, 0.)) - .12, 4., p, b);
}
// 16 Падналите звезди — кристали в кратера
void structStar(vec3 p, inout float b){
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float a = fi * 0.897;
    float rad = i == 0 ? 0. : 1.0 + 1.1 * sh1(fi);
    vec3 q = p - vec3(cos(a) * rad, 0., sin(a) * rad);
    q.x += q.y * (sh1(fi + 11.) - .5) * .8;
    q.z += q.y * (sh1(fi + 7.) - .5) * .8;
    float hgt = i == 0 ? 3.4 : 1.2 + 1.2 * sh1(fi + 2.);
    float rr = i == 0 ? .55 : .26 + .12 * sh1(fi);
    float tip = clamp((q.y - hgt * .7) / (hgt * .3), 0., 1.);
    float d = max(sdOct(q.xz, rr * (1. - tip)) * .8, max(-q.y, q.y - hgt));
    U(d, 4., q, b);
  }
}
// 17 Разрушени арки (Пепелен воал)
void structArches(vec3 p, inout float b){
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    vec3 q = p - vec3(-2.4 + fi * 1.6, 0., (fi - 1.5) * .3);
    float pil = sdBox(vec3(abs(q.x) - .6, q.y - 1.3, q.z), vec3(.14, 1.3 - .3 * sh1(fi), .16));
    U(pil, 1., q, b);
    float top = max(length(vec2(q.x, q.y - 2.2)) - .78, -(length(vec2(q.x, q.y - 2.2)) - .56));
    top = max(top, abs(q.z) - .14);
    top = max(top, -(q.y - 2.2) * (1. + 2. * step(.5, sh1(fi + 5.))));
    U(top, 3., q, b);
  }
  U(sdBox(p - vec3(0., .05, 0.), vec3(3.6, .05, .8)), 5., p, b);
}
// 18 Ледени шипове (Фроствейл)
void structIce(vec3 p, inout float b){
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float a = fi * 0.9 + .2;
    float rad = i == 0 ? 0. : .9 + 1.3 * sh1(fi);
    vec3 q = p - vec3(cos(a) * rad, 0., sin(a) * rad);
    q.x += q.y * (sh1(fi + 3.) - .5) * .5;
    float hgt = i == 0 ? 3.6 : 1.2 + 1.7 * sh1(fi + 2.);
    float rr = i == 0 ? .6 : .25 + .15 * sh1(fi);
    float d = max(sdOct(q.xz, rr * (1. - clamp(q.y / hgt, 0., 1.))) * .75, max(-q.y, q.y - hgt));
    U(d, 8., q, b);
  }
}
// 19 Кристални клъстери (Кристални пещери)
void structCrystals(vec3 p, inout float b){
  for (int i = 0; i < 9; i++){
    float fi = float(i);
    float a = fi * 0.7 + 1.;
    float rad = i == 0 ? 0. : .5 + 1.9 * sh1(fi);
    vec3 q = p - vec3(cos(a) * rad, 0., sin(a) * rad);
    q.x += q.y * (sh1(fi + 3.) - .5) * .9;
    q.z += q.y * (sh1(fi + 5.) - .5) * .9;
    float hgt = i == 0 ? 3.0 : .9 + 1.6 * sh1(fi + 2.);
    float rr = i == 0 ? .5 : .16 + .12 * sh1(fi);
    float d = max(sdOct(q.xz, rr * (1. - clamp((q.y - hgt * .75) / (hgt * .25), 0., 1.))) * .8, max(-q.y, q.y - hgt));
    U(d, 4., q, b);
  }
}
// 22 Бурният шпил (Бурни върхове)
void structStorm(vec3 p, inout float b){
  U(sdCyl(p - vec3(0., -.2, 0.), 1.7, .2), 5., p, b);
  tower(p, .55, 6.4, 3.0, .3, b);
  tower(p - vec3(1.25, 0., .4), .3, 3.6, 2.0, .2, b);
  tower(p - vec3(-1.2, 0., -.3), .32, 4.2, 2.2, .2, b);
  tower(p - vec3(.2, 0., -1.3), .26, 2.8, 1.6, .2, b);
  U(sdBox(p - vec3(.6, 2.8, .2), vec3(.7, .06, .08)), 3., p, b);
  U(length(p - vec3(0., 9.7, 0.)) - .14, 4., p, b);
}
// 21 Ембърийч — обсидианова крепост
void structEmber(vec3 p, inout float b){
  U(sdBox(p - vec3(0., -.2, 0.), vec3(3.0, .2, 2.4)), 5., p, b);
  tower(p - vec3(-1.3, 0., -.8), .55, 2.8, 1.7, .25, b);
  tower(p - vec3(1.4, 0., -.5), .5, 2.2, 1.5, .25, b);
  tower(p - vec3(0., 0., 1.0), .4, 1.6, 1.1, .2, b);
  hall(p - vec3(0., 0., -.2), vec3(.9, .7, .7), .6, b);
  U(sdBox(p - vec3(0., .02, 1.6), vec3(.2, .04, 1.2)), 4., p, b);
}

void structDist(int type, vec3 p, inout float b){
  if (type == 1) structThrone(p, b);
  else if (type == 2) structConclave(p, b);
  else if (type == 3) structSpire(p, b);
  else if (type == 4) structCrown(p, b);
  else if (type == 5) structLight(p, b);
  else if (type == 6) structForge(p, b);
  else if (type == 7) structGate(p, b);
  else if (type == 8) structMoon(p, b);
  else if (type == 9) structSunken(p, b);
  else if (type == 10) structHamlet(p, b);
  else if (type == 11) structWatch(p, b);
  else if (type == 12) structRibs(p, b);
  else if (type == 13) structChapel(p, b);
  else if (type == 14) structShards(p, b);
  else if (type == 15) structPeak(p, b);
  else if (type == 16) structStar(p, b);
  else if (type == 17) structArches(p, b);
  else if (type == 18) structIce(p, b);
  else if (type == 19) structCrystals(p, b);
  else if (type == 21) structEmber(p, b);
  else if (type == 22) structStorm(p, b);
}

float mapS(vec3 p, out float mat){
  float best = 1e9;
  float bP = 0.; vec3 bL = vec3(0.); float bT = 0., bS = 0.;
  for (int i = 0; i < 24; i++){
    if (i >= uNS) break;
    vec4 A = uStructA[i], B = uStructB[i];
    float sc = B.y;
    vec3 c = A.xyz;
    float R = B.x;
    float bd = length(p - c - vec3(0., R * .4, 0.)) - R;
    if (bd > .4){ best = min(best, bd); continue; }
    vec3 q = (p - c) / sc;
    float cs = cos(B.z), sn = sin(B.z);
    q.xz = vec2(cs * q.x + sn * q.z, -sn * q.x + cs * q.z);
    float b = 1e9;
    gP = 0.; gL = vec3(0.);
    structDist(int(A.w + .5), q, b);
    b *= sc;
    if (b < best){ best = b; bP = gP; bL = gL; bT = A.w; bS = B.w; }
  }
  gP = bP; gL = bL; gT = bT; gS = bS;
  mat = bP;
  return best;
}

// интервал на лъча, в който може да има структура (обединение на ограждащите сфери)
vec2 structSpan(vec3 ro, vec3 rd){
  float tin = 1e9, tout = -1e9;
  for (int i = 0; i < 24; i++){
    if (i >= uNS) break;
    vec4 A = uStructA[i], B = uStructB[i];
    vec3 oc = ro - A.xyz - vec3(0., B.x * .4, 0.);
    float bb = dot(oc, rd), cc = dot(oc, oc) - B.x * B.x;
    float hh = bb * bb - cc;
    if (hh > 0.){ hh = sqrt(hh); tin = min(tin, -bb - hh); tout = max(tout, -bb + hh); }
  }
  return vec2(tin, tout);
}

// ------------------------------------------------------------ материали и светлини на структурите
vec3 structNormal(vec3 p, float e){
  float m;
  vec2 k = vec2(1., -1.);
  return normalize(k.xyy * mapS(p + k.xyy * e, m) + k.yyx * mapS(p + k.yyx * e, m) + k.yxy * mapS(p + k.yxy * e, m) + k.xxx * mapS(p + k.xxx * e, m));
}

float windowPattern(vec3 l, float seed, out float lit){
  float ang = atan(l.z, l.x) * 1.27324;
  float fa = abs(fract(ang) - .5);
  float row = l.y / .52;
  float v = fract(row);
  float cell = hash12(vec2(floor(ang) + seed * 7., floor(row)));
  float slit = step(fa, .075 * (1. - smoothstep(.55, .85, v))) * step(.14, v) * step(v, .9);
  lit = step(.40, cell);
  return slit;
}

vec3 structLitColor(float type, float h){
  if (type < 1.5) return h < .72 ? vec3(.15, .85, 1.0) : vec3(1.0, .55, .18);
  if (type < 2.5) return h < .55 ? vec3(.2, .8, 1.0) : vec3(1.0, .72, .35);
  if (type < 3.5) return vec3(1.0, .3, .06);
  if (type < 4.5) return vec3(.55, .25, 1.0);
  if (type < 5.5) return vec3(1., .85, .5);
  if (type < 6.5) return vec3(1., .5, .1);
  if (type < 7.5) return vec3(1., .6, .22);
  return h < .5 ? vec3(.2, .8, 1.0) : vec3(1., .6, .25);
}

vec3 shadeStruct(vec3 ro, vec3 rd, Hit h){
  float fp = pixAng * h.t + 1e-5;
  vec3 p = h.p;
  float e = max(fp * .8, .003);
  vec3 n = structNormal(p, e);
  float dm;
  mapS(p, dm);
  float part = gP; vec3 loc = gL; float type = gT, seed = gS;
  vec3 L = uMoonDir;
  float nz = vnoise(loc.xz * 7. + loc.y * 5.);
  float nz2 = mix(.5, vnoise(vec2(loc.x + loc.z, loc.y) * 21.), lodf(21., fp));
  vec3 alb = vec3(.09, .095, .11);
  vec3 emis = vec3(0.);
  float spec = .05, rr = .5;
  if (part < 1.5){
    alb = vec3(.085, .09, .105) * (.7 + .5 * nz) * (.8 + .4 * nz2);
    float lit;
    float w = windowPattern(loc, seed, lit);
    vec3 lc = structLitColor(type, hash12(vec2(floor(atan(loc.z, loc.x) * 1.27324), floor(loc.y / .52)) + type * 3.));
    emis += lc * w * lit * 2.6;
    alb *= 1. - w * .8;
  } else if (part < 2.5){
    alb = vec3(.035, .04, .058) * (.7 + .6 * nz);
    spec = .18; rr = .28;
  } else if (part < 3.5){
    alb = vec3(.12, .12, .13) * (.8 + .4 * nz);
  } else if (part < 4.5){
    vec3 lc = structLitColor(type, .1);
    emis = lc * 3.4;
    alb = lc * .1;
  } else if (part < 5.5){
    alb = vec3(.1, .095, .1) * (.6 + .6 * nz);
    float g = max(smoothstep(.04, .0, abs(fract(loc.x * 2.) - .5) - .46), smoothstep(.04, .0, abs(fract(loc.z * 2.) - .5) - .46));
    alb *= 1. - .35 * g * step(.5, n.y);
  } else if (part < 6.5){
    alb = vec3(.025, .025, .03); spec = .12; rr = .4;
  } else if (part < 7.5){
    alb = vec3(.8, .75, .6); emis = vec3(1.0, .82, .5) * 1.6; spec = .2;
  } else {
    alb = vec3(.18, .28, .36); spec = .2; rr = .15; emis = vec3(.05, .25, .4) * .5;
  }
  float frost = smoothstep(.65, .92, n.y) * ((type == 18. || type == 8. || type == 15. || type == 1.) ? .65 : .12);
  alb = mix(alb, vec3(.55, .62, .72), frost * (.5 + .5 * nz));
  float sh = softShadow(p + n * (.01 + fp), L, fp);
  float ndl = max(dot(n, L), 0.);
  float occ = 0., sca = 1.;
  for (int i = 1; i <= 4; i++){
    float hr = .03 + .13 * float(i) + fp * 2.;
    float mm; float d = mapS(p + n * hr, mm);
    float dt = (p + n * hr).y - terrainHc((p + n * hr).xz, fp);
    occ += (hr - min(d, dt)) * sca; sca *= .7;
  }
  float ao = clamp(1. - 1.2 * occ, .1, 1.);
  mapS(p, dm);
  float skyL = .5 + .5 * n.y;
  vec3 amb = mix(uAmbGround, uAmbSky, skyL) * ao * 1.5;
  vec3 diff = uMoonCol * ndl * sh * 1.1 + amb;
  vec3 col = alb * diff;
  vec3 hv = normalize(L - rd);
  float pw = mix(20., 400., 1. - rr);
  col += uMoonCol * pow(max(dot(n, hv), 0.), pw) * spec * 4. * sh * ndl;
  col += uAmbSky * pow(1. - max(dot(n, -rd), 0.), 3.) * .35 * ao;
  col += emis;
  return col;
}

// светлинни ореоли (интеграл по лъча)
float glowPoint(vec3 ro, vec3 rd, float T, vec3 P, float rad){
  vec3 d = P - ro;
  float t0 = dot(d, rd);
  float d2 = max(dot(d, d) - t0 * t0, 0.);
  float s = sqrt(rad * rad + d2);
  return rad * rad / s * (atan((T - t0) / s) - atan(-t0 / s)) / 3.14159 * 2.;
}
vec3 addGlows(vec3 col, vec3 ro, vec3 rd, float T){
  for (int i = 0; i < 24; i++){
    if (i >= uNG) break;
    vec4 A = uGlowA[i], B = uGlowB[i];
    float sc = B.y;
    float ty = A.w;
    float cs = cos(B.z), sn = sin(B.z);
    vec3 c = A.xyz + vec3(0., B.x * .4, 0.);
    vec3 dd = c - ro;
    float t0 = dot(dd, rd);
    float perp = sqrt(max(dot(dd, dd) - t0 * t0, 0.));
    float gfade = 1. - smoothstep(B.x * 2.5, B.x * 6. + 4., perp);
    if (gfade <= 0.) continue;
    vec3 colIn = col;
    #define LP(x, y, z) (A.xyz + sc * vec3(cs * (x) - sn * (z), (y), sn * (x) + cs * (z)))
    if (ty < 1.5){
      col += vec3(.1, .8, 1.) * glowPoint(ro, rd, T, LP(0., .6, 2.35), .55 * sc) * .5;
      col += vec3(.1, .8, 1.) * glowPoint(ro, rd, T, LP(0., 5.0, -.2), 1.4 * sc) * .008;
      col += vec3(.2, .8, 1.) * glowPoint(ro, rd, T, LP(0., 8.2, -.2), .25 * sc) * .5;
    } else if (ty < 2.5){
      col += vec3(.2, .85, 1.) * glowPoint(ro, rd, T, LP(0., 7.3, 0.), .6 * sc) * .9;
      col += vec3(.2, .85, 1.) * glowPoint(ro, rd, T, LP(0., 3., 0.), 2.4 * sc) * .008;
      col += vec3(1., .55, .2) * glowPoint(ro, rd, T, LP(0., .6, 0.), 3.0 * sc) * .008;
    } else if (ty < 3.5){
      col += vec3(1., .3, .05) * glowPoint(ro, rd, T, LP(0., .8, 0.), 2.4 * sc) * .06;
      col += vec3(1., .35, .08) * glowPoint(ro, rd, T, LP(0., 7.8, 0.), .5 * sc) * .5;
    } else if (ty < 4.5){
      col += vec3(.55, .25, 1.) * glowPoint(ro, rd, T, LP(0., .95, 0.), .7 * sc) * .9;
      col += vec3(.5, .2, 1.) * glowPoint(ro, rd, T, LP(0., 2., 0.), 2.4 * sc) * .008;
    } else if (ty < 5.5){
      col += vec3(1., .85, .5) * glowPoint(ro, rd, T, LP(0., 2.4, 0.), 1.1 * sc) * .5;
      col += vec3(1., .85, .5) * glowPoint(ro, rd, T, LP(0., 5.1, 0.), .8 * sc) * .9;
      col += vec3(1., .8, .45) * glowPoint(ro, rd, T, LP(0., 3., 0.), 3.4 * sc) * .008;
    } else if (ty < 6.5){
      col += vec3(1., .5, .1) * glowPoint(ro, rd, T, LP(-1.4, 3.6, -1.1), .7 * sc) * .9;
      col += vec3(1., .5, .1) * glowPoint(ro, rd, T, LP(0., 3.9, -1.2), .7 * sc) * .9;
      col += vec3(1., .5, .1) * glowPoint(ro, rd, T, LP(1.5, 2.9, -1.0), .6 * sc) * .8;
      col += vec3(1., .55, .15) * glowPoint(ro, rd, T, LP(0., .5, 1.9), 1.6 * sc) * .05;
    } else if (ty < 7.5){
      col += vec3(1., .6, .2) * glowPoint(ro, rd, T, LP(-.4, 1.2, -1.2), .25 * sc) * .9;
      col += vec3(1., .6, .2) * glowPoint(ro, rd, T, LP(-.4, 1.2, 1.2), .25 * sc) * .9;
      col += vec3(1., .6, .2) * glowPoint(ro, rd, T, LP(0., 1., 0.), 1.4 * sc) * .008;
    } else if (ty < 8.5){
      vec3 base = A.xyz;
      for (int k = 0; k < 8; k++){
        float fk = float(k);
        col += vec3(.55, .75, 1.) * glowPoint(ro, rd, T, base + vec3(0., (1.2 + fk * 1.6) * sc, 0.), (.7 + fk * .12) * sc) * .06;
      }
      col += vec3(.7, .85, 1.) * glowPoint(ro, rd, T, LP(0., 3.6, 0.), .5 * sc) * .5;
    } else if (ty > 9.5 && ty < 10.5){
      col += vec3(1., .6, .2) * glowPoint(ro, rd, T, LP(.9, .5, 1.1), .35 * sc) * .6;
      col += vec3(1., .6, .2) * glowPoint(ro, rd, T, LP(-.9, .5, .45), .22 * sc) * .5;
      col += vec3(1., .6, .2) * glowPoint(ro, rd, T, LP(.6, .4, .8), .2 * sc) * .5;
    } else if (ty > 13.5 && ty < 14.5){
      col += vec3(.5, .25, 1.) * glowPoint(ro, rd, T, LP(0., 2.3, 0.), 2.0 * sc) * .06;
    } else if (ty > 14.5 && ty < 15.5){
      col += vec3(.2, .8, 1.) * glowPoint(ro, rd, T, LP(0., 6.6, 0.), .35 * sc) * .9;
    } else if (ty > 15.5 && ty < 16.5){
      col += vec3(.3, .5, 1.) * glowPoint(ro, rd, T, LP(0., 2., 0.), 1.8 * sc) * .08;
      col += vec3(.5, .7, 1.) * glowPoint(ro, rd, T, LP(0., 3.4, 0.), .6 * sc) * .5;
    } else if (ty > 18.5 && ty < 19.5){
      col += vec3(.1, .7, 1.) * glowPoint(ro, rd, T, LP(0., 1.5, 0.), 2.2 * sc) * .06;
    } else if (ty > 21.5){
      col += vec3(.2, .8, 1.) * glowPoint(ro, rd, T, LP(0., 9.7, 0.), .45 * sc) * .9;
    } else if (ty > 20.5){
      col += vec3(1., .4, .08) * glowPoint(ro, rd, T, LP(0., .5, 1.6), 1.4 * sc) * .06;
    }
    col = mix(colIn, col, gfade);
    #undef LP
  }
  return col;
}
