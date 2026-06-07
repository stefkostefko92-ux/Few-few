// Few-Few AdBlocker - popup логика

const toggle = document.getElementById("toggle");
const statusText = document.getElementById("statusText");
const blockedTotal = document.getElementById("blockedTotal");
const savedData = document.getElementById("savedData");
const savedTime = document.getElementById("savedTime");
const siteHost = document.getElementById("siteHost");
const allowToggle = document.getElementById("allowToggle");
const allowLabel = document.getElementById("allowLabel");
const pickBtn = document.getElementById("pickBtn");
const settingsBtn = document.getElementById("settingsBtn");
const listDot = document.getElementById("listDot");

let currentHost = null;

function fmtData(mb) {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  if (mb >= 1) return Math.round(mb) + " MB";
  return Math.round(mb * 1024) + " KB";
}

function fmtTime(sec) {
  if (sec >= 3600) return (sec / 3600).toFixed(1) + " ч";
  if (sec >= 60) return Math.round(sec / 60) + " мин";
  return Math.round(sec) + " сек";
}

function loadStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabUrl = tabs[0]?.url || "";
    chrome.runtime.sendMessage({ type: "getStats", tabUrl }, (res) => {
      if (!res) return;
      toggle.checked = res.enabled;
      blockedTotal.textContent = res.blockedTotal.toLocaleString("bg-BG");
      savedData.textContent = fmtData(res.saved.mb);
      savedTime.textContent = fmtTime(res.saved.seconds);
      updateStatusText(res.enabled);

      if (res.listInfo && res.listInfo.count) {
        listDot.textContent = res.listInfo.count.toLocaleString("bg-BG") + " филтъра";
      } else {
        listDot.textContent = "вградени филтри";
      }

      currentHost = res.host;
      if (currentHost) {
        siteHost.textContent = currentHost;
        allowToggle.checked = !res.allowed;
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

allowToggle.addEventListener("change", () => {
  if (!currentHost) return;
  const blocking = allowToggle.checked;
  updateAllowLabel(blocking);
  chrome.runtime.sendMessage(
    { type: "setAllow", host: currentHost, allow: !blocking },
    () => {
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
