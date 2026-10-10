uniform sampler2D tM0, tM1, tM2, tM3;
uniform vec2 uRes, uWorld;
out vec4 fragColor;
float H(vec2 uv){ return texture(tM0, uv).x; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 a = texture(tM0, uv), b = texture(tM1, uv), c = texture(tM2, uv), d = texture(tM3, uv);
  vec2 e = vec2(1.5 / uRes.x, 0.);
  vec3 n = normalize(vec3(-(H(uv + e.xy) - H(uv - e.xy)) * 6., 1.2, -(H(uv + e.yx*uRes.x/uRes.y) - H(uv - e.yx*uRes.x/uRes.y)) * 6.));
  float sh = clamp(dot(n, normalize(vec3(-.5, .7, -.5))), 0., 1.);
  vec3 col = vec3(.2, .3, .25);
  col = mix(col, vec3(.1, .35, .1), b.x);
  col = mix(col, vec3(.9), clamp(b.y * a.x / 4., 0., 1.));
  col = mix(col, vec3(.4), b.z);
  col = mix(col, vec3(1., .3, 0.), b.w);
  col = mix(col, vec3(.2, .8, 1.), c.x);
  col = mix(col, vec3(.5, .1, .8), c.y);
  col = mix(col, vec3(.7, .7, .8), c.z);
  col = mix(col, vec3(.9, .9, .8), c.w);
  col = mix(col, vec3(.7,.9,1.), d.x);
  col *= (.35 + sh);
  if (a.x <= 0.) col = mix(vec3(0., .05, .15), vec3(0., .2, .35), clamp(1. + a.x / 2.2, 0., 1.)) * (.6+.5*sh);
  if (a.y > .3) col = mix(col, vec3(.1, .4, 1.), a.y);
  fragColor = vec4(pow(col, vec3(.8)), 1.);
}
