precision highp float;
precision highp int;
precision highp sampler2D;

#define PI 3.14159265359

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash13(vec3 p3){
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

// value noise + analytic derivatives (iq)
vec3 noised(vec2 x){
  vec2 i = floor(x), f = fract(x);
  vec2 u = f*f*f*(f*(f*6.-15.)+10.);
  vec2 du = 30.*f*f*(f*(f-2.)+1.);
  float a = hash12(i), b = hash12(i+vec2(1,0)), c = hash12(i+vec2(0,1)), d = hash12(i+vec2(1,1));
  float k = a - b - c + d;
  return vec3(a + (b-a)*u.x + (c-a)*u.y + k*u.x*u.y,
              du * (vec2(b-a, c-a) + k*u.yx));
}
float vnoise(vec2 x){ return noised(x).x; }

float vnoise3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f*f*(3.-2.*f);
  float n000 = hash13(i), n100 = hash13(i+vec3(1,0,0)), n010 = hash13(i+vec3(0,1,0)), n110 = hash13(i+vec3(1,1,0));
  float n001 = hash13(i+vec3(0,0,1)), n101 = hash13(i+vec3(1,0,1)), n011 = hash13(i+vec3(0,1,1)), n111 = hash13(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y), mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}

const mat2 M2 = mat2(0.8, -0.6, 0.6, 0.8);

float fbm(vec2 p, int oct){
  float a = 0., b = .5;
  for (int i = 0; i < 12; i++){
    if (i >= oct) break;
    a += b * vnoise(p);
    p = M2 * p * 2.02 + 17.1;
    b *= .5;
  }
  return a / (1. - pow(.5, float(oct)));   // ~0..1
}

// "elevated" ерозионен fbm (iq): стръмните склонове губят дребен детайл
float erode(vec2 p, int oct){
  float a = 0., b = 1.;
  vec2 d = vec2(0.);
  for (int i = 0; i < 14; i++){
    if (i >= oct) break;
    vec3 n = noised(p);
    d += n.yz;
    a += b * n.x / (1. + dot(d, d));
    b *= .5;
    p = M2 * p * 2.;
  }
  return a;
}

// ridged fbm — остри била
float ridged(vec2 p, int oct){
  float a = 0., b = .5, w = 1.;
  for (int i = 0; i < 12; i++){
    if (i >= oct) break;
    float n = 1. - abs(vnoise(p) * 2. - 1.);
    n *= n;
    n *= w; w = clamp(n * 2., 0., 1.);
    a += b * n;
    p = M2 * p * 2.07 + 3.7;
    b *= .5;
  }
  return a;
}
