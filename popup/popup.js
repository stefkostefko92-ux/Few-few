// Few-Few AdBlocker - popup логика

const toggle = document.getElementById("toggle");
const statusText = document.getElementById("statusText");
const blockedTotal = document.getElementById("blockedTotal");
const siteHost = document.getElementById("siteHost");
const allowToggle = document.getElementById("allowToggle");
const allowLabel = document.getElementById("allowLabel");
const pickBtn = document.getElementById("pickBtn");
const settingsBtn = document.getElementById("settingsBtn");

let currentHost = null;

// Взима активния таб и зарежда състоянието.
function loadStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabUrl = tabs[0]?.url || "";
    chrome.runtime.sendMessage({ type: "getStats", tabUrl }, (res) => {
      if (!res) return;
      toggle.checked = res.enabled;
      blockedTotal.textContent = res.blockedTotal.toLocaleString("bg-BG");
      updateStatusText(res.enabled);

      currentHost = res.host;
      if (currentHost) {
        siteHost.textContent = currentHost;
        allowToggle.checked = !res.allowed; // checked = блокира се
        updateAllowLabel(!res.allowed);
      } else {
        siteHost.textContent = "тази страница";
        allowToggle.disabled = true;
      }
    });
  });
}

function updateStatusText(enabled) {
  if (enabled) {
    statusText.textContent = "Активна — рекламите се блокират";
    statusText.classList.remove("off");
  } else {
    statusText.textContent = "Изключена — рекламите се показват";
    statusText.classList.add("off");
  }
}

function updateAllowLabel(blocking) {
  allowLabel.textContent = blocking ? "Блокиране" : "Разрешено";
}

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  updateStatusText(enabled);
  chrome.runtime.sendMessage({ type: "toggle", enabled });
});

// Per-site allow toggle: checked = блокирай тук; unchecked = добави в allowlist.
allowToggle.addEventListener("change", () => {
  if (!currentHost) return;
  const blocking = allowToggle.checked;
  updateAllowLabel(blocking);
  chrome.runtime.sendMessage(
    { type: "setAllow", host: currentHost, allow: !blocking },
    () => {
      // Презареди активния таб, за да влезе в сила.
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.reload(tabs[0].id);
      });
    }
  );
});

pickBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "startPicker" }, () => window.close());
});

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.addEventListener("DOMContentLoaded", loadStats);
