// Adds "Check with scamnasium" to the right-click menu for selected text and links.
// The text is handed to the app in the URL (?check=…); the app removes it from the address bar on load.
// No network requests are made by the extension itself.

const DEFAULT_APP_URL = 'http://localhost:5173/';
const MAX_CHARS = 20000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({id: 'scamnasium-check', title: 'Check with scamnasium', contexts: ['selection', 'link']});
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'scamnasium-check') return;
  const text = [info.selectionText, info.linkUrl].filter(Boolean).join('\n').slice(0, MAX_CHARS);
  if (!text.trim()) return;
  const {appUrl} = await chrome.storage.sync.get({appUrl: DEFAULT_APP_URL});
  const url = new URL(appUrl);
  url.searchParams.set('check', text);
  url.hash = 'customer';
  await chrome.tabs.create({url: url.toString()});
});
