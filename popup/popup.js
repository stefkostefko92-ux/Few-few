// Few-Few AdBlocker - popup логика

const toggle = document.getElementById("toggle");
const statusText = document.getElementById("statusText");
const blockedTotal = document.getElementById("blockedTotal");

// Зарежда текущото състояние при отваряне.
function loadStats() {
  chrome.runtime.sendMessage({ type: "getStats" }, (res) => {
    if (!res) return;
    toggle.checked = res.enabled;
    blockedTotal.textContent = res.blockedTotal.toLocaleString("bg-BG");
    updateStatusText(res.enabled);
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

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  updateStatusText(enabled);
  chrome.runtime.sendMessage({ type: "toggle", enabled });
});

document.addEventListener("DOMContentLoaded", loadStats);
