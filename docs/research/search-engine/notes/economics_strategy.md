# Economics, costs, team requirements and go-to-market for a new search engine (as of 2026-10-22, from the perspective of a small Bulgarian/EU studio on Hetzner)

Notes conventions:
- All prices were fetched on **2026-10-22** unless stated otherwise. Each one cites the page it came from. Where I could not confirm that a page is current, or the figure comes from a secondary source, the bullet says so.
- **FX used for EUR conversions:** ECB reference rate, 22 Oct 2026: **1 EUR = 1.1205 USD**, so $1 = €0.8925 ([ECB USD](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html)). **1 EUR = 0.83770 GBP**, so £1 = €1.1937 ([ECB GBP](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-gbp.en.html)). EUR figures are my conversions. USD/GBP originals are kept.
- Lines marked **ESTIMATE** are my own arithmetic, with the inputs shown. They are not sourced facts.
- The tool session's web-search budget ran out near the end of the research. A few gaps below exist because of that, not because no data exists.

---

## 1. What real cost and scale data points have challengers disclosed?

### Takeaway
Disclosed numbers fall into two groups. Independent full-web indexes have been built cheaply but slowly by tiny teams: Mojeek has ~9.8B pages, a team of a handful of people and two decades of work. Fast, well-funded attempts burned VC money: Neeva raised $77.5M and shut its consumer search in 4 years. Kagi survives on subscriptions by mostly reselling third-party results. Its historically quoted cost was ~1.25¢ per search (secondary source). Common Crawl gives anyone a free ~2.1B-page monthly snapshot (~360 TiB uncompressed, ~5.8 TiB compressed text).

