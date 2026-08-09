// backend/src/lib/kbMatch.js
// v32 — Knowledge Base suggestion matching. Pure functions (no I/O) so the
// scoring logic is unit-testable without a DB — see routes/bot_v18.js for the
// GET /bot/kb/:serverId/suggest endpoint that calls findBestMatch.
//
// Naive match: one point per article keyword that appears as a substring of
// the (lowercased) query text. Highest score wins; ties keep the first (i.e.
// earliest-listed) article. A score of 0 means "no suggestion" — we'd rather
// stay silent than suggest something irrelevant.

/** Score a single article against a lowercased query string. */
export function scoreArticle(article, queryLower) {
  if (!queryLower || !Array.isArray(article?.keywords) || !article.keywords.length) return 0;
  let score = 0;
  for (const kw of article.keywords) {
    const needle = String(kw || "").trim().toLowerCase();
    if (needle && queryLower.includes(needle)) score++;
  }
  return score;
}

/**
 * Pick the single best-matching ENABLED article for a query, or null if
 * nothing scores at least 1 point. `articles` is the server's KB article
 * list (already scoped to serverId by the caller).
 */
export function findBestMatch(articles, query) {
  if (!query || !Array.isArray(articles) || !articles.length) return null;
  const queryLower = String(query).toLowerCase();

  let best = null;
  let bestScore = 0;
  for (const article of articles) {
    if (article?.enabled === false) continue;
    const score = scoreArticle(article, queryLower);
    if (score > bestScore) {
      bestScore = score;
      best = article;
    }
  }
  return bestScore >= 1 ? best : null;
}
