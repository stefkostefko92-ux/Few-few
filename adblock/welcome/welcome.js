// Страницата „Добре дошли“ — отваря се веднъж, само при първа инсталация (background.js).
// Нищо не пита, нищо не праща: два бутона — затвори раздела или отвори настройките.
document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("done").addEventListener("click", () => {
  chrome.tabs.getCurrent((tab) => {
    if (tab && tab.id !== undefined) chrome.tabs.remove(tab.id);
    else window.close();
  });
});
