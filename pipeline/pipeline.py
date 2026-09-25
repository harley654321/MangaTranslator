"""Pipeline Paso 1: deteccion + OCR + inpainting. NO traduce (la key nunca pasa por aqui).

Entrada:  pages/   (imagenes originales del capitulo)
Salida:   out/     (clean_XXX.png + data.json con regiones de texto)
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

from PIL import Image

from manga_translator import Config, MangaTranslator

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
try:
    from pipeline.slicer import slice_heights
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from slicer import slice_heights

IMG_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.bmp'}


def natural_key(path: Path):
    digits = ''.join(ch if ch.isdigit() else ' ' for ch in path.stem)
    return [int(tok) if tok else 0 for tok in digits.split()]


def build_config() -> Config:
    return Config(**{
        'detector': {'detector': 'ctd', 'detection_size': 1024},
        'ocr': {'ocr': '48px'},
        'inpainter': {
            'inpainter': 'lama_large',
            'inpainting_size': 1024,
            'inpainting_precision': 'fp32',
        },
        'translator': {'translator': 'none', 'target_lang': 'SPA'},
        'render': {'renderer': 'none'},
    })


def serialize_region(region, y_offset: int) -> dict:
    """TextBlock -> JSON plano para la extension."""
    x1, y1, x2, y2 = [int(v) for v in region.xyxy]
    polygon = None
    try:
        polygon = [[float(x), float(y + y_offset)] for x, y in region.unrotated_min_rect()]
    except Exception:
        pass
    fg, bg = [255, 255, 255], [0, 0, 0]
    try:
        fg, bg = region.get_font_colors()
        fg, bg = [int(c) for c in fg], [int(c) for c in bg]
    except Exception:
        pass
    return {
        'bbox': [x1, y1 + y_offset, x2, y2 + y_offset],
        'polygon': polygon,
        'text': region.text or '',
        'font_size': int(getattr(region, 'font_size', 0) or 0),
        'vertical': bool(region.vertical),
        'fg': list(fg),
        'bg': list(bg),
    }


async def translate_page(translator: MangaTranslator, config: Config, img: Image.Image) -> list:
    """Traduce (deteccion/ocr/inpaint) una imagen y devuelve regiones."""
    ctx = await translator.translate(img, config)
    result = ctx.result if ctx.result is not None else img
    regions = [serialize_region(r, 0) for r in (ctx.text_regions or [])]
    return [result, regions]


async def process_segmented(translator, config, img: Image.Image, seg_dir: Path, page_idx: int):
    """Webtoons: corta tiras largas en segmentos por filas en blanco y vuelve a unirlas."""
    segments = []
    total_h = img.height
    for seg_i, (y0, y1) in enumerate(slice_heights(img, max_h=2600)):
        seg = img.crop((0, y0, img.width, y1))
        try:
            result, regions = await translate_page(translator, config, seg)
        except Exception as exc:
            print(f'[page {page_idx}] segmento {seg_i} fallo: {exc}; se conserva original', flush=True)
            result, regions = seg, []
        segments.append((y0, y1, result, regions))
        print(f'[page {page_idx}] segmento {seg_i}: y={y0}-{y1}, regiones={len(regions)}', flush=True)

    full = Image.new('RGB', (img.width, total_h), (255, 255, 255))
    all_regions = []
    for y0, y1, result, regions in segments:
        full.paste(result, (0, y0))
        for r in regions:
            r['bbox'][1] += y0
            r['bbox'][3] += y0
            if r.get('polygon'):
                r['polygon'] = [[x, y + y0] for x, y in r['polygon']]
            all_regions.append(r)
    return full, all_regions


async def main(input_dir: Path, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(
        [p for p in input_dir.iterdir() if p.suffix.lower() in IMG_EXT],
        key=natural_key,
    )
    if not files:
        print(f'No hay imagenes en {input_dir}', file=sys.stderr)
        sys.exit(1)
    print(f'Procesando {len(files)} paginas', flush=True)

    translator = MangaTranslator(params=dict(
        device='cpu', verbose=False, ignore_errors=True, models_ttl=3600,
        kernel_size=3,
    ))
    config = build_config()
    seg_dir = output_dir / '_segments'
    pages_json = []

    for idx, path in enumerate(files, start=1):
        print(f'== Pagina {idx}/{len(files)}: {path.name} ==', flush=True)
        try:
            img = Image.open(path).convert('RGB')
        except Exception as exc:
            print(f'No se pudo abrir {path}: {exc}', flush=True)
            continue
        try:
            if img.height > 3000:
                result, regions = await process_segmented(translator, config, img, seg_dir, idx)
            else:
                result, regions = await translate_page(translator, config, img)
        except Exception as exc:
            print(f'Pagina {idx} fallo por completo: {exc}; se conserva original', flush=True)
            result, regions = img, []

        out_name = f'clean_{idx:03d}.png'
        result.save(output_dir / out_name)
        pages_json.append({
            'file': out_name,
            'width': result.width,
            'height': result.height,
            'regions': regions,
        })
        print(f'Pagina {idx} lista: {len(regions)} regiones', flush=True)

    with open(output_dir / 'data.json', 'w', encoding='utf-8') as f:
        json.dump({'schema': 1, 'pages': pages_json}, f, ensure_ascii=False)
    print('data.json escrito. Pipeline terminado.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Deteccion + OCR + inpainting de un capitulo')
    parser.add_argument('--input', required=True, help='Directorio con paginas originales')
    parser.add_argument('--output', required=True, help='Directorio de salida')
    args = parser.parse_args()
    asyncio.run(main(Path(args.input), Path(args.output)))
