// Device fingerprint, read only with consent: on the sign-up form only when its separate consent
// box is ticked; the sign-in form carries data-fingerprint only in a browser of consenting
// accounts. Written into the hidden "fp" field on submit; the server keeps a hash of the hardware
// part ("HWID") and a summary.
(function () {
  'use strict';

  function gpu() {
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return {};
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return {};
      return {
        gpuVendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '').slice(0, 120),
        gpu: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '').slice(0, 200),
      };
    } catch (error) {
      return {};
    }
  }

  function collect() {
    var n = navigator;
    var values = {
      platform: String((n.userAgentData && n.userAgentData.platform) || n.platform || '').slice(
        0,
        40,
      ),
      cores: typeof n.hardwareConcurrency === 'number' ? n.hardwareConcurrency : undefined,
      memory: typeof n.deviceMemory === 'number' ? n.deviceMemory : undefined,
      screen: screen.width + 'x' + screen.height,
      depth: screen.colorDepth,
      touch: typeof n.maxTouchPoints === 'number' ? n.maxTouchPoints : 0,
      tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 64),
    };
    var g = gpu();
    if (g.gpu) values.gpu = g.gpu;
    if (g.gpuVendor) values.gpuVendor = g.gpuVendor;
    var out = {};
    Object.keys(values).forEach(function (key) {
      var value = values[key];
      if (value !== undefined && value !== '' && !(typeof value === 'number' && !isFinite(value)))
        out[key] = value;
    });
    return JSON.stringify(out);
  }

  var forms = document.querySelectorAll('form[data-fingerprint]');
  Array.prototype.forEach.call(forms, function (form) {
    form.addEventListener('submit', function () {
      var field = form.querySelector('input[name="fp"]');
      if (!field) return;
      var consent = form.querySelector('input[name="deviceConsent"]');
      field.value = consent && !consent.checked ? '' : collect();
    });
  });
})();
