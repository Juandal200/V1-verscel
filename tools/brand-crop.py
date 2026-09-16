#!/usr/bin/env python3
"""Comprueba que el recorte del emblema cae en el hueco del logotipo.

    python3 tools/brand-crop.py

La pantalla de carga muestra el PNG de marca RECORTADO: el emblema si, la
palabra "aero comms" no, porque esa se escribe en la fuente de la app. El
recorte se hace con una ventana de N px sobre una imagen de M px, asi que corta
por el N/M de la altura -- un numero que tiene que caer en la franja de pixeles
transparentes que separa el emblema de la palabra.

Si no cae ahi, el corte parte un halo o media letra, y no da ningun error: sale
una raya tenue o un trozo de tipografia que nadie mira dos veces. De ahi que esto
sea un script y no un comentario. Falla con codigo 1 cuando el corte se sale.

Se vuelve a correr cuando cambie el logotipo o cambien las dos alturas del CSS.
Sin dependencias: decodifica el PNG con zlib, que esta en la biblioteca estandar.
"""
import os, re, struct, sys, zlib

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def png_alfa(ruta):
    """Devuelve (ancho, alto, alfa) con alfa[y][x], decodificando a mano."""
    d = open(ruta, 'rb').read()
    pos, idat, ihdr = 8, b'', None
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos+4])[0]
        typ = d[pos+4:pos+8]
        if typ == b'IHDR': ihdr = struct.unpack('>IIBBBBB', d[pos+8:pos+8+ln])
        elif typ == b'IDAT': idat += d[pos+8:pos+8+ln]
        pos += 12 + ln
    w, h, prof, tipo, _, _, entrelazado = ihdr
    if (prof, tipo, entrelazado) != (8, 6, 0):
        sys.exit('PNG inesperado (profundidad %d, tipo %d, entrelazado %d): '
                 'este script solo sabe leer RGBA de 8 bits sin entrelazar'
                 % (prof, tipo, entrelazado))
    raw = zlib.decompress(idat)
    bpp, stride = 4, w * 4
    prev, filas, i = bytearray(stride), [], 0
    for _y in range(h):
        f = raw[i]; i += 1
        ln = bytearray(raw[i:i+stride]); i += stride
        for x in range(stride):
            a = ln[x-bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x-bpp] if x >= bpp else 0
            if   f == 1: ln[x] = (ln[x] + a) & 255
            elif f == 2: ln[x] = (ln[x] + b) & 255
            elif f == 3: ln[x] = (ln[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                ln[x] = (ln[x] + pr) & 255
        filas.append([ln[x*4+3] for x in range(w)])
        prev = ln
    return w, h, filas

def leer(ruta, patron, que):
    m = re.search(patron, open(os.path.join(RAIZ, ruta), encoding='utf-8').read())
    if not m: sys.exit('no encuentro %s en %s' % (que, ruta))
    return m.group(1)

logo = leer('ConfigService.js', r"var BRAND_LOGO_FILE_\s*=\s*'([^']+)'", 'el nombre del logotipo')
css  = open(os.path.join(RAIZ, 'LoadingScreen.html'), encoding='utf-8').read()
ventana = float(re.search(r'\.aero-ls-emblema\s*\{[^}]*height:\s*([\d.]+)px', css, re.S).group(1))
imagen  = float(re.search(r'\.aero-ls-emblema img\s*\{[^}]*height:\s*([\d.]+)px', css, re.S).group(1))

w, h, alfa = png_alfa(os.path.join(RAIZ, logo.lstrip('/')))
tinta = [max(f) for f in alfa]

# La franja vacia mas larga por debajo de la mitad: ahi separa emblema de palabra.
mejor, y = (0, None), h // 2
while y < h:
    if tinta[y] == 0:
        s = y
        while y < h and tinta[y] == 0: y += 1
        if y - s > mejor[0]: mejor = (y - s, (s, y))
    else:
        y += 1

print('%s  %dx%d' % (logo, w, h))
if mejor[1] is None:
    sys.exit('FALLA- no hay ninguna franja transparente en la mitad inferior. '
             'Ese logotipo no se puede recortar a ciegas; hay que mirarlo.')
s, e = mejor[1]
corte = 100.0 * ventana / imagen
print('franja transparente: filas %d-%d  (%.1f%% - %.1f%% de la altura)'
      % (s, e - 1, 100.0*s/h, 100.0*(e-1)/h))
print('corte del CSS: %g/%g = %.1f%%' % (ventana, imagen, corte))
if 100.0*s/h <= corte <= 100.0*(e-1)/h:
    print('DENTRO de la franja- el recorte no parte nada.')
    sys.exit(0)
print('FUERA de la franja- el recorte parte el halo o la palabra.')
print('  ajusta .aero-ls-emblema height / .aero-ls-emblema img height para que '
      'su cociente caiga entre %.1f%% y %.1f%%' % (100.0*s/h, 100.0*(e-1)/h))
sys.exit(1)
