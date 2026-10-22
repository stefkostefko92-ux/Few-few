# Search-engine quality weaknesses, what users want, and the state of Bulgarian-language search (as of 22 Oct 2026)

Researcher notes. Evidence grading used throughout: **[RIGOROUS]** = peer-reviewed / methodologically documented study or primary dataset; **[VENDOR]** = SEO-tool/commercial measurement with disclosed but non-peer-reviewed method; **[SELF-REPORTED]** = company or publisher's own claim; **[ANECDOTE/OPINION]** = commentary. All dates are given; older studies are flagged. Note: the shared web-search budget ran out near the end of this research, so a few items below are marked as gaps that a follow-up could close.

---

## 1. What does rigorous evidence say about search-quality decline (SEO spam, parasite SEO, helpful-content effects, Reddit boosting, AI content, ad labelling)?

### Takeaway
The best rigorous evidence (Bevendorff et al., ECIR 2024; data Aug 2022–Sep 2023, i.e. now 3+ years old) shows that Google, Bing and DuckDuckGo all over-rank SEO-optimised affiliate content for product-review queries relative to the web's base rate, that Google's updates help only temporarily (a "constant struggle" rather than a monotonic decline), and that text quality trended down in all three engines. Since then Google has tightened spam policies (March/May/Nov 2024) and claims a 45% cut in low-quality content, but independent publishers report severe collateral damage, Reddit's visibility surged and then plateaued, AI-generated pages make up roughly 14–20% of top results (vendor measurements), and AI summaries roughly halve clicks to the open web.

