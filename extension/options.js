const input = document.getElementById('app');
const saved = document.getElementById('saved');
chrome.storage.sync.get({appUrl: 'http://localhost:5173/'}, ({appUrl}) => { input.value = appUrl; });
document.getElementById('save').addEventListener('click', () => {
  let url;
  try { url = new URL(input.value.trim()); } catch { saved.textContent = 'Enter a full address, e.g. http://localhost:5173/'; return; }
  if (!/^https?:$/.test(url.protocol)) { saved.textContent = 'Use an http(s) address.'; return; }
  chrome.storage.sync.set({appUrl: url.toString()}, () => { saved.textContent = 'Saved.'; });
});
