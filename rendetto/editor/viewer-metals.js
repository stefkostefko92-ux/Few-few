// Hardware finishes from the catalogue words („хром“, „мат хром“, „инокс“, „злато антик“, „черен мат“…) to
// physical metal: reflectance of the real metal (chromium ~55 %, aluminium ~92 %, gold, copper), roughness of the
// finish, and a brushing direction for satin and brushed ones (along the handle). Powder coats are not metal.
const LOOKS = [
  [/дърв|wood|орех|бук/, { key: 'wood', wood: true }],
  [
    /бял|white|бяла/,
    {
      key: 'white',
      params: {
        color: 0xf1f0eb,
        metalness: 0,
        roughness: 0.32,
        clearcoat: 0.4,
        clearcoatRoughness: 0.25,
      },
    },
  ],
  [
    /черн|black|графит|graphite|антрацит|anthracite|титан|titan/,
    {
      key: 'black',
      params: {
        color: 0x1c1c1e,
        metalness: 0.35,
        roughness: 0.42,
        clearcoat: 0.15,
        clearcoatRoughness: 0.4,
      },
    },
  ],
  [
    /(антик|антич|antique|стар|old|патин).*(злат|gold|месинг|brass)|(злат|gold|месинг|brass).*(антик|антич|antique|стар|old)/,
    { key: 'brass-antique', params: { color: 0x9a7642, metalness: 1, roughness: 0.42 } },
  ],
  [
    /(мат|matt|сатен|satin|четк|brushed).*(злат|gold|месинг|brass)|(злат|gold|месинг|brass).*(мат|matt|сатен|satin|четк|brushed)/,
    {
      key: 'brass-satin',
      params: { color: 0xe2c27e, metalness: 1, roughness: 0.34, anisotropy: 0.55 },
    },
  ],
  [
    /злат|gold|месинг|brass|шампан|champagne/,
    { key: 'gold', params: { color: 0xf0cf86, metalness: 1, roughness: 0.16 } },
  ],
  [
    /(антик|антич|antique|стар|old).*(мед|copper)|(мед|copper).*(антик|антич|antique|стар)/,
    { key: 'copper-antique', params: { color: 0x7a4a2e, metalness: 1, roughness: 0.45 } },
  ],
  [/мед|copper/, { key: 'copper', params: { color: 0xf3c3aa, metalness: 1, roughness: 0.22 } }],
  [/бронз|bronze/, { key: 'bronze', params: { color: 0x8c6a45, metalness: 1, roughness: 0.4 } }],
  [
    /инокс|inox|неръж|stainless|стомана|steel/,
    { key: 'inox', params: { color: 0xd2d0cc, metalness: 1, roughness: 0.3, anisotropy: 0.7 } },
  ],
  [
    /алумин|alumin/,
    { key: 'alu', params: { color: 0xe8eaeb, metalness: 1, roughness: 0.36, anisotropy: 0.5 } },
  ],
  [
    /мат хром|хром мат|сатен|satin|никел|nickel|матов/,
    {
      key: 'chrome-satin',
      params: { color: 0xcfd1d3, metalness: 1, roughness: 0.28, anisotropy: 0.5 },
    },
  ],
  [
    /хром|chrome|гланц/,
    { key: 'chrome', params: { color: 0xc8c9c9, metalness: 1, roughness: 0.05 } },
  ],
  [
    /сив|grey|gray|сребр|silver/,
    { key: 'grey', params: { color: 0x9ea1a4, metalness: 1, roughness: 0.34 } },
  ],
];
const DEFAULT = {
  key: 'steel',
  params: { color: 0xcbcdcf, metalness: 1, roughness: 0.3, anisotropy: 0.4 },
};

export function metalLook(finish = '', color = '') {
  const text = `${finish} ${color}`.toLowerCase();
  const hit = LOOKS.find(([re]) => re.test(text));
  const look = hit ? hit[1] : DEFAULT;
  if (look.wood) return look;
  // brushing runs along the bar: handles are lathe/cylinder meshes whose v follows the length
  const params = { ...look.params };
  if (params.anisotropy) params.anisotropyRotation = Math.PI / 2;
  return { key: look.key, params };
}
