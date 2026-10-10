// ПОСТ: bloom композиция + ACES + цветови грейд + виньета + хроматична аберация + зърно
uniform sampler2D tHdr, tBloom;
uniform vec2 uRes;
uniform float uExposure, uBloom, uGrain, uVig, uCA, uSat, uContrast;
uniform vec3 uShadowTint, uHighTint;
uniform float uSeed;
out vec4 fragColor;

vec3 aces(vec3 x){
  const float a = 2.51, b = .03, c = 2.43, d = .59, e = .14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0., 1.);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 c = uv - .5;
  float r2 = dot(c, c);
  vec2 off = c * r2 * uCA;
  vec3 hdr = vec3(texture(tHdr, uv + off).r, texture(tHdr, uv).g, texture(tHdr, uv - off).b);
  vec3 bl = vec3(texture(tBloom, uv + off).r, texture(tBloom, uv).g, texture(tBloom, uv - off).b);
  vec3 col = hdr + bl * uBloom;
  col *= uExposure;
  // тъмни зони — студен тон, светли — леко топли
  float l = dot(col, vec3(.2126, .7152, .0722));
  col *= mix(uShadowTint, uHighTint, smoothstep(.02, .6, l));
  col = aces(col);
  // контраст и наситеност в sRGB-подобно пространство
  col = pow(col, vec3(1. / 2.2));
  col = mix(vec3(.5), col, uContrast);
  col = clamp((col - .035) / .965, 0., 1.);
  float g = dot(col, vec3(.299, .587, .114));
  col = mix(vec3(g), col, uSat);
  col *= 1. - uVig * smoothstep(.15, .62, r2 * 1.6);
  // зърно + дитъринг
  float n = (hash12(gl_FragCoord.xy + uSeed) - .5) * 1.0;
  col += n * uGrain * (.4 + .6 * (1. - g));
  fragColor = vec4(clamp(col, 0., 1.), 1.);
}
