"""Fotos REAIS da oficina -> WebP em assets/img/oficina/.

Uso:  python ferramentas/fotos-oficina.py <pasta-com-as-fotos-originais>

As originais vieram do site antigo (Ueni) e são pequenas (até 960 px). Por
isso NÃO se amplia nada: a largura final é a menor entre a original e 960. Foto
esticada fica borrada, e borrado numa oficina de PRECISÃO é o recado errado.

Um leve ajuste de nitidez e contraste compensa a compressão do celular que
tirou a foto — sem filtro, sem mudar cor: é documento da oficina.
"""
import os
import sys
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(RAIZ, "assets", "img", "oficina")

# original -> nome no site (a numeração é a ordem do site antigo)
MAPA = {
    "cliente-03.jpg": "mesa-de-corte",
    "cliente-05.jpg": "enfesto-rolo",
    "cliente-10.jpg": "maquina-papel",
    "cliente-15.jpg": "corte-malha",
    "cliente-19.jpg": "risco-encaixe",
    "cliente-21.jpg": "pecas-cortadas",
    "cliente-22.jpg": "maquina-estampa",
    "cliente-14.jpg": "samuel-fachada",
    "cliente-04.jpg": "fachada-placa",
}

os.makedirs(DEST, exist_ok=True)
origem = sys.argv[1]
for arq, nome in MAPA.items():
    im = ImageOps.exif_transpose(Image.open(os.path.join(origem, arq))).convert("RGB")
    if im.width > 960:
        im = im.resize((960, round(im.height * 960 / im.width)), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    im = ImageEnhance.Contrast(im).enhance(1.04)
    saida = os.path.join(DEST, nome + ".webp")
    im.save(saida, "WEBP", quality=80, method=6)
    print(f"  ok {nome}.webp {im.width}x{im.height} {os.path.getsize(saida)//1024} KB")
