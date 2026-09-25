"""Corta tiras webtoon (muy altas) en segmentos por filas con poco contenido.

El inpainting LaMa se ejecuta a 1024px: en una tira de 15000px el texto
quedaria microscopico y el redibujado seria pobre. Cortar por filas casi
en blanco permite procesar cada segmento a escala legible.
"""
from PIL import Image


def _row_ink(img: Image.Image, y0: int, y1: int) -> float:
    """Densidad de tinta de un bloque de filas (0 = fila blanca)."""
    band = img.crop((0, y0, img.width, y1)).convert('L')
    hist = band.histogram()
    dark = sum(hist[:200])
    total = band.width * band.height
    return dark / total if total else 1.0


def slice_heights(img: Image.Image, max_h: int = 2600):
    """Devuelve lista de tuplas (y0, y1) que cubren la imagen completa.

    Corta cerca de cada multiplo de max_h buscando la ventana de filas
    (de 160px) con menor tinta, para no partir texto ni burbujas.
    """
    total = img.height
    if total <= max_h:
        return [(0, total)]

    cuts = [0]
    y = max_h
    while y < total - max_h // 2:
        window = 160
        scan_start = max(cuts[-1] + 600, y - window)
        best_y, best_ink = None, None
        for cand in range(scan_start, min(y + window, total - 200), 20):
            ink = _row_ink(img, cand, cand + 20)
            if best_ink is None or ink < best_ink:
                best_y, best_ink = cand, ink
        cuts.append(best_y if best_y is not None else y)
        y = cuts[-1] + max_h
    cuts.append(total)

    segments = []
    for i in range(len(cuts) - 1):
        y0, y1 = cuts[i], cuts[i + 1]
        if y1 - y0 < 200 and segments:
            # demasiado corto: fusionar con el anterior
            segments[-1] = (segments[-1][0], y1)
        else:
            segments.append((y0, y1))
    return segments