### Cited Findings
**Kagi (paid, metasearch-heavy)**
- Kagi was founded in 2018 by Vladimir Prelovac. It was bootstrapped with "~$3M from the founder" (2018–2023), then raised an "~$2.5M external investment round" from "~93 angel investors" from its community. It became a Public Benefit Corporation in early 2024. — [Kagi company page](https://help.kagi.com/kagi/company/)
- Live stats on 2026-10-22: **75,675 members**, **1,046,700 queries in the past day**, 3,238 "Orion+ members". — [kagi.com/stats](https://kagi.com/stats)
- Wikipedia: ~50,000 subscribed members making 845,200 searches/day as of 9 Jun 2025, and "over 75,000 subscribers" reported as of Sep 2026. The 2025 figure's citation is mismatched, since it cites a Jan 2024 *Register* article. — [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi)
- **Cost per search:** Kagi's older "Why pay for search" page was quoted as saying "it costs us about $1 to process 80 searches", i.e. ~1.25¢/search, and that an average user searched ~30 times/day, so "$10/month … does not even cover our cost for average use". This is a **secondary quote**. The current version of the page no longer contains the cost figure: I checked it, and it now gives only plan prices. — [Lemmy quote](https://lemmy.federate.cc/comment/891809); current page: [help.kagi.com/why-pay-for-search](https://help.kagi.com/kagi/why-kagi/why-pay-for-search.html)
- An unsourced Fediverse comment claims a 2024 compute cost of $0.0125/search, with "search partners" a major expense. Unverified. — [blendit.bsd.cafe](https://blendit.bsd.cafe/comment/1410003)
- Result sources: its own indexes **Teclis** (web) and **TinyGem** (news), plus "anonymized API calls to all major search result providers worldwide" (unnamed), plus Marginalia, Wolfram Alpha, Wikipedia, Yelp, TripAdvisor and others. "Subscriptions from our members pay for search results." — [Kagi search sources](https://help.kagi.com/kagi/search-details/search-sources.html)
- Wikipedia says the Teclis index is "only used for small-web searches." — [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi)
- Kagi (29 Aug 2024): Google's index "remains the only major search index not easily accessible under commercially friendly terms". Kagi argues a new entrant cannot build a competitive index because of cost, technical barriers and time. It cites a third-party claim that Bing spends "5-10 billion USD a year" on search. — [Kagi blog: Dawn of a new era in Search](https://blog.kagi.com/dawn-new-era-search)
- Kagi Search API price: one Kagi feedback post (undated) gives "$0.025/query aka $25 per thousand queries". CostBench lists $2.50/1K for the search request and $15/1K for FastGPT. **These conflict and are unverified.** Kagi's own API doc page shows no price. — [kagifeedback](https://kagifeedback.org/d/1521-discounted-single-site-search-api); [CostBench](https://www.costbench.com/software/ai-search-apis/kagi-search-api/); [Kagi API docs](https://help.kagi.com/kagi/api/search.html)

**Mojeek (UK, fully independent crawler/index)**
- Index: "The index is still growing and currently has **9.76 billion pages**" (founder Marc Smith, forum post dated 1 May 2026). — [Mojeek community](https://community.mojeek.com/t/how-is-mojeek-doing/2795)
- Milestones: 1B pages in 2015; 2B in 2018; 4B in 2021; 6B in 2022; 7B in 2023; 8B in 2024; 9B in 2025. — [Mojeek Team & Technology](https://mojeek.com/about/technology.html)
- The stack is written mostly in C. It launched in 2004 on "2 donated servers". Servers moved to a datacentre in 2011. In 2019 Mojeek "Added 100 more web servers". It runs on its own infrastructure in "a green data centre in our own dedicated and secure room". Funding: £50,000 (2009) and £250,000 (2013) from private investors, with later amounts undisclosed. — [Mojeek Team & Technology](https://mojeek.com/about/technology.html)
- Dec 2019: "took delivery of 100 new servers, this almost doubles the number we previously had". The machines are Supermicro 2U twin-node servers hosted at Custodian Data Centres, Maidstone. — [Mojeek blog 2019](https://blog.mojeek.com/2019/12/100-server-build-and-install.html)
- Index growth rate: up to 5M pages/day in 2018 and over 2M pages/day in 2021. — [Mojeek blog 2018](https://blog.mojeek.com/2018/06/two-billion-pages.html); [2021](https://blog.mojeek.com/2021/06/four-billion-pages.html)

**Marginalia Search (single-server, small/indie web)**
- Its design runs on one physical server, without "datacenters and enterprise hardware budgets". The minimum is an x86-64 machine with ≥16 GB RAM and ≥4 cores. It "would likely be very expensive to run in the cloud". — [Marginalia docs: hardware](https://docs.marginalia.nu/1_overview/01_hardware/); [Marginalia README](https://github.com/marginaliasearch/marginaliasearch)
- Sizing guidance as fetched: "For 100,000 documents, you can probably get away with 2 TB of SSD storage" plus "4 TB of mechanical storage for the crawl data". This ratio looks implausibly large per document and may be a doc typo or a fetch error, so **treat it as unverified**. — [Marginalia docs](https://docs.marginalia.nu/1_overview/01_hardware/)
- Production server (post of 2023-10-07): dual EPYC 7543 (64 physical cores, 128 threads), **512 GB RAM**, **10×8 TB + 2×4 TB SSD**. The index is partitioned across 8 drives without RAID. The post describes it as "10X as powerful as the previous one". The post gives no document count, server cost or colocation cost. — [marginalia.nu/log/90](https://www.marginalia.nu/log/90-new-server-design/)
- Grant: FUTO gave "$15,000 with no strings attached" (2023-09-15) for "more server power". The ongoing cost is described only as a "minimal burn rate from colocation". — [marginalia.nu/log/88](https://www.marginalia.nu/log/88-futo-grant/)

**Brave Search (own index, browser-bundled)**
- The team came from Tailcat, the search spin-off of Cliqz (Hubert Burda Media), which joined Brave in **March 2021** (secondary). — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search); [dkb.io interview](https://dkb.io/post/DEPR_brave-search-interview)
- Beta launched 22 Jun 2021 and GA followed in June 2022. Brave reported 2.5B total queries during the year-long beta. It became the default in US/CA/UK/FR/DE in Oct 2021. The Search API launched in May 2023. — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search)
- In 2023 Brave cut its remaining Bing dependency (~7% of queries). Coverage cites "increasing costs and uncertainties around Bing's API access" as a motivation. — [Search Engine Journal](https://www.searchenginejournal.com/brave-search-cuts-ties-with-bing-goes-independent/485736/)
- Usage (July 2026, from a Brave LinkedIn post reported 5 Aug 2026): **2.46B monthly queries**, 122.55M browser MAU, 51M DAU. The index is ">35 billion pages" per prior disclosures. Brave was added to Chrome's global default-engine list in July 2026. — [PPC Land](https://ppc.land/brave-search-gains-a-spot-on-chromes-engine-list-at-2-46-billion-queries/)
- Other index-size claims are 30B+ and 40B pages, with >100M page updates/day. These are **secondary and conflicting**. — [Parallel comparison](https://parallel.ai/articles/brave-search-api-vs-parallel); [Sacra](https://sacra.com/c/brave/)

**Neeva (VC-funded, ad-free subscription; failed)**
- Founded 2019. It "had raised $77.5m". It had 25 employees in June 2020. Consumer search shut down on 2 June 2023 because of "how hard it was to persuade normal users to make the switch". Snowflake acquired it for **$185.4M in cash** (per Snowflake 10-Q, cited by Wikipedia). — [Wikipedia: Neeva](https://en.wikipedia.org/wiki/Neeva)
- The team at shutdown was ~50 employees, which the company said was too small against "entrenched organizations with endless resources". — [gHacks](https://www.ghacks.net/?p=195321)
- One aggregator says 40 employees joined Snowflake (single source). — [Simplify](https://simplify.jobs/c/Neeva)

**Stract (open-source, Tantivy-based)**
- NLnet NGI0 Entrust grant, Dec 2023 to Dec 2024, for index performance, the web graph, a live news/blog index and documentation. — [NLnet: Stract](https://nlnet.nl/project/Stract/)
- Built on the **Tantivy** inverted-index library, with its "own crawler". Common Crawl was "a huge help in the early stages". **The repository was archived on 2 Apr 2026.** — [GitHub: StractOrg/stract](https://github.com/StractOrg/stract)

**Solo "search engine in two months" (Wilson Lin, 2025)**
- One engineer, paying "out of pocket", built a **280M-page index** with **3B SBERT embeddings** generated on 200 GPUs (250 at peak). Crawling peaked at 50K pages/s. The serving cluster had 200 cores, 4 TB RAM and 82 TB SSD. Query latency was ~500 ms. — [blog.wilsonl.in/search-engine](https://blog.wilsonl.in/search-engine/)
- Cost comparisons from the same post:
  - NVMe storage: Hetzner Auction **$6.63/TB-month** vs AWS i4g $243.30.
  - Memory-heavy servers: Hetzner Auction **$164/TB-RAM-month** vs AWS $7,011.53.
  - Egress: Oracle $8.70/TB vs AWS $92.16.
  - GPU: Runpod RTX 4090 at $0.79/h.
  - The author estimated sustainability at "around 10K $5/month subscriptions".
  — [blog.wilsonl.in/search-engine](https://blog.wilsonl.in/search-engine/)

**You.com, Exa, Perplexity** (funding and scale; headcounts are in §7)
- Exa raised a $85M Series B at a $700M valuation (Sept 2025, led by Benchmark). — [Latham & Watkins](https://www.lw.com/en/news/2025/09/latham-watkins-advises-exa-in-us85-million-series-b-financing-with-benchmark-and-lightspeed)
- Exa later raised $250M at a **$2.2B** valuation (2026, led by a16z), per Bloomberg. — [Bloomberg Gov](https://news.bgov.com/antitrust/andreessen-backed-ai-search-startup-exa-valued-at-2-2-billion)
- Perplexity was valued at $20B (Sept 2025) and ~$21.21B after a "Series E-6" (early 2026). — [Wikipedia: Perplexity](https://en.wikipedia.org/wiki/Perplexity_AI)
- I found no reliable You.com cost or index disclosure (see Gaps).

**Common Crawl (free bootstrap corpus)**
- 2026 monthly crawls hold 2.10–2.19B pages and 354.6–379.2 TiB uncompressed each:
  - Feb: 2.1B pages, 363 TiB.
  - Apr: 2.19B pages, 379.2 TiB.
  - May: 2.16B pages, 365.56 TiB.
  - Jun: 2.10B pages, 354.59 TiB.
  - Jul: 2.14B pages, 364.01 TiB.
  — [CC Feb 2026](https://commoncrawl.org/blog/february-2026-crawl-archive-now-available); [CC May 2026](https://commoncrawl.org/blog/may-2026-crawl-archive-now-available); [CC Jun 2026](https://commoncrawl.org/blog/june-2026-crawl-archive-now-available); [CC Jul 2026](https://blog.commoncrawl.org/blog/july-2026-crawl-archive-now-available); [CC Apr 2026](https://blog.commoncrawl.org/blog/april-2026-crawl-archive-now-available)
- **August 2026 crawl (CC-MAIN-2026-34):** 2.14B pages, 360 TiB uncompressed, 0.7B new URLs, 40.2M hosts and 33.1M registered domains. Compressed sizes: **WARC 84.78 TiB, WAT 13.92 TiB, WET 5.84 TiB**. — [CC Aug 2026](https://commoncrawl.org/blog/august-2026-crawl-archive-now-available)
- Access: "Crawl data is free to access by anyone from anywhere". It is available via `s3://commoncrawl/` (us-east-1) or `https://data.commoncrawl.org/`, and selected crawls are mirrored on Hugging Face. Processing inside AWS avoids inter-region transfer fees. — [Common Crawl: Get started](https://commoncrawl.org/get-started)

### Inferences
- **ESTIMATE — Common Crawl per-page ratios** (Aug 2026 crawl; TiB×1024⁴ ÷ 2.14B pages):
  - ~185 KB/page uncompressed HTTP content.
  - ~43.6 KB/page compressed WARC.
  - ~7.2 KB/page compressed WAT (metadata and links).
  - **~3.0 KB/page compressed extracted text (WET).**
  These are the most reliable public storage ratios I found. §2 uses them.
- **ESTIMATE — Common Crawl download time:** one month's WET (5.84 TiB ≈ 6.4 TB) takes ~14 h over a 1 Gbit/s line. The full WARC (~93 TB) takes ~8.6 days at 1 Gbit/s. A Hetzner box can bootstrap a 2B-page text corpus in under a day at no data cost.
- **ESTIMATE — Kagi economics, illustrative only:**
  - 1,046,700 queries/day ÷ 75,675 members ≈ **13.8 searches/member/day**.
  - At the old ~1.25¢/search figure, that would be ≈ $392k/month in search cost.
  - The revenue ceiling if every member paid $10 is ≈ $757k/month.
  - The real plan mix is unknown, and the 1.25¢ figure is old and secondary. This only shows that the metasearch cost per query is the dominant variable cost.
- **ESTIMATE — Mojeek server count:** the Dec 2019 post implies ~200 servers in total by 2020 (100 new "almost doubles" the previous fleet). The current count is not disclosed.
- **ESTIMATE — Wilson Lin storage footprint:** 82 TB SSD ÷ 280M pages ≈ **~290 KB SSD per page** in a dense-vector-heavy design, with ~10.7 embeddings per page (3B ÷ 280M). A 768-dim float32 vector is 3 KB, so vectors alone come to ~33 KB/page. That is roughly 35× the footprint of a lean lexical index (§2).

### Gaps
- No primary, current Kagi cost-per-search figure: the old figure was removed from the current page. Kagi headcount is not disclosed.
- No current Mojeek server count, revenue or API customer count.
- No Marginalia document count or index size on disk. Marginalia's NLnet grant (if any) could not be verified because the search budget was exhausted.
- No primary Brave statement on the cost of building its index. Brave Search team size is not found.
- You.com cost/index disclosures and Neeva's monthly burn or peak headcount: not found.
- Common Crawl Terms of Use were not retrieved, and Sept/Oct 2026 crawl figures were not found.

---

## 2. What would it cost to crawl, store and index ~1B and ~10B pages on EU (Hetzner) infrastructure?

### Takeaway
**ESTIMATE:** Hardware alone for a lean lexical (BM25-style) index looks like this:
- **1B pages:** about **€1.8–2.5k/month** on Hetzner dedicated servers.
- **10B pages:** about **€6.7–10.6k/month**, depending on per-page index footprint (8 vs 20 KB/page) and whether raw HTML is archived.

Hardware is not the binding constraint. Ranking quality, spam fighting, freshness and people are. A dense-vector (semantic) index multiplies storage by roughly 10–35× and adds GPU cost.

### Cited Findings
**Hetzner list prices (fetched 2026-10-22, EUR excl. VAT, monthly; setup fee in brackets)**
- **AX (NVMe) line:**
  - AX41: Ryzen 5 3600, 64 GB, 2×512 GB, €59 (€0 setup).
  - AX42: Ryzen 7 PRO 8700GE, 64 GB ECC, €79–99 (€49).
  - AX102: Ryzen 9 7950X3D 16C, 128 GB ECC, 2×1.92–2×7.68 TB, **€159–259** (€129).
  - AX162: EPYC 9454P 48C, 128–512 GB, up to 2×15.36 TB, **€319–614** (€304).
  - The page does not map each storage option to a model or price, so the mapping is uncertain. — [Hetzner AX matrix](https://www.hetzner.com/dedicated-rootserver/matrix-ax/)
- **SX (bulk HDD) line:**
  - SX65: €84/159 (€39).
  - SX135: €289/309 (€144).
  - SX295: €599/879 (€439).
  - Options include 4×, 8× or 14× 16–22 TB HDD, 128–256 GB RAM and up to EPYC 7502P. Config-to-price mapping is not explicit. — [Hetzner SX matrix](https://www.hetzner.com/dedicated-rootserver/matrix-sx/)
- **Storage Box:** BX11 1 TB €3.20; BX21 5 TB €10.90; BX31 10 TB €20.80; **BX41 20 TB €40.60**. — [Hetzner Storage Box](https://www.hetzner.com/storage/storage-box/)
- **Object Storage:** €6.49/month base including 1 TB storage and 1 TB egress. Extra storage is €0.0087 per TB-hour, and extra egress is €1.00/TB. The fetched text was slightly garbled on the egress unit. — [Hetzner Object Storage](https://www.hetzner.com/storage/object-storage/)
- **Traffic:** "All root servers have a dedicated 1 GBit uplink by default and with it unlimited traffic". 10 Gbit uplinks include 20 TB/month, with overage at "€ 1 ($1.20)/TB". — [Hetzner docs: traffic](https://docs.hetzner.com/robot/general/traffic/)
- **GPU servers:**
  - GEX45: RTX PRO 4000 Blackwell SFF 24 GB, **€214** (€209).
  - GEX63: RTX PRO 6000 Blackwell Max-Q 96 GB, **€999** (€999).
  - GEX131: from €1,499.
  - GEX430: 4× RTX PRO 6000, €3,599.
  — [Hetzner GPU matrix](https://www.hetzner.com/dedicated-rootserver/matrix-gpu/)

**Index-size ratios (published)**
- There is a long-standing "folklore" rule that inverted indexes need "about one-third of the storage of the text being indexed". A WWW 2009 paper tests this rule. — [WWW 2009 paper (PDF)](https://archives.iw3c2.org/www2009/proceedings/pdf/p451.pdf)
- Full-text indexing adds an additional "20 to 30 percent storage cost over the raw data". — [ITC journal 2021](https://itc.ktu.lt/index.php/ITC/article/view/25470/14899)
- Lucene's and Zettair's compression on web text is "about 15% larger" than quasi-succinct indices. This is an older measurement. — [Quasi-Succinct Indices (arXiv)](https://arxiv.org/pdf/1206.4300)
- Modern text compression can reduce text to "less than 30% of its size". — [Navarro et al. 2000](https://users.dcc.uchile.cl/~gnavarro/abstracts/ir00.html)
- Common Crawl per-page ratios (§1): ~3.0 KB compressed text, ~7.2 KB metadata/links and ~43.6 KB compressed raw WARC per page. — [CC Aug 2026](https://commoncrawl.org/blog/august-2026-crawl-archive-now-available)
- Real-world reference points:
  - Marginalia: 1 server, 512 GB RAM, ~88 TB SSD. — [marginalia.nu/log/90](https://www.marginalia.nu/log/90-new-server-design/)
  - Wilson Lin: 280M pages, 4 TB RAM, 82 TB SSD, vector-heavy. — [blog.wilsonl.in](https://blog.wilsonl.in/search-engine/)
  - Mojeek: ~9.76B pages on its own fleet of order ~200 servers (2019/2020 inference). — [Mojeek forum](https://community.mojeek.com/t/how-is-mojeek-doing/2795); [Mojeek blog 2019](https://blog.mojeek.com/2019/12/100-server-build-and-install.html)
- Embedding throughput reference: 100K embeddings/s across 250 GPUs (≈400/s per GPU, small SBERT model, RTX 4090 class at $0.79/h on Runpod). — [blog.wilsonl.in](https://blog.wilsonl.in/search-engine/)

### Inferences
**ESTIMATE — per-page footprint assumptions (lexical index)**
- Extracted text, compressed: 3.0 KB (CC WET ratio). Uncompressed: ≥10 KB, assuming compression to <30%.
- Inverted index ≈ 1/3 of uncompressed text ≈ 3.3 KB. Add compressed stored text for snippets (3 KB) and forward index/metadata (~1–2 KB). That gives **~8 KB/page serving footprint** (plausible range 5–20 KB with positions, richer snippets or multiple fields).
- Optional archives: links/metadata ~7.2 KB per page; raw HTML ~43.6 KB per page.

**ESTIMATE — 1B pages, refreshed monthly**

| Component | Sizing | Hetzner choice | €/month |
|---|---|---|---|
| Serving index | 8 TB × 2 replicas = 16 TB NVMe | 3 × AX102 (assume €259 = 2×7.68 TB config) | 777 |
| Crawl | 1B/30 days = **386 pages/s avg**, ≈0.13 Gbit/s at 43.6 KB/page, ~44 TB/month download | 3 × AX42 @ €99 | 297 |
| Parse / index build | – | 1 × AX162 @ €319 | 319 |
| Text + metadata + raw WARC archive | ~3 + 7 + 44 TB | 1 × SX135 @ €309 | 309 |
| Front-end, API, DB, monitoring | – | 2 × AX41 @ €59 | 118 |
| **Total** | | | **≈ €1,820/month** |

- One-time setup fees come to ≈ €980.
- With a 20 KB/page index or 3 replicas, the total is ≈ €2.5k/month.

**ESTIMATE — 10B pages, refreshed monthly**

| Component | Sizing | Hetzner choice | €/month |
|---|---|---|---|
| Serving index | 80 TB × 2 replicas = 160 TB NVMe | 12 × AX102 @ €259 | 3,108 |
| Crawl | **3,858 pages/s avg**, ≈1.35 Gbit/s, ~436 TB/month download, so more than one 1 Gbit uplink is needed | 12 × AX42 (assumption for politeness, DNS and parse overhead) | 1,188 |
| Index build | – | 4 × AX162 @ €319 | 1,276 |
| Text + metadata (~100 TB) | – | 1 × SX295 @ €879 | 879 |
| Front-end and misc | – | 4 × AX41 | 236 |
| **Total** | | | **≈ €6.7k/month** |

- Setup fees come to ≈ €3.8k one-time.
- Variants:
  - Keep raw HTML (~436 TB): add 2 × SX295, giving ≈ **€8.4k/month**.
  - 20 KB/page index (≈400 TB NVMe): ~27 AX102, giving ≈ **€10.6k/month**.

**ESTIMATE — semantic layer**
- 1 int8 768-dim vector per page = 768 B, so ~0.8 TB per 1B pages plus ANN-graph overhead (modest).
- Generating 1 embedding per page at ≈400 embeddings/s per RTX 4090-class GPU (Wilson Lin's throughput): ≈ **694 GPU-hours per 1B pages (~$549 ≈ €490 at $0.79/h)**, and ≈ €4.9k per 10B pages per full re-embed.
- At Wilson's ~10.7 chunks/page, multiply by ~11.
- On Hetzner the same work would run on GEX45/GEX63 boxes (€214/€999 per month). Hetzner-specific throughput is not measured.

**ESTIMATE — query serving cost vs. APIs, hardware only**
- At ≈€1,820/month, a 1B-page index costs:
  - €0.06 per 1,000 queries at 1M queries/day.
  - €0.61/1k at 100k/day.
  - €6.07/1k at 10k/day.
- Hardware-only breakeven vs. Brave Search API ($5 = €4.46/1k) is ≈ 408k queries/month (~13.6k/day).
- With staff cost S (€/month): breakeven queries/month = (1,820 + S) ÷ 4.46 × 1,000. For S = €20k (illustrative input, not a sourced salary), breakeven is ~4.9M queries/month (~163k/day).

**Comparison with reality**
- My 10B estimate (~40 servers) is lower than Mojeek's ~200-server fleet (older hardware, unknown roles). Real systems need more: QPS headroom, ranking features, link-graph computation, spam and dedup, recrawl prioritisation, redundancy.
- Treat these figures as a floor, not a budget.

### Gaps
- No current, published Lucene, Tantivy or Vespa benchmark giving bytes-per-web-page for a production web index. The 2025 Chalmers Lucene codec thesis was found but its numbers were not retrieved. — [Chalmers thesis](https://odr.chalmers.se/items/f21c75df-e652-4f48-a447-bdb25933211d)
- The Hetzner AX/SX config-to-price mapping is ambiguous on the matrix pages. Server Auction prices were not fetched this session.
- Crawler throughput per node (pages/s per core) and Tantivy indexing throughput (docs/s) are not sourced here. The crawler node counts above are assumptions.
- No sourced Bulgarian engineer salary data was collected (this is needed for a staff-inclusive TCO).
- ClueWeb22 (10B pages sampled from Bing, 2022) total TB size was not found. — [ClueWeb22](https://lemurproject.org/clueweb22/)

---

## 3. What do third-party search/grounding APIs cost per 1,000 queries (Oct 2026), with limits and license restrictions?

### Takeaway
Raw web-search APIs have converged on **~$4–5 per 1,000 queries** (≈€3.6–4.5): Brave, Exa (auto $7), You.com, Linkup and Parallel. Parallel offers $1/1k fast tiers, and Mojeek is cheapest at £2/1k (≈€2.39). SERP scrapers (SerpApi) fall to ~$2/1k only at tens of millions per month. LLM-vendor grounding is pricier ($10–35/1k) and comes with display or "no raw access" restrictions. **Storage/caching and AI-training rights are the key license differentiator:** Brave and Mojeek gate them by plan, and Bing grounding gives no raw access at all. Google's Custom Search JSON API is closed to new customers and ends on 1 Jan 2027.

### Cited Findings
**Brave Search API**
- Search: **$5 per 1,000 requests**, **50 queries/s**, with a $5 free credit every month. Answers: $4/1k plus $5 per million input/output tokens, 2 qps. Enterprise: custom, with Zero Data Retention. Billing is "Prepaid credits, not subscriptions", with "No minimums". The page footer reads © 2015–2026. — [brave.com/search/api](https://brave.com/search/api/)
- Brave's FAQ: results can be stored and used to train models only "with a plan that includes storage rights". — [brave.com/search/api](https://brave.com/search/api/)
- Brave's docs, seen only via search snippet because the page was unreachable: "Data for Search" and "Data for AI" plans "do not grant permission to retain any part of the API's output". "Data with Storage Rights" plans were priced **$26–45 per 1,000** vs $5–9 for AI plans. **This may be legacy pricing and is unverified as current.** — [Brave API docs pricing (unreachable)](https://api-docs.search.brave.software/pricing); [Brave community thread](https://community.brave.app/t/data-w-storage-rights-tos/571395)

**Exa**
- Search per 1k requests (≤10 results): lite $4; auto $7; deep-lite and deep $12; deep-reasoning (legacy) $15. Extra results cost $1 per 1k.
- Contents cost $1 per 1k pages per content type. Answer costs $5/1k. Monitors cost $15/1k.
- Agent: $0.012–$1.00 per request.
- Free tier: $10 of credits that reset monthly.
- Rate limits are not stated except custom QPS on Enterprise. Enterprise includes ZDR and custom indexes. — [exa.ai/pricing](https://exa.ai/pricing)

**Tavily** (now owned by Nebius)
- Basic search costs 1 credit and advanced costs 2. Pay-as-you-go is **$0.008/credit**, i.e. $8/1k basic and $16/1k advanced.
- Plans: Project $30 for 4k credits; Bootstrap $100 for 15k; Startup $220 for 38k; **Growth $500 for 100k ($0.005/credit = $5/1k basic)**. The free tier is 1,000 credits/month.
- Extract: 1 credit per 5 URLs. Research: 4–250 credits. — [Tavily docs: credits](https://docs.tavily.com/documentation/api-credits); [tavily.com/pricing](https://www.tavily.com/pricing)
- Nebius agreed to acquire Tavily (Feb 2026) for a reported **$275M**, up to $400M with earn-outs. — [SiliconANGLE](https://siliconangle.com/2026/02/10/ai-infrastructure-giant-nebius-buys-agentic-search-startup-tavily/); [Nebius blog](https://nebius.com/blog/posts/bringing-agentic-search-into-the-production-ai-stack)

**Mojeek API** (prices excl. VAT)
- **Startup:** **£2/1k (≈€2.39)**, 10 results, 5 qps, 100k queries/day. Results may be cached for 1 hour only.
- **Business:** **£3/1k (≈€3.58)**, 40 results, 10 qps, 400k/day. Storage rights allow "indefinite data retention".
- **Enterprise:** custom, up to 100 results, ZDR.
- Other terms: "AI Usage" is listed as included on all plans, and standard data retention is 90 days.
- The page is internally inconsistent: the table lists storage rights for all plans, while the FAQ limits Startup to 1-hour caching. — [Mojeek Search API](https://www.mojeek.com/services/search/web-search-api/)

**Google**
- Custom Search JSON API: 100 queries/day free, then "$5 per 1000 queries, up to 10k queries per day". It "is closed to new customers". Existing customers have "until January 1, 2027 to transition", and Google suggests Vertex AI Search (up to 50 domains). — [Google Custom Search JSON API](https://developers.google.com/custom-search/v1/overview)
- **Grounding with Google Search** via the Gemini API:
  - Gemini 3 and newer: 5,000 free requests/month, then **$14/1k**.
  - Gemini 2.5 Flash and Flash-Lite: 1,500/day free, then **$35/1k grounded prompts**.
  — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

**Microsoft**
- Bing Search APIs were **retired on 11 Aug 2025**. Customers were pointed to Grounding with Bing Search. — [PPC Land](https://ppc.land/microsoft-ends-bing-search-apis-on-august-11-alternative-costs-40-483-more/)
- **Grounding with Bing Search:** **$14 per 1,000 transactions**, 150 TPS, 1M/day. It "can only be used for Azure AI Foundry or as Web Knowledge Source". "Outputs are not directly accessible for use in other applications". References "must be shown to the end customer as per our Use and Display Requirements". — [Microsoft Grounding pricing](https://www.microsoft.com/en-us/bing/apis/grounding-pricing)
- History of platform risk: in 2023 Microsoft raised Bing API prices, effective 1 May 2023. S1 went from $7 to **$25 per 1k**, and another tier went from $3 to $15, up to ~10× on some tiers. — [Techzine](https://www.techzine.eu/news/devops/102113/microsoft-increases-bing-api-prices-by-1000-problems-for-duckduckgo/); [ITPro](https://itpro.com/business/business-strategy/370107/microsoft-hikes-bing-search-api-prices)

**SerpApi** (Google SERP scraping)
- Monthly plans: $25 for 1k searches; $75 for 5k; $150 for 15k; $725 for 100k ($7.25/1k); $3,750 for 1M ($3.75/1k); $21,125 for 10M ($2.11/1k); and ~$1.96–2.00/1k at 25M+. Hourly throughput caps run from 50 to 600k. — [serpapi.com/pricing](https://serpapi.com/pricing)

**You.com**
- Web Search API **$5 per 1,000 calls** (lowered 11 Mar 2026). Contents API $1/1k pages. Research API $12–$50/1k for lite/standard tiers. New accounts get $100 in free credits and 100 free searches/day. — [You.com billing docs](https://docs.you.com/administration/billing); [You.com announcement](https://you.com/resources/lower-search-api-cost)

**Linkup**
- Standard: **$5/1k** (searchResults), $6/1k for sourcedAnswer or structured output. Deep: $50/1k, or $55/1k with answer. $20 of free credit refills monthly.
- Some listings show EUR pricing (€50/1k deep), which is unconfirmed. — [Linkup FAQ](https://docs.linkup.so/pages/faq/faq.md)

**Parallel**
- Search: Turbo/Fast **$1/1k**; Basic/Advanced $5/1k; extra results $1/1k. Extract: $1/1k.
- Task API: $5–$2,400 per 1k depending on processor.
- Rate limits: Search 600 req/min and Task 2,000 req/min.
- Free tier: 5,000 requests/month, $80 at signup and $5/month. — [parallel.ai/pricing](https://parallel.ai/pricing)

**Anthropic web search tool**
- **$10 per 1,000 searches** plus token costs. Web fetch carries no extra charge. — [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)

**Staan / EUSP (Ecosia + Qwant European index API)**
- Positioned for AI chatbots. Ecosia's CEO claims "a tenth of the cost" of Google/Bing. No public price was found. — [TechCrunch](https://techcrunch.com/2025/08/06/qwant-and-ecosia-debut-staan-a-european-search-index-that-aims-to-take-on-big-tech)

### Inferences
**ESTIMATE — EUR per 1,000 queries**

| Provider / tier | Price per 1k | ≈ EUR per 1k | License note |
|---|---|---|---|
| Parallel Turbo/Fast | $1 | €0.89 | |
| Mojeek Startup | £2 | €2.39 | 1h cache only |
| Mojeek Business | £3 | €3.58 | storage rights |
| Exa lite | $4 | €3.57 | |
| Brave Search | $5 | €4.46 | no retention without storage-rights plan |
| You.com, Linkup std, Parallel Basic, Tavily Growth | $5 | €4.46 | |
| Exa auto | $7 | €6.25 | |
| Tavily PAYG basic | $8 | €7.14 | |
| Claude web search | $10 + tokens | €8.92 | |
| Bing Grounding | $14 | €12.49 | Azure-only, no raw results |
| Gemini 3 grounding | $14 | €12.49 | |
| Gemini 2.5 grounding | $35 | €31.24 | |
| SerpApi | $25 → $2.11 | €22.31 → €1.88 | by volume |

- Metasearch is only viable if the license allows the intended use: display, caching, mixing with LLM output, retention. For an EU product that wants to cache or re-rank results, plans with explicit storage rights matter more than headline price. Mojeek Business and Brave storage-rights plans are examples.
- The Bing 2023 price hike, the Bing API retirement in 2025 and the Google CSE closure in 2027 show **upstream platform risk**. A wrapper business can have its COGS multiplied or its supply removed at the provider's discretion.

### Gaps
- Brave's current storage-rights plan prices and full ToS were not verified (docs page unreachable).
- Kagi API price is conflicting ($25/1k vs $2.50/1k, both secondary).
- No public Staan/EUSP API price.
- Vertex AI Search per-query pricing: the page fetch was truncated.
- Exa, Tavily and You.com standard rate limits are not published on the pricing pages.
- SerpApi's legal exposure (scraping Google) was not researched.

---

## 4. What does LLM-generated answer synthesis cost per 1,000 queries?

### Takeaway
**ESTIMATE:** with a lean prompt (3,500 input + 300 output tokens per query), synthesis costs:
- **~€0.4–0.6 per 1,000 queries** on the cheapest current API models: Claude Haiku 5.5, Gemini 2.5 Flash-Lite, Ministral 3 8B.
- **~€1.2–3.4 on mid-tier "Flash" models.**
- **~€4.5–9 on Haiku 4.5 / Sonnet-class.**

Self-hosting an 8B model on a Hetzner GEX63 (€999/month) can reach a few cents per 1k at high utilisation. In every case synthesis is cheap relative to the search retrieval itself (€2.4–4.5/1k via APIs).

### Cited Findings
**Anthropic (USD per million tokens, input/output)**
- **Claude Haiku 5.5: $0.10/$0.50** for prompts ≤100k tokens; $0.50/$2.50 above that.
- **Haiku 4.5: $1/$5.**
- **Sonnet 5 and 5.5: $2/$10.** The $2/$10 Sonnet 5 price "is now the standard price", and the planned rise to $3/$15 "will not occur".
- Opus 4.5–4.8: $5/$25.
- Cache hits cost 0.1× input, or 0.05× on Sonnet 5.5 and Opus 5.5.
- The **Batch API is 50% off** (Haiku 5.5 batch $0.05/$0.25).
- US-only inference (`inference_geo: "us"`) carries a 1.1× multiplier. Bedrock/Google Cloud regional endpoints carry a +10% premium.
- Claude 4.7+ models use a tokenizer producing "approximately 30% more tokens for the same text".
- Web search costs $10/1k searches. — [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)

**Google Gemini (USD per million tokens, input/output)**
- Gemini 2.5 Flash-Lite: **$0.10/$0.40**.
- Gemini 3.1 Flash-Lite: $0.25/$1.50.
- Gemini 3.5 Flash-Lite: $0.30/$2.50.
- Gemini 2.5 Flash: $0.30/$2.50.
- Gemini 3 Flash Preview: $0.50/$3.00.
- Gemini 3.6 and 3.8 Flash: **$0.75/$3.75 through 31 Dec 2026**, then $1.50/$7.50 from 1 Jan 2027.
- Search grounding: $14/1k (Gemini 3+) or $35/1k (2.5). — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

**Mistral** (EU-headquartered vendor; USD per million tokens, input/output)
- Ministral 3 3B: $0.10/$0.10.
- **Ministral 3 8B: $0.15/$0.15.**
- Ministral 3 14B: $0.20/$0.20.
- **Mistral Small 4: $0.15/$0.60.**
- Mistral Medium 3.5: $1.50/$7.50.
- Mistral Large 3: $0.50/$1.50.
- Mistral Large 4: $1.36/$4.18.
- Cached input is ~0.1× input.
- Batch processing reduces price by 50%. — [Mistral docs pricing](https://docs.mistral.ai/inference/pricing); [mistral.ai/pricing](https://mistral.ai/pricing)

**Self-hosting on EU GPUs**
- Hetzner GEX45 (RTX PRO 4000 Blackwell 24 GB): €214/month. GEX63 (RTX PRO 6000 Blackwell Max-Q 96 GB): €999/month. — [Hetzner GPU matrix](https://www.hetzner.com/dedicated-rootserver/matrix-gpu/)
- Third-party vLLM benchmarks on the RTX Pro 6000 Blackwell: ~1,999 tok/s (Llama-3.1-8B FP8). For Qwen3-8B the figures conflict (5,988 vs 1,531 tok/s, concurrency unspecified). These numbers are for the full-power card, not the Max-Q variant Hetzner rents. — [trooper.ai benchmark](https://www.trooper.ai/benchmarks-compare-RTX-Pro-6000-Blackwell-with-RTX-4090-Pro)

### Inferences
**ESTIMATE — cost per 1,000 answered queries** (lean = 3,500 in / 300 out tokens; rich = 8,000 in / 500 out)

| Model | Lean | Rich |
|---|---|---|
| Claude Haiku 5.5 | $0.50 (€0.45) | $1.05 (€0.94) |
| Gemini 2.5 Flash-Lite | $0.47 (€0.42) | $1.00 (€0.89) |
| Ministral 3 8B | $0.57 (€0.51) | $1.27 (€1.14) |
| Mistral Small 4 | $0.70 (€0.63) | $1.50 (€1.34) |
| Gemini 3.1 Flash-Lite | $1.32 (€1.18) | $2.75 (€2.45) |
| Gemini 2.5 Flash | $1.80 (€1.61) | $3.65 (€3.26) |
| Gemini 3.6/3.8 Flash (2026 price) | $3.75 (€3.35) | $7.88 (€7.03) |
| Gemini 3.6/3.8 Flash (2027 price) | $7.50 (€6.69) | $15.75 (€14.06) |
| Claude Haiku 4.5 | $5.00 (€4.46) | $10.50 (€9.37) |
| Claude Sonnet 5/5.5 | $10.00 (€8.92) | $21.00 (€18.74) |

- Adjustments:
  - Add ~30% for Claude 4.7+ tokenizer inflation where applicable.
  - Subtract 50% for batch or offline use, e.g. pre-computing answers for popular queries.
  - Caching the shared system prompt cuts the input cost further.

**ESTIMATE — self-hosted 8B model on a GEX63 (€999/month)**
- At ~2,000 output tok/s and 300 output tokens per answer: ≈6.7 answers/s ≈ 17M answers/month.
- That is ≈ **€0.06/1k at 100% utilisation and ≈ €0.19/1k at 30%**. At 6,000 tok/s: €0.02–0.06/1k.
- Prefill of the 3.5k-token context is ignored, so real throughput is lower (likely 2–3×). Treat this as a lower bound.
- Self-hosting only beats API pricing (~€0.45/1k) above roughly 2M+ answers/month. It does, however, keep queries in the EU on owned hardware, a GDPR advantage.

**Overall unit cost**
- An AI answer engine built on a $5/1k search API plus Haiku-5.5-class synthesis costs ≈ **€5 per 1,000 queries**, or ~€0.005 per query.
- A Kagi-like user at ~14 queries/day generates ~420 queries/month, ≈ €2.10/month COGS. That is within a €5–10 subscription.

### Gaps
- No vendor-published EU-region (data residency) price for the Claude first-party API. The page mentions only a US-only multiplier.
- Mistral's EUR price table and its EU-hosting terms were not retrieved.
- No benchmark specific to the RTX PRO 6000 Max-Q / RTX PRO 4000 under realistic RAG prompt lengths.
- Scaleway/OVH GPU hourly prices were not collected.

---

## 5. Distribution and monetization: how did challengers acquire users, what do defaults cost, and which models work at small scale?

### Takeaway
Defaults are a pay-to-play market priced far beyond a small studio: Google paid Apple $20B in 2022, and Mozilla gets most of its ~$0.5–0.65B revenue from search royalties. Challengers that grew did so through **owned distribution**:
- Brave via its own browser (122M MAU).
- DuckDuckGo via apps, extensions and choice screens.
- Ecosia via mission marketing and extensions.
- Perplexity via bundling deals with telcos, OEMs and fintechs.
- Kagi via word of mouth to a paying niche.

At small scale, two models work. Subscriptions work (Kagi ~75k members). B2B APIs sold to AI companies are currently the most capital-attracting model (Exa, Tavily, Parallel). Ad syndication revenue requires a Microsoft/Google partnership and scale.

### Cited Findings
**Default deal economics**
- Google paid Apple **$20B in 2022** for Safari default. A Google witness disclosed that Google pays Apple **36%** of search-ad revenue from Safari. Microsoft reportedly offered Apple 90% revenue share for a Bing default. — [Gulf News (Bloomberg)](https://gulfnews.com/technology/companies/googles-payments-to-apple-reached-20-billion-in-2022-antitrust-court-documents-show-1.1714660457987); [Business Insider NL](https://businessinsider.nl/court-documents-reveal-googles-payments-to-apple-increased-to-an-eye-watering-20-billion/)
- Mozilla's 2023 revenue was ~**$653M** (vs ~$593M in 2022). Search-deal royalties were ~**$495M**, about three-quarters. — [OMG! Ubuntu](https://www.omgubuntu.co.uk/2024/12/mozilla-financial-report-2023-revenue-increase)
- In the US v. Google remedies phase, Mozilla's CFO testified to ~$570M revenue in the prior year, with ~85% from Google. This is a **secondary source**. — [Nerdschalk](https://nerdschalk.com/85-of-mozillas-revenue-at-risk-firefoxs-survival-threatened-by-potential-loss-of-google-search-deal/)

**Choice screens and switching friction** (DuckDuckGo submission to the UK CMA, early 2026; PDF created 25 Feb 2026)
- "Past choice screens have produced a switching rate of around 1%" (the CMA's figure).
- After the **EU DMA choice screen (March 2024)**, "DuckDuckGo's selection rates increased by approximately +40%" vs the older Android screen, in countries with UK-comparable brand recognition.
- "About 50% of users who install DuckDuckGo's search extension on Chrome become inactive over time" because of Chrome's "Change back to Google?" prompt.
- Deep-linking to default settings "could improve our conversion rate … by up to 100%".
- The UK is DDG's "largest market … outside the United States". — [DuckDuckGo CMA response (PDF)](https://assets.publishing.service.gov.uk/media/69b970da635612b767a46662/DuckDuckGo.pdf)

**Brave**
- Distribution runs through its own browser: 122.55M MAU and 51M DAU, against 2.46B monthly queries (July 2026). It joined Chrome's default-engine list in July 2026. — [PPC Land](https://ppc.land/brave-search-gains-a-spot-on-chromes-engine-list-at-2-46-billion-queries/)
- It became the default for new users in US/CA/UK/FR/DE in Oct 2021. — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search)

**DuckDuckGo**
- Revenue and headcount are only available from estimates, e.g. $100–200M revenue and 51–200 employees on Similarweb. These are **unverified third-party figures**.
- A 2022 Yale case study describes it as profitable, with 98 employees in July 2020. — [Similarweb](https://similarweb.com/company/duckduckgo.com); [Yale Tobin case PDF](https://tobin.yale.edu/sites/default/files/2022-11/DuckDuckGo.pdf)
- Exposure to Bing as upstream: the 2023 Bing price hike raised viability questions for engines that resell Bing. — [Techzine](https://www.techzine.eu/news/devops/102113/microsoft-increases-bing-api-prices-by-1000-problems-for-duckduckgo/)

**Ecosia**
- Self-reported **20M MAU**. Its ads are served through Microsoft Advertising under revenue share. — [Ecosia InfoDoc](https://companies.ecosia.org/hubfs/143969174/External%20assets%20for%20companies/Ecosia-Search-Engine-InfoDoc-FAQ.pdf?hsLang=en); [Reference.org](https://reference.org/facts/Ecosia/3WkYaTPR)
- 2025 revenue of **€43.2M** (Wikipedia, no primary source found). — [Wikipedia: Ecosia](https://en.wikipedia.org/wiki/Ecosia)
- EU monthly users were ~3.4M (Feb 2024, DSA transparency). — [Ecosia Help Center](https://ecosia.helpscoutdocs.com/article/402-reports-transparency)
- European Search Perspective (EUSP) is a 50/50 Qwant–Ecosia joint venture announced Nov 2024. It served first own-index results in France in Aug 2025. Targets were 50% of French queries by end-2025 and 33% in Germany (TechCrunch), while Ecosia stated 30%. **Staan** is its index API for third parties and AI chatbots. — [TechCrunch](https://techcrunch.com/2025/08/06/qwant-and-ecosia-debut-staan-a-european-search-index-that-aims-to-take-on-big-tech); [tech.eu](https://tech.eu/2025/08/06/ecosia-rolls-out-independent-search-results-in-europe-taking-another-giant-step-away-from-big-tech/)

**Perplexity distribution deals**
- Motorola preload, with 3 months of Pro free (Apr 2025). — [NBC/CNBC](https://www.nbcmiami.com/news/business/money-report/perplexity-ai-enters-the-smartphone-market-with-motorola-partnership/3599167/?amp=1)
- Airtel: 1 year of Pro free for Airtel's subscriber base, reported at 390M+ (Jul 2025). — [Angel One](https://www.angelone.in/news/stocks-share-market/airtel-offers-free-17-000-ai-subscription-to-users-in-partnership-with-perplexity)
- PayPal/Venmo: 12-month Pro trial and Comet browser access (Sep 2025). — [Yahoo Tech](https://tech.yahoo.com/ai/articles/paypal-venmo-users-gain-early-130537421.html)
- ARR was estimated at >$450M (FT, Mar 2026), and the CEO later cited $500M revenue. These are **secondary**. — [Quashbugs summary](https://quashbugs.com/blog/perplexity-ai-statistics-revenue-users-queries-and-valuation)

**Kagi** (subscription)
- Trial: 100 searches. Starter **$5/month for 300 searches**. Professional **$10 unlimited**. Ultimate $25 with premium AI. Annual plans are 10% off. — [kagi.com/pricing](https://kagi.com/pricing)
- Family plans: $14 for 2 users and $20 for 6. — [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi)
- 75,675 members and ~1.05M queries/day (22 Oct 2026). — [kagi.com/stats](https://kagi.com/stats)

**Ad syndication terms**
- Google pays AdSense-for-Search partners a **51% revenue share** (2010 statement; unchanged "since 2005"). AdSense for content pays 68%. Current applicability is unverified. — [Google AdSense blog 2010](https://adsense.googleblog.com/2010/05/adsense-revenue-share.html)

**Neeva** (the subscription model failed at VC scale)
- Shut down because persuading users to switch was too hard. It was sold to Snowflake for enterprise/AI search ($185.4M). — [Wikipedia: Neeva](https://en.wikipedia.org/wiki/Neeva); [VentureBeat](https://venturebeat.com/ai/snowflake-acquires-neeva-days-after-the-search-startup-pivots-to-enterprise)

**B2B API to AI companies**
- Exa: ~$10M annualized revenue in Sept 2025, ~11× YoY (Sacra estimate). Customers include Cursor, v0 and Lovable. — [Sacra: Exa](https://sacra.com/research/exa-at-10m-growing-11x-yoy)
- Tavily was acquired for ~$275M (above). Exa is valued at $2.2B (above).

### Inferences
- **Paying for defaults is not an option** for a small studio. The realistic levers are:
  1. Own surfaces: a browser extension, mobile app, PWA or "set as default" flow. Note DDG's evidence that ~50% of Chrome-extension users are lost to Google's prompt.
  2. EU DMA choice screens. These apply only to large engines and to browsers designated as gatekeepers, and eligibility thresholds were not researched.
  3. Bundling with partners: telcos, banks or OEMs in Bulgaria/EU, mirroring Perplexity's Airtel/PayPal model.
  4. Mission or privacy marketing to a niche.
- **ESTIMATE — Ecosia revenue per user:** €43.2M ÷ 20M MAU ≈ **€2.2 per MAU per year**. Ad-funded search at small scale yields very little per user. 100k MAU would generate ~€216k/year, minus hosting and API COGS.
- **ESTIMATE — subscription per user:** Kagi at $10/month = $120/year per user, roughly 50× Ecosia's per-MAU ad revenue. It needs a tiny but motivated audience; Kagi has ~75k after ~4 years post-launch.
- **B2B/API** (selling search to AI builders and agents) is where 2025–26 money and exits concentrated: Exa, Tavily, Parallel. That market is crowded and price-compressed at ~$1–5/1k, so a small EU entrant would need a differentiated index (EU languages, sovereignty, specific verticals) rather than generic web search.

### Gaps
- Microsoft Advertising syndication revenue-share terms are not public; none were found.
- No affiliate-revenue data for search engines.
- No DuckDuckGo primary financials.
- No current Ecosia monthly financial report retrieved.
- No search-specific DMA choice-screen eligibility rules researched.
- No Bulgarian telco or OEM bundling precedents researched.

---

## 6. Which niche or vertical wedges have proven viable for small teams?

### Takeaway
Proven small-team wedges:
- **Paid ad-free search** (Kagi: ~75k members, profitable status unknown).
- **Small-web/indie discovery** on one server with grants (Marginalia).
- **Independent index licensed via API** (Mojeek, with a handful of staff).
- **AI-agent search APIs** (Exa/Tavily/Parallel), which proved viable but became capital-intensive and consolidating.

Country/language search works only where an incumbent existed before Google's dominance: Seznam holds ~13.5% of Czech search. In **Bulgaria, Google has ~96% share** and there is no local engine, so a pure "Bulgarian general search" wedge has no precedent and faces a near-monopoly.

### Cited Findings
- **Seznam (Czechia):** 13.51% of all-platform search share (Jun 2026) and 16.1% on desktop+tablet (Aug 2026), per StatCounter. — [StatCounter CZ](https://gs.statcounter.com/search-engine-market-share/all-platforms/czech-republic); [StatCounter CZ desktop+tablet](https://gs.statcounter.com/search-engine-market-share/desktop-tablet/czech-republic)
- **Bulgaria (Sep 2026):** Google 95.98%, Bing 3.04%, Yandex 0.41%, DuckDuckGo 0.24%, Yahoo 0.12%, Ecosia 0.08%. — [StatCounter Bulgaria](https://gs.statcounter.com/search-engine-market-share/all/bulgaria)
- **Small web:**
  - Marginalia runs on one server (512 GB RAM, ~88 TB SSD) with a $15k FUTO grant. — [marginalia.nu/log/90](https://www.marginalia.nu/log/90-new-server-design/); [marginalia.nu/log/88](https://www.marginalia.nu/log/88-futo-grant/)
  - Kagi uses Marginalia as a source, and its own Teclis index serves small-web results. — [Kagi search sources](https://help.kagi.com/kagi/search-details/search-sources.html); [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi)
- **Independent index as B2B supply:** Mojeek sells an API (£2–3/1k) on a 9.76B-page index. — [Mojeek API](https://www.mojeek.com/services/search/web-search-api/); [Mojeek forum](https://community.mojeek.com/t/how-is-mojeek-doing/2795)
- **European index JV:** Staan/EUSP targets AI chatbots and other engines at "a tenth of the cost". — [TechCrunch](https://techcrunch.com/2025/08/06/qwant-and-ecosia-debut-staan-a-european-search-index-that-aims-to-take-on-big-tech)
- **AI-agent search APIs:**
  - Exa: ~$10M ARR (Sep 2025, estimate), used for "code snippet search and documentation retrieval" by vibe-coding tools. — [Sacra: Exa](https://sacra.com/research/exa-at-10m-growing-11x-yoy)
  - Tavily → Nebius (~$275M). — [SiliconANGLE](https://siliconangle.com/2026/02/10/ai-infrastructure-giant-nebius-buys-agentic-search-startup-tavily/)
  - Parallel and Linkup are priced at $1–5/1k. — [parallel.ai/pricing](https://parallel.ai/pricing); [Linkup FAQ](https://docs.linkup.so/pages/faq/faq.md)
- **Enterprise/site-search exit:** Neeva pivoted to enterprise search and was acquired by Snowflake days later. — [VentureBeat](https://venturebeat.com/ai/snowflake-acquires-neeva-days-after-the-search-startup-pivots-to-enterprise)
  - A search summary said Neeva's technology later powered Snowflake Cortex Search, but I did not verify it against a primary source.
- **Replacement demand for site search:** Google CSE JSON API is closing (new customers blocked; existing customers until 1 Jan 2027), and Google suggests Vertex AI Search for ≤50 domains. — [Google CSE overview](https://developers.google.com/custom-search/v1/overview)
- **Cautionary case:** open-source Stract, NLnet-funded, was archived on 2 Apr 2026. — [GitHub: Stract](https://github.com/StractOrg/stract)

### Inferences
- **Plausible wedges for a Bulgarian EU studio** (inference, not evidence of success):
  1. **Site search and "CSE replacement"** for EU/Bulgarian publishers, municipalities and e-shops. Google CSE retirement on 1 Jan 2027 creates migration demand. A small index (millions of pages) fits on one AX102.
  2. **Bulgarian/Balkan-language and public-data vertical index sold as an API to AI builders** (grounding in BG/EU sources, GDPR/EU-hosted). This differentiates against US APIs at ~$5/1k.
  3. **Paid, private metasearch with an EU-hosted AI answer layer**, Kagi-style, built on a licensed index (Mojeek Business, or Brave with storage rights) plus cheap synthesis. COGS ≈ €2–5/1k queries.
  4. **Government/public-data vertical**, e.g. Bulgarian legislation, procurement, registries. No precedent data was collected.
- A general-purpose Bulgarian web search competing head-on with Google (96%) lacks any successful precedent in a market without a pre-existing local incumbent. Seznam's share is a legacy of pre-Google entrenchment, which is my inference since its history was not researched here.

### Gaps
- No data collected on jobs, product/shopping, code (beyond Exa's use), or academic vertical-search economics.
- No data on Bulgarian-language web size (pages/domains), e.g. the share of `.bg` and Bulgarian-language pages in Common Crawl.
- Seznam revenue and headcount were not found (only EMIS paywalled: +4.82% revenue in 2024). — [EMIS](https://www.emis.cn/php/company-profile/CZ/SeznamCz_AS_en_2102401.html)
- Naver, Yandex and Baidu were not researched.

---

## 7. Team sizes and timelines

### Takeaway
Usable independent indexes have come from very small teams over long periods: Mojeek has a ~5-person dev team and took ~11 years to reach 1B pages, and Marginalia is essentially one person. Fast paths either bought a team (Brave acquired the ex-Cliqz Tailcat team and reached beta ~3 months later and GA ~15 months later) or skipped the index entirely (Perplexity launched ~3.5 months after founding on third-party models and search). Kagi took ~4 years from founding to public launch. VC-scale teams (Neeva ~25–50 people, $77.5M) did not reach sustainability in ~4 years.

### Cited Findings
- **Kagi:** founded 2018; public beta June 2022; funded with ~$3M (founder) + ~$2.5M (93 community angels). Headcount not disclosed: the company page says only "actively hiring". — [Kagi company page](https://help.kagi.com/kagi/company/); [Vladimir Prelovac](https://vladimir.prelovac.com/)
- **Mojeek:**
  - Started in 2004 in the founder's bedroom.
  - Nov 2020: development team "comprises four individuals alongside Marc", i.e. 5. — [Mojeek blog FAQ 2020](https://blog.mojeek.com/2020/11/frequently-asked-questions-about-mojeek-objectives-company-and-team.html)
  - Third-party headcount estimates range from 3 to 10 (Built In says 10; PitchBook/LeadIQ say 3). These are **unreliable**. — [Built In](https://builtin.com/company/mojeek); [LeadIQ](https://leadiq.com/c/mojeek/5a1dc95e2300005b00ce0d68)
  - 1B pages in 2015 (~11 years after start) and 9.76B by May 2026. — [Mojeek Team & Technology](https://mojeek.com/about/technology.html); [Mojeek forum](https://community.mojeek.com/t/how-is-mojeek-doing/2795)
  - The CEO (Colin Hayhurst) left, and a new team member joined in 2026. — [Mojeek forum](https://community.mojeek.com/t/how-is-mojeek-doing/2795)
- **Brave Search:**
  - Tailcat (ex-Cliqz) team acquired in Mar 2021 (secondary). — [dkb.io](https://dkb.io/post/DEPR_brave-search-interview)
  - Beta 22 Jun 2021, GA Jun 2022, API May 2023, Bing fully removed 2023. — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search)
  - Team size not found.
- **Neeva:** founded 2019; 25 employees (Jun 2020); ~50 at shutdown (May 2023); raised $77.5M; consumer search ended 2 Jun 2023. — [Wikipedia: Neeva](https://en.wikipedia.org/wiki/Neeva); [gHacks](https://www.ghacks.net/?p=195321)
- **Perplexity:**
  - Founded 22 Aug 2022; search engine launched 7 Dec 2022; 52 employees (2024, Wikipedia infobox). — [Wikipedia: Perplexity](https://en.wikipedia.org/wiki/Perplexity_AI)
  - Third-party trackers give ~1,100–1,600 in 2026. The CEO said headcount rose 34% while revenue grew from $100M to $500M. These are **conflicting and secondary**. — [TrueUp](https://trueup.io/co/perplexity-ai); [Latka](https://getlatka.com/companies/perplexity.ai)
- **Exa:** headcount ~40–80 (Oct 2025, Salestools) or ~90 (2026, Latka). These are **conflicting third-party estimates**. — [Salestools](https://salestools.io/en/report/exa-85m-series-b-september-2025); [Latka](https://getlatka.com/companies/exa.ai)
- **Marginalia:** a one-server design, with the blog written in the first person by its author. — [marginalia.nu/log/90](https://www.marginalia.nu/log/90-new-server-design/)
  - "Single developer" is my reading of the blog. Wikipedia covers the project but was not fetched this session, so it is not re-verified. — [Wikipedia: Marginalia](https://en.wikipedia.org/wiki/Marginalia_(search_engine))
- **Wilson Lin:** solo, ~2 months, 280M pages, with a semantic index. — [blog.wilsonl.in](https://blog.wilsonl.in/search-engine/)
- **Stract:** NLnet grant from Dec 2023 to Dec 2024; repository archived Apr 2026, roughly 1.3 years after the grant ended. — [NLnet](https://nlnet.nl/project/Stract/); [GitHub](https://github.com/StractOrg/stract)
- **Ecosia/Qwant EUSP:** JV announced Nov 2024; first own-index results Aug 2025 (~9 months), built on Qwant's existing index work. — [TechCrunch](https://techcrunch.com/2025/08/06/qwant-and-ecosia-debut-staan-a-european-search-index-that-aims-to-take-on-big-tech)

### Inferences
- **For a small studio (2–5 engineers):**
  - A metasearch/API-based product with an AI answer layer is achievable in **weeks to a few months** (Perplexity's 3.5-month launch is the extreme; Wilson Lin's prototype took 2 months solo).
  - A **usable niche/vertical index** (≤100M–1B pages) takes on the order of **6–24 months**.
  - A **general-purpose 5–10B-page index of competitive quality** has historically taken **many years**: Mojeek took ~2 decades to reach 9.8B pages with ~5 developers, and Brave started from an acquired team with years of Cliqz work.
  - These ranges are inferences from the cases above, not measured benchmarks.
- **Recurring failure mode:** funding ends before distribution is solved (Neeva, and Stract as an open-source project). Plan revenue (API/B2B or subscriptions) from day one.

### Gaps
- No primary headcount for Kagi, Brave Search, DuckDuckGo, Exa or Tavily.
- No data on how long Kagi's Teclis or Brave's index took to reach "usable" quality by any metric.
- Bulgarian salary benchmarks for search/IR engineers were not collected.
