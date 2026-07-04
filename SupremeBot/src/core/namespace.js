/**
 * Root namespace for the content-script side of Tanoth Master Bot.
 *
 * Content scripts declared in the manifest run in the same isolated world and
 * share the page-isolated `window`. Rather than ES modules (which the manifest
 * content_scripts array does not support without a bundler) we hang every
 * subsystem off a single global object that each subsequent file extends.
 */
(function () {
  'use strict';
  const TB = (window.TanothBot = window.TanothBot || {});
  TB.VERSION = '1.13.0';
  TB.modules = TB.modules || {};   // registered automation modules, keyed by id
  TB.ready = TB.ready || false;
})();
