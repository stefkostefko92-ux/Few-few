// Вътрешни маркери, които НЕ бива да попадат в публичен профил на агент.
// Ползва се от генератора (филтър) и от проверката в гейта (fail-closed).

const PRODUCT_DIRS = [
  'zabobovdol',
  'medqr',
  'SupremeDiscordBot',
  'treydar',
  'Minyor',
  'Nexus',
  'scuolabulgara',
  'panev',
  'kebab',
  'CSPos',
  'vizitka',
  'mastilko',
  'linketto',
  'eternaltouch',
  'evanitasport',
  'adblock',
  'SupremeBot',
  'ospedalitrasparenti',
  'mascot',
  'vpsdash',
  'piuma',
  'agentgw',
  'Ivan',
  'Gaming',
  'agents-dashboard',
  'Few-few',
];

export const INTERNAL_MARKERS = [
  // файлови пътища и разширения
  {
    name: 'път с разширение',
    re: /[\w.-]+\/[\w./-]*\.(?:m?js|cjs|tsx?|json|md|sh|ya?ml|env|prisma|sql|conf|toml)\b/i,
  },
  {
    name: 'вътрешна папка',
    re: /(?:^|[\s`'"(])(?:\.claude|\.github|_memory|_shared|_evals|tools|deploy|src|scripts|docs|prisma|node_modules)\//i,
  },
  { name: 'файл на репото', re: /\b(?:CLAUDE|SECURITY|PROCEDURE|PROTOCOL|README|DEPLOY)\.md\b/ },
  { name: 'скрипт', re: /\.(?:mjs|cjs|sh)\b/ },
  { name: 'alias @/', re: /@\// },
  { name: 'памет', re: /_memory|```learn|\blearn блок|(?<!\p{L})поук[аи](?!\p{L})/iu },
  // инструменти и харнес
  {
    name: 'инструмент',
    re: /\b(?:Bash|Grep|Glob|WebFetch|WebSearch|NotebookEdit|TodoWrite|Read|Write|Edit)\b/,
  },
  {
    name: 'харнес',
    re: /\b(?:subagent|sub-agent|hooks?|maxTurns|frontmatter|MCP|Claude Code|headless|worktree|oversee|HANDOFF)\b/i,
  },
  { name: 'предаване', re: /ПРЕДАВАНЕ|оркестрат|делегир/i },
  {
    name: 'вътрешно решение',
    re: /собственик|нашите продукти|наш(?:ия|ите)? (?:продукт|екип|сървър)|(?<!\p{L})умение(?:то)?(?!\p{L})|\bskills?\b|motion-a11y|frontend-design/iu,
  },
  // инфраструктура
  {
    name: 'инфраструктура',
    re: /\b(?:VPS|systemd|systemctl|nginx|Hetzner|ssh|Docker|docker-compose|Caddy|autodeploy|journald|cron)\b/i,
  },
  { name: 'IP адрес', re: /\b\d{1,3}(?:\.\d{1,3}){3}\b/ },
  { name: 'localhost', re: /\blocalhost\b/i },
  { name: 'поддомейн', re: /\b[a-z0-9-]+\.carbonstealth\.eu\b/i },
  { name: 'продуктова папка', re: new RegExp(`\\b(?:${PRODUCT_DIRS.join('|')})\\b`) },
  // тайни (грубо — истинският скенер е secret-scan.mjs)
  { name: 'тайна', re: /\b(?:sk-ant-|AIza[0-9A-Za-z_-]{10}|ghp_|cs_sk_|xox[bp]-|-----BEGIN)/ },
  {
    name: 'променлива на средата',
    re: /\b[A-Z][A-Z0-9]*_(?:API_KEY|TOKEN|SECRET|PEPPER|PASSWORD)\b/,
  },
];

/** Списък от имената на маркерите, които се срещат в текста (празен = чисто). */
export function findMarkers(text) {
  return INTERNAL_MARKERS.filter((m) => m.re.test(text)).map((m) => m.name);
}