### Cited Findings
**Bevendorff, Wiegmann, Potthast, Stein — "Is Google Getting Worse? A Longitudinal Investigation of SEO Spam in Search Engines" (ECIR 2024, LNCS) [RIGOROUS, data 2022–2023]**
- Design: monitored Google (via Startpage, "a privacy frontend to Google"), Bing and DuckDuckGo on 7,392 product-review queries; top-20 English organic (non-ad) results; first scrape 24 Aug 2022, then roughly every two weeks from 26 Oct 2022 to 19 Sep 2023; the period spans eleven Google ranker updates (three helpful-content and three product-review updates); ~6.6 million results analysed; baseline = BM25 research engine ChatNoir over ClueWeb22 — [Paper PDF (mirror)](https://gwern.net/doc/technology/google/2024-bevendorff.pdf); [DOI 10.1007/978-3-031-56063-7_4](https://doi.org/10.1007/978-3-031-56063-7_4); [code/data repo](https://github.com/webis-de/ECIR-24)
- Pages with affiliate links made up 29% of Startpage(Google) results, 42% of Bing, 41% of DuckDuckGo, vs 18% for the ChatNoir baseline and 2.35% of ClueWeb22 overall; Amazon Associates was the largest affiliate network "by an order of magnitude", followed by Awin, ShareASale, CJ, eBay — [Paper PDF](https://gwern.net/doc/technology/google/2024-bevendorff.pdf)
- Higher-ranked pages carry more affiliate links (r = −.99 between rank and affiliate links); "higher-ranked pages are on average more optimized, more monetized with affiliate marketing, and they show signs of lower text quality" — [Paper PDF](https://gwern.net/doc/technology/google/2024-bevendorff.pdf)
- Manual classification of the top-20 recurring sites: "Spam" was 9% of Startpage(Google) top sites, 31% for DuckDuckGo and 23% for Bing; "Review farm" 15–16% for all three commercial engines — [Paper PDF](https://gwern.net/doc/technology/google/2024-bevendorff.pdf)
- "Google's updates in particular are having a noticeable, yet mostly short-lived, effect"; Google results "seem to have improved to some extent" on affiliate spam over the year, but there is "an overall downwards trend in text quality in all three search engines"; the authors judge the "constant struggle" (spam entering and leaving in waves) as the most likely scenario. Bing cut its 95th-percentile affiliate-link count by almost 70% between Feb and Aug 2023 but remained high. DuckDuckGo's results were "extremely similar to Bing" — [Paper PDF](https://gwern.net/doc/technology/google/2024-bevendorff.pdf)
- Authors' warning: the line between benign content and content/link farms is blurring, "a situation that will surely worsen in the wake of generative AI" — [Paper PDF](https://gwern.net/doc/technology/google/2024-bevendorff.pdf)
- Critique [OPINION]: "fine but not amazing evidence" — one year only (a post-decline year), product searches only, mechanical proxy measures — [Gleech blog](https://www.gleech.org/prospect)
- No 2025–2026 Webis follow-up was found in searches (see Gaps).

**Google's March 2024 core update and spam policies [SELF-REPORTED]**
- 5 Mar 2024 (Elizabeth Tucker, Google): combined changes expected to "collectively reduce low-quality, unoriginal content in search results by 40%"; later update: rollout finished 19 April with a 45% reduction. New spam policies: **scaled content abuse** ("producing content at scale to boost search ranking — whether automation, humans or a combination are involved"), **site reputation abuse** ("very low-value, third-party content produced primarily for ranking purposes" on reputable hosts — "parasite SEO"; enforcement from 5 May 2024), **expired domain abuse** — [Google blog](https://blog.google/products/search/google-search-update-march-2024/); see also [Marie Haynes](https://mariehaynes.com/the-march-2024-core-update)
- Nov 2024 tightening: third-party content exploiting a host's ranking signals violates the policy "regardless of whether there is first-party involvement or oversight"; enforced via manual actions; reported targets included Forbes Advisor and CNN Underscored (trade-press reports; Google did not confirm specific actions) — [PPC Land](https://ppc.land/site-reputation-abuse/); [Sistrix](https://www.sistrix.com/?p=169359); [Search Engine Journal](https://searchenginejournal.com/google-strengthens-policy-against-site-reputation-abuse/533018/)

**Helpful-content system and independent publishers — HouseFresh case [SELF-REPORTED / ANECDOTE]**
- HouseFresh (independent air-purifier reviewer) reported a 91% loss of Google traffic, attributing it to Google favouring big media brands' affiliate content — [Search Engine Land](https://searchengineland.com/review-site-google-traffic-affiliate-seo-content-440143); [HouseFresh "David vs Digital Goliaths"](https://housefresh.com/david-vs-digital-goliaths/); [HouseFresh on "enshittified Google"](https://housefresh.com/finding-helpful-content-in-an-enshittified-google/)
- Reported fall from ~4,000 to ~200 daily Google visitors; recovery described on 11 Oct 2025 after ~2 years, credited partly to YouTube/brand searches and to the site-reputation-abuse policy "levelling the playing field"; sources disagree whether Sept 2023 or March 2024 update was the trigger — [PPC Land](https://ppc.land/housefresh-achieves-notable-traffic-recovery-after-google-algorithm-impacts-2/)
- Retro Dodo reported ~85% organic loss; a 2026 post describes the pattern across many independents (publisher accounts, not independent measurement) — [PPC Land](https://ppc.land/housefresh-achieves-notable-traffic-recovery-after-google-algorithm-impacts-2/); [PiunikaWeb](https://piunikaweb.com/2026/05/10/google-c)

**Reddit / forum boosting [VENDOR]**
- Sistrix: reddit.com went from the 68th to the 5th most visible domain in Google US organic between July 2023 and July 2024; Amsive citing Sistrix: +1,328% visibility July 2023→April 2024; Semrush: monthly visitors ~132M (Aug 2023) → 346M (Apr 2024) — [Adweek](https://www.adweek.com/media/reddit-search-visibility-publishers/); [eMarketer](https://www.emarketer.com/content/reddit-top-google-search-results-growing-ad-revenues-should-marketers-take-notes)
- Sistrix domain analysis (data as of 28 Jul 2026): Reddit #4 in US visibility, #5 UK; peak visibility October 2025; "new downward trend", US trend labelled "strong negative"; no sign of core-update impact — [Sistrix](https://www.sistrix.com/blog/reddit-domain-analysis/). Conflict: a search-snippet version of the same Sistrix analysis said Reddit "turned the corner in August 2025, dropping from #2" — [Sistrix](https://www.sistrix.com/?p=154455). Treat the exact peak month as uncertain.

**AI-generated content in results [VENDOR]**
- Originality.ai ongoing tracker: AI content in Google top-20 peaked at 19.56% (July 2025), 17.31% (Sept 2025) — [Originality.ai](https://originality.ai/blog/ai-content-in-google-search-results)
- Graphite (June 2025; 31,493 keywords, 10 categories, English articles/listicles, Surfer detector with reported 4.2% FP / 0.6% FN): 14% of Google-ranked articles AI-generated (12% in 2024, detectors not comparable); only 7% of #1-ranked articles AI-generated; human pages ranked higher in keyword-matched test (p < 1e-6); ChatGPT and Perplexity citations 18% AI. Highest AI share: Productivity 14.1%, Crypto 13.3%, Tech 10.8%, Education 10.4%; lowest Food 4.5%, News 4.7%. Graphite also reports that AI-generated articles published online exceeded human-written ones in Nov 2024 — [Graphite](https://graphite.io/five-percent/ai-content-in-search-and-llms)

**AI answers replacing clicks / accuracy**
- Pew Research (22 Jul 2025) [RIGOROUS, panel browsing data]: 900 US adults' March 2025 Google searches (68,879 searches; ~18% produced an AI summary). Users clicked a traditional result on 8% of visits with an AI summary vs 15% without; clicked a link inside the summary on ~1%; session ended after the results page 26% vs 16%. Wikipedia, YouTube and Reddit = 15% of AI-summary sources; .gov = 6% of AI-summary sources vs 2% of standard results; median summary 67 words — [Pew Research](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
- Reuters Institute DNR 2026 (16 Jun 2026) citing Chartbeat: Google organic search traffic to 2,500+ news sites down 33% globally Nov 2024→Nov 2025 (−38% US); publishers expect search traffic to fall a further 43% in three years — [Reuters Institute DNR 2026](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/dnr-executive-summary)
- Guardian investigation (Jan 2026) [JOURNALISTIC]: AI Overviews gave misleading health info (e.g., liver-test ranges; telling pancreatic-cancer patients to avoid high-fat foods); Google removed AI Overviews for some flagged queries while saying most health summaries are accurate — [Euronews](https://www.euronews.com/2026/01/12/google-removes-some-health-related-questions-from-its-ai-overviews-following-accuracy-conc); [PSL Hub (reprint)](https://www.pslhub.org/blogs/entry/9365-google-ai-overviews-put-people-at-risk-of-harm-with-misleading-health-advice/)

**Ad load and sponsored-label changes**
- 13 Oct 2025: Google groups text ads under a single sticky "Sponsored results" label and adds a one-click "Hide sponsored results" control; ad size unchanged and "never more than four text ads in a grouping"; marketers spotted tests from 24 Sep 2025 — [PPC Land](https://ppc.land/google-introduces-sticky-sponsored-results-label-and-hide-ads-control/); [BetaNews](https://betanews.com/2025/10/14/google-search-now-lets-you-hide-sponsored-results/); [PPC Land (grouping)](https://ppc.land/google-groups-sponsored-ads-under-single-header-in-search-results/)

### Inferences
- The rigorous evidence supports "persistent adversarial pollution in commercial verticals" more than "monotonic decline"; a newcomer's best attack surface is exactly those verticals (product reviews, "best X" lists, how-to), where affiliate density is 10× the web base rate.
- Google's own 40→45% claim is unaudited; independent evidence after March 2024 is mostly vendor visibility indices and publisher testimonies, i.e., weaker than Bevendorff.
- AI answers shift the quality problem from "ranking spam" to "summary accuracy + attribution"; Pew's 1% in-summary click rate means sources get little traffic, a fairness argument a source-first engine can exploit.
- DuckDuckGo ≈ Bing in results (per Bevendorff) means "alternative" engines built on syndicated indexes inherit the same spam profile.

### Gaps
- No 2025–2026 peer-reviewed follow-up to Bevendorff et al. found (search budget exhausted before checking Webis publication list / SIGIR 2025–2026 proceedings).
- No independent measurement of Google's claimed 45% reduction.
- No rigorous measurement of ad load (ads per SERP, pixels above the fold) over time found; only the Oct 2025 label/grouping change is documented.
- No Bulgarian-language equivalent of these spam/affiliate studies found.

---

## 2. What do user surveys say people like and dislike about search engines (ads, privacy, trust, speed, AI answers)?

### Takeaway
Stated satisfaction with Google remains high in the US (ACSI 2024: Google 81/100, the most recent search-engine score I could verify), yet a large minority to majority of users complain about too many ads and declining usefulness; trust in AI answers is low (20% globally, DNR 2026) and ads inside AI answers would reduce trust for most. EU-level survey data on search engines specifically is old (2016).

### Cited Findings
- ACSI Search & Social Media Study 2024 (published 23 Jul 2024; 8,940 surveys) [RIGOROUS, US]: search engines industry 80; Google 81 (up from 80); DuckDuckGo 79; Bing 77; Yahoo 77 — [ACSI press release 2024](https://theacsi.org/news-and-resources/press-releases/2024/07/23/press-release-search-and-social-media-study-2024); [Search Engine Land](https://searchengineland.com/google-user-satisfaction-2024-444300). SEJ reads the gains as linked to 2023 AI features (interpretation) — [Search Engine Journal](https://searchenginejournal.com/study-backs-googles-claims-ai-search-boosts-user-satisfaction/523059)
- ACSI AI platforms (March 2026 benchmarks): Gemini 76, Claude 73 — [ACSI AI Platforms](https://theacsi.org/industries/interactive-media-subscription-entertainment/ai-platforms/)
- Older ACSI context: Google 83 / Bing 82 (2011) — [eWeek](https://www.eweek.com/news/google-could-boost-customer-satisfaction-vs-facebook-acsi-report/) (flag: 15 years old)
- WalletHub survey [SURVEY, date not given in sources]: 66% think Google shows too many ads; 35% too many irrelevant results; 63% think results were better the previous year — [Consumer Watchdog repost of WalletHub](https://consumerwatchdog.org/in-the-news/wallet-hub-google-quality-issues-part-of-an-intentional-strategy/)
- Vox Media / Two Cents Insights (2025; 2,000+ US adults): 42% say "Google and search engines are becoming less useful"; 76% say about a quarter of shopping results are sponsored; only 14% find those ads useful — [Gigazine](https://gigazine.net/gsc_news/en/20250227-google-are-becoming-less-useful)
- Ipsos (2026): 63% say ads in AI search results would reduce their trust — [Search Engine Journal](https://searchenginejournal.com/trust-in-ai-search-could-drop-with-ads-survey-shows/571240/)
- A Search Engine Land survey report is headlined "54% of people look through more search results vs. 5 years ago" (2024; full text not retrievable, HTTP 403) — [Search Engine Land](https://searchengineland.com/search-engine-experience-results-ads-survey-442943)
- Pew (Jul 2025): behavioural, not attitudinal — AI summary visits end sessions more often (26% vs 16%) and get fewer clicks (8% vs 15%) — [Pew Research](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
- Reuters Institute DNR 2025 (17 Jun 2025): 7% use AI chatbots for news weekly (15% of under-25s); public expects AI to make news cheaper (+29) and more up to date (+16) but less transparent (−8), less accurate (−8), less trustworthy (−18) — [YouGov summary](https://yougov.com/articles/52379-three-key-findings-from-the-2025-digital-news-report); [Twipe](https://www.twipemobile.com/what-the-2025-digital-news-report-tells-us-about-ai-in-news/)
- Reuters Institute "Generative AI and News Report 2025" (Oct 2025): weekly use of gen-AI for news rose from 3% to 6% — [Reuters Institute PDF](https://reutersinstitute.politics.ox.ac.uk/sites/default/files/2025-10/Gen_AI_and_News_Report_2025.pdf)
- Reuters Institute DNR 2026 (16 Jun 2026; ~100,000 respondents, 48 countries): weekly AI-chatbot news use 7%→10% (16% of under-35s); trust in AI chatbot answers 20% vs 37% for news overall (UK 6%); self-reported click-through to sources: search 44%, AI chatbots 42%, social 36% — [DNR 2026 executive summary](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/dnr-executive-summary); sample size per [Solidarna](https://solidarna.hr/news/reuters-institute-digital-news-report-2026-how-is-the-way-we-consume-news-changing)
- DNR 2026 Bulgaria: trust in news 21% (−5; global 37%); news avoidance 60% ("no longer leads"); 9% pay for online news; more Bulgarians turning to AI chatbots for daily news (no figure on page) — [DNR 2026 Bulgaria](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/bulgaria)
- EU-level data (OLD, 2016): Special Eurobarometer on online platforms (27,969 respondents) covered awareness of search engines' data collection and trust in how they rank — [rcmediafreedom dataset entry](https://www.rcmediafreedom.eu/Media-freedom-datasets/Online-platforms-Eurobarometer). Vodafone Institute / TNS (2016, 8 European countries): only 16% trusted search-engine companies to handle personal data correctly (telecoms 18%, social media 11%) — [Telecompaper](https://www.telecompaper.com/news/only-18-of-europeans-trust-operators-on-personal-data--1123558)

### Inferences
- Satisfaction indices (ACSI) and complaint surveys coexist: users rate Google "good enough" overall but name ads and SEO filler as specific irritants — a newcomer must win on specific pain points, not on general satisfaction.
- Low trust in AI answers (20%) plus low news trust in Bulgaria (21%) suggests Bulgarian users would value transparent source attribution over unattributed AI summaries.
- Ads inside AI answers are a trust liability (Ipsos 63%), supporting an ad-free or clearly separated ad model.

### Gaps
- ACSI 2025 and 2026 search-engine scores could not be verified (ACSI site returned HTTP 403; ACSI moved to theacsi.com).
- No 2024–2026 Eurobarometer specifically on search engines found; no Bulgarian national survey on search-engine satisfaction found.
- No credible survey isolating "speed" as a stated driver of engine choice found.
- WalletHub survey date not established.

---

## 3. Privacy and personalization: tracking evidence, filter bubbles, and verifiability of privacy-first promises

### Takeaway
The strongest filter-bubble evidence (Robertson et al., Nature 2023, US elections 2018/2020) finds Google Search exposes users to *less* partisan/unreliable news than users themselves choose to click — algorithmic curation is not the main driver. Privacy-first engines' claims are mostly unverifiable policy statements; the DuckDuckGo–Microsoft tracker episode (2022) shows contractual dependencies can silently undercut them, while Kagi's Privacy Pass (2025) is one of few cryptographically enforceable designs.

### Cited Findings
- Robertson et al., "Users choose to engage with more partisan news than they are exposed to on Google Search", Nature 2023 (doi 10.1038/s41586-023-06078-5) [RIGOROUS; data 2018 & 2020, US only]: paired surveys with browser-extension measurement of exposure (what Google showed) and engagement (what users clicked); in both waves engagement contained more identity-congruent and unreliable sources than Google exposure; exposure/engagement "appear to stem mainly from users' own choices rather than algorithmic curation" — [Network Science Institute](https://www.networkscienceinstitute.org/publications/users-choose-to-engage-with-more-partisan-news-than-they-are-exposed-to-on-google-search); samples 262–333 (2018, over-sampling strong partisans) and 459–688 (2020) — [Scimex/Nature press summary](https://scimex.org/newsfeed/are-google-search-algorithms-creating-an-online-echo-chamber-that-just-tells-you-what-you-want-to-hear); preprint [arXiv 2201.00074](https://arxiv.org/abs/2201.00074v1)
- DuckDuckGo–Microsoft (May 2022): researcher Zach Edwards found the DuckDuckGo browser blocked Google/Facebook trackers but allowed Microsoft (Bing, LinkedIn) trackers; CEO Gabriel Weinberg attributed it to the Microsoft search-syndication agreement, which was confidential and undisclosed to users; he said it affected the browser, not search — [Search Engine Journal](https://www.searchenginejournal.com/duckduckgo-microsoft-trackers/452006/); [Reclaim The Net](https://reclaimthenet.org/breaking-down-duckduckgos-microsoft-tracking-controversy)
- Startpage is "a privacy frontend to Google" (used as a Google proxy in the Bevendorff study) — [Paper PDF](https://gwern.net/doc/technology/google/2024-bevendorff.pdf)
- Brave claims: "Brave Search doesn't profile you"; "impossible for us to share, sell, or lose your personal data" because it is not collected; results from "its own, built-from-scratch index" described as "fully independent", but Brave may mix in Google results via fallback mixing it aims to reduce; no percentage published on that page — [Brave Search](https://brave.com/search/) [SELF-REPORTED]
- Kagi: "no ads, no tracking … fully funded by its users" — [Kagi pricing](https://kagi.com/pricing) [SELF-REPORTED]. Kagi Privacy Pass (launched ~Feb 2025, with a Tor onion service): searches authenticated by cryptographic tokens so they cannot be linked to the account or to each other; account settings unavailable in that mode; available on unlimited plans (Professional, Ultimate, Family, Team) — [Kagi blog](https://blog.kagi.com/kagi-privacy-pass); [Kagi help](https://help.kagi.com/kagi/privacy/privacy-pass.html); [AlternativeTo](https://alternativeto.net/news/2025/2/kagi-search-introduces-privacy-pass-and-tor-onion-service-for-enhanced-privacy-and-anonymity)
- Trust baseline (2016): 16% of Europeans in 8 countries trusted search-engine companies with personal data — [Telecompaper](https://www.telecompaper.com/news/only-18-of-europeans-trust-operators-on-personal-data--1123558)

### Inferences
- "Filter bubble" is a weak marketing argument against Google on the evidence; "surveillance/ads profiling" and "data leaving the EU" are stronger, verifiable differentiators.
- Verifiability options for a privacy-first newcomer: cryptographic unlinkability (Privacy Pass pattern), published independent audits, open-source front end, EU-only hosting, and disclosure of any syndication contracts (lesson from DDG).
- Personalization that users *control explicitly* (Kagi-style domain boosts) avoids both the filter-bubble critique and covert profiling.

### Gaps
- No independent technical audit of DuckDuckGo, Brave or Kagi privacy claims found.
- No recent (2024–2026) peer-reviewed measurement of what data Google/Bing search collect per query found.
- Robertson et al. is US-only and pre-AI-Overviews; no EU/Bulgarian replication found.

---

## 4. Which features do power users explicitly value and pay for?

### Takeaway
The paying-power-user segment is small but real (Kagi: 75,675 members, ~1.05M queries/day as of 22 Oct 2026) and is built around user-controlled ranking (block/lower/raise/pin domains), scoped "lenses", no ads/tracking, and community-shared re-ranking rules (Brave Goggles); the most-blocked domains on Kagi are Pinterest variants. DuckDuckGo's !bangs (shortcut to other sites' search) remain a signature feature.

### Cited Findings
- Kagi personalized results: shield icon per result → Block / Lower / Normal / Higher / Pin; whole-domain only (no path wildcards/regex; recommends uBlacklist for that); works in image search; anonymized community "Personalization Leaderboard" — [Kagi help](https://help.kagi.com/kagi/features/website-info-personalized-results.html)
- Kagi blog (25 Mar 2026): Pinterest variants "dominate the top seven spots" of most-blocked domains — [Kagi blog](https://blog.kagi.com/tips/domain-ranking); users must block each Pinterest ccTLD separately — [Kagi feedback](https://kagifeedback.org/d/2098-sharing-lists-of-personalized-results-domains)
- Kagi Lenses: built-in Forums, Programming, Academic (.edu), PDFs, Kagi Docs; optional Cyber Security, Small Web, Recipes; custom lenses with region, ≤10 included/≤10 excluded sites, ≤5 included/≤5 excluded keywords, file type, date range; not yet for image/video — [Kagi Lenses](https://help.kagi.com/kagi/features/lenses.html)
- Kagi pricing: Trial free (100 searches), Starter $5/mo (300 searches), Professional $10/mo (unlimited), Ultimate $25/mo (unlimited) — [Kagi pricing](https://kagi.com/pricing)
- Kagi stats: 75,675 members (chart date "Oct 22", fetched 22 Oct 2026); 1,046,700 queries in the past day — [Kagi stats](https://kagi.com/stats) [SELF-REPORTED]
- Brave Goggles: plain-text DSL rules to boost/downrank/discard results, hosted on GitHub/Gist/GitLab, applied as re-ranking on a query-dependent "expanded recall set"; one Goggle at a time — [Brave Goggles help](https://search.brave.com/help/goggles); [Brave support](https://support.brave.app/hc/en-us/articles/6959189556237-How-do-I-use-Goggles); Brave Search Premium = ad-free paid tier — [Brave Search](https://brave.com/search/)
- DuckDuckGo !bangs: "!Bang commands perform your searches directly on other search engines" (e.g., "!a bags" → Amazon); help page says "over a thousand" (the often-quoted ~13,000 figure was not verified); bangs follow the region setting (e.g., !amazon → amazon.de) — [DuckDuckGo help](https://duckduckgo.com/duckduckgo-help-pages/features/bangs)
- Verticals in AI summaries: .gov sources overrepresented (6% vs 2%) and Wikipedia/YouTube/Reddit ~15% of AI-summary sources — [Pew Research](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
- Google added a user "Hide sponsored results" button (Oct 2025) — evidence the ad-clutter complaint is salient enough for the incumbent to respond — [BetaNews](https://betanews.com/2025/10/14/google-search-now-lets-you-hide-sponsored-results/)

### Inferences
- Explicit, user-owned ranking controls are the clearest "paid-for" differentiator; a newcomer should ship domain block/boost + shareable lists (Goggles-like) from day one.
- Pinterest-blocking demand indicates image-SEO/aggregator pollution is a top irritant; similar Bulgarian aggregator/scraper sites would be natural default-demotion candidates.
- Kagi's ~76k paying members after several years shows paid search is a niche; a Bulgarian-language product cannot rely on subscriptions alone at that conversion level.

### Gaps
- No primary source fetched on Google "Verbatim" mode / operator support status in 2026, nor on operator support in DDG/Brave/Kagi.
- No quantitative study of which verticals (maps, shopping, news, images, video, academic, code) users value most or switch engines for.
- No measured latency comparisons between engines; no evidence on speed as a purchase driver.
- Kagi's 75,675 figure lacks an explicit year on the page (taken as 2026 because fetched on 22 Oct 2026).

---

## 5. How is search quality measured, and how could a newcomer credibly prove it is "better"?

### Takeaway
Google measures quality via human raters following the Search Quality Rater Guidelines (Needs Met, Page Quality, E-E-A-T; Jan 2025 edition explicitly allows "Lowest" for low-value AI content; Sept 2025 adds AI Overview examples) plus massive side-by-side and live-traffic experiments (2023: 719,326 quality tests, 124,942 side-by-sides, 16,871 live experiments → 4,781 launches). Published head-to-head blind tests are old and sponsor-tainted (Microsoft "Bing It On" vs Yale rebuttal); the most credible independent template is academic: representative query samples + graded relevance by blind jurors (Lewandowski) and longitudinal spam auditing against an open baseline (Bevendorff).

### Cited Findings
- SQRG Jan 2025 edition: 181 pages; first definition of generative AI; main content produced with automated tools and little added value can be rated Lowest — [PPC Land](https://ppc.land/search-quality-rater-guidelines/)
- SQRG 11 Sep 2025: "minor update" with clarifications, updated YMYL definitions and AI Overview examples (raters now assess AI Overview content); Google: no change to overall guidance — [Search Engine Land](https://searchengineland.com/google-updates-search-quality-raters-guidelines-adding-ai-overview-examples-ymyl-definitions-461908); [Marie Haynes](https://www.mariehaynes.com/google-quality-raters-now-rate-ai-overviews/). Raters do not directly change rankings — [PPC Land](https://ppc.land/search-quality-rater-guidelines/)
- Google "rigorous testing": raters see two result sets (with/without a change) and say which they prefer and why; 2023 figures: 719,326 search quality tests, 124,942 side-by-side experiments, 16,871 live traffic experiments, 4,781 launches — [Google How Search Works](https://google.com/search/howsearchworks/how-search-works/rigorous-testing/); earlier figures (383,605 quality tests, 62,937 side-by-sides, 3,600+ improvements) — [Google blog](https://blog.google/products/search/raters-experiments-improve-google-search/)
- Blind tests [SPONSOR-BIASED, OLD]: Microsoft "Bing It On" (2012) claimed users chose Bing nearly 2:1 (Answers Research, ~1,000 participants) — [BetaNews](https://betanews.com/article/the-quest-for-the-best-search-engine-bing-it-on/); UK 2013 Microsoft test (branding/ads removed, 10 popular queries): 53% Bing, 34% Google, 13% equal — [Bing UK blog](https://blogs.bing.com/uk/2013/10/09/search-has-changed)
- Rebuttal (Oct 2013, Ian Ayres, Yale): on BingItOn.com with participants' own queries, 53% preferred Google, 41% Bing, 6% ties; Bing-suggested queries produced near-parity; Microsoft did not release its site results; Microsoft disputed the method — [Slate](https://www.slate.com/blogs/future_tense/2013/10/02/bing_vs_google_professor_fact_checks_bing_it_on_challenge_microsoft_loses.html); [PCWorld](https://www.pcworld.com/article/447930/bing-it-on-yale-professor-calls-shenanigans-over-microsofts-search-superiority-claims.html)
- Independent three-engine blind tool (older, developer was a Microsoft employee): Google 44%, Bing 33%, Yahoo 23%; note that some experts argue users rate results higher because they come from Google — [TechCrunch](https://techcrunch.com/?p=90832)
- Lewandowski (2014, arXiv 1405.2210) [RIGOROUS, German market, OLD]: 1,000 informational + 1,000 navigational queries sampled from a German engine's logs, crowdsourced jurors, graded relevance; Google led modestly on informational queries; navigational correct answer at top: Google 95.3% vs Bing 76.6%; graded judgments revealed more fully irrelevant Bing results; recommends graded over binary relevance — [arXiv](https://arxiv.org/abs/1405.2210)
- Sünkler & Lewandowski (ASIST 2017): 64-participant user study with post-task relevance judgments; Google produced more relevant results than Bing — [ASIST 2017 PDF](https://searchstudies.org/wp-content/uploads/2022/06/ASIST_2017_Lewandowski.pdf)
- Bevendorff et al.'s method (open baseline ChatNoir/ClueWeb22, repeated scraping, affiliate-density and text-quality features, manual site classification with κ = .96 agreement; review classifier 79% accuracy, 85% precision) is a reusable audit template — [Paper PDF](https://gwern.net/doc/technology/google/2024-bevendorff.pdf)

### Inferences
- A credible "better" claim for a newcomer would combine: (a) a published, representative Bulgarian query sample (informational / navigational / transactional / local strata), (b) blind graded-relevance judgments by independent native-speaker raters using a public guideline (SQRG-style Needs Met + Page Quality), (c) offline metrics such as NDCG@10 and navigational success@1 (standard IR practice; no source fetched here), (d) a spam/affiliate-density audit in the Bevendorff style, and (e) pre-registration plus release of queries/judgments so third parties can reproduce — avoiding the "Bing It On" credibility trap of sponsor-chosen queries.
- Navigational success is where Google historically dominates (95.3%); a newcomer should expect to lose there unless the index is very complete for Bulgarian domains, and should report it honestly.

### Gaps
- No independent, published blind side-by-side comparison of engines from 2020–2026 found; no comparison including Kagi/Brave/DDG with rigorous method found.
- No published Bulgarian-language relevance test collection (TREC/CLEF-style) for web search verified in this session (CLEF had Bulgarian ad-hoc tracks in the 2000s per Savoy's stemming work, but not fetched).
- Specific changes to "Needs Met" scale in 2025 not documented in sources found.

---

## 6. Bulgarian-language search: web size, quality issues, NLP resources, шльокавица, local verticals, past Bulgarian engines

### Takeaway
Bulgarian is ~0.24–0.31% of Common Crawl HTML pages in 2026 crawls (similar to Serbian, about half of Greek/Romanian, ~1/4 of Czech) and Google holds ~96% of Bulgarian search. Tooling is decent (CLASSLA-Stanza/Stanza lemmatisation 97–99%, BulTreeBank, Lucene light stemmer, Bulgarian BERTs, INSAIT's BgGPT 3.0 on Gemma 3), but spaCy has no trained Bulgarian pipeline and no Bulgarian retrieval benchmark was found. Quality problems specific to the Bulgarian web include large networks of cloned "mushroom" disinformation sites. Local data sources such as the state price portal kolkostruva.bg are verticals where a local engine could add value. Earlier Bulgarian engines (Jabse, Diri.bg) and editorial directories (Dir.bg, Gbg.bg) never displaced Google.

### Cited Findings
**Size of the Bulgarian web**
- Common Crawl (share of HTML documents by primary language, CLD2): Bulgarian 0.2903% (CC-MAIN-2026-34), 0.3119% (2026-39), 0.2446% (2026-43, latest). Comparators in 2026-43: Czech 1.1472%, Greek 0.5107%, Romanian 0.5758%, Serbian 0.2635%, Ukrainian 0.7870%, Russian 6.3018%, English 42.5647% — [Common Crawl language statistics](https://commoncrawl.github.io/cc-crawl-statistics/plots/languages)
- Common Crawl acknowledges its data "has always been biased towards English content" — [Common Crawl blog](https://blog.commoncrawl.org/blog/expanding-the-language-and-cultural-coverage-of-common-crawl)
- W3Techs: Bulgarian is roughly 0.2–0.3% of websites by content language (different measure; secondary reading) — [W3Techs](https://w3techs.com/technologies/history_overview/content_language)

**Market structure in Bulgaria**
- Statcounter Bulgaria, all platforms: May 2026 Google 96.02%, Bing 3.03%, Yandex 0.31%, DuckDuckGo 0.26%; Sept 2026 Google 95.98%, Bing 3.04%; Yahoo and Ecosia ~0.1% each — [Statcounter Bulgaria](https://gs.statcounter.com/search-engine-market-share/all-platforms/bulgaria); [Statcounter (desktop-mobile-tablet)](https://gs.statcounter.com/search-engine-market-share/desktop-mobile-tablet/bulgaria) (Google label inferred from table layout in snippets)

**Quality issues in Bulgarian results/web**
- Center for the Study of Democracy "Webs of Deceit" (2025): clusters of interlinked pro-Kremlin "mushroom websites" publishing identical/near-identical content across many domains, with overlapping ownership signals and synchronized publishing — [Sensika/CSD](https://sensika.com/partner-reports/webs-of-deceit-disinformation-networks-bulgaria/)
- DFRLab (26 Mar 2024): suspicious Facebook assets amplify these sites; AdRain-linked emails registered ≥10 network sites 2013–2018 — [DFRLab](https://dfrlab.org/2024/03/26/suspicious-facebook-assets-bulgarian-mushroom-websites); RFE/RL: cash-for-clicks copycat model, share4pay.com — [RFE/RL](https://www.rferl.org/a/bulgaria-disinformation-mushroom-websites/32893788.html) (AdRain's co-owner denied the claims)
- Bulgarian trust in news 21% (DNR 2026) — [DNR 2026 Bulgaria](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/bulgaria)

**Bulgarian NLP resources**
- CLASSLA-Stanza: tokenisation (rule-based reldi-tokeniser), POS, lemmatisation, dependency parsing, NER for standard Bulgarian — [CLARIN.SI Bulgarian FAQ](https://www.clarin.si/info/k-centre/faq4bulgarian/); lemmatiser trained on BulTreeBank + inflectional lexicon, estimated lemma F1 ~98.93 — [CLARIN.SI repository](https://www.clarin.si/repository/xmlui/handle/11356/1850?show=full); parser LAS ~91.18 — [B2FIND](https://b2find.eudat.eu/dataset/678e7f6d-2660-5658-9ec8-491c35195336); 2023 release adds lexicon support and CLARIN.SI embeddings — [CLASSLA mailing list](https://mailman.ijs.si/pipermail/classla/20230913/000016.html)
- Stanford Stanza on UD_Bulgarian-BTB: Tokens 99.96, UPOS 99.16, UFeats 97.84, AllTags 96.62, Lemmas 97.28, UAS 93.98, LAS 91.09 — [Stanza performance](https://stanfordnlp.github.io/stanza/performance.html)
- UD_Bulgarian-BTB: 156,149 tokens, 11,138 sentences (subset of BulTreeBank) — [Universal Dependencies](https://universaldependencies.org/treebanks/bg_btb)
- spaCy: Bulgarian has language data only; Pipelines column "none yet" — [spaCy models](https://spacy.io/usage/models); a separate spaCy-based Bulgarian pipeline trained on BulTreeBank was described by Popov, Osenova, Simov (TLT 2020) — [ACL Anthology PDF](https://preview.aclanthology.org/fix_video/2020.tlt-1.14.pdf)
- Lucene BulgarianAnalyzer: light stemming based on Jacques Savoy's "Searching Strategies for the Bulgarian Language", BSD stopword list from Savoy/CLEF — [Apache Lucene docs](https://lucene.apache.org/core/4_9_0/analyzers-common/org/apache/lucene/analysis/bg/package-summary.html)
- Encoders/embeddings: IICT-BAS (AIaLT-IICT) Bulgarian BERT base/large trained on ~19B tokens (no NSP; large usable with SentenceTransformers) — [Hugging Face large](https://huggingface.co/AIaLT-IICT/bert_bg_lit_web_large_uncased); [Hugging Face base](https://huggingface.co/AIaLT-IICT/bert_bg_lit_web_base_uncased); BG–EN parallel-trained sentence RoBERTa — [Hugging Face](https://huggingface.co/rmihaylov/roberta-base-nli-stsb-theseus-bg); Qwen3-Embedding-0.6B vocabulary-trimmed for Bulgarian (no scores published) — [Hugging Face](https://huggingface.co/alphaedge-ai/Qwen3-Embedding-bul-32768); CLaDA-BG 2026 slides on encoder sizes and tagging/parsing results — [CLaDA-BG](https://clada-bg.eu/wp-content/uploads/2026/07/SmallCanBeBeautiful.pptx.pdf)
- BgGPT 1.0 (INSAIT, arXiv Dec 2024): Gemma-2 continually pretrained on >100B Bulgarian+English tokens; 27B and 9B (plus 2B); INSAIT claims 27B/9B beat Qwen 2.5 72B and Llama 3.1 70B in Bulgarian on its benchmarks (some built from non-public data) — [arXiv](https://arxiv.org/html/2412.10893v1); [Google DeepMind Gemmaverse case study](https://deepmind.google/models/gemma/gemmaverse/insait/) [SELF-REPORTED benchmarks]
- BgGPT 3.0 (Gemma 3; 4B/12B/27B; vision, instruction-following, ~131k context; pretraining data to May 2025, instruction tuning to Oct 2025); public chat at bggpt.ai with internet search, free, iOS/Android apps; model listings dated 25 Mar 2026 — [INSAIT](https://insait.ai/insait-unveils-a-new-generation-of-ai-precision-models-for-business-and-an-upgraded-bggpt-chat-for-all-citizens/); [BNT](https://bntnews.bg/news/bggpt-launches-new-version-and-mobile-app-1385524news.html); [Featherless](https://featherless.ai/models/INSAIT-Institute/BgGPT-Gemma-3-27B-IT); [Ollama](https://ollama.com/todorov/bggpt:Gemma-3-27B-IT-Q6_K)

**Latin-script Bulgarian (шльокавица) and transliteration**
- Шльокавица = unofficial writing of Bulgarian in Latin letters that spread in the 1990s–early 2000s, now often stigmatised; an art-school project built a шльокавица→Cyrillic converter — [UAL Cyrillic Transformer](https://portfolio.arts.ac.uk/project/552319-cyrillic-transformer-tool)
- Zidarova (2016, Slavjanski dialozi): Latin script in contemporary Bulgarian — cartography/toponymy, commerce, digital communication — [Plovdiv University PDF](https://dialozi.uni-plovdiv.bg/wp-content/uploads/2020/04/Slavjanski-dialozi-kn.18-2016-60-68.pdf)
- Official romanisation fixed by the 2009 Transliteration Act (Streamlined System) — [UNGEGN document](https://unstats.un.org/Unsd/geoinfo/UNGEGN/docs/10th-uncsgn-docs/econf/E_CONF.101_12_Romanization%20System%20in%20Bulgaria.pdf); formal model of romanisation as alphabet mapping — [Ivanov, Skordev, Dobrev (Sofia Univ.)](https://store.fmi.uni-sofia.bg/fmi/logic/skordev/B1-Ivanov-Skordev-Dobrev.pdf)

**Local verticals**
- kolkostruva.bg (Commission for Consumer Protection): daily prices by city and chain for 101 consumer-basket product groups (incl. 16 medicine types), mandated by the Euro Adoption Act for retailers with turnover > BGN 10M; Bulgarian-only; at launch only 2 of 35 chains reported, later reported "fully operational" — [BTA](https://www.bta.bg/en/news/977611-new-retail-price-platform-kolkostruva-bg-fully-operational); [Sofia Globe](https://sofiaglobe.com/?p=124932); [BNT](https://bntnews.bg/news/consumer-basket-new-retail-price-platform-kolkostruvabg-to-be-launched-1358188news.html); used by BNT in 2026 price comparisons (cucumbers €1.25–€3.00) — [BNT](https://bntnews.bg/news/comparison-between-prices-in-bulgaria-and-the-uk-where-are-prices-higher-1390626news.html); an earlier caretaker-government food-price platform existed — [Sofia Globe](https://sofiaglobe.com/?p=111889)
- Pazaruvaj.com is a Bulgarian price-comparison site (third-party scraper exists) — [Apify](https://apify.com/studio-amba/pazaruvaj-scraper.md)

**Past Bulgarian search engines [OLD, 2006–2008 blog sources]**
- Jabse: described ~2006 as a one-man project with a Bulgarian-only index of ~3.15M pages; later ~5.5M pages and ~20,000 unique visits/day (+~400% in a year); revenue from contextual ads via Easytrader.bg; ran News.jabse.com — [Webcertain blog (Georgi Georgiev)](https://blog.webcertain.com/author/georgi-georgiev); [Webcertain](https://blog.webcertain.com/?p=934)
- Diri.bg: launched Dec 2007 by portal Dir.bg as standalone search, "in direct competition with the already existing Jabse" — [Webcertain Dec 2007](https://blog.webcertain.com/12/12/2007/)
- Dir.bg and Gbg.bg: editorial directories with small staffs reviewing submitted sites and selling paid premium listings — [Webcertain](https://blog.webcertain.com/?p=230); general overview — [Search Engine Journal (Bulgaria's search engines)](https://www.searchenginejournal.com/bulgarias-search-engines-yogurt-and-kotooshu-sumo/2264/)
- Logo-Company took 100% of Dir.bg (2014) — [FFBH](https://www.ffbham.bg/en/post/bulgaria-s-logo-company-takes-full-control-of-dir-bg-158997985869261); Dir.bg still had 21.71M visits in April 2025 — [Semrush](https://tr.semrush.com/website/dir.bg/overview)
- Napred.bg mentioned as a Bulgarian search engine in one plugin listing (unverified) — [mxp.tw](https://www.mxp.tw/plugins/bulgarian-search)

### Inferences
- At ~0.25–0.31% of Common Crawl, a Bulgarian-focused index is small enough to crawl and re-rank comprehensively on modest infrastructure, and the Bulgarian Common Crawl slice is a cheap bootstrap seed (exact per-crawl document count not computed here).
- Morphology is solvable: high-quality lemmatisers (97–99%) plus a light stemmer exist; the bigger gaps are retrieval-specific (no public Bulgarian web relevance benchmark, untested Bulgarian embeddings), which a newcomer could fill and publish as a credibility asset.
- Шльокавица/transliteration normalisation (Latin→Cyrillic query rewriting, both official Streamlined System and informal variants) is an under-served query class with no dedicated NLP study found — a concrete feature where a local engine can visibly beat generic handling.
- Demoting cloned "mushroom" networks via near-duplicate detection is a Bulgarian-specific quality win with documented evidence (CSD/DFRLab) and ties into low news trust (21%).
- Structured public data (kolkostruva.bg prices, government services) supports verticals Google covers poorly in Bulgarian; history (Jabse, Diri.bg) suggests a general-purpose Bulgarian engine alone does not dislodge Google — differentiation must be vertical/feature-led.

### Gaps
- No direct study of Google result quality for Bulgarian-language queries (spam rates, affiliate density, AI-content share) found.
- No academic NLP paper on шльокавица detection/de-transliteration found (web-search budget exhausted before a targeted search).
- Fate/closure dates of Jabse, Diri.bg and Search.bg not found; nothing found on Search.bg.
- No Bulgarian retrieval benchmark (MTEB-style or TREC-style) with scores for Bulgarian embedding models found.
- No verified data on Bulgarian e-government service search (egov.bg) usability or local-business data coverage (Google Maps vs local directories).
- Current number of chains reporting to kolkostruva.bg and whether an open API/data feed exists not verified.
