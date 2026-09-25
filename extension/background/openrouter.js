// Traduccion con CUALQUIER endpoint compatible con la API de OpenAI
// (OpenRouter, OpenAI, Groq, DeepSeek, Together, servidor local, etc.).
// La API key nunca sale de este service worker.
function apiBase(settings) {
  return (settings.apiUrl || '').replace(/\/+$/, '');
}

function systemPrompt(settings) {
  const lang = settings.targetLang || 'Espanol';
  return 'Eres un traductor profesional de comics (manga, manhwa, manhua). ' +
    'Recibes un JSON con un array de objetos {"id": <numero>, "text": "<texto de una burbuja>"}, ' +
    'en orden de lectura del comic. Devuelve EXCLUSIVAMENTE un objeto JSON valido ' +
    `donde cada clave es el id y cada valor la traduccion al idioma ${lang}. ` +
    'Reglas: conserva el tono y la personalidad del personaje, adapta onomatopeyas, ' +
    'no traduzcas nombres propios, no anadas notas ni comentarios, solo el JSON.';
}

function chunkArray(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseTranslations(content, items) {
  let text = String(content || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('El modelo no devolvio JSON');
  const map = JSON.parse(text.slice(start, end + 1));
  const out = new Array(items.length).fill(null);
  for (const item of items) {
    const val = map[item.id] !== undefined ? map[item.id] : map[String(item.id)];
    if (typeof val === 'string') out[items.indexOf(item)] = val;
  }
  return out;
}

async function callModel(settings, items) {
  if (!settings.apiKey || !settings.model) {
    throw new Error('Configura API key y modelo en el popup de la extension');
  }
  const res = await fetch(apiBase(settings) + '/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + settings.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt(settings) },
        { role: 'user', content: JSON.stringify(items) },
      ],
    }),
  });
  if (!res.ok) {
    let detail = res.status + ' ' + res.statusText;
    try { const body = await res.json(); if (body.error && body.error.message) detail = body.error.message; } catch (e) {}
    throw new Error('Modelo de traduccion: ' + detail);
  }
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content : '';
  return parseTranslations(content, items);
}

async function translatePageTexts(texts) {
  const settings = await getSettings();
  const items = texts.map((t, i) => ({ id: i, text: t }));
  const out = new Array(texts.length).fill(null);

  for (const group of chunkArray(items, 40)) {
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      try {
        const results = await callModel(settings, group);
        group.forEach((item, idx) => { out[item.id] = results[idx]; });
        done = true;
      } catch (e) {
        if (attempt === 2) console.warn('MT: bloque de traduccion fallo:', e.message);
        else await sleep(1500 * (attempt + 1));
      }
    }
  }
  // Si una burbuja no se pudo traducir, se muestra el texto original (mejor que un hueco).
  return { ok: true, translations: out.map((t, i) => (t === null ? texts[i] : t)) };
}
