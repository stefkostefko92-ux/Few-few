// Few-Few AdBlocker - YouTube ad remover (MAIN world)
// Изпълнява се в page контекста на document_start и премахва рекламните данни
// от отговорите на YouTube player API-то, преди плейърът да ги обработи.
// Това спира pre-roll / mid-roll рекламите при източника, вместо просто да ги скрива.

(function () {
  "use strict";

  // Изчиства всички известни рекламни полета от обект на player отговор.
  function stripAds(obj) {
    if (!obj || typeof obj !== "object") return obj;

    // Преки рекламни контейнери.
    if ("adPlacements" in obj) obj.adPlacements = [];
    if ("playerAds" in obj) obj.playerAds = [];
    if ("adSlots" in obj) obj.adSlots = [];
    if ("adBreakHeartbeatParams" in obj) delete obj.adBreakHeartbeatParams;
    if (obj.playerConfig && obj.playerConfig.adConfig) {
      delete obj.playerConfig.adConfig;
    }
    if (obj.playerConfig && obj.playerConfig.daiConfig) {
      delete obj.playerConfig.daiConfig;
    }

    // Вложен playerResponse (среща се в /next и навигационни отговори).
    if (obj.playerResponse) stripAds(obj.playerResponse);
    if (obj.player && obj.player.playerResponse) stripAds(obj.player.playerResponse);

    return obj;
  }

  // Проверява дали обект изглежда като player отговор с реклами.
  function looksLikePlayer(obj) {
    return (
      obj &&
      typeof obj === "object" &&
      ("adPlacements" in obj ||
        "playerAds" in obj ||
        "adSlots" in obj ||
        "streamingData" in obj ||
        "playerResponse" in obj)
    );
  }

  // ---- 1. Прихващане на JSON.parse (хваща ytInitialPlayerResponse и др.) ----
  const origParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const data = origParse.call(this, text, reviver);
    try {
      if (looksLikePlayer(data)) stripAds(data);
    } catch (e) {}
    return data;
  };

  // ---- 2. Прихващане на fetch (хваща /youtubei/v1/player и /next) ----
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url =
      (typeof input === "string" && input) ||
      (input && input.url) ||
      "";

    const response = await origFetch.apply(this, arguments);

    try {
      if (
        url.includes("/youtubei/v1/player") ||
        url.includes("/youtubei/v1/next") ||
        url.includes("/youtubei/v1/reel")
      ) {
        const text = await response.clone().text();
        let json;
        try {
          json = origParse(text);
        } catch {
          return response;
        }
        stripAds(json);
        return new Response(JSON.stringify(json), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
    } catch (e) {}

    return response;
  };

  // ---- 3. Прихващане на XMLHttpRequest (legacy player заявки) ----
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._ffUrl = url || "";
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const url = this._ffUrl || "";
    if (
      url.includes("/youtubei/v1/player") ||
      url.includes("/youtubei/v1/next")
    ) {
      this.addEventListener("readystatechange", function () {
        if (this.readyState === 4) {
          try {
            let json = origParse(this.responseText);
            stripAds(json);
            const cleaned = JSON.stringify(json);
            // Презаписваме responseText/response с изчистената версия.
            Object.defineProperty(this, "responseText", { value: cleaned });
            Object.defineProperty(this, "response", { value: cleaned });
          } catch (e) {}
        }
      });
    }
    return origSend.apply(this, arguments);
  };
})();
