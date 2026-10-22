# How web-scale search engines work: architecture, ranking, retrieval SOTA, open-source building blocks (as of October 2026)

Evidence labels used throughout:
- **[COURT]**: findings of fact in the US v. Google memorandum opinions, citing sworn testimony and trial exhibits. This is the strongest public evidence on Google internals.
- **[OFFICIAL]**: the company's own docs, blogs or papers.
- **[LEAK]**: leaked documents. Authentic, but they lack weights and context.
- **[SECONDARY]**: SEO and trade press, vendor marketing, aggregators.

Primary court documents (read in full text for these notes):
- Liability opinion, ECF 1033, 5 Aug 2024: https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf
- Remedies opinion, ECF 1436, 2 Sep 2025: https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf

Research limit: the session's shared WebSearch quota ran out partway through. Later facts were collected only by fetching known primary URLs directly. Some sub-questions are therefore marked as gaps rather than answered from memory.

## 1. Pipeline: crawling, rendering, dedup and canonicalization, indexing, tiering, serving, latency

### Takeaway
Court records and Google's docs confirm the overall funnel. Google crawls "trillions" of pages, and de-duplication cuts ~1 trillion extracted links to ~100 billion URLs processed for possible indexing. The index is split into freshness tiers, and the fresher tiers are rebuilt more often. Retrieval narrows candidates to tens of thousands, cheaper signals score them down to hundreds, and ML ranking produces the top ~10. Crawling follows RFC 9309 robots.txt plus adaptive per-host politeness ("crawl budget"). Pages are rendered by an evergreen headless Chromium (WRS). Serving latency targets have been under 200 ms on average since at least 2009, and delays of 100–400 ms measurably reduce usage.

