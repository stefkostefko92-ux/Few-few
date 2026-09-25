// glsl-galaxy.js — звезден фон с диафракционни лъчи тип JWST за най-ярките звезди. (Решение на
// собственика, решаващ кръг: структурираната спираловидна мъглявина/bulge/HII опит СЕ ВЪРНА към
// изпитаната наситена мъглявина в shaders.js — виж бележката там; PSF/диафракционните лъчи тук
// останаха, изрично одобрени като подобрение.) Изисква GLSL_NOISE (hash/blackbody) в контекста.
//
// РЕШАВАЩ КРЪГ (собственика, 2026-09-25 — „вдигни качеството на детайлите на самите звезди"):
// PSF-ът мина от единична степенна крива (една „пухкава" сфера) на Moffat профил ядро+ореол
// (реален телескопски point-spread function модел — виж Moffat 1969/Trujillo 2001), диафракционните
// лъчи получиха фина хроматична дисперсия САМО на върховете на най-ярките звезди (физически: синьото
// се разсейва повече от червеното при дифракция от апертура), а скинтилацията стана по-фина
// (по-малка амплитуда) — вече е и по-бавна de facto, защото e функция на споделеното `t` (виж
// GALAXY_TIME_SCALE в index.html). Всичко е resolution-independent (изчислено per-pixel в
// фрагмент-шейдъра) → остро на всеки DPR, никога размазано/пикселизирано при zoom.
export const GLSL_GALAXY = `
// Moffat PSF: I(r) = (1 + (r/alpha)^2)^-beta — по-физически вярна форма на звезда от гладко power-law
// или Gaussian: тесен, стръмен пик (ядро) + дълги, бавно затихващи крила (ореол), точно както реална
// оптика/атмосферно размазване разпределя енергия. Комбинираме тясно ядро (голямо beta, малко alpha)
// с широк ореол (малко beta, голямо alpha) — двукомпонентен PSF, стандартна техника в photometry.
float moffat(float r, float alpha, float beta){
  return pow(1.0 + (r*r)/(alpha*alpha), -beta);
}
// Диафракционни лъчи тип JWST (6 хексагонални + 2 вертикални — сборът "6+2" от собственика):
// апроксимация без отделен pass — тесен ексpоненциален гребен покрай няколко фиксирани оси,
// приложен САМО на горния процентил ярки звезди (bMag>threshold), физически смисъл: дифракция
// от сегментираното огледало/паяка на телескопа расте рязко само при висок контраст извор/фон.
float spikeGlow(vec2 d, float size){
  float s = 0.0;
  float angs[4]; angs[0]=0.0; angs[1]=1.0471975512; angs[2]=2.0943951024; angs[3]=1.5707963268;
  for (int i=0;i<4;i++){
    vec2 ax = vec2(cos(angs[i]), sin(angs[i]));
    float along = dot(d, ax);
    float perp = length(d - ax*along);
    float len = size*16.0;
    s += exp(-perp*110.0) * exp(-abs(along)/max(len,0.001));
  }
  return s;
}
// Хроматично разцепена версия — само за спайковете на най-ярките звезди (собственикова заявка):
// синьото разсейва малко по-надалеч от червеното (size*1.045 vs *0.965), давайки фин цветен ръб
// само към връховете на лъчите; ядрото (близо до d=0) остава практически бяло във всички канали.
vec3 spikeGlowRGB(vec2 d, float size){
  return vec3(spikeGlow(d, size*0.965), spikeGlow(d, size), spikeGlow(d, size*1.045));
}
vec3 starLayer(vec2 uv, float seed, float cells, float twT, float brightThresh){
  vec2 guv = uv*cells; vec2 id = floor(guv); vec2 gv = fract(guv)-0.5; vec3 col = vec3(0.0);
  for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++) {
    vec2 off = vec2(float(x),float(y)); vec2 cid = id+off; vec2 h = hash22(cid+seed);
    float present = step(0.865, h.x);
    vec2 jitter = (h-0.5)*0.86; vec2 d = gv - off - jitter;
    float bMag = pow(hash21(cid+seed+7.7), 3.2);
    float size = mix(0.018, 0.075, bMag);
    float r = length(d);
    float core = moffat(r, size*0.5, 4.5);
    float halo = moffat(r, size*2.4, 1.5) * 0.45;
    float glow = (core + halo) * present;
    // фина скинтилация: малка амплитуда (реалистично трептене, не мигане); честотата се влачи от
    // споделеното време (GALAXY_TIME_SCALE в index.html го забавя накуп с всичко останало).
    float tw = twT > -0.5 ? (0.88 + 0.12*sin(twT*6.0 + h.x*44.0)) : 1.0;
    vec3 starCol = blackbody(hash21(cid+seed+3.3));
    col += starCol * glow * bMag * tw;
    float spikeAmt = smoothstep(brightThresh, 1.0, bMag) * present;
    if (spikeAmt > 0.0) {
      float chromAmt = smoothstep(0.97, 1.0, bMag); // хроматичен ръб само за горния ~3% ярки
      vec3 sc = mix(vec3(spikeGlow(d, size)), spikeGlowRGB(d, size), chromAmt);
      col += starCol * sc * spikeAmt * 0.6 * tw;
    }
  }
  return col;
}
`;
