"""emblem_build.py — контурите на монограмата CS за 3D емблемата → emblem.json.

Точките са снети от логото (public/brand/cs-scene.webp, мащаб 900 px): осмоъгълното „C“, ъгловатото
„S“ (точково симетрично) и диагоналното острие. Оттук излизат и вътрешните контури: джобът за
карбоновата вложка и светещото уплътнение около нея (вътрешната циан линия на логото).
Пуска се с обикновен Python + shapely само при промяна на формата; сцената чете готовия emblem.json.
"""
import json
import os

from shapely.geometry import Polygon

PX = 9.0 / 640.0  # 640 px = 9 единици (90 mm) ширина
X0, Y0 = 470.0, 545.0  # началото: по средата, на долния ръб на „S“


def P(pts):
    return [((x - X0) * PX, (Y0 - y) * PX) for x, y in pts]


C = P([(530, 165), (245, 165), (150, 255), (150, 430), (245, 520), (430, 520), (462, 435), (285, 435),
       (238, 390), (238, 295), (285, 250), (498, 250)])
S = P([(455, 235), (790, 235), (730, 310), (515, 310), (515, 352), (750, 352), (770, 372), (770, 525),
       (750, 545), (415, 545), (475, 470), (690, 470), (690, 428), (455, 428), (435, 408), (435, 255)])
# острието: двувърх ромб по диагонала
ax, ay, bx, by = 560.0, 95.0, 375.0, 580.0
mx, my = (ax + bx) / 2, (ay + by) / 2
dx, dy = bx - ax, by - ay
ln = (dx * dx + dy * dy) ** 0.5
nx, ny = -dy / ln, dx / ln
BLADE = P([(ax, ay), (mx + nx * 13, my + ny * 13), (bx, by), (mx - nx * 13, my - ny * 13)])


def ring(poly, d):
    q = Polygon(poly).buffer(-d, join_style=2, mitre_limit=4.0)
    assert q.geom_type == "Polygon", q.geom_type
    return [list(map(float, c)) for c in list(q.exterior.coords)[:-1]]


out = {"scale": PX, "blade": BLADE}
for name, poly in (("C", C), ("S", S)):
    out[name] = {
        "outer": [list(map(float, c)) for c in poly],
        "pocket": ring(poly, 0.23),   # джобът: 2.3 mm навътре от ръба — рамката от шлайфан метал
        "inlay": ring(poly, 0.275),   # карбонът: още 0.45 mm навътре — в междината свети уплътнението
    }
xs = [c[0] for k in ("C", "S") for c in out[k]["outer"]]
zs = [c[1] for k in ("C", "S") for c in out[k]["outer"]]
out["bbox"] = [min(xs), min(zs), max(xs), max(zs)]
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "emblem.json"), "w"), indent=0)
print("bbox", [round(v, 2) for v in out["bbox"]], "| C точки", len(out["C"]["pocket"]), len(out["C"]["inlay"]), "| S точки", len(out["S"]["pocket"]), len(out["S"]["inlay"]))