### Cited Findings
**Crawling and URL frontier**
- [COURT] Giannandrea testified that "step one [of] building a general search engine would be to take a copy of as much of the web as you can". A crawling bot "starts with a list of websites", crawls their HTML, extracts links and "recursively crawls them". Search engines "constantly recrawl the web to index new content" (Liability Op. ¶28) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- [COURT] User data sets crawl order and frequency. Popularity decides which sites to crawl, and popular sites such as the New York Times "are worth crawling more often". Nayak: engines "need to know how to recrawl [sites] to make sure that [they] do at all times have a reasonably fresh copy of the web" (¶91) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- [COURT] Reid (remedies phase): "Google starts by crawling trillions of web pages." Many of those pages are spam or duplicates. Google scores the crawled pages and tries to exclude spam-heavy or pornographic pages that have no value to users — [ECF 1436, p.137](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- [COURT] Exhibit RDX0062: "[d]e-duplication" allows Google to "reduce the 1 trillion web links" that it extracts to the "100 [billion]" that it processes for possible indexing — [ECF 1436, pp.148–149](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- [COURT] Quality, popularity and spam-score signals decide how often Google recrawls pages. The court notes that the record "does not establish the extent to which the spam score involves user-interaction data" (fn.17) — [ECF 1436, p.138](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- [OFFICIAL] "Googlebot uses an algorithmic process to determine which sites to crawl", and how often. Server responses throttle it, and HTTP 500 errors mean "slow down". Not every discovered page is crawled — [Google Search Central: How Search works](https://developers.google.com/search/docs/fundamentals/how-search-works)
- [OFFICIAL] Crawl budget is "the set of URLs that Google can and wants to crawl". It is the product of two things:
  - a **crawl capacity limit**, which rises with stable response times and falls on 5xx or HTTP 429;
  - **crawl demand**, driven by perceived inventory, popularity and staleness.

  Each hostname is a separate site. Every site starts with the same conservative capacity limit. The budget only matters for roughly 1M+ page sites that change weekly, or 10k+ page sites that change daily ("not exact thresholds") — [Google: crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget)
- [OFFICIAL] RFC 9309 (Robots Exclusion Protocol) has been on the IETF Standards Track since September 2022. Authors: Koster, Illyes, Zeller, Sassman (the last three at Google). Main rules:
  - parsers should handle at least 500 KiB;
  - caching beyond 24 h is discouraged;
  - 4xx means the file is "unavailable", and the crawler may fetch anything;
  - 5xx means "unreachable", and the crawler must assume complete disallow, for roughly 30 days;
  - the most specific (longest) match wins.

  — [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html)
- [OFFICIAL/SECONDARY] In March 2026 Google published "Inside Googlebot: demystifying crawling, fetching, and the bytes we process" ([post](https://developers.google.com/search/blog/2026/03/crawler-blog-post); the body could not be extracted). Trade coverage of the post and the updated docs reports three limits:
  - Googlebot for Search fetches only the **first 2 MB** of an HTML file, headers included, and ignores bytes past the cutoff (not fetched, rendered or indexed);
  - **64 MB** for PDFs;
  - a **15 MB** platform default for crawlers that set no limit.

  Google says the limits did not change; only the docs became more precise — [ppc.land](https://ppc.land/google-rewrites-googlebots-rulebook-2mb-limits-ip-moves-and-what-crawlers-really-are/), [DebugBear](https://www.debugbear.com/blog/googlebot-crawler-file-size-limit), [Search Engine Land](https://searchengineland.com/google-explains-how-crawling-works-in-2026-473110)
- [OFFICIAL] CCBot (Common Crawl) is "Nutch-based" and runs on Hadoop. It obeys robots.txt and Crawl-delay, defaults to "a few seconds" between requests to the same site, follows up to 4 redirects, and backs off 24 h from blocked IPs — [Common Crawl FAQ](https://commoncrawl.org/faq)

**JS rendering (Web Rendering Service)**
- [OFFICIAL] JavaScript is processed in three phases: crawling, rendering and indexing. Every HTTP 200 page goes into a render queue unless robots meta/header says noindex. The page "may stay on this queue for a few seconds, but it can take longer than that". An evergreen headless Chromium renders it, and links are re-extracted from the rendered HTML. Other rules:
  - JS from blocked files is not run;
  - with `noindex`, Google "may skip rendering";
  - WRS "may ignore caching headers";
  - Google recommends SSR or pre-rendering because "not all bots can run JavaScript".

  — [Google JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [OFFICIAL] Google runs JavaScript with "a recent version of Chrome" during crawling — [How Search works](https://developers.google.com/search/docs/fundamentals/how-search-works)

**Deduplication and canonicalization**
- [OFFICIAL] Google clusters pages with similar content and picks the most representative one as canonical ("the page that may be shown in search results"). It stores canonical-level signals such as language, country and usability. "Indexing isn't guaranteed" — [How Search works](https://developers.google.com/search/docs/fundamentals/how-search-works)
- [OFFICIAL] Manku, Jain and Das Sarma (WWW 2007) showed that Charikar's simhash works for near-duplicate detection. "For a repository of 8B webpages, 64-bit simhash fingerprints and k = 3 are reasonable": 8B fingerprints take 64 GB, and k is the Hamming distance — [Google Research PDF](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/33026.pdf)
- [COURT] The remedies opinion orders a one-time disclosure of index data to Qualified Competitors, which shows what Google's index records per document:
  - a unique **DocID**, with a notation marking duplicates;
  - a DocID→URL map;
  - when the URL was first seen;
  - when it was last crawled;
  - the **spam score**;
  - a **device-type flag**.

  The order excludes the crawled content and the ranking signals — [ECF 1436, pp.144–149](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)

**Inverted index, tiering, storage**
- [COURT] "Google divides its index into tiers. Each page is assigned to a tier based on how fresh it needs to be, and the fresher tiers are rebuilt more frequently" (Oard testimony, ¶92). Click data is "not particularly important for indexing", but query data is, because the index must cover frequently entered queries (Giannandrea) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- [COURT] An internal Google document (PXR0185) quoted in the remedies opinion describes Docjoins, Google's URL/document store: "a large repository of the documents publicly available on the web and visited at least once by Googlebot in the last few months. It currently consists of over [REDACTED] documents … By comparison, the external Common Crawl corpus is much smaller, with only a bit over 3 B in the latest release." Docjoins also feeds the Google Common Corpus used to pre-train Gemini — [ECF 1436, p.29](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- [OFFICIAL] The Google index is "a large database hosted on thousands of computers" — [How Search works](https://developers.google.com/search/docs/fundamentals/how-search-works)
- [OFFICIAL] Jeff Dean (WSDM 2009 keynote) compared 1999 with 2009:
  - documents grew from ~70M to "many billion" (~100×);
  - queries per day grew ~1000×;
  - per-document information in the index grew ~3×;
  - update latency went from "months to minutes" (~10000×);
  - average query latency went from <1 s to <0.2 s (~5×);
  - "more machines * faster machines" gave ~1000×.

  — [WSDM09 keynote](https://static.googleusercontent.com/media/research.google.com/en//people/jeff/WSDM09-keynote.pdf)

**Query serving funnel and latency budgets**
- [COURT] Nayak: retrieval "narrows the volume of responsive links to tens of thousands, as opposed to millions". The engine then decides which results are worth scoring more finely, and scores "those hundreds of sites to determine which top 10 or so should be surfaced" (¶31, Tr. 6331–6332) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- [COURT] In 2017, Google found that for certain popular queries the SERP took >3 s to load 25% of the time. Bing was "dramatically faster": its first result arrived sooner 98% of the time, about 300 ms ahead. Google responded with "Project Folly" to cut latency, which the court says succeeded (¶137) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- [OFFICIAL] Google's 2009 experiment added 100–400 ms of server delay and cut searches per user by 0.2%–0.6%. After 6 weeks at +400 ms, users still searched 0.21% less in the 5 weeks after the delay was removed — [Google Research "Speed matters"](https://research.google/blog/speed-matters/)
- [COURT] Google grounds Gemini with **FastSearch**, built on RankEmbed signals. It returns abbreviated ranked results faster than Search because it retrieves fewer documents, at lower quality than fully ranked results (¶44) — [ECF 1436](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)

### Inferences
- The confirmed funnel has five stages: crawl trillions → de-dup to ~100B candidates → tiered index of "hundreds of billions" → tens of thousands retrieved per query → hundreds scored → ~10 shown. This is the standard multi-stage cascade, and a small team can copy its shape at 3–5 orders of magnitude smaller scale.
- Freshness tiers suggest designing separate small, frequently rebuilt indexes (news, hot hosts) alongside a large, rarely rebuilt base index.
- Since the 2 MB cut and render-queue delays are confirmed, an independent crawler should parse raw HTML first and render JS only selectively. Rendering everything is expensive, and even Google queues it.

### Gaps
- No public source gives Google's per-stage latency budget (retrieval vs. ranking vs. SERP assembly), nor current hardware counts or data-centre totals. The 2009 "<0.2 s average" figure is the latest official number found.
- Shard counts, replication factors and posting-list compression used today in Google or Bing production are not public. Only historical papers exist, and these were not fetched in this session.
- The body of the March 2026 "Inside Googlebot" post could not be extracted, so the 2 MB / 64 MB / 15 MB figures rest on secondary coverage of it.

## 2. Index sizes: Google, Bing, Brave, Mojeek, Common Crawl, OWI; how many pages are worth indexing

### Takeaway
Google's index is officially "hundreds of billions of webpages" and "well over 100,000,000 gigabytes". Nayak tentatively agreed in 2023 that it was about 400 billion documents in 2020. Other confirmed sizes:

| Index | Size | Date / source |
|---|---|---|
| Brave | ~40B pages | Feb 2026 |
| Open Web Index (EU) | >9B pages | Apr 2026 |
| Mojeek | 6B pages | Oct 2022, latest stated |
| Common Crawl | ~2.1–2.3B pages per monthly crawl | 2026 |
| Marginalia | ~107M documents | 2022, deliberately small |

Bing has published no index size. Google stresses that, given heavy duplication, "comprehensive" matters more than "bigger".

### Cited Findings
- [OFFICIAL] "The Google Search index covers hundreds of billions of webpages and is well over 100,000,000 gigabytes in size." — [Google How Search Works: Organizing information](https://www.google.com/search/howsearchworks/how-search-works/organizing-information/)
- [COURT/SECONDARY] Nayak testified in October 2023. Asked "In 2020, the index was about 400 billion documents; is that right?", he answered "I don't know the specific number, but maybe." He also acknowledged a period when the number came down. He said "size isn't everything" because of web duplication: Google's goal is a "comprehensive index", and "bigger is not necessarily better" — [Zyppy](https://zyppy.com/seo/google-index-size/), [Search Engine Land](https://searchengineland.com/how-google-search-ranking-works-pandu-nayak-435395), [Search Engine Journal](https://searchenginejournal.com/google-search-vp-defends-practices-as-antitrust-trial-progresses/498806)
- [COURT] Plaintiffs pointed to "a period of stagnation and decline in Google's index size" as quality degradation. The court was "not persuaded" this showed degraded quality — [ECF 1033, p.~250](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- [COURT] "Today, only Google and Bing create fulsome web search indexes that generate accessible results." DuckDuckGo indexes portions of the web for its own "modules". Apple keeps an index of about [REDACTED] billion websites but did not then plan to use it for a results page (¶29) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- [COURT] A Google exhibit (DX429) rates Bing "25 times worse than Google regarding not-in-index issues" — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- [COURT] Google's Docjoins store holds "over [REDACTED] documents" visited by Googlebot in the last few months. Common Crawl is "much smaller, with only a bit over 3 B in the latest release" — [ECF 1436, p.29](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- [OFFICIAL] Brave (24 Feb 2026): "40 billion Web pages". It adds or refreshes ">100 million pages each day", serves "billions of weekly API calls", and has "no intermediate calls to other indexes". The post also says Microsoft shut down the public Bing Search API in August 2025 — [Brave blog](https://brave.com/blog/search-api-growth/). Brave's older API guide says "over 30 billion pages" — [Brave API guide](https://brave.com/search/api/guides/what-sets-brave-search-api-apart/). Brave Search reached 1.6B monthly searches in September 2025 — [Wikipedia](https://en.wikipedia.org/wiki/Brave_Search)
- [OFFICIAL] Mojeek (UK, launched 2004, own crawler): 5B pages in March 2022 and 6B in October 2022, the most recent stated figure — [Mojeek blog](https://blog.mojeek.com/2022/03/five-billion-pages.html), [Wikipedia](https://en.wikipedia.org/wiki/Mojeek)
- [OFFICIAL] Common Crawl CC-MAIN-2026-34 (7–20 Aug 2026): **2.14B pages**, 360 TiB uncompressed, 0.7B URLs not in earlier crawls, 40.2M hosts, 33.1M registered domains — [Common Crawl Aug 2026](https://commoncrawl.org/blog/august-2026-crawl-archive-now-available). Earlier 2026 crawls:

  | Crawl | Pages | Uncompressed |
  |---|---|---|
  | June | 2.10B | 354.59 TiB |
  | May | 2.16B | 365.56 TiB |
  | April | 2.19B | 379.2 TiB |
  | February | ~2.1B | 363 TiB |

  Sources: [Jun](https://commoncrawl.org/blog/june-2026-crawl-archive-now-available), [May](https://commoncrawl.org/blog/may-2026-crawl-archive-now-available), [Apr](https://blog.commoncrawl.org/blog/april-2026-crawl-archive-now-available), [Feb](https://commoncrawl.org/blog/february-2026-crawl-archive-now-available). Since April 2026 the data is also distributed through Hugging Face storage alongside S3 (same April post).
- [OFFICIAL] OpenWebSearch.eu Open Web Index (LRZ, 21 Apr 2026): ">9 billion web pages in 185 languages" crawled, about 1,330 TiB of indexed content, at roughly 100 million URLs per day. Fourteen organisations from seven countries took part, using several European HPC centres. OWI is publicly accessible at openwebindex.eu — [LRZ](https://www.lrz.de/en/news/detail/online-search-services-for-europe). The pilot OWI was released 6 June 2025 under a general research license — [HPCwire](https://www.hpcwire.com/?p=181234). The project officially ended 28 Feb 2026 and continues as the "European Open Web Search" initiative — [openwebsearch.eu](https://openwebsearch.eu/2026/04/)
- [OFFICIAL] ClueWeb22, an academic corpus, has 10 billion web pages "aligned with the document distributions in commercial web search" — [arXiv 2211.15848](https://arxiv.org/abs/2211.15848)
- [OFFICIAL] Marginalia reached 106,857,244 documents in 2022; the author called it "probably more than good enough" — [Marginalia log](https://www.marginalia.nu/log/64-hundred-million/)

### Inferences
- How many pages are "worth indexing": the confirmed ratios are ~1T extracted links → ~100B processed, and a few hundred billion indexed with heavy tiering. So even Google treats most discovered URLs as low-value or duplicate.
- Each 2026 Common Crawl adds only ~0.7B new URLs on top of ~2.1B pages. A union of many crawls gives a usable 5–10B unique-page seed, about OWI's size, without running a crawler.
- For a small team, 100M–1B well-chosen pages (the Marginalia/Mojeek range) is a realistic first target. National or language-specific vertical indexes, e.g. Bulgarian, are far smaller still. This is an inference, not a sourced figure.

### Gaps
- No official Bing index size has been published; the court opinions are silent or redacted on it. The Apple index size and the Docjoins document count are redacted in the opinions.
- No current (2025–2026) Google index figure beyond "hundreds of billions" was found.
- No Mojeek figure after October 2022 was found. Marginalia's current count is unverified; one archive page claims 300–400M without a source.
- No authoritative estimate was found for the size of the "indexable/valuable" web.

## 3. What is publicly known about Google ranking, the leaks, Yandex, and Bing

### Takeaway
Sworn testimony confirms a mix of hand-built signals and ML. Older "memorization" systems include Navboost (click memorization over 13 months of logs) and QBST. Newer "generalization" models include RankBrain, DeepRank, RankEmbed(BERT) and MUM, all still trained partly on user data and human-rater scores. Glue is a "super query log" of all SERP interactions.

Google's official ranking-systems guide confirms PageRank, BERT, MUM (limited uses), neural matching, SpamBrain and other systems. Helpful content was merged into the core systems in March 2024, and site-reputation-abuse enforcement began 5 May 2024.

Other evidence:
- The 2024 Content Warehouse leak (2,596 modules, 14,014 attributes) is authentic but has no weights.
- The 2023 Yandex leak listed 1,922 factors, including click/behaviour signals and BM25.
- Bing has run transformer models on every query since 2019, a 135B-parameter sparse "MEB" model, and Prometheus (GPT plus the Bing index) for Copilot. IndexNow is Bing's push-indexing protocol.

### Cited Findings
**Signals confirmed under oath [COURT]**
- QBST (Query-based Salient Terms) identifies words that "should appear prominently on web pages that are relevant to that query". It is a "memorization system", "trained on about 13 months of user data" (Lehman, ¶95) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- Navboost "pairs queries and documents through memorizing user click data". It was trained on 18 months of data before 2017 and on 13 months since (Nayak). Thirteen months of Google data equals "over 17 years" of Bing data (¶96). Giannandrea said NavBoost "was considered very important". An internal document says "Navboost remains one of the most power[ful] ranking components historically" (¶102) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- The remedies opinion puts the multiplier more precisely: Google gets 9× more queries than all rivals combined (19× on mobile). Thirteen months of Google click-and-query data is "the equivalent of over 17.5 years of Bing data" — [ECF 1436](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- RankBrain, DeepRank, RankEmbed, RankBERT and MUM are "generalization" systems that "may not be so good at memorizing facts, but they're really good at understanding language". They are "designed to fill holes in [click] data". Older signals use "up to 1 trillion examples" and newer ones "only 1 billion" (¶¶97–98). Internal document UPX226: "Learning from this user feedback is perhaps the central way that web ranking has improved for 15 years." — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- MUM "achieved essentially human-level performance" on newer scoring metrics, where RankBERT "exhibited fairly weak performance". MUM is trained on a subset of the web corpus plus some click data. LaMDA, PaLM and PaLM2 "were not built with user data". LLM signals "did not replace Navboost and QBST" and are "additional signals that get balanced both against each other as well as against other signals". Navboost can beat LLMs on freshness (¶¶99–103) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- Glue is a "super query log". It holds four kinds of data:
  - the query: text, language, location, device;
  - ranking information: the 10 blue links plus triggered features such as images, maps, Knowledge Panel and People Also Ask;
  - SERP interaction: clicks, hovers, duration;
  - query interpretation: spelling correction, salient terms.

  Nayak: "Glue is just another name for [N]avboost that includes all of the other features on the page." Navboost "can be thought of as 'just a giant table'" — [ECF 1436, p.153](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- RankEmbed and its later version RankEmbedBERT rely on two data sources: "[REDACTED]% of 70 days of search logs plus scores generated by human raters". It is "embedding based retrieval … effective at semantic matching", helped especially with long-tail queries, and is "trained on 1/100th of the data used to train earlier ranking models yet provides higher quality search results" — [ECF 1436, pp.153–154](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- Signals range from "raw" counts, e.g. how many times a page was clicked for a query (the Navboost type), to deep models (RankEmbedBERT). Signals are aggregated into "top-level" signals that feed the final score. Top-level signals include page **quality** and **popularity**, and RankEmbed — [ECF 1436, pp.137–138](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- [SECONDARY] Nayak said Google has "maybe over a hundred" signals and called the document itself "perhaps" the most important retrieval signal — [Search Engine Land](https://searchengineland.com/how-google-search-ranking-works-pandu-nayak-435395)

**Remedies (data sharing) [COURT]**
- On 2 Sep 2025 the court ordered Google to provide "Qualified Competitors", at marginal cost, with:
  - a one-time Search Index snapshot of DocIDs, URL map, duplicates, first-seen and last-crawled times, spam score and device flag;
  - periodic "User-side Data", namely the data underlying Glue and RankEmbed. The underlying data only, "not the models or signals built from it".

  Chrome divestiture and a payment ban were rejected. A Technical Committee oversees compliance. The judgment runs **six years** and takes effect 60 days after entry. A syndication remedy also exists — [ECF 1436](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf). Privacy measures such as noise and k-anonymity apply before sharing — [ppc.land](https://ppc.land/google-ordered-to-share-glue-data-system-in-landmark-antitrust-ruling/)
- Knowledge Graph: "five billion entities and 500 billion connections among them" (Allan). It is built from structured data, including Google's Geo Index, and from unstructured data — [ECF 1436](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- Plaintiffs' slides: Chrome is the search access point for 35% of Google queries (2024) — [DOJ remedies opening](https://www.justice.gov/atr/media/1397241/dl)
- [SECONDARY] Google appealed and asked to pause the data-sharing remedies — [ppc.land](https://ppc.land/google-appeals-doj-search-ruling-asks-to-pause-data-sharing-remedies/). A 5 Dec 2025 memorandum (ECF 1461) addressed the final-judgment text — [CourtListener](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1461.0_3.pdf) (not read). Knight-Georgetown argues the data remedy was pared down so far that it may be ineffective — [KGI](https://kgi.georgetown.edu/?p=2440)

**Official Google ranking systems [OFFICIAL]**
- The ranking-systems guide (last updated 2025-12-10) lists:
  - BERT; crisis information; deduplication; exact-match-domain; freshness;
  - **link analysis and PageRank** ("still forms part of core ranking");
  - local news; **MUM** (used "not for general ranking", only for specific applications);
  - **neural matching**; original content; removal-based demotion; passage ranking; **RankBrain**;
  - reliable information; reviews; site diversity (generally ≤2 results per site, subdomains counted with the root);
  - spam detection incl. **SpamBrain**.

  Retired systems:
  - Helpful content (2022) became part of core in March 2024;
  - Hummingbird (2013);
  - Panda (2011) went into core in 2015;
  - Penguin (2012) went into core in 2016.

  — [Google ranking systems guide](https://developers.google.com/search/docs/appearance/ranking-systems-guide)
- BERT launched 25 Oct 2019, affecting "one in 10 searches in the U.S. in English", and was served on Cloud TPUs — [Google blog](https://blog.google/products/search/search-language-understanding-bert/). By Oct 2020, "BERT is now used in almost every query in English" — [Google Search On 2020](https://blog.google/products/search/search-on/)
- MUM (18 May 2021) is "1,000 times more powerful than BERT", built on T5, multimodal, and trained across 75 languages — [Google blog](https://blog.google/products/search/introducing-mum/)
- March 2024 core update and spam policies (5 Mar 2024): the target was 40% less low-quality, unoriginal content; Google reported 45% when the rollout completed (update dated 26 Apr 2024) — [Google blog](https://blog.google/products/search/google-search-update-march-2024/). New spam policies:
  - **scaled content abuse**, "whether automation, humans or a combination";
  - **site reputation abuse**, third-party pages "with little or no first-party oversight", enforced from **5 May 2024**;
  - **expired domain abuse**.

  — [Search Central blog](https://developers.google.com/search/blog/2024/03/core-update-spam-policies)
- SpamBrain (2022 report, 11 Apr 2023) detected 5× more spam sites than in 2021 and 200× more than at launch, plus 50× more link-spam sites than the previous link-spam update. Over 99% of visits from Search were spam-free — [Search Central](https://developers.google.com/search/blog/2023/04/webspam-report-2022)

**2024 Content Warehouse API leak [LEAK]**
- An automated bot (`yoshi-code-bot`) pushed internal Content Warehouse API docs to a public Google GitHub repo around 13 Mar 2024 (Apache-2.0). The files were removed 7 May 2024 but had already been indexed by Hexdocs. Erfan Azimi found them; Rand Fishkin published on 27 May and Mike King on 28 May. The docs cover 2,596 modules and 14,014 attributes across Search, YouTube, Assistant, Books and crawl infrastructure. They are protobuf field definitions, not source code, and give no weights.

  Google (Davis Thompson, 29 May 2024) confirmed authenticity and warned against "out-of-context, outdated, or incomplete information". Attributes named in coverage:
  - NavBoost;
  - goodClicks / badClicks / lastLongestClicks;
  - chromeInTotal / chrome_trans_clicks;
  - siteAuthority;
  - hostAge / sandbox-like behaviour;
  - siteFocusScore / siteRadius / site2vecEmbeddingEncoded.

  These were read as contradicting Google's earlier public denials about clicks, a sandbox, domain age and subdomain handling. Analysts stress that the docs do not show which attributes are used or how they are weighted — [Wikipedia](https://en.wikipedia.org/wiki/2024_Google_Search_documentation_leak), [iPullRank](https://ipullrank.com/google-algo-leak), [The Register](https://www.theregister.com/2024/05/29/internal_google_search_documents/)

**2023 Yandex source-code leak [LEAK]**
- In January 2023 a former employee leaked Yandex's repository. Yandex said its systems were not hacked and that the content differs from the current production repository — [Hackread](https://www.hackread.com/yandex-source-code-hacked-leaked/), [Techzine](https://www.techzine.eu/news/security/101200/massive-leak-of-yandex-code-reveals-1922-search-ranking-factors/)
- The code contains **1,922 ranking factors**, with "page rank" listed first (Alex Buraks' analysis) — [Techzine](https://www.techzine.eu/news/security/101200/massive-leak-of-yandex-code-reveals-1922-search-ranking-factors/). Sistrix breaks them down as 999 TG_DEPRECATED, 242 TG_UNUSED, 149 TG_UNIMPLEMENTED and 115 TG_REMOVED, leaving "just 417 active". Named factors:
  - link quality/text/age;
  - user signals (CTR, time on site, bounce, return to SERP);
  - BM25 text relevance and keyword-in-URL;
  - FI_MEDICAL quality factors;
  - Wikipedia favoured;
  - 4xx/5xx errors hurt; HTTPS and speed help.

  Sistrix caveats: findings "do not necessarily apply directly to Google"; "not a confirmation that Google uses them, but a good indication" — [Sistrix](https://www.sistrix.com/blog/yandex-code-leak-reveals-ranking-factors/). LinkResearchTools argues instead that TG_DEPRECATED ≠ unused, which would leave ~1,658 factors potentially active — [LRT](https://linkresearchtools.com/blog/yandex-leak-ranking-factors). Commentary also notes separate morning and evening weights — [Techzine](https://www.techzine.eu/news/security/101200/massive-leak-of-yandex-code-reveals-1922-search-ranking-factors/)

**Bing [OFFICIAL unless noted]**
- Bing started using large transformer (BERT-type) models in April 2019. By Nov 2019 they were "applied to every Bing search query globally". A distilled 3-layer BERT took 77 ms on 20 CPU cores. On an NC6s_v3 VM (Tensor Cores, mixed precision), a 64-inference batch took 6 ms (~800× the CPU throughput). Over 2,000 Azure GPU VMs in four regions served over 1M BERT inferences per second — [Azure blog](https://azure.microsoft.com/en-us/blog/bing-delivers-its-largest-improvement-in-search-experience-using-azure-gpus/)
- MEB ("Make Every feature Binary") is a 135B-parameter sparse network over 200B+ binary query–document features. It runs alongside Transformer models in Bing production — [Microsoft Research](https://www.microsoft.com/en-us/research/blog/make-every-feature-binary-a-135b-parameter-sparse-neural-network-for-massively-improved-search-relevance/)
- Prometheus (21 Feb 2023) combines the "fresh and comprehensive Bing index, ranking, and answers results" with OpenAI GPT reasoning. The **Bing Orchestrator** generates internal queries iteratively, and answers are grounded with per-sentence citations — [Bing blog](https://blogs.bing.com/search-quality-insights/february-2023/Building-the-New-Bing)
- [COURT] Microsoft deposition testimony: "Copilot relies heavily on how Bing is ranking the results … the quality of the Bing index … will determine the ordering of … the citations" — [ECF 1436](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- IndexNow (push URL notification, shared by Bing, Yandex and others; not Google):

  | Date | Metric | Source type |
  |---|---|---|
  | Sep 2023 | 60M+ websites, 1.4B URLs daily | Wikipedia |
  | 2024 | 2.5B URLs submitted daily; 17% of new URLs clicked in Bing | SEL, Wikipedia |
  | Dec 2024 | 3.5B daily; 22% share | secondary, unverified |

  Sources: [Wikipedia](https://en.wikipedia.org/wiki/IndexNow), [Search Engine Land](https://searchengineland.com/bing-webmaster-tools-gains-new-indexnow-insights-top-seo-insights-report-438100), [blckalpaca (secondary)](https://blckalpaca.at/en/knowledge-base/seo-geo/technical-seo/indexnow-35-billion-urls-daily-without-google)

### Inferences
- The court record and the leak converge on one picture: user-interaction memorization (Navboost/Glue), site-level quality and popularity scores, and deep semantic models layered on top. Google's earlier public downplaying of clicks is contradicted by sworn testimony, not just by the leak.
- For a new engine without click data, the generalization route is the realistic path: embeddings, rerankers and rater-labelled data (RankEmbed itself used rater scores). Click memorization only becomes available once traffic exists.
- Both leaks and the court show that classic signals (BM25-type text relevance, PageRank-type links, spam scores, freshness) remain foundational and are not replaced by LLMs.

### Gaps
- Ranking weights, the exact DeepRank scope (the "top 20–30 docs" claim appears only in SEO blogs), "Twiddlers" and "SuperRoot" details were not verified from primary sources in this session.
- The final judgment text (ECF 1461) and the appeal status as of Oct 2026 were not verified.
- No public number exists for Bing's index size or its count of ranking features.
- The 680M-parameter figure for Google's spelling model was not confirmed; the Search On 2020 page does not state it.

## 4. State of the art in retrieval: sparse, learned sparse, dense/ANN, late interaction, hybrid, rerankers, benchmarks, Bulgarian

### Takeaway
BM25 is still a strong zero-shot baseline. Learned sparse retrieval (SPLADE-v3: >40 MRR@10 on MS MARCO), late interaction (ColBERTv2/PLAID) and cross-encoder or LLM rerankers give the best quality at higher cost. Dense retrieval rests on ANN indexes:
- HNSW for in-RAM search;
- DiskANN for billion-scale search on a single SSD node (<3 ms, >5k QPS, 95% recall@1);
- IVF-PQ for heavy compression.

MMTEB (500+ tasks, 250+ languages) found multilingual-e5-large-instruct (560M) the best public model. Qwen3-Embedding-8B topped MTEB-Multilingual in June 2025. For Bulgarian specifically, a 2026 study ranks llama-embed-nemotron-8b and multilingual-e5-large-instruct top, with Qwen3-Embedding-8B second tier, but notes that the Bulgarian evidence base is thin.

### Cited Findings
- [OFFICIAL] BEIR (NeurIPS 2021 D&B) evaluated 10 systems on 18 datasets. BM25 is "a robust baseline". Re-ranking and late-interaction models give the best zero-shot results "at high computational cost". Dense and sparse retrievers are cheaper but "often underperform" out of domain — [arXiv 2104.08663](https://arxiv.org/abs/2104.08663)
- [OFFICIAL] MS MARCO has ~8.8M passages and ~3.2M documents, with 1M+ queries. It was the basis of the TREC Deep Learning tracks in 2019 and 2020. Its ranking leaderboards are marked "retired" (end date 1 Jan 2023), though the page also says submissions continue — [MS MARCO](https://microsoft.github.io/msmarco/)
- [OFFICIAL] SPLADE-v3 (11 Mar 2024) scores ">40 MRR@10 on the MS MARCO dev set" and improves BEIR out-of-domain results by 2%. It is reported as significantly better than BM25 and SPLADE++ and as comparing well to cross-encoder rerankers — [arXiv 2403.06789](https://arxiv.org/abs/2403.06789)
- [OFFICIAL] ColBERTv2 (NAACL 2022) uses residual compression to cut the late-interaction index footprint by 6–10× while keeping SOTA quality in and out of domain — [arXiv 2112.01488](https://arxiv.org/abs/2112.01488)
- [OFFICIAL] PLAID speeds up ColBERTv2 search by up to 7× on GPU and 45× on CPU. Latency is "tens of milliseconds" on GPU and tens to a few hundred ms on CPU, tested at up to 140M passages — [arXiv 2205.09707](https://arxiv.org/abs/2205.09707)
- [OFFICIAL] HNSW (Malkov & Yashunin, 2016/2018) is a hierarchy of proximity graphs with "logarithmic complexity scaling". It strongly outperformed earlier open-source vector-only methods — [arXiv 1603.09320](https://arxiv.org/abs/1603.09320)
- [OFFICIAL] DiskANN (NeurIPS 2019) handles SIFT1B (1B points) on one 64 GB RAM workstation with an inexpensive SSD. It serves ">5000 queries a second with <3ms mean latency and 95%+ 1-recall@1". FAISS/IVFOADC+G+P at a similar memory footprint plateau at ~50% recall@1. In the high-recall regime it handles 5–10× more points per node than HNSW or NSG — [Microsoft Research](https://www.microsoft.com/en-us/research/publication/diskann-fast-accurate-billion-point-nearest-neighbor-search-on-a-single-node/)
- [COURT] Google uses embedding-based retrieval in production: RankEmbed, "effective at semantic matching of docs and queries" — [ECF 1436](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf). Bing runs GPU-served transformers on every query — [Azure blog](https://azure.microsoft.com/en-us/blog/bing-delivers-its-largest-improvement-in-search-experience-using-azure-gpus/)
- [OFFICIAL] MMTEB (arXiv, Feb 2025, revised Nov 2025) has >500 quality-controlled tasks in >250 languages, including instruction-following, long-document and code retrieval. "The best-performing publicly available model is multilingual-e5-large-instruct with only 560 million parameters" — [arXiv 2502.13595](https://arxiv.org/abs/2502.13595)
- [OFFICIAL] Qwen3-Embedding-8B scored 70.58 mean and ranked **No.1 on MTEB multilingual as of 5 June 2025**. It has a 32K context, embedding dimensions from 32 to 4096 (MRL), 100+ languages and an Apache-2.0 license. Companion rerankers Qwen3-Reranker come in 0.6B, 4B and 8B sizes, all with 32K context — [Hugging Face model card](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
- [OFFICIAL] BGE-M3 (M3-Embedding) supports "more than 100 working languages" and inputs "up to 8,192 tokens". It does dense, sparse (lexical) and multi-vector retrieval from one model — [arXiv 2402.03216](https://arxiv.org/abs/2402.03216). [SECONDARY via search snippet] BGE-M3 reports nDCG@10 ≈ 70.0 on MIRACL (all modes) vs ≈65.4 for mE5 (self-reported)
- [OFFICIAL] Multilingual-E5 averages 64.4 (large-instruct) and 61.5 (large) on MTEB's 56 English-heavy datasets, with 512-token context — [arXiv 2402.05672](https://arxiv.org/pdf/2402.05672)
- [OFFICIAL] EmbeddingGemma (4 Sep 2025) has 308M parameters, 100+ languages, a 2K context, and runs in under 200 MB RAM when quantized. Google calls it "the highest ranking open multilingual text embedding model under 500M" on MTEB — [Google Developers blog](https://developers.googleblog.com/en/introducing-embeddinggemma/)
- [OFFICIAL] Bulgarian evidence (Gjorgjevikj, Koroušić Seljak, Eftimov, arXiv, 25 Aug 2026; Slavic subset of MTEB):
  - Bulgarian has MTEB data for 7 of 8 task types, but many tasks rest on a **single dataset**.
  - Cross-task consistency ranking for Bulgarian: **llama-embed-nemotron-8b** (CW 0.55) and **multilingual-e5-large-instruct** (CW 0.53) lead; Qwen3-Embedding-8B is next (0.42), then Octen-Embedding-8B (0.32), Qwen3-Embedding-4B (0.28) and e5-mistral-7b-instruct (0.26). Evidence strength is "moderate" (ESS 0.29).
  - On the retrieval task alone, Qwen3-Embedding-8B is the most transfer-consistent model for Bulgarian, but on a single dataset (ESS 0.30).
  - The authors call "benchmark scarcity … a major obstacle to trustworthy multilingual evaluation".

  — [arXiv 2608.24477](https://arxiv.org/abs/2608.24477)
- [SECONDARY] Blog snapshots of the MTEB leaderboard disagree. English NV-Embed-v2 is cited at ~72.3 and gemini-embedding-001 at 68.32 overall (67.71 retrieval, 2,048-token input limit). Blogs warn that the MTEB average is unweighted, that retrieval is scored with nDCG@10 over 15 datasets, and that some models train on data overlapping MTEB — [PremAI](https://blog.premai.io/best-embedding-models-for-rag-2026-ranked-by-mteb-score-cost-and-self-hosting), [Modal](https://frontend.modal.com/blog/mteb-leaderboard-article)
- [OFFICIAL] Vendor guidance from Vespa's Perplexity page describes the production pattern: multi-stage ranking with lightweight first-phase ranking, then neural models and cross-encoders on top candidates, with hybrid keyword + semantic retrieval and structured filters — [Vespa: Perplexity](https://vespa.ai/perplexity/)

### Inferences
- The best small-team stack is a cascade:
  1. BM25 or SPLADE plus dense ANN (HNSW in RAM, or DiskANN/IVF-PQ on SSD) as hybrid first stage, fused with e.g. RRF;
  2. a cheap learned or GBDT ranker over a few hundred candidates;
  3. a cross-encoder or small LLM reranker (e.g. Qwen3-Reranker-0.6B, bge-reranker class) over the top 20–100.

  This mirrors the confirmed Google funnel: tens of thousands → hundreds → 10.
- For Bulgarian, multilingual-e5-large-instruct (560M, cheap) is the safest open default. Qwen3-Embedding-8B and llama-embed-nemotron-8b are higher-cost options. Teams should build their own small Bulgarian relevance set, given the documented evidence scarcity.
- Late interaction gives top quality but multiplies index size. Even with ColBERTv2's 6–10× compression, it is better as a reranker than a web-scale first stage.

### Gaps
- No live MTEB/MMTEB leaderboard snapshot for October 2026 was retrieved; the leaderboard is dynamic. Current #1 models are not verified.
- No primary head-to-head BGE-M3 vs. mE5 numbers on a Bulgarian retrieval dataset were found.
- Cross-encoder and LLM reranker latency and cost figures (RankGPT, monoT5, commercial rerankers) were not fetched, because the search quota ran out.
- No primary source was fetched for IVF-PQ (FAISS) memory and recall trade-offs beyond the DiskANN comparison.

## 5. Open-source building blocks and proven scale

### Takeaway
Proven production-scale engines:
- Lucene, under Elasticsearch, OpenSearch and Solr;
- Vespa, at Yahoo with ~800k QPS across ~150 apps; Perplexity partnered with Vespa in April 2025, but Vespa's own page says Perplexity later moved its web index to an in-house system;
- Tantivy/Quickwit, with petabyte-scale log search (Quickwit joined Datadog in January 2025 and was relicensed Apache-2.0).

Crawlers: StormCrawler, Nutch (Common Crawl's CCBot is Nutch-based) and Heritrix (Internet Archive). Open data: Common Crawl (~2.1B pages/month) and OWI (>9B pages). Independent engines with open code: Marginalia (Java, ~100M docs) and Stract (Rust, AGPL, activity low since 2024). YaCy is P2P. Wikidata (~124M items) can seed a knowledge graph.

### Cited Findings
- [OFFICIAL] Apache Lucene is the "Ultra-fast Search Library" at the core of Solr, Elasticsearch and OpenSearch (Apache-2.0). The latest listed release is Lucene **10.5.2**, dated "04.Oct" (year not shown; presumably 2026) — [lucene.apache.org](https://lucene.apache.org/)
- [OFFICIAL] Tantivy is a Rust full-text library "inspired by Apache Lucene", MIT-licensed, with BM25, phrase queries, facets, mmap and multithreaded indexing. Its own benchmark puts it at "approximately 2x faster than Lucene", depending on queries. Users include Etsy, ParadeDB and Nuclia — [GitHub tantivy](https://github.com/quickwit-oss/tantivy)
- [OFFICIAL] Quickwit (built on Tantivy) joined Datadog on 9 Jan 2025, and Quickwit and Tantivy were to be relicensed Apache-2.0. Binance built a 100 PB log service on it, indexing 1.6 PB/day — [Quickwit blog](https://quickwit.io/blog/quickwit-joins-datadog)
- [OFFICIAL] Vespa:
  - 2017 open-sourcing: almost 90,000 content/ad serves per second with latencies in tens of ms; Flickr search over tens of billions of images — [SiliconANGLE](https://siliconangle.com/2017/09/26/yahoo-open-sources-vespa-important-software-release-since-hadoop/)
  - 2023 spin-out from Yahoo: ~150 Yahoo applications, ~800,000 QPS, nearly 1B users; centralizing on Vespa cut machine count by 90% — [Vespa blog](https://blog.vespa.ai/vespa-is-becoming-its-own-company/), [TechCrunch](https://techcrunch.com/2023/10/04/yahoo-spins-out-vespa-its-search-tech-into-an-independent-company/)
- [OFFICIAL/SECONDARY] Perplexity partnered with Vespa in April 2025 to bring search in-house. Perplexity then served >15M monthly users and >100M queries/week — [BusinessWire](https://www.businesswire.com/news/home/20250415258066/en). Vespa's current Perplexity page cites 780M+ queries/month but says "Perplexity moved its web index to a purpose-built internal search system and still uses Vespa for other use cases" — [Vespa: Perplexity](https://vespa.ai/perplexity/). A Vespa engineering post says indexes for such systems run to "hundreds of millions to billions of documents, with tens of vector embeddings each" (general, not Perplexity-specific) — [Vespa blog](https://blog.vespa.ai/perplexity-show-what-great-rag-takes/)
- [OFFICIAL] Apache StormCrawler is an ASF SDK for distributed crawlers on Apache Storm, "low-latency, scalable and polite". It is Java, Apache-2.0, at release v3.7.0, and "in production since 2014" — [stormcrawler.apache.org](https://stormcrawler.apache.org/)
- [OFFICIAL] Heritrix is "the Internet Archive's open-source, extensible, web-scale, archival-quality web crawler" (Java, Apache-2.0, WARC archiving) — [GitHub heritrix3](https://github.com/internetarchive/heritrix3)
- [OFFICIAL] Common Crawl's CCBot is a "Nutch-based web crawler" using Hadoop — [Common Crawl FAQ](https://commoncrawl.org/faq). The 2026 crawls are ~2.1–2.2B pages each (see §2).
- [OFFICIAL] OpenWebSearch.eu OWI: >9B pages in 185 languages, ~1,330 TiB, built on European HPC centres; the project ended Feb 2026 and continues as the European Open Web Search initiative (see §2) — [LRZ](https://www.lrz.de/en/news/detail/online-search-services-for-europe), [openwebsearch.eu](https://openwebsearch.eu/2026/04/)
- [OFFICIAL] Marginalia Search:
  - own crawler and index, open source;
  - 106.9M documents in 2022 — [Marginalia log](https://www.marginalia.nu/log/64-hundred-million/);
  - runs on a 32 GB machine "possibly smaller", with SSD storage scaling by index size — [Marginalia docs](https://docs.marginalia.nu/1_overview/01_hardware/);
  - release v2024.10.0 added a position index for phrase matching and a new on-disk format ("Slop") that cut index construction time ~80% in production — [release notes](https://www.marginalia.nu/release-notes/v2024-10-0/);
  - source: [GitHub](https://github.com/MarginaliaSearch/MarginaliaSearch).
- [OFFICIAL] Stract is an independent open engine with its own crawler and index, written mostly in Rust under AGPL-3.0. It supports `site:` and `intitle:` operators and "optics" re-ranking, and was funded by NLnet NGI0 Entrust — [GitHub](https://github.com/StractOrg/stract). It started as a DTU master's thesis — [404 Media](https://www.404media.co/this-guy-is-building-an-open-source-search-engine-in-real-time/). [SECONDARY] The last notable repository activity seen was around March 2024.
- [OFFICIAL] YaCy is free software for a P2P decentralized web index, standalone portals or intranet search; no scale figures are published — [yacy.net](https://yacy.net/)
- [OFFICIAL] Wikidata has "123,690,525 items" and 2.56B edits (page as last edited) — [Wikidata:Statistics](https://www.wikidata.org/wiki/Wikidata:Statistics). For comparison, Google's Knowledge Graph has 5B entities and 500B connections — [ECF 1436](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- [OFFICIAL] Brave runs its own independent index (40B pages) and sells it as an API, after Microsoft shut down the public Bing API in August 2025 — [Brave blog](https://brave.com/blog/search-api-growth/)

### Inferences
- A pragmatic European small-team stack:
  1. Seed URLs and content from Common Crawl and OWI.
  2. Recrawl and freshness with StormCrawler or Nutch, obeying RFC 9309.
  3. Run the index on Vespa (hybrid BM25 + vectors + multi-phase ranking in one system), or on OpenSearch/Elasticsearch, or on Tantivy for a lean Rust core.
  4. Build entity and knowledge features from Wikidata.

  Marginalia shows that one person with modest hardware can run an independent ~100M-doc engine.
- Perplexity moving its web index off Vespa suggests that at very large, AI-native scale, teams still build custom systems. Vespa or Lucene suffice up to the low billions of documents.

### Gaps
- Current Elasticsearch, OpenSearch and Vespa versions and published benchmark scale numbers for 2026 were not fetched.
- Apache Nutch release status and Heritrix's latest version were not verified.
- No primary source was found on Stract's 2025–2026 status or index size.
- Whether OWI data is available in specific formats (CIFF, Parquet) and under what license was not confirmed in the sources fetched.

## 6. Query understanding: spelling, rewriting, entity linking, knowledge graphs, verticals, freshness

### Takeaway
Court findings confirm that Google's query-understanding layer covers spelling correction, synonym annotation, multi-word concept marking, related-term generation, QBST, query clustering and segmentation. Much of it is learned from query logs and reformulations. Entity understanding rests on a 5B-entity / 500B-connection Knowledge Graph, partly fed by the Geo (local) index. Verticals (images, maps, Knowledge Panel, People Also Ask) are triggered features logged in Glue. Freshness relies on tiered index rebuilds, query-dependent freshness systems, and click memorization (Navboost), which beats LLMs on freshness.

### Cited Findings
- [COURT] Search engines "aim to identify spelling errors, annotate the query with synonyms, mark multi-word concepts, generate terms related to the query, and more". Google uses spelling and synonym functions, QBST, and "semantic tools, such as query clustering and segmentation" (¶30) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- [COURT] User data powers spelling, synonyms and autocomplete. "Reformulation", where a user re-enters a misspelled query, is important for spell check. Google built spelling by "look[ing] at all the ways in which people mis-spell words in queries and text all over the web" (¶93) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- [OFFICIAL] Google's Oct 2020 spelling model uses "a deep neural net" and runs "all in under 3 milliseconds". "One in 10 queries every day are misspelled". Passage understanding "will improve 7 percent of search queries across all languages" — [Google Search On 2020](https://blog.google/products/search/search-on/)
- [COURT] The Knowledge Graph has five billion entities and 500 billion connections. It is used "to help interpret queries and to return factual results" and is built from structured sources (incl. the **Geo Index** of local businesses) and unstructured web pages — [ECF 1436](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- [COURT] Glue logs which SERP features fired, "such as images, maps, Knowledge Panel, People also ask", plus spelling corrections and salient query terms. This makes vertical triggering a learned, logged decision — [ECF 1436, p.153](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- [OFFICIAL] Google lists freshness systems (fresher content when a query calls for it), local news systems, crisis information systems and passage ranking among its ranking systems — [ranking systems guide](https://developers.google.com/search/docs/appearance/ranking-systems-guide)
- [COURT] Navboost-type systems "beat out LLMs (and even generalization systems) in certain aspects of SERP production, like freshness" (¶103). Fresher index tiers are rebuilt more often (¶92) — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf)
- [COURT] AI layer: Pichai agreed that 1.5 billion Search users interact with AI through AI Overviews. Google estimated (28 Mar 2025) the Gemini app at ~140M daily queries and ChatGPT at ~1.2B — [ECF 1436](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- [OFFICIAL] Wikidata (~123.7M items) is the largest open entity base usable as a KG seed — [Wikidata:Statistics](https://www.wikidata.org/wiki/Wikidata:Statistics)

### Inferences
- Without query logs, a new engine should do the following:
  - spell-correct with web-text statistics plus small neural models;
  - link entities against Wikidata;
  - trigger verticals with simple intent classifiers;
  - for freshness, run a small fast-rebuilt "fresh" tier fed by IndexNow, sitemaps and RSS.

  Logs then improve each of these as traffic accrues.

### Gaps
- No primary source was fetched on shopping or news vertical architecture, QDF ("query deserves freshness"), or entity-linking methods in Google or Bing production.
- The 680M-parameter spelling-model figure remains unverified.

## 7. Evaluation: rater guidelines and E-E-A-T, experiment and launch counts, offline and online metrics, TREC

### Takeaway
The current Google Search Quality Rater Guidelines are dated **11 Sep 2025** (182 pages; changelog: Sep 2025, Jan 2025, Feb 2024, Nov 2023). They define Page Quality with E-E-A-T, where "Trust is the most important member", and a Needs Met scale. About 16,000 external raters feed evaluation and model training (e.g. RankEmbed), but ratings do not directly change any page's rank. In 2023 Google ran 719,326 search quality tests, 124,942 side-by-side experiments and 16,871 live-traffic experiments, and made 4,781 launches. Offline IR is scored with nDCG@10 (BEIR, MTEB) and MRR@10 (MS MARCO). TREC 2026 focuses on RAG, LLM auto-judging and user simulation.

### Cited Findings
- [OFFICIAL] The current PDF is titled "General Guidelines September 11, 2025", has 182 pages, and was created 10 Sep 2025. Its changelog:
  - Sep 2025: updated YMYL definitions, added examples;
  - Jan 2025: Lowest/Low Page Quality aligned with web-spam policies, minor-interpretation guidance for Needs Met;
  - Feb 2024: untrustworthy-page characteristics;
  - Nov 2023: simplified Needs Met scale, forum and video examples.

  E-E-A-T is defined in §3.4, and "Trust is the most important member of the E-E-A-T family". The Needs Met scale includes Fully Meets, Highly Meets and lower grades — [Google QRG PDF](https://static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf)
- [SECONDARY] The Sep 2025 update renamed and broadened the "YMYL Society" category into "Government, Civics & Society" (elections, trust in institutions). It also added AI Overview rating examples that mirror the featured-snippet examples — [Marie Haynes](https://www.mariehaynes.com/google-quality-raters-now-rate-ai-overviews/), [ppc.land](https://ppc.land/search-quality-rater-guidelines/)
- [OFFICIAL] "We work with ~16,000 external Search Quality Raters". "No single rating – or single rater – directly impacts how a given page or site ranks", and ratings "alone will not directly affect" rankings. Google made "more than 4,725" improvements in 2022 alone. The process combines side-by-side tests, rater evaluations and live traffic experiments, then a launch review with privacy and legal checks (overview dated Nov 2023) — [Google rater overview PDF](https://services.google.com/fh/files/misc/hsw-sqrg.pdf)
- [OFFICIAL] 2023 counts: **719,326** search quality tests, **124,942** side-by-side experiments, **16,871** live traffic experiments, **4,781** launches ("over 700,000 experiments that resulted in more than 4,000 improvements") — [Google How Search Works: rigorous testing](https://www.google.com/search/howsearchworks/how-search-works/rigorous-testing/)
- [COURT] Google measures itself with "IS4" (Information Satisfaction) human-rater side-by-sides against Bing, DuckDuckGo and others, and compares latency (¶¶136–139). RankEmbed is trained partly on "scores generated by human raters and used by Google to measure the quality of organic search results" — [ECF 1033](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf), [ECF 1436](https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1436.0.pdf)
- [OFFICIAL] Offline metrics in public benchmarks: BEIR and MTEB retrieval use nDCG@10 — [BEIR](https://arxiv.org/abs/2104.08663), [Modal (secondary)](https://frontend.modal.com/blog/mteb-leaderboard-article). MS MARCO passage ranking uses MRR@10 — [SPLADE-v3](https://arxiv.org/abs/2403.06789)
- [OFFICIAL] TREC's current tracks are AutoJudge, Change Detection, Million LLM, Retrieval-Augmented Generation (RAG), RAGTIME (multilingual RAG evaluation), User Simulation and Video QA. The TREC 2026 conference runs 16–18 Nov 2026 — [trec.nist.gov](https://trec.nist.gov/)
- [OFFICIAL] Online usage is sensitive to latency: 100–400 ms of added delay cut searches by 0.2–0.6% — [Google Research](https://research.google/blog/speed-matters/)

### Inferences
- A small engine can copy Google's evaluation loop at small scale:
  - a few hundred labelled queries in Bulgarian and other locales, graded with a simplified Needs Met / Page Quality rubric (judged by nDCG@10);
  - side-by-side comparisons against Google, Bing or Brave;
  - online interleaving or A/B tests once traffic exists.

  LLM-as-judge (the TREC AutoJudge direction) can stretch the human labels, but it must be validated against them.

### Gaps
- No primary source was fetched for interleaving methods or their sensitivity versus A/B tests. The canonical reference is Chapelle et al., TOIS 2012, "Large-scale validation and analysis of interleaved search evaluation" ([ACM DOI](https://dl.acm.org/doi/10.1145/2094072.2094078)); it was not verified in this session.
- No official Google experiment and launch counts for 2024–2025 were found; the "rigorous testing" page still shows 2023.
- Rater-guideline changes after Sep 2025 were checked: the PDF fetched in Oct 2026 is still the Sep 2025 version.
