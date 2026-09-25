// glsl-noise.js — базова GLSL noise/fbm/blackbody библиотека за галактическия шейдър.
// hash() е БЕЗ тригонометрия нарочно (собственикова бележка, кръг 4 от разследването на таблото):
// класическият sin(dot(p,...))*43758.5453 губи прецизност при по-големи аргументи — p расте през
// fbm октавите ×2.02 всеки път + мащаб по времето — и sin() на някои GPU/ANGLE/SwiftShader
// имплементации банди вместо да остане псевдослучаен → цели решетъчни клетки излизат с еднакъв тон
// (видимите бледи „плочки" във фона). Тази fract/dot верига е стабилна за произволно големи входове.
export const GLSL_NOISE = `
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
vec2 hash22(vec2 p){ return vec2(hash21(p), hash21(p+19.19)); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1)); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float fbm(vec2 p, int oct){ float v=0.,a=.5; for(int i=0;i<8;i++){ if(i>=oct) break; v+=a*noise(p); p=p*2.02+vec2(1.7,9.2); a*=.52; } return v; }
float ridge(vec2 p, int oct){ float v=0.,a=.5; for(int i=0;i<8;i++){ if(i>=oct) break; float n=1.0-abs(noise(p)*2.0-1.0); v+=a*n*n; p=p*2.05+vec2(3.1,-2.7); a*=.5; } return v; }
// Планк-приближение (blackbody): t=0 топло жарава (~3000K), t=0.5 бяло-жълто (~5800K, Слънцето),
// t=1 сини-бели (~12000K+, О/B звезди) — не произволен градиент, следва реалната цветова
// последователност на звезден спектър, каквато се вижда и в HDR снимки на Хъбъл/JWST.
vec3 blackbody(float t){
  vec3 warm=vec3(1.0,0.55,0.22), mid=vec3(1.0,0.93,0.82), hot=vec3(0.66,0.76,1.0);
  vec3 c = mix(warm, mid, smoothstep(0.0,0.5,t));
  return mix(c, hot, smoothstep(0.5,1.0,t));
}
`;
