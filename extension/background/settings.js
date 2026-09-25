// Config del usuario. La API key y el PAT viven SOLO aqui (storage.local del telefono).
const DEFAULT_SETTINGS = {
  pat: '',
  owner: '',
  repo: '',
  apiUrl: 'https://openrouter.ai/api/v1',
  model: 'meta-llama/llama-3.3-70b-instruct:free',
  apiKey: '',
  targetLang: 'Espanol neutro latinoamericano',
};

async function getSettings() {
  const stored = await chrome.storage.local.get('settings');
  return Object.assign({}, DEFAULT_SETTINGS, stored.settings || {});
}

async function saveSettings(settings) {
  const clean = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (settings[key] !== undefined) clean[key] = settings[key];
  }
  await chrome.storage.local.set({ settings: clean });
}
