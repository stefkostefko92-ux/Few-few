import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

// Remove the instant-paint hero once React has painted the real one.
var __boot = document.getElementById('cs-boot');
if (__boot) __boot.style.display = 'none';   // hide synchronously, same frame as mount
requestAnimationFrame(function () {
  if (__boot && __boot.parentNode) __boot.parentNode.removeChild(__boot);
});

// PWA: register the service worker (offline + fast repeat visits)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
