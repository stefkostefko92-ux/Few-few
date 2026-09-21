/**
 * Предпубликационен линт на пост. Не публикува, само съди.
 * Огледало на `tools/social/post-lint.mjs`, но с правилата на Instagram.
 */

export type LintSeverity = 'HIGH' | 'MEDIUM' | 'INFO';

export interface LintFinding {
  severity: LintSeverity;
  rule: string;
  message: string;
}

export interface LintablePost {
  kind: 'IMAGE' | 'REELS';
  caption: string;
  hashtags: string[];
  altText: string;
  mediaUrl: string;
  coverUrl?: string | null;
}

/** Твърдият лимит на Instagram за caption. */
export const CAPTION_MAX = 2200;
/** Твърдият лимит на Instagram за хаштагове в един пост. */
export const HASHTAG_MAX = 30;
/** Над това хаштаговете спират да помагат — social SEO бие хаштаг спама. */
export const HASHTAG_RECOMMENDED = 10;

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ['ig-token', /\bIG[A-Za-z0-9]{20,}\b/],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{10,}/],
  ['stripe-key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/],
  ['bearer', /\bBearer\s+[A-Za-z0-9._-]{20,}/i],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const URL_PATTERN = /https?:\/\/[^\s)]+/g;

export function lintPost(post: LintablePost): LintFinding[] {
  const findings: LintFinding[] = [];
  const caption = post.caption.trim();

  if (caption.length === 0) {
    findings.push({ severity: 'HIGH', rule: 'caption-empty', message: 'Празен caption.' });
  }
  if (caption.length > CAPTION_MAX) {
    findings.push({
      severity: 'HIGH',
      rule: 'caption-too-long',
      message: `Caption е ${caption.length} знака при лимит ${CAPTION_MAX}.`,
    });
  }

  for (const [rule, pattern] of SECRET_PATTERNS) {
    if (pattern.test(caption)) {
      findings.push({
        severity: 'HIGH',
        rule: `secret-${rule}`,
        message: 'Caption съдържа нещо, което прилича на тайна/ключ.',
      });
    }
  }

  if (!post.mediaUrl.startsWith('https://')) {
    findings.push({
      severity: 'HIGH',
      rule: 'media-not-https',
      message: 'Instagram тегли медията сам — URL-ът трябва да е публичен HTTPS.',
    });
  }
  if (post.kind === 'REELS' && post.coverUrl && !post.coverUrl.startsWith('https://')) {
    findings.push({
      severity: 'HIGH',
      rule: 'cover-not-https',
      message: 'Cover URL-ът трябва да е публичен HTTPS.',
    });
  }

  if (post.hashtags.length > HASHTAG_MAX) {
    findings.push({
      severity: 'HIGH',
      rule: 'hashtags-over-limit',
      message: `${post.hashtags.length} хаштага при твърд лимит ${HASHTAG_MAX}.`,
    });
  } else if (post.hashtags.length > HASHTAG_RECOMMENDED) {
    findings.push({
      severity: 'MEDIUM',
      rule: 'hashtags-too-many',
      message: `${post.hashtags.length} хаштага — 3-5 нишови работят по-добре от списък.`,
    });
  }

  const badHashtag = post.hashtags.find((tag) => !/^#[\p{L}\p{N}_]+$/u.test(tag));
  if (badHashtag) {
    findings.push({
      severity: 'MEDIUM',
      rule: 'hashtag-format',
      message: `„${badHashtag}“ не е валиден хаштаг (започва с # , без интервали и пунктуация).`,
    });
  }

  if (post.altText.trim().length === 0) {
    findings.push({
      severity: 'MEDIUM',
      rule: 'alt-missing',
      message: 'Липсва alt текст (достъпност по EAA/WCAG + social SEO).',
    });
  }

  const urls = caption.match(URL_PATTERN) ?? [];
  if (urls.length > 0) {
    findings.push({
      severity: 'MEDIUM',
      rule: 'link-in-caption',
      message: 'Линковете в caption на Instagram не са кликаеми — прати към линка в био.',
    });
    for (const url of urls) {
      if (!url.includes('utm_source=')) {
        findings.push({
          severity: 'INFO',
          rule: 'link-without-utm',
          message: `${url} е без utm_source — трафикът няма да се проследи.`,
        });
      }
    }
  }

  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(caption)) {
    findings.push({
      severity: 'INFO',
      rule: 'email-in-caption',
      message: 'Личен имейл в публичен текст — обмисли фирмена кутия.',
    });
  }

  return findings;
}

export function hasBlockingFindings(findings: LintFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'HIGH');
}
