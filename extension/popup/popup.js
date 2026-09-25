const FIELDS = ['pat', 'owner', 'repo', 'apiUrl', 'model', 'apiKey', 'targetLang'];
const $ = (id) => document.getElementById(id);

function setStatus(text, cls) {
  const el = $('status');
  el.textContent = text;
  el.className = cls || '';
}

function readForm() {
  const data = {};
  for (const f of FIELDS) data[f] = $(f).value.trim();
  return data;
}

async function loadSettings() {
  const res = await chrome.runtime.sendMessage({ type: 'MT_GET_SETTINGS' });
  if (res && res.ok) {
    for (const f of FIELDS) $(f).value = res.settings[f] || '';
  }
}

async function save() {
  const settings = readForm();
  const res = await chrome.runtime.sendMessage({ type: 'MT_SAVE_SETTINGS', settings });
  setStatus(res && res.ok ? 'Guardado.' : 'No se pudo guardar.', res && res.ok ? 'ok' : 'err');
}

async function test() {
  setStatus('Probando...');
  const settings = readForm();
  const res = await chrome.runtime.sendMessage({ type: 'MT_TEST_CONNECTION', settings });
  if (res && res.ok) setStatus(res.message, 'ok');
  else setStatus(res && res.error ? res.error : 'Fallo la prueba.', 'err');
}

async function translateCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || !tabs.length || !tabs[0].id) return setStatus('No hay pestana activa.', 'err');
  setStatus('Mira el panel de progreso en la pagina.');
  try {
    await chrome.tabs.sendMessage(tabs[0].id, { type: 'MT_START' });
    window.close();
  } catch (e) {
    setStatus('Abre un capitulo de manga en esta pestana primero.', 'err');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('saveBtn').addEventListener('click', save);
  $('testBtn').addEventListener('click', test);
  $('translateBtn').addEventListener('click', translateCurrentTab);
  loadSettings();
});
