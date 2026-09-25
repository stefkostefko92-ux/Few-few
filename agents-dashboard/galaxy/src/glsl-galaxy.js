// glsl-galaxy.js — звезден фон с диафракционни лъчи тип JWST за най-ярките звезди. (Решение на
// собственика, решаващ кръг: структурираната спираловидна мъглявина/bulge/HII опит СЕ ВЪРНА към
// изпитаната наситена мъглявина в shaders.js — виж бележката там; PSF/диафракционните лъчи тук
// останаха, изрично одобрени като подобрение.) Изисква GLSL_NOISE (hash/blackbody) в контекста.
export const GLSL_GALAXY = `
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
vec3 starLayer(vec2 uv, float seed, float cells, float twT, float brightThresh){
  vec2 guv = uv*cells; vec2 id = floor(guv); vec2 gv = fract(guv)-0.5; vec3 col = vec3(0.0);
  for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++) {
    vec2 off = vec2(float(x),float(y)); vec2 cid = id+off; vec2 h = hash22(cid+seed);
    float present = step(0.865, h.x);
    vec2 jitter = (h-0.5)*0.86; vec2 d = gv - off - jitter;
    float bMag = pow(hash21(cid+seed+7.7), 3.2);
    float size = mix(0.018, 0.075, bMag);
    float glow = pow(size/(length(d)+0.0018), 1.55) * present;
    float tw = twT > -0.5 ? (0.78 + 0.22*sin(twT*6.0 + h.x*44.0)) : 1.0;
    vec3 starCol = blackbody(hash21(cid+seed+3.3));
    col += starCol * glow * bMag * tw;
    float spikeAmt = smoothstep(brightThresh, 1.0, bMag) * present;
    if (spikeAmt > 0.0) col += starCol * spikeGlow(d, size) * spikeAmt * 0.6 * tw;
  }
  return col;
}
`;
