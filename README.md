# Manga Translator

Traduce un capitulo COMPLETO de manga/manhwa/manhua con redibujado real, desde tu
navegador Android con extensiones (Quetta, Kiwi, Lemur). Un boton, sin scroll,
sin elegir carpetas.

**Que hace:**
1. La extension extrae las URLs de TODAS las paginas del capitulo (interceptando
   la API del lector y el lazy-load, sin que hagas scroll).
2. Las sube a una rama temporal de este repo (GitHub API, nada de file.io).
3. GitHub Actions ejecuta la IA 100% local: deteccion de burbujas (comic-text-detector),
   OCR multilingue (japones vertical, ingles, ruso, coreano, chino) e inpainting
   con LaMa Large (redibujado REAL, no rectangulo blanco).
4. La extension baja el resultado, traduce los textos con TU modelo de IA
   (cualquier API compatible con OpenAI) y abre un lector nuevo traducido.

**Seguridad:**
- Tu API key de traduccion y tu PAT viven SOLO en el almacenamiento local de la
  extension en tu telefono. Nunca se suben a este repo ni a Actions.
- Actions no traduce nada: solo detecta, limpia y OCR. La key no pasa por ahi.
- La rama con las paginas y el artefacto se borran solos (el workflow borra la
  rama; el artefacto expira en 1 dia y la extension lo borra al terminar).

## Requisitos

- Repo PUBLICO (Actions con minutos ilimitados).
- Cuenta de GitHub.
- Navegador Android con soporte de extensiones (Quetta / Kiwi).

## Configuracion

### 1. Crear el PAT

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained**:
- Repository access: solo este repo.
- Permissions: **Contents: Read and write**, **Actions: Read and write**,
  **Metadata: Read** (obligatorio, auto).

(O funciona un PAT clasico con scope `repo` + `workflow`.)

### 2. Cargar la extension

Quetta/Kiwi → menu → Extensiones → activa el modo desarrollador → "Cargar
descomprimida" (Load unpacked) → selecciona la carpeta `extension/`.

### 3. Configurar el popup

Toca el icono de la extension:
- **PAT**: el token del paso 1.
- **Owner / Repo**: tu usuario y este repo.
- **API de traduccion**: cualquier endpoint compatible con OpenAI
  (`https://openrouter.ai/api/v1`, `https://api.openai.com/v1`,
  `https://api.groq.com/openai/v1`, DeepSeek, un servidor local...).
- **Modelo**: el que quieras en esa API.
- **API key**: tu clave. Solo se guarda en el telefono.
- Toca **Probar** (verifica PAT + repo) y **Guardar**.

### 4. Usar

Abre un capitulo en cualquier lector web → toca el boton flotante **"ES"**
abajo a la derecha (o el boton grande del popup) → espera con la barra de
progreso → se abre el lector traducido. El capitulo queda cacheado en el
telefono: al volver a abrir la misma URL se abre al instante.

## Tiempos reales

- Primera ejecucion en Actions: ~15-20 min (instala modelos, luego los cachea).
- Siguientes capitulos: ~1-3 min por cada 10 paginas aprox (CPU gratis de Actions).
- El progreso paso a paso se ve en el panel flotante.

## Estructura

```
extension/   extension MV3 (popup, content scripts, service worker)
pipeline/    pipeline Python que corre en Actions (usa manga-image-translator)
.github/     workflow translate.yml
```

Motor: [manga-image-translator](https://github.com/zyddnys/manga-image-translator)
(GPL-3). El pipeline de este repo lo invoca con `--translator none` para
producir paginas limpias + data.json de regiones; la traduccion se hace en el
telefono con tu modelo.

## Limitaciones conocidas

- Si un lector carga las imagenes por streams raros sin JSON ni `img` visible,
  la extraccion puede fallar (el panel te avisa cuantas paginas detecto).
- Texto dentro de cuadros de arte complejos: el OCR puede equivocarse igual
  que cualquier scanlation automatica.

## Demo con capítulo real

`results/awr-chapter-1/` contiene el resultado de procesar el **capítulo 1 de
"The Academy's Weapon Replicator"** (manhwa long-strip, 14 tiras de ~14.000px,
186 burbujas) con este flujo en GitHub Actions:

- `preview.html` — visor antes/después con slider y tabla de diálogos EN → ES
- `pages/original/` — páginas tal como se descargaron del lector
- `pages/clean/` — texto borrado e inpainting (detección ctd + OCR 48px + LaMa)
- `pages/overlay/` — clean + traducción al español remaquetada (igual que la extensión)
- `pages.json` — regiones, cajas, colores y fuentes detectadas por el OCR

Tiempo total del run: **19m30s** (gratis, CPU de Actions, modelos cacheados).
