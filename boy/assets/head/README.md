# Сканирана глава — признание и промени

**Източник:** „Infinite“, 3D скан на глава от **Lee Perry-Smith** (Infinite-Realities), по работа
на [triplegangers.com](https://www.triplegangers.com). Лиценз:
[Creative Commons Attribution 3.0 Unported (CC BY 3.0)](https://creativecommons.org/licenses/by/3.0/).
Оригиналната бележка за лиценза е запазена дословно в `LeePerrySmith_License.txt`.

Файловете тук са непроменени копия от three.js r186 (`examples/models/gltf/LeePerrySmith/`):

| Файл | SHA-256 |
|------|---------|
| `LeePerrySmith.glb` | `402b8a8ac9f03232e6d64b5962929703a069daf99d3c49ac8eb0e48bedc9c576` |
| `Map-COL.jpg` | `e976d73b31407f8d0967412bf468019ed26a5d5a32cf5811aabff7e816458a65` |
| `Map-SPEC.jpg` | `cbb96b60e355b804d9b6c7338372d13ec8cc7adf664f50a00a3d32c66afd293a` |
| `Infinite-Level_02_Tangent_SmoothUV.jpg` | `36925e51ad9b324b94e8faf4692da1b4132809f2762bb8d5bd549ffd215d4ca6` |
| `LeePerrySmith_License.txt` | `7cf4da43a6ae6d32f7f7d063fe129a19468af6f4fe7c53b937f83959709fcb50` |

## Какво променя двубоят (преработката)

`bake/head.mjs` превръща скана в главите на двамата рицари при билда; файловете тук остават
непокътнати. Преработката:

- мащаб в метри и напасване към главата на скелета; вратът под яката е изрязан;
- затворените очи са отворени около отделни очни ябълки, устните — над кухината на устата;
  по ръба на клепачите са добавени мигли;
- добавени са изрази (мигане, присвиване, вежди, гримаса, челюст) и второ лице от същия скан
  (Надзирателя: по-тежки вежди, чупен нос, по-широка челюст) с белег, брада и коса, които
  рендерът „отглежда“ върху него;
- от цветовата карта са махнати червените маркери за проследяване; картите са прекодирани в WebP.

Признанието стои на финалния надпис на трите езика:
*Heads: the “Infinite” 3D head scan by Lee Perry-Smith (triplegangers.com), CC BY 3.0
(creativecommons.org/licenses/by/3.0), adapted.*
