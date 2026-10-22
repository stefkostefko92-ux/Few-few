# Independent, Alternative and Regional Search Engines — Survivors, Failures and Lessons for a New Entrant (status as of 22 Oct 2026)

Research notes. Research date: 2026-10-22. Each item carries a date where the source gives one. Labels used:
**[company claim]** means self-reported and unaudited. **[secondary]** means an aggregator, review site or forum, not a primary source. **[single source]** means I found only one source and could not cross-check it. **[possibly outdated]** means the newest source I found is more than about 12 months old.
Method note: several 2026 items, such as the DMA fine, the Firefox–Startpage deal and the Presearch shutdown, come from just one outlet or a Wikipedia line. They are flagged where they appear.

---

## Engine-by-engine profiles (index, technology, business model, differentiators, traction, weaknesses, status)

### Takeaway
About six of the listed Western/independent engines run a crawler-built web index of real scale: Brave, Mojeek, the EUSP/Staan index behind Ecosia and Qwant, Marginalia (small), Stract (small) and Yep. The rest either syndicate (Bing, Google) or blend several sources (Kagi, SearXNG). The regional champions (Seznam, Naver, Yandex, Baidu) all have their own indexes and lean on local language and services.

### Cited Findings

#### DuckDuckGo (US) — syndicated (mainly Bing) plus its own vertical indexes
- Source of results: "traditional links and images" come "largely" from Bing. DDG also runs "our own crawler (DuckDuckBot) and many indexes". Instant Answers draw on specialised sources such as Sportradar and Wikipedia. Requests to partners are proxied, so partners do not see the user's IP — [DDG help: results sources](https://duckduckgo.com/duckduckgo-help-pages/results/sources) (fetched 2026-10-22)
- Bing API retirement: a DDG spokesperson (Kamyl Bazbaz) told WIRED that DDG was unaffected "for now" and that Microsoft is "retiring the self-serve version". Customers with private long-term Microsoft deals keep access — WIRED reporting (May 2025) as relayed by [Privacy Guides forum](https://discuss.privacyguides.net/t/microsoft-set-to-pull-the-plug-on-bing-search-apis-in-favor-of-ai-alternative/27606) [secondary; original WIRED piece not retrieved]
- AI layer: You.com lists DuckDuckGo as an enterprise API customer (Sept 2025) — [Unite.AI](https://www.unite.ai/you-com-raises-100m-becomes-a-unicorn-as-it-pivots-from-search-to-ai-infrastructure/)
- Traction: DDG's press page reportedly gives about 3 billion monthly searches (roughly 100M/day). In June 2021 DDG said it had been profitable since 2014, with annual revenue above $100M — [yespress.io, 07 Oct 2026](https://yespress.io/duckduckgo) [secondary; I did not see the press page myself]. Other sites quote $420M revenue for 2026; they are low-quality and I give that figure no weight — [searchendurance](https://searchendurance.com/duckduckgo-statistics/) [secondary]
- Business model: contextual (keyword) ads and affiliate commissions, not profile-based targeting — [nichepursuits](https://www.nichepursuits.com/?p=33154) [secondary]

#### Ecosia (Germany) — Bing/Google syndication, moving to its own EUSP index
- 2023: results "sourced predominantly from Google" — [Wikipedia: Ecosia](https://en.wikipedia.org/wiki/Ecosia)
- 2026: organic results can come from Bing, Google or EUSP, depending on location, device, cookie consent and query — 2026 review via [thesustainableagency](https://thesustainableagency.com/blog/how-to-do-seo-for-ecosia/) [secondary]
- In France, where Ecosia started using the index in 2025, EUSP already serves **more than half of Ecosia's search queries**. The German rollout is under way and Christian Kroll (LinkedIn) expects a large share of German queries on the index by year-end 2026 — [onlinemarketing.de, 4 Aug 2026](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland)
- EUSP also powers Ecosia's AI Overviews. Ecosia's AI features run on clean energy, can be switched off and skip energy-heavy features (video generation, deep research) — [onlinemarketing.de, 4 Aug 2026](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland)
- Business model: search ads, with profits going to environmental projects (mainly tree planting) — same source
- Traction: 1.18% share in Germany (StatCounter, Sept 2025), 6th place. Global share 0.10–0.15% (2025) — [drweb.de](https://www.drweb.de/ecosia/) and [Wikipedia: Ecosia](https://en.wikipedia.org/wiki/Ecosia) [figures as reported by search snippets]
- Leadership conflict: heise (30 Jul 2026) names **Wolfgang Oels** as Ecosia CEO, while onlinemarketing.de (4 Aug 2026) calls **Christian Kroll** CEO. Unresolved; Kroll is the founder — [heise](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-German-web-index-11385019.html); [onlinemarketing.de](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland)

#### Qwant (France) — historically mostly Bing; now partly the EUSP/Staan index
- Ownership: since 2023, Synfonium (Octave Klaba of OVHcloud and family 75%, Caisse des Dépôts 25%) — [Wikipedia: Qwant](https://en.wikipedia.org/wiki/Qwant); [Sifted](https://sifted.eu/articles/qwant-entrepreneur-european-rival-google-klaba)
- Finances (2022–23): €10.5M cash in July 2022. Reportedly valued at about €50M, "almost all of that representing the debts it owes" — [Sifted](https://sifted.eu/articles/qwant-entrepreneur-european-rival-google-klaba) [possibly outdated]
- History: own indexing began in 2013 but the engine stayed "heavily dependent on Microsoft's Bing" (government audits) — [Wikipedia: Qwant](https://en.wikipedia.org/wiki/Qwant)
- Qwant brought its indexing infrastructure, engineers and data scientists into the 50/50 EUSP JV, and Ecosia contributed cash — [Wikipedia: Ecosia](https://en.wikipedia.org/wiki/Ecosia)
- 2026: "Qwant is now the default search engine of the EU Parliament" — [onlinemarketing.de, 4 Aug 2026](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland) [single source]
- A search summary says Qwant announced at VivaTech 2026 a public opening of the Staan API aimed at AI workflows. I could not find a primary source, so this is [unverified]. onlinemarketing.de does confirm that "the Staan search API is now available as a self-service product" (Aug 2026)

#### EUSP / Staan (Ecosia–Qwant JV, Paris/Berlin) — own European index
- Formed at the end of 2024 as a 50/50 JV. The French index has been live since **Aug 2025**, feeding part of Ecosia's and Qwant's results, and has "several customers". On **30 Jul 2026** EUSP launched its own **German** index with its own ranking algorithms. The German index holds about **1 billion pages**, similar to the French one (per Ecosia CEO Wolfgang Oels). Ecosia will raise the German share gradually — [heise, 30 Jul 2026](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-German-web-index-11385019.html)
- Staan = "Search Trusted API Access Network". Third-party search engines and AI providers can license it — [heise](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-German-web-index-11385019.html)
- Customers include Ecosia, Qwant and the French engine **Lilo** — [onlinemarketing.de](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland)
- Pricing claim (Aug 2025): Staan delivers results "at a fraction of the cost — up to a tenth of Google and Bing's pricing", per Christian Kroll — [Tech.eu, 6 Aug 2025](https://tech.eu/2025/08/06/ecosia-rolls-out-independent-search-results-in-europe-taking-another-giant-step-away-from-big-tech/) [company claim]
- Policy push: in **March 2026** EUSP sent open letters to all EU heads of government. They proposed national search indexes as public digital infrastructure and extending Staan to more member states — [heise](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-German-web-index-11385019.html)
- 2025 targets of about 30% of French queries and about 33% of German queries by end-2025 appear in search snippets only. The Aug 2026 article reports ">50% of Ecosia French queries", which suggests the French target was exceeded — [heise 2025](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-web-search-via-European-index-10513567.html) [snippet, not fetched]

#### Startpage (Netherlands; majority-owned by US System1) — syndicated Google plus Bing
- Pays for Google results (Google-only since 7 Jul 2009). Bing results and ads were added on some result pages from March 2023 — [Wikipedia: Startpage](https://en.wikipedia.org/wiki/Startpage); [System1 IR, Mar 2023](https://ir.system1.com/news/news-details/2023/Startpage-Bolsters-Private-Search-Results-with-New-Product-Enhancements-and-Integrations/default.aspx)
- Ownership: System1's Privacy One Group took a majority stake in Oct 2019 (Surfboard Holding BV, The Hague) — [Wikipedia: Startpage](https://en.wikipedia.org/wiki/Startpage)
- Business model: contextual keyword ads. No IP logging since Jan 2009. "Anonymous View" proxy since 2018 — same source
- Traction: about 2 billion searches estimated in 2017, and no newer figure found — same source [possibly outdated]
- **Aug 2026:** Mozilla added Startpage as a built-in search option in **Firefox 154** desktop for DE/FR/AT/CH/NL, with mobile planned — [Wikipedia: Startpage](https://en.wikipedia.org/wiki/Startpage) [single source]
- EU-sovereignty lists exclude Startpage because of majority US ownership — [eurotechguide, Feb 2026](https://eurotechguide.com/state-of-european-tech/part-4-search-engine-sovereignty-in-europe-progress-compromises-and-hard-truths/)

#### Brave Search (US) — own index; fully independent web results since April 2023
- Origin: built on Tailcat, acquired from Cliqz (Hubert Burda Media). It became the Brave browser's default in the US, CA, UK, FR and DE in Oct 2021 — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search)
- Independence: on 27 Apr 2023 Brave said "Every Web search result seen in Brave Search is now served by our own index". It removed the Bing calls that had covered about 7% of results. Its "global independence score" rose from 87% to 93% in under a year; at launch (June 2021) about 13% of queries needed third-party help. Volume was about **22M queries/day** at that time. Google fallback mixing stayed as an optional user setting — [Brave blog, 27 Apr 2023](https://brave.com/blog/search-independence/)
- Image and video moved to Brave's own index in Aug 2023 — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search)
- Index size: Brave's API page and its 2026 guide claim **40+ billion pages**. Older claims were 30B+ (2024) and 35B — [Brave Search API](https://brave.com/search/api/); [Brave: best search APIs 2026](https://brave.com/learn/best-search-api-2026/) [company claim, via search snippet]
- Traffic: about **1.6B monthly searches (Sept 2025)**. Wikipedia warns the cited source concerns browser users and may be unreliable — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search) [company claim]
- Business model: privacy-preserving (non-behavioural) search ads since 2024, an ad-free paid **Search Premium** tier, and the **Search API** (announced May 2023). API pricing was reported as a 2,000-queries/month free tier and about $3 CPM paid — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search); [Brave learn page](https://brave.com/learn/best-search-api-2026/) [pricing from search snippet]
- Features: **Goggles** (2022), user-written and shareable re-ranking rules in a DSL with a 10,000-instruction cap. **Rerank** upvote/downvote of sites (Jan 2025). The AI Summarizer appeared on 30–40% of searches by 2025 — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search)
- Legal risk: Brave sued News Corp (Mar 2025) seeking a fair-use declaration for indexing and summarising, and News Corp **countersued in Jul 2026** alleging unlawful scraping — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search)

#### Mojeek (UK, Brighton) — own index, built from scratch
- Index passed **9 billion pages in 2025** (1B in 2015, 2B 2018, 3B 2020, 4B 2021, 5–6B 2022, 7B 2023, 8B 2024). Technology "created from the ground up". Founder Marc Smith built the crawler, indexing and algorithms and has worked on search since 2004. Hosted in "the UK's greenest data centre". "Added 100 more web servers" in 2019. Funding from private investors in 2009, 2013, 2016 and 2018, with no amounts disclosed. Products: **Mojeek Ads, Web Search API, Site Search API, Focus**, search boxes. "Independent search without tracking for over 15 years." 2024 additions: Search Summary and Semantic Search — [Mojeek About](https://www.mojeek.com/about/) [company claim]
- Servers sit in the Custodian data centres in Maidstone — [Wikipedia: Mojeek](https://en.wikipedia.org/wiki/Mojeek)
- Revenue estimate: about **$193k/year** (RocketReach, undated). This was the reason eurotechguide excluded Mojeek from its €20M+ revenue shortlist — [eurotechguide, Feb 2026](https://eurotechguide.com/state-of-european-tech/part-4-search-engine-sovereignty-in-europe-progress-compromises-and-hard-truths/) [estimate; basis is RocketReach, quality unknown]
- B2B role: Kagi listed Mojeek as a result source (April 2024) — [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi)

#### Kagi (US, Palo Alto) — paid metasearch plus small own indexes
- Sources: anonymised API calls to "all major search result providers worldwide", specialised engines such as **Marginalia**, and vertical providers (Wolfram Alpha, Apple, Wikipedia, Open-Meteo, Yelp, TripAdvisor). A typical search hits "about a dozen" sources at once. Own indexes are **Teclis** (web, small-web focus) and **TinyGem** (news). Pages heavy with ads and trackers are down-ranked; independent, ad-free and personal sites are promoted — [Kagi help: search sources](https://help.kagi.com/kagi/search-details/search-sources.html) (fetched 2026-10-22)
- Named sources (April 2024): Google, Brave, Mojeek, Yandex — [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi). The docs later replaced named providers with the generic wording — [kagi-docs commit](https://github.com/kagisearch/kagi-docs/commit/6baff1c066db9b3d804653ea19bc9d1c076a710b)
- Traction (**kagi.com/stats, 22 Oct 2026**): **75,675 members**, 10,160 families, 399 teams, 3,238 Orion+ members, **1,046,700 queries in the past day**, 21,404 Assistant threads in the past day. Members stayed roughly flat (75.5–75.7k) over 8–22 Oct — [Kagi stats](https://kagi.com/stats)
- Earlier: about 50,000 subscribers and 845,200 searches/day on 9 Jun 2025; "over 75,000" by Sept 2026 — [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi)
- Pricing: $5/mo for 300 searches, $10/mo unlimited, $25/mo Ultimate, family plans $14 and $20, and 100 free trial searches — [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi)
- Product moves: Kagi Assistant (announced 4 Sep 2024; all users from Apr 2025). Privacy Pass anonymous authentication and a Tor service (2025). Kagi News (30 Sep 2025). Orion browser for Linux/Windows ended on **2 Oct 2026** with code to be open-sourced — [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi)

#### Marginalia Search (Sweden) — own small index, non-commercial
- Built by Viktor Löfgren starting in 2021. Has its own crawler and index, written in Java, C++ and Python, AGPL-3, self-hostable, with an API. Runs on Löfgren's own low-powered hardware and takes "about an hour a week" to maintain. Favours text-heavy non-commercial sites. Lets users filter out pages with affiliate links, tracking or JavaScript. No ads, no registration. Domain: marginalia-search.com — [Wikipedia: Marginalia](https://en.wikipedia.org/wiki/Marginalia_(search_engine))
- Used as a source by Kagi — [Kagi help](https://help.kagi.com/kagi/search-details/search-sources.html)
- Index size and NLnet grant details: not found (Wikipedia only cites a 2023 NLnet interview)

#### Stract (Denmark) — open-source own index
- Open-source web search (AGPL) "targeted towards tinkerers and developers". It started from Common Crawl and now uses its own crawler — [GitHub: StractOrg/stract](https://github.com/StractOrg/stract)
- NLnet grant for 2023-12 to 2024-12, covering index and web-graph performance and a live news/blog index — [NLnet: Stract](https://nlnet.nl/project/Stract/)
- Ran on a server in the developer's office basement at about **1,000 searches/hour**; a one-person project — [404 Media](https://404media.co/this-guy-is-building-an-open-source-search-engine-in-real-time)
- Status as of 2026: **not confirmed**

#### Yep (Ahrefs; Singapore) — own index (Ahrefs crawler data)
- Beta launched in June 2022. Ahrefs invested about $40M by Aug 2021 and **$60M** by June 2022. It promised to give **90% of ad revenue to content creators**. YepTLDR AI summaries arrived in Apr 2023. SEJ's beta review called the results "passable" but not fresh — [Wikipedia: Yep](https://en.wikipedia.org/wiki/Yep_(search_engine))
- Status as of 2026: **not confirmed**. I found no shutdown report and no traffic data.

#### You.com (US) — consumer AI search pivoted to an enterprise search API
- Founded in 2020 by Richard Socher and Bryan McCann. YouChat (Dec 2022) was described as the first LLM chatbot with live web results. The YouPro subscription followed in June 2023. In Nov 2023 it launched web/news/RAG APIs for LLMs, and by 2025 it had moved from consumer search to enterprise customers and search APIs. The ARI deep-research agent launched in Feb 2025 — [Wikipedia: You.com](https://en.wikipedia.org/wiki/You.com)
- **Series C, Sept 2025: $100M at a $1.5B valuation** led by Cox Enterprises. It processes about **1B queries/month**, and customers include DuckDuckGo, Databricks, Harvey AI, DPA and the Telegraph — [Unite.AI](https://www.unite.ai/you-com-raises-100m-becomes-a-unicorn-as-it-pivots-from-search-to-ai-infrastructure/); [You.com Series C](https://you.com/articles/series-c?hsLang=en)
- About $50M annualised revenue reported in June 2025; consumer growth was slower than Perplexity's — [Shopifreaks](https://www.shopifreaks.com/you-com-eyes-1-4b-valuation-in-funding-talks-with-cox-enterprises/) [secondary]
- Index ownership (own vs. Bing): **not stated** in the sources I found

#### Neeva (US, 2019–2023) — ad-free subscription search; dead
- Founded in 2019 by Sridhar Ramaswamy (ex-Google SVP Ads) and Vivek Raghunathan. Raised **$77.5M**. Had 25 employees in June 2020. Results combined partners (incl. Bing) with its own crawler. Consumer search closed on **2 Jun 2023**. Snowflake bought it for **$185.4M in cash** (May 2023), and Ramaswamy later became Snowflake CEO — [Wikipedia: Neeva](https://en.wikipedia.org/wiki/Neeva)
- Neeva was one of the few Bing customers allowed to mix Bing results with its own index — per search-result summary of [Business Today](https://www.businesstoday.in/amp/technology/news/story/potential-google-search-challenger-neeva-shutting-down-pivots-towards-ai-382176-2023-05-21) [secondary]

#### Cuil (US, 2008–2010) — own huge index; dead
- Launched on 28 Jul 2008 claiming **120B pages** ("three times Google", per co-founder Anna Patterson) and 127B by Feb 2009. Raised **$33M** (Tugboat, Madrone, Greylock). Shut down on **17 Sep 2010** after an acquisition fell through; patents were reportedly sold to Google — [Wikipedia: Cuil](https://en.wikipedia.org/wiki/Cuil); [VentureBeat, 17 Sep 2010](https://venturebeat.com/2010/09/17/supposed-google-killer-cuils-reign-of-terror-may-finally-be-over)

#### Blekko (US, 2010–2015) — curated own index; acqui-hired
- Co-founded in 2007 by Rich Skrenta, Bob Truel and Michael Markson; public launch on 1 Nov 2010. Raised **$24M** (U.S. Venture Partners, CMEA, Andreessen, Conway). Indexed about **3B "trusted" pages** and excluded content farms. **Slashtags** let users filter: about 8,000 beta editors built about 3,000 slashtags, and editors pre-screened health and finance. Mozilla Firefox plugin in May 2012. **IBM acquired it in March 2015**; the service closed on 27 Mar 2015 and the technology went into Watson — [Wikipedia: Blekko](https://en.wikipedia.org/wiki/Blekko)

#### Seznam (Czech Republic) — own index plus a portal ecosystem
- Own crawler (SeznamBot), own ad network (**Sklik**), Czech-language focus, and an ecosystem: **Mapy.cz** (navigation, hiking, cycling), **Firmy.cz** business directory, news and real estate — [Search Engine World](https://www.searchengineworld.com/seznam-cz-search-engine-overview-for-web-marketers-seos); [Linguise](https://www.linguise.com/blog/guide/seznam-seo-guide-how-to-optimize-your-website-for-the-czech-search-engine/) [secondary]
- Share and Android lawsuit: see the regional-champions question

#### Naver (South Korea) — own index plus a UGC and portal moat
- 1999: first Korean portal with its own search engine. "Comprehensive search" launched in Aug 2000, five years before Google's universal search. **Knowledge iN** Q&A (2002) generated the Korean-language content the web lacked — [Search Engine Land](https://searchengineland.com/naver-the-google-of-south-korea-11627); [Wikipedia: Naver](https://en.wikipedia.org/wiki/Naver)
- Share and trend: see the regional-champions question

#### Yandex (Russia) — own index; 2024 corporate split
- **15 Jul 2024**: a Russian consortium bought Yandex's Russian businesses in a deal worth about **$5.4B**. Yandex N.V. received $2.8B in cash plus 162.5M of its own shares, renamed itself **Nebius Group**, and kept four AI and cloud units (cloud AI infrastructure, data labelling, self-driving, edtech). Chairman John Boynton: "All connections with Russia have now been severed." Arkady Volozh returned as CEO after the EU lifted his sanctions in March 2024 — [Silicon Republic](https://siliconrepublic.com/business/yandex-nv-russia-business-split-sale-nebius-group); [MediaPost](https://www.mediapost.com/publications/article/397637/yandex-split-final-as-russian-assets-sold-in-54b.html)
- The search engine (yandex.ru / ya.ru) now belongs to the Russian-owned entity, while Nebius is a separate, Netherlands-based AI cloud company — same sources

#### Baidu (China) — own index; protected market
- See the regional-champions question for share data.

#### Petal Search (Huawei) — mixed: own crawl in some markets, syndicated elsewhere
- In 2020–21 Huawei used its own crawling and indexing in Spain and Turkey and relied on partners elsewhere — [GSMArena](https://m.gsmarena.com/huawei_petal_search_now_functions_as_search_engine-news-45238.php)
- A tester saw Bing-provided results — [Android Authority](https://www.androidauthority.com/huawei-petal-search-1156767/)
- One reviewer (mirrored Feb 2025) says Petal uses Yandex in Russia and Qwant in some EU regions — [seirdy.one mirror commit](https://git.broken-by-design.fr/fmaury/seirdy.one/commit/37d7f6adbac711779c168343875991b987b3556b) [secondary, individual opinion]
- PetalBot still crawls to feed Huawei Mobile Services devices — [llmpulse PetalBot](https://llmpulse.ai/es/ai-crawler-index/petalbot) [secondary, undated]
- 2025–26 status: **no authoritative statement found**

#### Mullvad Leta (Sweden) — search proxy for Google and Brave; **shut down**
- Mullvad announced on 6 Nov 2025 that Leta would close on **27 Nov 2025**. Its reasons were search engines growing "hostile" to proxy access: tighter anti-bot measures, more CAPTCHAs and real-time behavioural signals — [TechRadar](https://www.techradar.com/vpn/vpn-services/mullvad-says-goodbye-to-proxy-search-citing-big-changes-in-the-search-industry); [AlternativeTo, Nov 2025](https://alternativeto.net/news/2025/11/mullvad-will-shut-down-its-privacy-focused-search-proxy-leta-on-november-27-2025)

#### Presearch (crypto/"decentralised") — mixed own node index plus syndication; **reportedly shut down July 2026**
- Moderators on its official subreddit announced on **24 Jul 2026** that it was closing "effective immediately". Services came back for a few days so users could withdraw tokens. The stated reason was missing a milestone of 1M legitimate daily searches — [Wikipedia: Presearch](https://en.wikipedia.org/wiki/Presearch_(search_engine)) [single source; Wikipedia marks it "better source needed" and the reason "citation needed"]
- Model: the PRE ERC-20 token, earned by node operators and searchers. Advertisers staked PRE on keywords. "Takeover" ads (late 2024) and an adult-brand "Spicy Mode" (2025) followed, along with a $1.2M WeFunder campaign in March 2025 — same source
- Claimed traction: about 12M searches/month and 40,000+ community nodes (Dec 2025) — [yellow.com](https://yellow.com/de/news/privacy-focused-presearch-rolls-out-independent-web-index-built-on-decentralized-network) [company claim]. A June 2025 claim of 390k MAU and 400k searches/day does not reconcile with that — [Benzinga, Jun 2025](https://www.benzinga.com/crypto/cryptocurrency/25/06/46093380/as-bing-goes-private-presearch-opens-censorship-resistant-search-api-for-developers) [company claim]

#### Swisscows (Switzerland, Hulbee AG) — Bing plus its own German-language index
- Uses Bing for web search plus its own index for the German edition — [Wikipedia: Swisscows](https://en.wikipedia.org/wiki/Swisscows)
- In 2015 CEO Andreas Wiebe called Bing "nur eine Lösung auf Zeit" (a temporary solution) and planned a full own index in 2016 — [Netzwoche, 2 Mar 2015](https://www.netzwoche.ch/news/2015-03-02/ich-mag-es-nicht-wenn-meine-daten-geklaut-werden)
- 20M monthly queries in 2018 (per Wiebe) — [Wikipedia: Swisscows](https://en.wikipedia.org/wiki/Swisscows) [possibly outdated]
- 2025–26 status of index and Bing dependence: **not found**

#### SearXNG / metasearch (open source, self-hosted) — no index of its own
- Aggregates other engines. Google has blocked some instances since 2019, and some instances silently drop Google — [Wikipedia: Searx](https://en.wikipedia.org/wiki/Searx)
- Google answers instance traffic with "Suspended: access denied", CAPTCHAs and HTTP 429 — [GitHub issue #2498](https://github.com/searxng/searxng/issues/2498); [Lemmy post](https://lemmy.uninsane.org/post/757276) [secondary]
- searx.space warns that public instances get blocked more often and recommends self-hosting — [searx.space](https://searx.space/)

### Inferences
- "Own index" covers very different scales: Brave claims 40B+ pages, Mojeek about 9B, EUSP about 1B per country index, while Marginalia and Stract are hobby-scale. Index size alone has never been enough; Cuil claimed 120B and still failed.
- The scraping and proxy layer (Leta, SearXNG, and partly Startpage's model) is getting less viable as Google hardens anti-bot defences. A new entrant cannot plan on scraping Google.

### Gaps
- Current own-index share for Ecosia in Germany and for Qwant overall: not published.
- Yep, Stract, Swisscows and Petal Search 2026 status: not confirmed.
- DDG's current traffic and revenue from a primary source: the press page was not retrieved.
- Marginalia index size and Brave's current independence ratio: not found.

---

## Which engines actually own a web-scale index, and what share of queries do they serve from it?

### Takeaway
Brave is the only Western consumer engine with a credible claim of near-100% own-index web results (since April 2023; claimed index 40B+ pages). Mojeek (about 9B pages) is fully own-index but small in traffic. EUSP/Staan already serves more than half of Ecosia's French queries (Aug 2026) and launched a German index in July 2026. Seznam, Naver, Yandex and Baidu run full own indexes in their home languages. DDG, Startpage, Swisscows and (before EUSP) Ecosia and Qwant are mainly syndicators.

### Cited Findings
- **Brave:** 100% of web results from its own index since 27 Apr 2023, up from 87% to 93% "independence score" before that. Optional Google fallback mixing remains for users who want it — [Brave blog](https://brave.com/blog/search-independence/)
- Brave says there is no fallback to another engine in its API — [Brave Search API](https://brave.com/search/api/) [via search snippet]
- **Mojeek:** own crawler and index from scratch, 9B+ pages (2025) — [Mojeek About](https://www.mojeek.com/about/)
- **EUSP/Staan:** about 1B-page German index (Jul 2026) alongside a similar French one. More than half of Ecosia's French queries come from EUSP (Aug 2026) — [heise](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-German-web-index-11385019.html); [onlinemarketing.de](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland)
- **DDG:** links and images come "largely" from Bing, alongside its own DuckDuckBot crawler and "many indexes" — [DDG help](https://duckduckgo.com/duckduckgo-help-pages/results/sources)
- **Kagi:** mostly third-party APIs. Its own Teclis and TinyGem indexes are niche (small web, news) — [Kagi help](https://help.kagi.com/kagi/search-details/search-sources.html); [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi) ("Teclis is used only for small-web searches")
- **Startpage:** paid Google results plus Bing, with no own index — [Wikipedia: Startpage](https://en.wikipedia.org/wiki/Startpage)
- **Swisscows:** Bing plus an own German-language index — [Wikipedia: Swisscows](https://en.wikipedia.org/wiki/Swisscows)
- **Neeva (historic):** own crawler plus Bing fallback. Ramaswamy (Jul 2022): "We increasingly use Bing as a fallback when we cannot answer queries" — [SEJ, 5 Jul 2022](https://www.searchenginejournal.com/building-a-better-search-engine-lessons-from-neevas-ceo/455483/)
- **Petal:** own crawl only in some markets (Spain, Turkey as of 2020–21) — [GSMArena](https://m.gsmarena.com/huawei_petal_search_now_functions_as_search_engine-news-45238.php)
- **Seznam:** own crawler SeznamBot — [Search Engine World](https://www.searchengineworld.com/seznam-cz-search-engine-overview-for-web-marketers-seos)
- **Naver:** own search engine since 1999 — [Wikipedia: Naver](https://en.wikipedia.org/wiki/Naver)

### Inferences
- A rough tier list:
  - (1) web-scale, near-100% own: Brave, plus Yandex, Baidu, Naver and Seznam at home
  - (2) own index of a meaningful but limited size, own share rising: EUSP (Ecosia/Qwant), Mojeek
  - (3) niche own index with heavy blending: Kagi, Marginalia, Stract, Swisscows (German)
  - (4) syndication or proxying only: DDG (mostly), Startpage, SearXNG, the defunct Leta
- The EUSP model is to build per-language, per-country indexes of about 1B pages each, rather than one "whole-web" index. This is the closest proven path for a small European entrant. Start with one language or market, where 1B well-chosen pages may cover most head queries.

### Gaps
- No engine except Brave (2023) publishes an ongoing own-index share. Brave's 2025–26 independence ratio was not found.
- No reliable independent audit exists of any index-size claim.

---

## What happened when Microsoft retired the Bing Search APIs (August 2025), and how did others adapt?

### Takeaway
Microsoft retired the self-serve Bing Search APIs on 11 Aug 2025 and pointed customers to the LLM-oriented "Grounding with Bing Search" in Azure AI Agents. Big contracted partners such as DuckDuckGo kept access under private deals. Smaller syndicators were squeezed and moved to Brave or Mojeek APIs, or built their own indexes; Ecosia and Qwant did the latter via EUSP. The 2023 Bing price hikes (up to about 10x) had already pushed Brave and others to leave.

### Cited Findings
- Retirement date 11 Aug 2025. "Existing instances … will be decommissioned completely", with no new sign-ups; the replacement is Grounding with Bing Search in Azure AI Agents — [Microsoft Learn lifecycle notice](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement); [AlternativeTo, May 2025](https://alternativeto.net/news/2025/5/microsoft-to-retire-bing-search-apis-in-august-2025-encourages-users-to-shift-to-azure-ai); [Simon Willison, 14 May 2025](https://simonwillison.net/2025/May/14/bing-search-api-is-being-retired)
- DDG was unaffected "for now" because Microsoft was "retiring the self-serve version". Brave's understanding was that companies with private long-term deals keep access. The largest customers kept access after 11 Aug, according to an anonymous source cited by WIRED — WIRED via [Privacy Guides](https://discuss.privacyguides.net/t/microsoft-set-to-pull-the-plug-on-bing-search-apis-in-favor-of-ai-alternative/27606) [secondary]
- Smaller engines renting Bing data were squeezed. Suggested replacements were the Brave Search API and the Mojeek Web Search API — [Softonic](https://en.softonic.com/articles/what-will-happen-to-search-engines-now-that-microsoft-is-shutting-down-the-bing-search-api); [Privacy Guides](https://discuss.privacyguides.net/t/microsoft-set-to-pull-the-plug-on-bing-search-apis-in-favor-of-ai-alternative/27606) [secondary]
- Background, 2023: after ChatGPT, Microsoft raised Bing API prices by as much as about 10x (up to 900% depending on tier). Brave called it "undue pressure for search engines that rely partly or fully on the Bing Search API" and dropped its remaining Bing calls (about 7%) — [Brave blog](https://brave.com/blog/search-independence/); [MediaPost](https://www.mediapost.com/publications/article/384882/brave-disconnects-microsoft-bing-from-its-web-sear.html)
- Kagi's March 2023 post: "search indexes are about to become several times more expensive" — [Kagi blog, 8 Mar 2023](https://blog.kagi.com/update-kagi-search-pricing)
- **Ecosia and Qwant** answered through EUSP/Staan. Partial own results in France arrived in Aug 2025, the same month as the API retirement; Germany followed in Jul 2026. By Aug 2026 more than 50% of Ecosia's French queries came from EUSP — [Tech.eu](https://tech.eu/2025/08/06/ecosia-rolls-out-independent-search-results-in-europe-taking-another-giant-step-away-from-big-tech/); [heise](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-German-web-index-11385019.html); [onlinemarketing.de](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland)
- **Startpage** already relied mainly on paid Google results (Bing since 2023), so the API retirement mattered less. Startpage did not comment to WIRED — [Wikipedia: Startpage](https://en.wikipedia.org/wiki/Startpage); [Softonic](https://en.softonic.com/articles/what-will-happen-to-search-engines-now-that-microsoft-is-shutting-down-the-bing-search-api)
- **You.com** had already become a search-API provider itself (Nov 2023) and reached about 1B queries/month by Sept 2025 — [Wikipedia: You.com](https://en.wikipedia.org/wiki/You.com)
- **Presearch** used the "Bing goes private" moment to market its own censorship-resistant search API (June 2025) — [Benzinga](https://www.benzinga.com/crypto/cryptocurrency/25/06/46093380/as-bing-goes-private-presearch-opens-censorship-resistant-search-api-for-developers). It reportedly shut down in July 2026 — [Wikipedia: Presearch](https://en.wikipedia.org/wiki/Presearch_(search_engine)) [single source]
- On the Google side, **Mullvad Leta** (a Google/Brave proxy) closed in Nov 2025 because of anti-bot hardening — [TechRadar](https://www.techradar.com/vpn/vpn-services/mullvad-says-goodbye-to-proxy-search-citing-big-changes-in-the-search-industry)

### Inferences
- Rentable search indexes are now an oligopoly. Microsoft serves large private deals and LLM grounding, and Google has no public web-search API. The remaining independent wholesalers are **Brave**, **Mojeek**, **EUSP/Staan** (EU, self-service since 2026), **You.com** (AI-oriented) and, previously, Yandex for some (Kagi). A new entrant's cost and supply risk is high unless it owns at least part of its index.
- The same pressure that hurt Bing syndicators (AI-driven API repricing) is also visible on the Google side (anti-scraping), so metasearch-only business models are fragile.

### Gaps
- No primary statement from Ecosia, Qwant, Startpage or Swisscows about their own Bing contract terms after Aug 2025.
- Grounding with Bing pricing was not retrieved.
- Whether DDG's private agreement still holds in Oct 2026 is not confirmed.

---

## How did Seznam, Naver, Yandex and Baidu hold off Google, and how are their shares trending?

### Takeaway
All four combined their own index and language-specific relevance with portal services (maps, directories, Q&A, news, mail) and with regulatory or legal leverage. Naver is strengthening: 62.9% in 2025, up from 58.1% in 2024, helped by AI Briefing. Yandex holds about 70% in Russia. Seznam holds a stable about 15% in Czechia. Baidu is the leader but sliding, with Bing growing on Chinese desktop.

### Cited Findings
**Seznam (CZ)**
- StatCounter, **Sept 2026**: Google 78.71%, **Seznam 15.05%**, Bing 4.73%, Yandex 0.63%, DDG 0.45% — [StatCounter CZ](https://gs.statcounter.com/search-engine-market-share/all/czech-republic) (fetched 2026-10-22)
- Other 2026 months: 13.53% (May) and 15.63% (Aug) — [StatCounter CZ](https://gs.statcounter.com/search-engine-market-share/all-platforms/czech-republic) [via search snippet]
- Older comparison: Google 74% vs. Seznam 26% at end-2018 (different source and method) — [Linguise](https://www.linguise.com/blog/guide/seznam-seo-guide-how-to-optimize-your-website-for-the-czech-search-engine/) [secondary]
- Defences: Czech-language focus; Mapy.cz, Firmy.cz, news and real-estate ecosystem; own ad network Sklik — [Search Engine World](https://www.searchengineworld.com/seznam-cz-search-engine-overview-for-web-marketers-seos)
- Legal: in Dec 2020 Seznam sought about **CZK 9.07bn** from Google for Android-licensing abuse covering 2011–2018. In June 2021 it raised the claim to about **CZK 10bn (about €400M)** — [GALA law blog](https://blog.galalaw.com/post/102h4xq/seznam-against-google); [Mondaq](https://webiis08.mondaq.com/advertising-marketing-branding/1102872/seznam-against-google)
- Chairman Pavel Zima said the EU-mandated Android choice screen had little effect, citing about 140,000 choice-screen selections of Seznam — [CzechCrunch](https://cc.cz/chovani-googlu-se-nezlepsilo-tvrdi-seznam-jako-nahradu-skody-proto-bude-pozadovat-10-miliard-korun/)

**Naver (KR)**
- InternetTrend data: **2025 Naver 62.86%** (up 4.72 pp from 58.14% in 2024), **Google 29.55%** (down 3.45 pp). **March 2026: Naver 63.8%, Google 28.7%**. Single-day peaks of 70.6% (28 Feb 2026) — [Korea Times, 16 Apr 2026](https://www.koreatimes.co.kr/amp/business/tech-science/20260416/naver-remains-dominant-player-in-koreas-search-market)
- Drivers per industry officials:
  - **AI Briefing**, Naver's generative summarised answers
  - users cross-checking ChatGPT and Gemini answers on Naver
  - Korean user-generated content in blogs and communities that global AI services find hard to replicate

  Analyst Choi Seung-ho (DS Investment) says it is uncertain whether near-double-digit ad growth can continue — same source
- History: Naver built Korean content itself (Knowledge iN Q&A, 2002) because "Google … doesn't have enough Korean-language data to trawl". Its integrated search launched in 2000 — [Search Engine Land](https://searchengineland.com/naver-the-google-of-south-korea-11627); [Wikipedia: Naver](https://en.wikipedia.org/wiki/Naver)

**Yandex (RU)**
- StatCounter, **June 2026**: Yandex about **71%** (yandex.ru about 60.8% plus ya.ru about 9.4%), Google about 26.5% — [StatCounter RU](https://gs.statcounter.com/search-engine-market-share/all-platforms/russian-federation); [StatCounter RU hosts](https://gs.statcounter.com/search-engine-host-market-share/all/russian-federation) [via search snippet]
- bne IntelliNews (Apr 2026) also reports about 70% and notes Russian authorities have not restricted Google — [IntelliNews](https://www.intellinews.com/yandex-captures-70-of-russia-s-search-market-outpacing-google-436161/)
- Regulatory lever: Yandex complained to Russia's FAS in Feb 2015 about mandatory Google-app pre-installation on Android. FAS found a violation in Sept 2015 and the courts upheld it. Yandex then took the complaint to the European Commission — [MarTech](https://martech.org/168474/); [eWeek](https://www.eweek.com/de/cloud/russian-court-rejects-google-s-appeal-of-antitrust-ruling/)
- 2024 split: see the profile above — [Silicon Republic](https://siliconrepublic.com/business/yandex-nv-russia-business-split-sale-nebius-group)

**Baidu (CN)**
- StatCounter, **June 2026**: Baidu 47.44%, Bing 23.24%, Haosou 14.02%, "Yandex" 10.23%, Sogou 2.62% — [StatCounter CN](https://gs.statcounter.com/search-engine-market-share/all-worldwide/china) [via search snippet; the 10% Yandex share in China looks anomalous and probably reflects referral-measurement artefacts]
- Another estimate: Baidu 58.23% (Jan 2026), down from 68.52% in 2023, at 71.91% on mobile; Bing reportedly over 30% on desktop — [Elite Asia](https://www.eliteasia.co/most-popular-search-engines-in-china/) [secondary; conflicts with StatCounter]
- StatCounter measures page referrals, not queries or users — noted by [Search Endurance](https://searchendurance.com/yandex-statistics/)

**Europe-wide context**
- Google has almost 90% of European search and about 95% on mobile (Jul 2026) — [heise](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-German-web-index-11385019.html)
- In Germany, Google has more than 85% and Bing more than 7% — [onlinemarketing.de](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland)

### Inferences
- Common pattern among the survivors:
  - (a) they arrived early, before or alongside Google in their local language
  - (b) they own content and services Google cannot crawl or replicate: UGC Q&A, blogs, maps, directories, classifieds
  - (c) portal habit and their own ad network fund the index
  - (d) they use competition law (Yandex at FAS, Seznam's lawsuit) against default and pre-install lock-in
  - (e) political or market separation (China, Russia) is the strongest shield and cannot be copied in the EU
- Naver's 2025–26 gains suggest a strong local-content corpus plus fast AI answers can defend share in the generative-AI era. A Bulgarian-language entrant would lack such a moat unless it builds one.
- Seznam shows the ceiling for a small-language EU market without walls: a stable 13–16% against Google, sustained by the ecosystem rather than search quality alone.
- Background not verified in this session: Google moved google.cn to Hong Kong in 2010, which left the mainland to Baidu.

### Gaps
- The status of Seznam's Czech court case in 2025–26 was not found.
- No primary source found on Yandex's Russian-morphology advantage or on Seznam's AI search features in 2025–26.
- No LiveInternet or Yandex-internal share for 2026.
- Baidu's AI-search (ERNIE) effect on share not researched.

---

## Why did Neeva, Cuil and Blekko fail, and what did Neeva's founders say about the economics of search?

### Takeaway
Neeva failed on **distribution**: users would not switch, and Google's default deals (Safari, Android) "freeze the ecosystem". Paying was not the main barrier. Cuil failed on **quality and launch execution**: a huge claimed index, poor relevance, outages and a collapse in traffic. Blekko had a good idea (curated anti-spam) and some distribution, but never reached scale and ended as an IBM acqui-hire. Ramaswamy's own lessons were to own the index from day one, keep technology at scale cheap, and recognise that defaults are the real wall.

### Cited Findings
- Neeva announced on 20 May 2023 the end of consumer search (closed 2 Jun 2023). Acquiring users "has been really hard", in a "different economic environment" — [CNBC, 20 May 2023](https://www.cnbc.com/2023/05/20/neeva-co-founded-by-a-former-google-exec-to-shut-down-its-consumer-search-product-and-focus-on-ai.html) [quotes via search snippet]; [Techmeme](https://www.techmeme.com/230520/p8)
- The founders found "convincing users to pay for a superior experience was less challenging than persuading them to try a new search engine in the first place" — [Business Today, 21 May 2023](https://www.businesstoday.in/amp/technology/news/story/potential-google-search-challenger-neeva-shutting-down-pivots-towards-ai-382176-2023-05-21)
- Google antitrust trial testimony (2023): an economic slowdown plus Google's paid placement on smartphones meant Neeva couldn't "grow our subscriber base fast enough". Google's default payments "basically freeze the ecosystem in place" — [Business Standard / Bloomberg, Oct 2023](https://www.business-standard.com/world-news/ex-googler-s-struggling-search-startup-becomes-antitrust-cautionary-tale-123100300091_1.html); [DOJ filing](https://www.justice.gov/atr/media/1402261/dl)
- Ramaswamy, July 2022 interview — [SEJ](https://www.searchenginejournal.com/building-a-better-search-engine-lessons-from-neevas-ceo/455483/):
  - The core distribution problem is "getting people to set us as the default search in Safari, which is impossible"
  - "we would have been better off investing in search from day one" (instead of starting on the Bing API)
  - "technology at scale is actually quite inexpensive"
  - a flat subscription price made a worldwide release easier
- Funding and team: $77.5M raised, 25 employees (June 2020). Exit to Snowflake for $185.4M cash, so investors were roughly returned — [Wikipedia: Neeva](https://en.wikipedia.org/wiki/Neeva)
- **Cuil**: launch-day outages, no results for common queries, and results judged no better than Google's — [MIT Technology Review](https://www.technologyreview.com/s/410535/a-google-killer-stumbles/). Its VP Product left after a month — [TechCrunch](https://techcrunch.com/?p=22150). Traffic had nearly bottomed out by Dec 2008 — [TechCrunch, 27 Dec 2008](https://www.techcrunch.com/2008/12/27/cuil-fail-traffic-nearly-hits-rock-bottom/%20). It closed on 17 Sep 2010 after an acquisition fell through — [VentureBeat](https://venturebeat.com/2010/09/17/supposed-google-killer-cuils-reign-of-terror-may-finally-be-over); [Wikipedia: Cuil](https://en.wikipedia.org/wiki/Cuil)
- **Blekko**: raised $24M, built a curated 3B-page index with slashtags and editors, got a Firefox plugin deal (2012), was acquired by IBM (Mar 2015) and closed — [Wikipedia: Blekko](https://en.wikipedia.org/wiki/Blekko); [Xconomy](https://legacy.xconomy.com/?p=297024). No official failure reasons are documented

### Inferences
- The failures have different root causes:
  - **Cuil**: quality and timing. Size without relevance, and a hype-driven launch that wasted its one chance at a first impression.
  - **Blekko**: niche quality without scale or distribution, so the curation cost could not be amortised.
  - **Neeva**: good quality, but no default distribution and a subscription price meeting free Google.

  In all three, the exit value went to the technology and team (Google patents, IBM Watson, Snowflake) rather than to the consumer product.
- Neeva's own lesson, "own your index from day one", plus Bing's 2023–25 repricing and retirement, supports building at least a partial own index early.

### Gaps
- Neeva's own shutdown blog post was not retrieved (archive.org blocked), so exact wording is via press quotes.
- Neeva's subscriber count at shutdown was not found.
- Cuil's and Blekko's peak traffic was not found.

---

## Which features do users explicitly value at Kagi, Brave, DDG and Marginalia?

### Takeaway
The differentiators users cite are:
- user control over ranking (block, boost or pin domains; Brave Goggles and Rerank; Kagi personalised ranking)
- no ads, or no tracking
- filters for "small web" and non-commercial content (Kagi Small Web and Lenses; Marginalia's affiliate, JS and tracking filters)
- bangs and shortcuts
- privacy-preserving AI answers that can be switched off

### Cited Findings
- **Kagi**:
  - Lenses (e.g. discussions, podcasts, PDFs, small sites); sites can be prioritised, de-prioritised, pinned or blocked
  - Small Web RSS feed; custom CSS
  - "bangs" redirects
  - a toggle to hide AI-generated images and de-clickbaited video thumbnails
  - opt-in AI quick answers with sources
  - Assistant with model choice — [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi)

  "Flip a toggle … to 'Small Web' and see only results from a hand-curated set of personal blogs" (The Verge, Mar 2025) — [Nieman Lab roundup](https://niemanlab.org/reading/the-future-of-search-isnt-google-and-its-10-a-month). Lenses can be used inside the Assistant (6 May 2025 changelog) — [Kagi changelog](https://kagi.com/changelog)
- **Kagi** ranking policy: down-rank pages heavy with ads and trackers, and promote independent, ad-free personal sites — [Kagi help](https://help.kagi.com/kagi/search-details/search-sources.html)
- **Kagi** privacy: Privacy Pass anonymous tokens and a Tor service (2025) — [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi)
- **Brave**: Goggles, user-written shareable re-ranking rule sets (2022). Rerank voting (Jan 2025). Option to collect no IP addresses by default. Ad-free Premium — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search)
- **DDG**: partner requests proxied with no user IP passed on; specialised Instant Answers — [DDG help](https://duckduckgo.com/duckduckgo-help-pages/results/sources)
- **Marginalia**: filters for affiliate links, tracking and JS, a per-result keyword-position visualisation, an "info" view of each site, and no ads — [Wikipedia: Marginalia](https://en.wikipedia.org/wiki/Marginalia_(search_engine))
- **Ecosia**: a mission (profits to reforestation) and AI that can be switched off and avoids energy-heavy features — [onlinemarketing.de](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland)
- **Mojeek**: "Focus" (site-group search), NoML campaign, cookieless preferences, Semantic Search (2024) — [Mojeek About](https://www.mojeek.com/about/)
- Blekko slashtags were an early version of curated, user-steerable verticals — [Wikipedia: Blekko](https://en.wikipedia.org/wiki/Blekko)

### Inferences
- Engines with the most loyal users trade raw recall for **control and trust**: the user shapes the ranking and the engine visibly does not monetise them. This can be built cheaply on top of any index, own or rented.
- Small-web and non-commercial discovery is a real but niche segment. Kagi's member count (about 75.7k) and Marginalia's one-person scale show its size.

### Gaps
- No quantitative user research found, such as surveys ranking features by importance. Evidence of "valued" features is mostly product and press descriptions.
- The DDG bangs count and usage data were not retrieved.

---

## What do these engines say publicly about costs and team sizes?

### Takeaway
Few engines publish costs. Kagi is the most open: **1.25¢ per search** in March 2023, with a goal of ≤1.5¢, and it said it was losing money on most accounts. EUSP claims Staan costs up to **one tenth** of Google or Bing pricing. Team sizes are tiny compared with Google: Kagi 15 people (2022), Neeva 25 (2020), Marginalia and Stract one person each, Mojeek a small team with its index built mostly by its founder.

### Cited Findings
- **Kagi costs** — [Kagi blog, 8 Mar 2023](https://blog.kagi.com/update-kagi-search-pricing):
  - "Currently it is 1.25 cents per search. We will try to keep the cost at 1.5 cents per search or below"
  - cost per search "rose significantly" between Sept 2022 and Mar 2023
  - "losing money on most accounts"
  - the average Kagi user makes about 700 searches/month (vs. 90–120 for typical Google users)
  - Kagi spends nothing on marketing
  - bootstrapped, with a "Family, Friends and Users" round planned in Apr–May 2023
- **Kagi team and revenue**: about 3 people in 2018, 10 in 2020–21, 15 in 2022. Crossed $1M annual revenue in 2023 and was bootstrapped by the founder for its first 4 years — [Kagi company history](https://help.kagi.com/kagi/company/history.html) [via search snippet]
- **Kagi Search API** price, reported at $15–25 per 1,000 queries (May 2026) — [costbench](https://costbench.com/software/ai-search-apis/kagi-search-api/) [secondary, low confidence]
- **Implied Kagi scale (estimate)**: 1,046,700 queries/day — [Kagi stats](https://kagi.com/stats). At the 2023 cost of 1.25¢, that is about $13k/day or about $4.8M/year in search costs. **Estimate**: it assumes the 2023 per-search cost still applies, which is unverified.
- **Mojeek**: "Added 100 more web servers" (2019). No total server count or headcount published. The about page lists founder Marc Smith only — [Mojeek About](https://www.mojeek.com/about/). Revenue estimate about $193k/yr (RocketReach, undated) — [eurotechguide](https://eurotechguide.com/state-of-european-tech/part-4-search-engine-sovereignty-in-europe-progress-compromises-and-hard-truths/) [estimate]
- **EUSP/Staan**: "up to a tenth of Google and Bing's pricing" (Kroll, Aug 2025) — [Tech.eu](https://tech.eu/2025/08/06/ecosia-rolls-out-independent-search-results-in-europe-taking-another-giant-step-away-from-big-tech/) [company claim]. Each country index holds about 1B pages — [heise](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-German-web-index-11385019.html)
- **Neeva**: Ramaswamy said "technology at scale is actually quite inexpensive" (2022) — [SEJ](https://www.searchenginejournal.com/building-a-better-search-engine-lessons-from-neevas-ceo/455483/). It had 25 employees (2020) and raised $77.5M in total — [Wikipedia: Neeva](https://en.wikipedia.org/wiki/Neeva)
- **Marginalia**: one person, low-powered self-hosted hardware, about 1 h/week of maintenance — [Wikipedia: Marginalia](https://en.wikipedia.org/wiki/Marginalia_(search_engine))
- **Stract**: one developer, a basement server, about 1,000 searches/hour, an NLnet grant — [404 Media](https://404media.co/this-guy-is-building-an-open-source-search-engine-in-real-time); [NLnet](https://nlnet.nl/project/Stract/)
- **Brave API**: free tier of 2,000 queries/month, about $3 CPM paid; it claims 150B cumulative queries answered — [Brave learn](https://brave.com/learn/best-search-api-2026/); [Brave Search API](https://brave.com/search/api/) [via search snippet]
- **Bing API** price increases of up to about 10x (2023) — [MediaPost](https://www.mediapost.com/publications/article/384882/brave-disconnects-microsoft-bing-from-its-web-sear.html)
- **Funding benchmarks**: Cuil $33M, Blekko $24M, Neeva $77.5M, Yep (Ahrefs) $60M, You.com $100M Series C (Sept 2025). Qwant had €10.5M cash in 2022 — sources in the profiles above

### Inferences
- A single-market, own-index engine is technically within reach of a team of about 10–25 engineers: Mojeek, early Kagi, early Neeva and EUSP's per-country approach show it. The scarce resources are distribution and the quality of the long tail, not servers.
- Syndication costs about 1–1.5¢ per query in Kagi's 2023 experience. An ad-funded engine earning a typical few-dollars-RPM cannot sustain that, which is why syndicators need either subscriptions (Kagi) or contracted below-list rates (DDG). This is an inference, not a published figure.

### Gaps
- No published costs from DDG, Brave, Mojeek (beyond servers), Ecosia or Qwant.
- Brave, DDG, Ecosia and Qwant headcounts were not found.
- Kagi's 2025–26 cost per search and profitability were not found.

---

## EU / European sovereignty angle

### Takeaway
2025–26 is the first period with real momentum for EU search sovereignty. EUSP/Staan has French (Aug 2025) and German (Jul 2026) indexes and sells API access to other engines and AI firms. Qwant is reportedly the EU Parliament's default. Regulators are forcing Google to share data (DMA Art. 6(11); a reported €890M DMA fine in Jul 2026). Mojeek (UK) is the long-running independent alternative. Startpage counts as "European" only by operations; it is majority US-owned.

### Cited Findings
- EUSP French plus German indexes. The March 2026 open letters asked EU governments to treat national search indexes as public digital infrastructure — [heise](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-German-web-index-11385019.html)
- DMA Art. 6(11) requires Google to share ranking, query, click and ad data on fair terms. The Commission opened a specification procedure in **Jan 2026**. In the US, a court ordered Google to share search data with qualified competitors, and Google appealed in May 2026 — [heise](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-German-web-index-11385019.html)
- On **23 Jul 2026** the European Commission fined Google **€890M** under the DMA and ordered sharing of anonymised search data with other providers **from 2027** — [onlinemarketing.de](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland) [single source; verify]
- Qwant is reportedly the EU Parliament's default search engine; Lilo also runs on EUSP; the Staan API is self-service — [onlinemarketing.de](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland) [single source]
- An EU-sovereignty review (Feb 2026) excluded Mojeek and Lilo for low revenue and Startpage for US majority ownership, and noted that Ecosia and Qwant still partly use Google and Bing indexes — [eurotechguide](https://eurotechguide.com/state-of-european-tech/part-4-search-engine-sovereignty-in-europe-progress-compromises-and-hard-truths/)
- Mojeek: UK-hosted (Custodian, Maidstone) and independent of AWS, Azure and GCP — [Wikipedia: Mojeek](https://en.wikipedia.org/wiki/Mojeek); [Privacy Guides](https://discuss.privacyguides.net/t/mojeek/12101)
- Firefox 154 (Aug 2026) adds Startpage as a built-in option in DE/FR/AT/CH/NL — [Wikipedia: Startpage](https://en.wikipedia.org/wiki/Startpage) [single source]
- Cliqz (Hubert Burda Media, Germany), which closed in 2020, lives on as Brave's Tailcat-based index. A European index ended up under US ownership — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search)

### Inferences
- For a European, especially Bulgarian, entrant, the most realistic path is to **license Staan or Mojeek, or a Brave-style API, for the long tail while crawling its own language corpus**. Positioning should lean on EU-hosting and GDPR, and the entrant should watch DMA Art. 6(11) data-sharing, which could cut cold-start costs from 2027 if the fine and remedy hold.
- Bulgarian is not yet covered by an EUSP country index; only FR and DE are confirmed. A national Bulgarian index is exactly the kind of "public digital infrastructure" EUSP lobbied for in March 2026. This is an inference.

### Gaps
- Not verified: the €890M fine, the 2027 data-sharing start and the Parliament default (single trade-press source).
- EUSP funding amounts, staffing and pricing were not found.
- Whether Staan plans other languages, such as Bulgarian, was not found.

---

## Cross-cutting lessons: why newcomers succeed or fail

### Takeaway
Survivors share four traits:
- a **cheap or partly owned supply** of results
- a **non-Google monetisation** model that fits their cost per query
- a **distribution hook** (a browser default, a mission, a portal or ecosystem, local language)
- a **sharp differentiator users can feel**: control, privacy, small web, mission

Failures usually had a strong technical story but **no distribution** (Neeva), **weak quality at launch** (Cuil), **no scale** (Blekko, Presearch), or a **fragile dependency** on someone else's index or scraping (Leta, SearXNG on Google, Bing API syndicators).

### Cited Findings
- **Distribution beats quality**: Neeva on Safari defaults ("impossible") and on Google's payments freezing the ecosystem — [SEJ](https://www.searchenginejournal.com/building-a-better-search-engine-lessons-from-neevas-ceo/455483/); [Business Standard](https://www.business-standard.com/world-news/ex-googler-s-struggling-search-startup-becomes-antitrust-cautionary-tale-123100300091_1.html)
- Brave Search got distribution as the default in its own browser (Oct 2021) — [Wikipedia: Brave Search](https://en.wikipedia.org/wiki/Brave_Search)
- Firefox now gives Startpage EU distribution (2026) — [Wikipedia: Startpage](https://en.wikipedia.org/wiki/Startpage) [single source]
- The choice screen alone barely moved Seznam (about 140k picks) — [CzechCrunch](https://cc.cz/chovani-googlu-se-nezlepsilo-tvrdi-seznam-jako-nahradu-skody-proto-bude-pozadovat-10-miliard-korun/)
- **Owning (part of) the index de-risks supply**: Brave left Bing after up to 10x price rises — [Brave blog](https://brave.com/blog/search-independence/). Microsoft retired self-serve Bing APIs — [Microsoft Learn](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement). Leta closed because of anti-bot measures — [TechRadar](https://www.techradar.com/vpn/vpn-services/mullvad-says-goodbye-to-proxy-search-citing-big-changes-in-the-search-industry). Ramaswamy said "better off investing in search from day one" — [SEJ](https://www.searchenginejournal.com/building-a-better-search-engine-lessons-from-neevas-ceo/455483/)
- **Size is not quality**: Cuil's 120B pages did not help — [Wikipedia: Cuil](https://en.wikipedia.org/wiki/Cuil); [MIT Technology Review](https://www.technologyreview.com/s/410535/a-google-killer-stumbles/)
- **Language and local-content moats work**: Naver gained share in 2025–26 on AI Briefing and Korean UGC — [Korea Times](https://www.koreatimes.co.kr/amp/business/tech-science/20260416/naver-remains-dominant-player-in-koreas-search-market). Seznam holds about 15% — [StatCounter CZ](https://gs.statcounter.com/search-engine-market-share/all/czech-republic)
- **Unit economics must fit the model**: Kagi pays about 1.25¢/search and charges subscriptions — [Kagi blog](https://blog.kagi.com/update-kagi-search-pricing). Presearch's token-funded model reportedly died after missing a 1M-daily-search milestone — [Wikipedia: Presearch](https://en.wikipedia.org/wiki/Presearch_(search_engine)) [single source]
- **Pivot to B2B API** is a common survival or exit route:
  - You.com: consumer search to an enterprise API, $1.5B valuation — [Unite.AI](https://www.unite.ai/you-com-raises-100m-becomes-a-unicorn-as-it-pivots-from-search-to-ai-infrastructure/)
  - Brave Search API — [Brave](https://brave.com/search/api/)
  - Staan API for AI providers — [heise](https://www.heise.de/en/news/Ecosia-and-Qwant-launch-German-web-index-11385019.html)
  - Neeva, Blekko and Cuil exits went to tech acquirers — [Wikipedia: Neeva](https://en.wikipedia.org/wiki/Neeva); [Wikipedia: Blekko](https://en.wikipedia.org/wiki/Blekko); [Wikipedia: Cuil](https://en.wikipedia.org/wiki/Cuil)
- **Paying users exist but plateau**: Kagi grew from about 50k (Jun 2025) to about 75.7k (Oct 2026), flat in October — [Wikipedia: Kagi](https://en.wikipedia.org/wiki/Kagi); [Kagi stats](https://kagi.com/stats)
- **Pooling across engines works in the EU**: EUSP is shared by Ecosia, Qwant and Lilo — [onlinemarketing.de](https://onlinemarketing.de/seo/ecosia-suchergebnisse-eigener-search-index-deutschland)

### Inferences (lessons for a new entrant, e.g. a Bulgarian/EU engine)
1. **Don't launch as a pure syndicator or scraper.** Bing self-serve is gone and Google blocks proxies. Plan an own index for the home language, about 1B pages or fewer for a small language, following EUSP's per-country scale, and license a European wholesale index (Staan, Mojeek) or Brave for the long tail.
2. **Secure distribution before scaling the tech.** Options: browser or OS partner deals (Firefox–Startpage style), institutional defaults (EU Parliament–Qwant style), or an owned ecosystem (Seznam's Mapy and Firmy, Naver's Knowledge iN). Expect the choice screen alone to deliver little.
3. **Own local content and verticals Google can't easily replicate**: local business directory, maps, Q&A, news and public data, plus AI answers grounded on that corpus (Naver's AI Briefing model).
4. **Match monetisation to cost per query**: contextual, non-tracking ads (DDG, Startpage, Brave, Mojeek), subscriptions (Kagi), or B2B API sales (Brave, Staan, You.com). Keep per-query costs well under 1¢ if ad-funded.
5. **Differentiate on control and trust**: domain block and boost, Goggles- or Lens-style user ranking rules, no tracking, AI answers that can be switched off, small-web and non-commercial filters. All are cheap to build and explicitly valued.
6. **Don't over-claim at launch** (Cuil). Quality on head queries in the home language is decisive on day one.
7. **Use regulation**: DMA Art. 6(11) data access (procedure from Jan 2026; reported data sharing from 2027), EU sovereignty funding narratives (EUSP open letters), and competition complaints on defaults (Yandex at FAS, Seznam).

### Gaps
- No public comparative data on retention or churn for alternative engines.
- No verified 2026 traffic for Brave, DDG, Ecosia or Qwant from primary sources.
- Not researched: AI-answer engines (Perplexity, ChatGPT Search) as competitors to this cohort; out of scope, but relevant context for any entrant in 2026.
