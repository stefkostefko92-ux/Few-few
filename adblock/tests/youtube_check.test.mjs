// tools/youtube_check.mjs — решението за един клип от пробите (по една на секунда). Живата част
// (истински YouTube) се пуска от домашна връзка; тук е само логиката.
import { ok, done } from "./_harness.mjs";
import { verdict } from "../tools/youtube_check.mjs";

const play = (n, from = 0, extra = {}) => Array.from({ length: n }, (_, i) => ({ t: from + i, w: 1280, ad: false, enforce: false, ...extra }));

ok("a clip that plays for 25 s with a picture and no ad → ok", verdict(play(25)).ok === true);
ok("one sample in an ad (ad-showing) → fail", verdict(play(25).map((x, i) => (i === 7 ? { ...x, ad: true } : x))).ok === false);
ok("the ad-blocker dialog shown → fail, and it says so",
  ((v) => !v.ok && /прозореца/.test(v.why))(verdict(play(25).map((x, i) => (i === 3 ? { ...x, enforce: true } : x)))));
ok("stuck: currentTime does not move → fail", verdict(play(25).map((x) => ({ ...x, t: 0 }))).ok === false);
ok("0x0 the whole time → fail", verdict(play(25).map((x) => ({ ...x, w: 0 }))).ok === false);
ok("no player (nulls) → fail", verdict(Array(25).fill(null)).ok === false && verdict(undefined).ok === false);
ok("starts late but then plays (first samples null) → ok", verdict([null, null, null, ...play(22, 0)]).ok === true);

done();
