// backend/src/lib/redactUrl.js
// Адресът на заявката, какъвто влиза в access лога (morgan), без тайните в
// query частта. Callback-ът на Discord носи `code` (обменя се за токени) и
// `state`, а архивните транскрипти — `t` (единственият ключ към лични данни
// в транскрипта). Дневникът не бива да е място, откъдето те се четат.

const SECRET_PARAMS = /([?&](?:code|state|t)=)[^&#]*/gi;

export function redactSecretParams(url) {
  return typeof url === "string" ? url.replace(SECRET_PARAMS, "$1[redacted]") : url;
}
