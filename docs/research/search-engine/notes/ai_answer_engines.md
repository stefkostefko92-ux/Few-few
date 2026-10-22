# AI-native search & answer engines and how LLMs are changing web search (status: 22 Oct 2026)

> Research notes for the report writer. Every fact has an inline source. Items marked **[secondary]** come from aggregators or trade blogs rather than primary documents. Items marked **[estimate]** are third-party estimates. Items marked **[superseded]** have been overtaken by newer facts listed beside them. Research was cut short when the session's shared web-search budget ran out (see the Gaps sections). A few planned lookups (Brave consumer AI answers, You.com funding, ChatGPT search's third-party providers, Google's primary I/O 2026 post) could not be run.

---

## 1. Index/retrieval per engine and the typical RAG answer-engine pipeline

### Takeaway
The market splits in two. One group owns a large index: Google, Microsoft Bing, Perplexity (Vespa-based, >200B URLs), Brave, Exa, You.com and Ceramic.ai. The other group rents or wraps someone else's index or SERP scrapes: Tavily, many SERP-API wrappers, and historically DuckDuckGo-style Bing syndication. Every major answer engine runs the same broad pipeline: query rewriting or fan-out → hybrid (lexical + vector) retrieval → multi-stage reranking (down to cross-encoders) → passage chunking → LLM synthesis with inline citations. Bot hygiene is now part of the architecture. Each vendor separates three kinds of crawler: a search-index crawler, a user-triggered fetcher, and a training crawler.

### Cited Findings
**Perplexity (incl. Comet)**
- Perplexity's search index tracks "over 200 billion unique URLs", with capacity for "many hundreds of billions" more. Perplexity calls it an exabyte-scale index (blog post of 25 Sep 2025) — [Perplexity: Architecting and evaluating an AI-first search API](https://www.perplexity.ai/hub/blog/architecting-and-evaluating-an-ai-first-search-api)
- Pipeline as Perplexity describes it:
  - (1) hybrid retrieval against lexical and semantic indexes, merged into one candidate set;
  - (2) heuristic prefiltering of stale or non-responsive content;
  - (3) multi-stage ranking: lexical/embedding scorers first, then cross-encoder rerankers;
  - (4) sub-document chunking into self-contained spans that are retrieved and ranked individually;
  - (5) frontier LLMs used to assess and refine parsing.
  - ML models decide which URLs to index and how often to refresh them, and high-traffic documents are continually reindexed. — [Perplexity](https://www.perplexity.ai/hub/blog/architecting-and-evaluating-an-ai-first-search-api)
- The same infrastructure "handles 200 million daily queries". Latency measured from AWS us-east-1: p50 358 ms, p95 763 ms. Comparison figures: Brave p50 513/p95 808 ms; Exa 1,375/2,188 ms; SERP-based (Tavily) 1,342/1,790 ms — [Perplexity](https://www.perplexity.ai/hub/blog/architecting-and-evaluating-an-ai-first-search-api)
- Perplexity's vendor-run benchmark scores (SimpleQA / FRAMES / BrowseComp / HLE):
  - Perplexity .930 / .453 / .371 / .288
  - Exa .781 / .399 / .265 / .242
  - Brave .822 / .320 / .221 / .191
  - SERP-based Tavily .890 / .437 / .348 / .248
  - Perplexity ran this benchmark on its own product. — [Perplexity](https://www.perplexity.ai/hub/blog/architecting-and-evaluating-an-ai-first-search-api)
- Perplexity runs on **Vespa**. Vespa unifies retrieval, ranking, filtering, real-time indexing and ML inference in one distributed engine, which lets Perplexity index billions of documents continuously while serving thousands of low-latency QPS. This is a vendor claim. — [Vespa case study](https://vespa.ai/perplexity/); [Vespa blog](https://blog.vespa.ai/perplexity-builds-ai-search-at-scale-on-vespa-ai/)
- **PerplexityBot** crawls for the search index and is not used to train foundation models. Perplexity recommends allowing it in robots.txt. **Perplexity-User** handles user-initiated fetches and "generally ignores robots.txt rules". IP ranges are published as JSON. — [Perplexity docs: bots](https://docs.perplexity.ai/guides/bots)
- Cloudflare alleges that Perplexity also used **undeclared crawlers** that impersonated Chrome 124 on macOS and rotated IPs and ASNs outside its published ranges. Volumes cited: declared crawler 20–25M requests/day, stealth crawler 3–6M/day, across tens of thousands of domains (4 Aug 2025). — [Cloudflare blog](https://blog.cloudflare.com/perplexity-is-using-stealth-undeclared-crawlers-to-evade-website-no-crawl-directives/)
- Reddit's lawsuit alleges that Perplexity also obtained Google-SERP data via scrapers. Reddit created a test post crawlable only by Google, and its content appeared in Perplexity answers within hours (filed 22 Oct 2025). — [Search Engine Land](https://searchengineland.com/reddit-sues-perplexity-serpapi-scraping-google-463681); [Bloomberg Law](https://news.bloomberglaw.com/ip-law/reddit-sues-perplexity-others-over-alleged-data-scraping)
- Comet browser: launched July 2025 on Chromium; Android added Nov 2025 — [Sacra](https://sacra.com/c/perplexity/) **[secondary]**

**OpenAI (ChatGPT Search, Atlas)**
- OpenAI separates three crawlers:
  - **OAI-SearchBot** surfaces sites in ChatGPT search. "Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search answers", although they can still appear as navigational links.
  - **GPTBot** collects training data.
  - **ChatGPT-User** handles user-initiated fetches, where "robots.txt rules may not apply".
  - Robots.txt changes take about 24 h to apply.
  - — [OpenAI docs: bots](https://developers.openai.com/api/docs/bots)
- In Cloudflare's test, ChatGPT-User fetched robots.txt and stopped when disallowed. Cloudflare saw no fallback to other user agents. — [Cloudflare blog](https://blog.cloudflare.com/perplexity-is-using-stealth-undeclared-crawlers-to-evade-website-no-crawl-directives/)
- **ChatGPT Atlas** launched 21 Oct 2025, first on macOS for Free/Plus/Pro/Go users worldwide, with Windows, iOS and Android to follow. It is built on Chromium. Agent mode launched in preview for paid tiers; sources differ on exactly which tiers. Browsing data is not used for training by default. — [BetaNews](https://betanews.com/2025/10/22/openai-launches-chatgpt-atlas-a-new-browser-built-around-ai-but-its-macos-only-for-now/); [The Decoder](https://the-decoder.com/openai-launches-atlas-a-new-web-browser-built-around-chatgpt-integration/); [TechRadar](https://techradar.com/ai-platforms-assistants/chatgpt/openai-launched-a-chatgpt-atlas-browser-here-are-the-5-things-you-need-to-know)

**Google (AI Overviews, AI Mode, Gemini)**
- AI Mode uses **"query fan-out"**. A custom Gemini model breaks a question into subtopics and issues many queries simultaneously, then synthesises one answer. Google's Search Central documentation says AI Overviews and AI Mode "may use" fan-out. The "8–12 sub-queries" figure comes from outside analysts, not Google. — [Aleyda Solís](https://www.aleydasolis.com/en/ai-search/google-query-fan-out/); [Marie Haynes](https://www.mariehaynes.com/ai-mode-query-fan-out/) **[secondary]**
- AI Overviews ran on Gemini 3-family models as of the article's current revision — [Wikipedia: AI Overviews](https://en.wikipedia.org/wiki/AI_Overviews). At I/O 2026, Gemini 3.5 Flash was reported to become the default model in AI Mode globally — [Nasdaq/I-O coverage](https://www.nasdaq.com/articles/google-introduces-ai-enhanced-search-features-i-o-2026); [tech-insider](https://tech-insider.org/google-ai-mode-1-billion-users-io-2026/) **[secondary]**
- AI Overviews history: launched in the US at I/O on 14 May 2024 (it began as SGE in 2023). It reached 100+ countries on 28 Oct 2024 and 200+ countries and 40+ languages by May 2025. — [Wikipedia](https://en.wikipedia.org/wiki/AI_Overviews)
- Developers can buy "Grounding with Google Search" for Gemini 3+ models: 5,000 free search requests/month, then **$14 per 1,000** search queries. For Gemini 2.5 it costs $35 per 1,000 grounded prompts. — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

**Microsoft (Copilot Search in Bing)**
- **Copilot Search** launched 4 Apr 2025. It "blends the best of traditional and generative search". Answers are summaries, direct answers or structured layouts, with sentences inline-linked to sources and a click-to-reveal list of every link used. It rolled out worldwide except Russia and China. — [Bing blog](https://blogs.bing.com/search/April-2025/Introducing-Copilot-Search-in-Bing)
- Microsoft **retired the public Bing Search APIs on 11 Aug 2025** (F1/S1–S9 and Custom Search tiers). It pointed developers to "Grounding with Bing Search" inside Azure AI Agents, which does not return raw results. — [Microsoft notice AZ492574](https://mc.merill.net/message/AZ492574); [The Register](https://www.theregister.com/2025/05/15/bing_search_apis_retired/). Grounding with Bing is reportedly $14/1,000 transactions — [Olostep](https://www.olostep.com/blog/bing-search-api-alternatives) **[secondary]**. The replacement is reportedly priced 40–483% higher — [PPC Land](https://ppc.land/microsoft-ends-bing-search-apis-on-august-11-alternative-costs-40-483-more/). A Microsoft "Web IQ" suite opened 2 Jun 2026 and claims p95 < 165 ms — [PPC Land](https://ppc.land/cloudflare-web-search-for-ai-agents-costs-0-25-to-7-per-1-000-requests/) **[secondary]**

**Kagi Assistant**
- Kagi Assistant is an LLM chat interface with an optional **Kagi Search grounding toggle**, which can be switched mid-thread and respects Lenses and personalization. It offers models from Anthropic, OpenAI, Google, Mistral, DeepSeek, Alibaba, Meta, xAI and others.
  - Data is not used for training by Kagi or the providers, and threads are deleted after 24 h of inactivity by default.
  - Usage is value-based: the plan price equals the token allowance (e.g., a $25/month plan = up to $25 of model usage), with a 20% markup on token costs. Premium models need the Ultimate plan.
  - — [Kagi help: Assistant](https://help.kagi.com/kagi/ai/assistant.html)
- Kagi live stats (fetched 22 Oct 2026): 75,675 members, 10,160 families, 1,046,700 searches in the past day, 21,404 Assistant threads in the past day. Member growth is roughly flat, about 5/day over the previous two weeks. — [kagi.com/stats](https://kagi.com/stats)

**Brave**
- Brave says its Search API is "the only fully-fledged search index available through an open API". It reports that every result comes from its own index with no fallback to Google or Bing, that it covers "99.9% of the web that matters", and that it has answered "150 billion" total queries at "100s of millions" per day. — [Brave Search API](https://brave.com/search/api/)

**You.com / Ceramic.ai / Exa**
- You.com says it runs its own crawler, web index and news index, with "no resold results from Google or Bing" — [You.com APIs](https://you.com/apis)
- Ceramic.ai runs its own index of more than 40B pages. Exa runs its own index combining keyword and embedding search. — [PPC Land on Cloudflare Web Search API](https://ppc.land/cloudflare-web-search-for-ai-agents-costs-0-25-to-7-per-1-000-requests/) **[secondary]**

### Inferences
- Bing's API shutdown (Aug 2025) and Google's refusal to license raw SERPs removed the two easy index sources. This explains the funding rush into independent indexes (Exa, Parallel, Ceramic, Perplexity's own Search API) and into SERP-scraping legal disputes such as Reddit v. SerpApi.
- The Perplexity-User and ChatGPT-User fetchers mean that blocking the *index* crawler does not stop *live* fetches. Site owners need WAF or IP-based rules, or Cloudflare-style managed rules, in addition to robots.txt.
- The answer engines' pipelines converge on: query rewrite or fan-out, hybrid BM25 + vector retrieval, cross-encoder rerank, passage-level context, a small or fast LLM for synthesis, and citation links per sentence. The main differentiators are index freshness and coverage, reranking quality, and latency.

### Gaps
- I could not fetch OpenAI's own ChatGPT-search help page (HTTP 403). The exact current mix of third-party search providers (historically Bing) behind ChatGPT Search remains unconfirmed in this session.
- I found no primary architecture documentation for You.com, Brave's consumer "AI answers" / "Ask Brave", or Kagi's index composition (Kagi historically mixes its own Teclis index with third-party sources, but I could not verify this this session).

---

## 2. Cost and latency per AI-answered query vs. a classic search query; current small-model API prices

### Takeaway
No vendor publishes its true cost per AI answer. The 2023 consensus held that an LLM exchange cost about 10× a keyword search, which Reuters reported at about $0.002 per Google search. Model prices have since collapsed, so for a lightweight answer the **search/grounding fee ($1–$14 per 1,000 calls) now usually costs more than the summarisation tokens**. Energy per median text prompt is published at about 0.24–0.34 Wh, close to Google's dated 2009 figure of 0.3 Wh per search. Index-level retrieval latency is now about 0.2–1.4 s p50, before LLM generation time.

### Cited Findings
**Historical cost estimates (2023, all [superseded] by price drops but still the most-cited figures)**
- Alphabet chairman John Hennessy (Reuters, 22 Feb 2023): an LLM exchange "likely cost 10 times more than a standard keyword search". Morgan Stanley estimated Google's 3.3 trillion searches in 2022 at "roughly a fifth of a cent each". Analysts projected a "$6-billion hike in expenses by 2024" if half of queries got 50-word AI answers. SemiAnalysis put the cost at "$3 billion" thanks to TPUs. — [Reuters via KSL](https://www.ksl.com/article/50584679/using-ai-like-chatgpt-costs-more-than-other-internet-searches-its-a-billion-dollar-problem)
- UBS later estimated Bard's incremental cost at $0.003–$0.028 per query on top of a base search cost of about $0.003 **[estimate]** — [MediaPost](https://www.mediapost.com/publications/article/383508/ubs-analysts-estimate-costs-of-google-bard-on-search-queries.html)

**Energy per query (proxy for compute cost)**
- Google (Aug 2025): a median Gemini text prompt uses 0.24 Wh, emits 0.03 g CO₂ and uses 0.26 mL of water — [Sustainability Magazine](https://sustainabilitymag.com/news/google-ai-search-uses-10x-more-energy-than-standard-searches); [EnergySage](https://www.energysage.com/news/google-ai-energy-use-electric-bill-impact/). Counting the accelerator only gives about 0.10 Wh — [ScienceShot](https://scienceshot.com/post/ai-energy-per-query)
- OpenAI's CEO cited 0.34 Wh per ChatGPT query, and Epoch AI estimated about 0.3 Wh for GPT-4o. Google's only official per-search figure is 0.3 Wh, from 2009. The popular "10× a Google search" claim comes from a 2023 estimate of about 3 Wh per ChatGPT query. — [Projet Celsius](https://projetcelsius.com/en/blog/chatgpt-vs-google-search-energy/); [Hannah Ritchie](https://hannahritchie.substack.com/p/ai-footprint-august-2025) **[secondary]**

**Current small/fast LLM API prices (fetched 22 Oct 2026, USD per 1M input/output tokens)**
- **Google Gemini:**
  - gemini-2.5-flash-lite: $0.10/$0.40
  - gemini-3.1-flash-lite: $0.25/$1.50
  - gemini-3.5-flash-lite: $0.30/$2.50
  - gemini-3.6-flash and 3.8-flash: $0.75/$3.75 through 31 Dec 2026, then $1.50/$7.50 from 1 Jan 2027
  - Batch pricing is half these rates.
  - — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- **OpenAI:**
  - gpt-5-nano: $0.05/$0.40
  - gpt-5-mini: $0.25/$2.00
  - gpt-5.4-nano: $0.20/$1.25
  - gpt-5.4-mini: $0.75/$4.50
  - gpt-5.6-luna: $0.20/$1.20
  - gpt-6-luna: $0.10/$0.50
  - **Web search tool $10 per 1,000 calls.** The preview tool for non-reasoning models costs $25/1k with free content tokens. For gpt-4o-mini and gpt-4.1-mini, each call is billed as a fixed 8,000 input tokens.
  - — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- **Anthropic:**
  - Claude Haiku 5.5: $0.10/$0.50 for prompts ≤100k tokens, $0.50/$2.50 above that
  - Claude Haiku 4.5: $1/$5
  - Claude Sonnet 5 and 5.5: $2/$10
  - **Web search $10 per 1,000 searches** plus tokens
  - Batch pricing is 50% off.
  - — [Claude pricing](https://platform.claude.com/docs/en/docs/about-claude/pricing)

**Retrieval latency (index level)**
- Perplexity Search API p50 is 358 ms. Brave p50 is 513 ms, Exa p50 1,375 ms, and SERP-based p50 1,342 ms. Perplexity measured all of these itself. — [Perplexity](https://www.perplexity.ai/hub/blog/architecting-and-evaluating-an-ai-first-search-api)
- Parallel Search "Turbo" is about 200 ms and "Fast" about 700 ms — [Parallel comparison article](https://parallel.ai/articles/tavily-alternatives) **[secondary/vendor]**. Exa Instant takes under 180 ms — [SiliconANGLE](https://siliconangle.com/2026/05/20/exa-labs-raises-250m-2-2b-valuation-ai-search-tools). You.com reports a p50 of 538 ms with snippets and 1,048 ms with full pages — [You.com](https://you.com/apis)

### Inferences
- **[estimate, my arithmetic from the list prices above]** Illustrative unit cost of one grounded answer: 1 search call plus 4,000 input tokens of retrieved context plus 300 output tokens.
  - With gpt-5-nano: about $0.0003 in tokens plus $0.005–$0.010 in search, so roughly $0.005–$0.010 in total.
  - With Claude Haiku 5.5: about $0.00055 in tokens plus search.
  - With gemini-3.8-flash: about $0.004 in tokens plus $0.014 for grounding.
  - On these assumptions an API-built answer costs roughly 2.5–10× Morgan Stanley's 2023 estimate of about $0.002 per classic search, and **the retrieval fee dominates**. Vertically integrated players (Google, Perplexity, Brave) avoid that fee, which is a structural cost advantage.
- Fan-out (8–12 sub-queries) and "deep research" multiply retrieval cost linearly. This is why vendors price deep or agentic modes 2–100× higher (see §7).

### Gaps
- I found no published, primary 2025–2026 estimate of Google's or Perplexity's all-in cost per AI answer.
- I found no primary figure for energy per AI Overview. A blog figure of 2–3 Wh per AIO query could not be verified.

---

## 3. Accuracy of AI search answers

### Takeaway
Independent audits consistently find high error rates for news-related questions. The Tow Center (Mar 2025) found that eight AI search tools misidentified news sources in **over 60%** of 1,600 queries. The EBU/BBC study (Oct 2025) found that **45%** of 2,700–3,000+ answers had at least one significant issue, with sourcing the biggest problem (31%) and Gemini the worst (76%). Paid tiers were *more confidently* wrong. Robots.txt blocks and licensing deals did not reliably change outcomes. I found no comparable large-scale 2026 re-run.

### Cited Findings
**Tow Center / Columbia Journalism Review (6 Mar 2025, tests run Feb 2025)**
- Method: 8 tools (ChatGPT Search, Perplexity, Perplexity Pro, DeepSeek Search, Copilot, Grok-2, Grok-3 beta, Gemini) × 20 publishers × 10 articles = 1,600 queries. Each tool was given a verbatim excerpt and asked for the headline, publisher, date and URL. — [CJR](https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php)
- Collectively the tools were wrong on more than 60% of queries. Perplexity was wrong on 37% (the best result) and Grok-3 on 94% (the worst). — [CJR](https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php); [Nieman Lab](https://www.niemanlab.org/2025/03/ai-search-engines-fail-to-produce-accurate-citations-in-over-60-of-tests-according-to-new-tow-center-study/)
- ChatGPT misidentified 134 of 200 articles, flagged low confidence only 15 times and never declined to answer. DeepSeek misattributed the source 115 of 200 times. Copilot declined more questions than it answered. — [CJR](https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php)
- Premium tiers (Perplexity Pro at $20/month, Grok-3 at $40/month) answered more prompts correctly but also had *higher* error rates, because they gave definitive wrong answers instead of declining. — [CJR](https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php); [Fortune](https://fortune.com/2025/03/18/ai-search-engines-confidently-wrong-citing-sources-columbia-study)
- More than half of Gemini and Grok-3 citations led to fabricated or broken URLs. For Grok-3, 154 of 200 citations led to error pages. — [CJR](https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php)
- **Robots.txt was not reliably honoured.** Perplexity's free tier correctly identified all 10 paywalled National Geographic excerpts even though the publisher blocks Perplexity's crawler. Perplexity Pro identified about one-third of 90 excerpts it should not have been able to access. — [CJR](https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php)
- **Licensing deals did not guarantee accuracy.** ChatGPT correctly identified only 1 of 10 San Francisco Chronicle excerpts despite a deal with Hearst. Tools often cited syndicated copies (e.g., Yahoo News instead of USA Today) instead of the original. — [CJR](https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php)

**EBU/BBC "News Integrity in AI Assistants" (published 21 Oct 2025)**
- Scope: 22 public service media organisations, 18 countries, 14 languages. Professional journalists evaluated more than 3,000 responses from ChatGPT, Copilot, Gemini and Perplexity on accuracy, sourcing, opinion vs. fact, and context. — [EBU report page](https://www.ebu.ch/research/open/report/news-integrity-in-ai-assistants)
- Some write-ups count the graded set as 2,709 answers graded by 271 journalists — [thesuperskills](https://thesuperskills.com/research/how-will-ai-change-journalism) **[secondary]**
- Results:
  - **45%** of answers had at least one significant issue.
  - **31%** had serious sourcing problems.
  - **20%** had major accuracy issues, including hallucinated or outdated details.
  - **Gemini** had significant issues in **76%** of responses, more than double the other assistants, mostly because of sourcing.
  - Results improved slightly compared with the BBC's earlier (Feb 2025) study, but error rates stayed high.
  - — [VRT/EBU press release](https://communication.vrt.be/largest-study-of-its-kind-shows-ai-assistants-misrepresent-news-content-45-of-the-time-regardless-of-language-or-territory); [Gizmodo](https://gizmodo.com/ai-assistants-get-news-wrong-45-of-the-time-study-finds-2000676069)
- The authors concluded that AI "routinely misrepresents news content, no matter which language, territory, or AI platform is tested". They released a "News Integrity in AI Assistants Toolkit". — [EBU](https://www.ebu.ch/research/open/report/news-integrity-in-ai-assistants)
- In July 2026 the EBU was still citing the 2025 study in its AI-governance advocacy. I found no new EBU dataset. — [EBU, July 2026](https://www.ebu.ch/news/2026/07/ai-governance-must-put-trust-information-integrity-and-child-safety-front-and-centre-backed-by-real-accountability)

**Other accuracy signals**
- Google temporarily restricted AI Overviews in May 2024 after answers such as "eat rocks" and "glue on pizza". In January 2026 it restricted AI Overviews on some health searches after a Guardian investigation. In 2026 a Munich court issued an injunction over false AIO claims about two publishers, and the musician Ashley MacIsaac sued over an AIO that falsely called him a sex offender. — [Wikipedia: AI Overviews](https://en.wikipedia.org/wiki/AI_Overviews)
- Vendor-run SimpleQA scores for search APIs (not answer engines):
  - Perplexity Search .930, Exa .781, Brave .822 — measured by Perplexity — [Perplexity](https://www.perplexity.ai/hub/blog/architecting-and-evaluating-an-ai-first-search-api)
  - You.com 92.1% with full page vs. Exa 90.1%, Parallel basic 89.8%, Tavily advanced 86.3% and Google SERP 80.2% — measured by You.com — [You.com](https://you.com/apis)
  - The two vendors' benchmarks give conflicting rankings.

### Inferences
- The failure mode is not mostly made-up facts. It is **attribution**: wrong or broken URLs, citing syndicated copies, and confident answers with no source. That matters most for publishers, whose referral value depends on correct attribution.
- Benchmarks run by the vendors themselves disagree with each other, so the independent journalist audits (Tow and EBU) are the more credible evidence on accuracy.

### Gaps
- I found no 2026 re-run of either the Tow Center or EBU/BBC methodology. The EBU had not published a follow-up as of my searches.
- Per-assistant figures from EBU/BBC other than Gemini's 76% (ChatGPT, Copilot, Perplexity) were not on the pages I could fetch.
- I found no independent 2026 audit of Google AI Mode or ChatGPT Atlas answer accuracy.

---

## 4. Usage and adoption

### Takeaway
AI answers have become mass-market, mostly through Google. Google reports **2.5B monthly AI Overviews users and 1B+ AI Mode users** (I/O, May 2026) and ChatGPT about 1.2B weekly users (Sept 2026), both via secondary reports. Standalone answer engines are much smaller. Perplexity is estimated at about $750M annualized revenue (Aug 2026) and a $20B+ valuation. Kagi has about 76k paying members. Survey data show AI as a news source growing **"fast rather than explosive"**: 10% of people use AI chatbots for news weekly in 2026, up from 7% in 2025.

### Cited Findings
**Google**
- At I/O 2026 (19 May 2026), Google said AI Mode had passed **1 billion monthly users**, with queries "more than doubled every quarter since launch". It repeated the figure on the Q2 2026 earnings call (22 Jul 2026). AI Overviews was at **2.5 billion monthly users**. The previous AI Mode figure was more than 75M daily users (Q3 2025). — [Presenc.ai](https://presenc.ai/research/google-ai-mode-usage-statistics-2026); [WrittenlyHub](https://www.writtenlyhub.com/news/google-ai-mode-1-billion-users-adoption-data) **[secondary; primary Google post not fetched]**
- A Similarweb US panel found that only **0.34%** of Google searches went to AI Mode from January to April 2026 — [MarketSplash](https://marketsplash.com/google-ai-mode-statistics/) **[secondary]**
- In Pew's March 2025 US panel, 18% of Google searches produced an AI summary, and 58% of respondents saw at least one. — [Pew](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
- **EU availability:**
  - AI Mode was reported rolling out in October 2025 to 40+ additional countries and 38 languages, including Germany, Austria, Italy, the Netherlands, Poland, Spain and Sweden, as a separate tab rather than the default — [Trending Topics](https://www.trendingtopics.eu/google-ai-mode-launch-europe/); [PPC Land](https://ppc.land/google-expands-ai-mode-to-over-40-countries-and-territories/)
  - Earlier coverage described an English-only launch in 180 countries that excluded the EU, a delay blamed on DSA/DMA and data-protection compliance — [Presse-citron](https://www.presse-citron.net/google-prepare-une-nouvelle-cure-dia-pour-vos-resultats-de-recherche/); [Onlinemarketing.de](https://onlinemarketing.de/technologie/google-ai-mode-deutschland-start-eu-rollout)
  - In mid-2025, Google's AI Overviews "had not yet launched" in **France** — [Reuters Institute, GenAI & News 2025](https://reutersinstitute.politics.ox.ac.uk/generative-ai-and-news-report-2025-how-people-think-about-ais-role-journalism-and-society)

**OpenAI / ChatGPT**
- ChatGPT reportedly reached **1.2 billion weekly users** (OpenAI to developers, 29 Sep 2026), up from 900M in Feb 2026 — [TechnologyChecker](https://technologychecker.io/blog/chatgpt-statistics); [Whizi](https://whizi.io/resources/chatgpt-statistics/) **[secondary]**
- Information-seeking reportedly grew from 14% to 24% of ChatGPT conversations in one year — [Search Engine Land stats guide](https://searchengineland.com/guide/chatgpt-stats) **[secondary]**
- In six countries (mid-2025), ChatGPT was the most used gen-AI tool at 22% weekly — [Reuters Institute, GenAI & News 2025](https://reutersinstitute.politics.ox.ac.uk/generative-ai-and-news-report-2025-how-people-think-about-ais-role-journalism-and-society)

**Perplexity**
- Valuation/funding: $18B (Jul 2025, Bloomberg) and **$20B** (Sep 2025, $200M, TechCrunch). Total raised is roughly $1.2–1.5B. Pricing: Pro $20/month, Max $200/month, Enterprise Pro $40/seat. Advertising has been dropped as a revenue line. — [Sacra](https://sacra.com/c/perplexity/)
- Annualized revenue **[estimate, Sacra]**: $63M (end of 2024) → $148M (Jun 2025) → $232M (end of 2025) → **$750M (Aug 2026)**. Sacra attributes recent growth to the Feb 2026 "Computer" agent and usage-based pricing. — [Sacra](https://sacra.com/c/perplexity/); [Sacra on Exa](https://sacra.com/research/exa-at-10m-growing-11x-yoy)
- Later valuations of $21–22.6B (Jan 2026) and talks above $30B appear only in aggregators and are **unconfirmed** — [ValueAdd VC](https://valueaddvc.com/blog/perplexity-ai-valuation-revenue-2026-23b-450m-arr); [SQ Magazine](https://sqmagazine.co.uk/perplexity-ai-statistics/) **[secondary]**
- Query volume: the most-cited confirmed data point is about **780M queries/month (May 2025)**. Figures of 1.2–1.5B/month for mid-2026 are extrapolations. — [SQ Magazine](https://sqmagazine.co.uk/perplexity-ai-statistics/); [Search Engine Land guide](https://searchengineland.com/guide/perplexity-statistics) **[secondary, not verified against primary]**
- 100M+ MAU (unattributed). Distribution deals reported include Snap (about $400M), Airtel (360M eligible customers) and a 3-year, $750M Microsoft partnership (Jan 2026, payment direction unclear). — [Sacra](https://sacra.com/c/perplexity/) **[secondary]**

**Kagi:** 75,675 members and about 1.05M searches/day (22 Oct 2026) — [kagi.com/stats](https://kagi.com/stats)

**Survey data on AI for information/news**
- **Reuters Institute DNR 2025** (17 Jun 2025, 48 markets): **7%** used AI chatbots for news weekly, **15% of under-25s**. Figures for India and the UK were 18% and 3%. ChatGPT was the top tool at 4% weekly for news. Google AI Overviews scored low, perhaps because users did not recognise it as AI. — [DNR 2025 summary](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2025/dnr-executive-summary)
- **Reuters Institute "Generative AI and News Report 2025"** (7 Oct 2025; Argentina, Denmark, France, Japan, UK, US; n≈2,000 per country):
  - Weekly gen-AI use rose to 34% (from 18% in 2024). Use for getting information rose to **24%** (from 11%).
  - **54%** saw an AI-generated search answer in the last week (Argentina 70%, UK 64%, US 61%, France 29%).
  - — [Reuters Institute](https://reutersinstitute.politics.ox.ac.uk/generative-ai-and-news-report-2025-how-people-think-about-ais-role-journalism-and-society)
- **Reuters Institute DNR 2026** (16 Jun 2026; 48 markets; n=97,520):
  - Weekly use of AI chatbots for news is **10%** (up from 7%), which the report calls "fast rather than explosive" growth. Under-35s: 16%. Secondary coverage gives 17% for 18–24s and 5% for 55+ — [GIJN](https://gijn.org/stories/2026-reuters-institute-digital-news-report/) **[secondary]**.
  - Use doubled in South Korea (14%), Greece (12%) and Spain. There was no increase in the USA, UK, France or Germany, and the UK is lowest at 4%.
  - The chatbot measure excludes Google AI Mode and AI Overviews.
  - — [DNR 2026 summary](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/dnr-executive-summary)

### Inferences
- Google counts anyone who saw an AI Overview, so "users" means passive exposure. Similarweb's 0.34% share of searches suggests that actual AI Mode *query share* in the US remains small despite the 1B MAU headline.
- Growth of AI-for-news is uneven. It is flat in the US, UK, DE and FR and fast in Asia, LatAm and Southern/Eastern Europe. This matters for EU-market products: Spain, Greece and Eastern Europe are adopting faster than the large Western EU markets.

### Gaps
- I could not fetch Alphabet's primary I/O 2026 or Q2 2026 materials. The Google user counts rest on consistent secondary reporting.
- Perplexity does not publish audited revenue or query counts. All 2026 figures are estimates.
- I found no reliable usage numbers for Copilot Search, Brave AI answers, You.com consumer search or ChatGPT Atlas installs.

---

## 5. Impact on publishers and the open web: clicks, zero-click, lawsuits, Cloudflare, licensing

### Takeaway
AI summaries roughly **halve click-through**. Pew found 8% vs. 15% CTR, and only 1% of visits included a click on a cited link. Chartbeat measured publisher Google traffic **down 33% globally (38% in the US)** from Nov 2024 to Nov 2025. Litigation has produced mixed results:
- Google won dismissal of the antitrust suits from Penske and Chegg (30 Sep 2026; the judge said "an expectation is not an agreement").
- Perplexity won the Ninth Circuit CFAA round against Amazon (4 Aug 2026).
- The copyright suits against Perplexity (Dow Jones/NY Post, NYT, Chicago Tribune, Britannica/Merriam-Webster, Reddit) were still pending as of Sept–Oct 2026.

Infrastructure, not courts, is moving fastest. Cloudflare moved from default blocking (Jul 2025) to Pay-Per-Crawl to **Pay-Per-Use** and new defaults that block Training and Agent crawlers on ad-supported pages (15 Sep 2026). The EU is the most active regulator: a Commission antitrust probe has been open since Dec 2025.

### Cited Findings
**Click-through and zero-click**
- **Pew Research (22 Jul 2025):** 900 US adults, March 2025 browsing, 68,879 searches.
  - Users clicked a traditional result on **8%** of visits when an AI summary appeared vs. **15%** without one.
  - Users clicked a link *inside* the summary on only **1%** of visits.
  - The session ended on 26% of visits with a summary vs. 16% without.
  - AI summaries appeared for 8% of 1–2-word queries, 53% of 10+-word queries and 60% of question queries.
  - Wikipedia, YouTube and Reddit made up 15% of AIO sources. News sites made up 5% of both AIO and standard sources.
  - — [Pew](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
- **Similarweb:** the share of news-related Google searches with no click rose from about **56% to 69%** (May 2024 → May 2025). Organic visits to news sites fell from more than 2.3B (mid-2024 peak) to under 1.7B. — [SERoundtable](https://www.seroundtable.com/similarweb-google-zero-click-search-growth-39706.html?cid=482) **[secondary]**
- **Ahrefs (Dec 2025, 300k keywords):** an AI Overview correlates with a **58% lower** average CTR for the top-ranking page — [Ahrefs](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update)
- **Seer Interactive** (Jan 2025–Feb 2026; 53 brands, 2.43B impressions): organic CTR was 0.61% with an AIO vs. 1.62% without, a 61% drop. This comes via secondary reporting. — [Relevant Audience](https://relevantaudience.com/seo/ai-overview-impact-on-organic-search-2026) **[secondary]**
- **Chartbeat via DNR 2026:** Google organic search traffic to more than 2,500 sites fell **33% globally and 38% in the US** (Nov 2024 → Nov 2025). Publishers expect search referrals to fall a further **43%** over 3 years. — [DNR 2026](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/dnr-executive-summary)
- Crawl-to-referral ratios (Cloudflare Radar via secondary blogs) **conflict by month and source**.
  - Prince is reported to have cited about 73,000:1 for Anthropic, 1,700:1 for OpenAI and 14:1 for Google in 2025.
  - July 2026 figures were reported at about 1,917:1 (Anthropic), 251:1 (OpenAI), 289:1 (Perplexity) and about 5:1 (Google).
  - The ratios reportedly fell up to 95% in a year.
  - — [eCorpIT](https://ecorpit.com/ai-crawler-crawl-to-referral-ratio-2026-geo-decision/); [Nobori](https://nobori.ai/blog/crawl-to-refer-ratio-ai-crawler-traffic-b2b-2026) **[secondary; verify on Cloudflare Radar]**

**Cloudflare**
- **1 Jul 2025 ("Content Independence Day"):** known AI crawlers are blocked by default on all *new* Cloudflare domains. Over 1M sites had already opted to block. **Pay Per Crawl** (private beta) lets sites allow, charge or block each crawler, using HTTP 402 to quote a price. — [Cloudflare blog](https://blog.cloudflare.com/introducing-pay-per-crawl/); [Cloudflare blog](https://blog.cloudflare.com/content-independence-day-no-ai-crawl-without-compensation/); [Search Engine Land](https://searchengineland.com/cloudflare-to-block-ai-crawlers-by-default-with-new-pay-per-crawl-initiative-457708)
- **4 Aug 2025:** Cloudflare accused Perplexity of stealth crawling (details in §1), delisted it as a verified bot and added blocking signatures for all plans, including free. — [Cloudflare blog](https://blog.cloudflare.com/perplexity-is-using-stealth-undeclared-crawlers-to-evade-website-no-crawl-directives/). A Perplexity spokesperson reportedly dismissed it as a "sales pitch" — [TechRepublic](https://www.techrepublic.com/article/news-cloudflare-accuses-perplexity-stealth-crawling-violations/) **[secondary]**
- **1 Jul 2026:**
  - Pay Per Crawl evolves into **Pay Per Use**, under which publishers are paid when content contributes to an answer. Launch partners: **Ceramic.ai** (pays per appearance in its AI search results) and **You.com** (agents pay on demand for premium content).
  - New default from **15 Sep 2026** for new domains: "Training" and "Agent" crawlers are blocked on pages that display ads, while "Search" stays allowed.
  - Multi-purpose crawlers such as Googlebot, Applebot and BingBot are blocked wherever a customer blocks Training.
  - — [Cloudflare press release 2026](https://www.cloudflare.com/en-au/press/press-releases/2026/cloudflare-allows-the-agentic-internet-to-flourish-with-a-simple-philosophy-your-content-your-rules/); [Cloudflare changelog](https://developers.cloudflare.com/changelog/post/2026-07-01-ai-traffic-options/)
- **2 Oct 2026:** Cloudflare launched a Web Search API in AI Gateway that routes agents to Ceramic.ai ($0.25/1k), Linkup ($5/1k) or Exa ($7/1k) with no markup. Inclusion requires verified crawlers that obey robots.txt and link every result to its source. — [PPC Land](https://ppc.land/cloudflare-web-search-for-ai-agents-costs-0-25-to-7-per-1-000-requests/) **[secondary]**

**Lawsuits (status as of Oct 2026)**
- **Penske Media v. Google** (filed Sep 2025) and **Chegg v. Google** (filed 24 Feb 2025) are antitrust suits over AI Overviews. — [Wikipedia](https://en.wikipedia.org/wiki/AI_Overviews)
  - **Dismissed** by Judge Amit Mehta in an opinion dated 30 Sep 2026 and reported 1 Oct 2026.
  - The court held that Penske had not plausibly alleged that Search and AI Overviews are separate products, and that "an expectation is not an agreement. It is simply how a general search engine works".
  - The judge said the issue is for Congress or regulators. Copyright claims were not before the court.
  - — [Reuters via TradingView](https://www.tradingview.com/news/reuters.com,2026:newsml_L6N45N09D:0-google-wins-dismissal-of-chegg-penske-media-lawsuits-over-ai-overviews/); [Android Headlines](https://www.androidheadlines.com/2026/10/judge-dismisses-google-ai-overviews-publisher-lawsuits.html); [Digital Music News](https://www.digitalmusicnews.com/2026/10/06/google-penske-media-lawsuit-dismissal/)
  - Reports say the dismissal was without prejudice and appealable, but this is unconfirmed. Earlier in 2026 (March), suits involving Helena World Chronicle and Emmerich Newspapers were also dismissed. — [Android Headlines](https://www.androidheadlines.com/2026/10/judge-dismisses-google-ai-overviews-publisher-lawsuits.html)
- **Amazon v. Perplexity** (Comet agent shopping; CFAA and California's CDAFA):
  - The district court (N.D. Cal.) granted Amazon a preliminary injunction on **9 Mar 2026** [superseded].
  - The **Ninth Circuit vacated it on 4 Aug 2026**, holding that "it was the user who 'accessed' Amazon's computers".
  - Amazon's contract and terms-of-service theories remain open.
  - — [Cooley](https://www.cooley.com/news/insight/2026/2026-08-06-ninth-circuit-rules-on-ai-agent-access-to-third-party-websites-under-cfaa); [Knight Institute](https://knightcolumbia.org/cases/amazon-v-perplexity-ai)
- **New York Times v. Perplexity** (filed 5 Dec 2025, SDNY, 1:25-cv-10106): Perplexity moved to dismiss Counts II–V of the amended complaint on 17 Apr 2026, with no ruling reported. The **Chicago Tribune** case is at the same stage. — [TechCrunch](https://techcrunch.com/2025/12/05/the-new-york-times-is-suing-perplexity-for-copyright-infringement); [Axios](https://www.axios.com/2025/12/05/nyt-sues-perplexity-for-copyright-infringement); [CourtListener](https://www.courtlistener.com/docket/71997720/the-new-york-times-company-v-perplexity-ai-inc/); [AI Lawsuit Tracker](https://ailawsuittracker.com/companies/perplexity/) **[secondary for status]**
- **Dow Jones & New York Post v. Perplexity** (SDNY copyright): pending, with no settlement as of 30 Sep 2026 — [SettlementInsight](https://settlementinsight.com/perplexity-lawsuit) **[secondary]**
- **Encyclopaedia Britannica & Merriam-Webster** and **Yomiuri Shimbun** are also suing Perplexity — [Press Gazette](https://pressgazette.co.uk/news/perplexity-launches-ai-subscription-revenue-share-scheme-for-publishers/)
- **Reddit v. Perplexity, SerpApi, Oxylabs, AWMProxy** (filed 22 Oct 2025, SDNY) alleges scraping of Google SERPs to obtain Reddit content. Perplexity called it a "show of force" in Reddit's data-licensing talks. — [Search Engine Land](https://searchengineland.com/reddit-sues-perplexity-serpapi-scraping-google-463681); [Bloomberg Law](https://news.bloomberglaw.com/ip-law/reddit-sues-perplexity-others-over-alleged-data-scraping)

**Licensing / revenue share**
- **Perplexity Comet Plus** (announced 26 Aug 2025):
  - $5/month, with **80%** of revenue going to publishers and 20% kept for compute.
  - Perplexity set aside a **$42.5M** initial pool. Pro and Max include Comet Plus.
  - Payouts are based on human visits, search citations and **agent actions**.
  - Launch partners included Time, Fortune, Der Spiegel, Gannett, The Independent and Blavity.
  - — [Axios](https://www.axios.com/2025/08/26/perplexity-comet-plus-subscription); [Press Gazette](https://pressgazette.co.uk/news/perplexity-launches-ai-subscription-revenue-share-scheme-for-publishers/); [Subscription Insider](https://www.subscriptioninsider.com/article-type/news/perplexity-unveils-42-5m-revenue-sharing-model-as-comet-browser-takes-aim-at-google)
- Google is reportedly piloting payments to about **100 publishers** for use of their content across AI Overviews, AI Mode and Gemini — [Android Headlines](https://www.androidheadlines.com/2026/10/judge-dismisses-google-ai-overviews-publisher-lawsuits.html) **[secondary]**
- Google introduced an option for publishers to keep content out of AI features without losing search ranking. The EU Commission consulted publishers on it until 28 Aug 2026. — [NewsBytes](https://www.newsbytesapp.com/news/science/european-commission-asks-publishers-about-google-ai-opt-out-amid-probe/tldr) **[secondary]**

**EU regulation**
- On **9 Dec 2025** the European Commission opened an antitrust investigation into whether Google abused its dominance by using publishers' content and YouTube content for AI (AI Overviews and AI Mode) without adequate compensation or a real opt-out — [CNBC](https://www.cnbc.com/2025/12/09/google-hit-with-eu-antitrust-probe-over-use-of-online-content-for-ai.html); [Press Gazette](https://pressgazette.co.uk/news/european-commission-google-ai-investigation/)
- The **European Publishers Council** filed a formal complaint in Feb 2026 — [MediaNama](https://www.medianama.com/2026/02/223-european-publishers-antitrust-complaint-google-ai-overviews/)
- The US Penske ruling does not affect the EU or UK proceedings — [Digital Applied](https://www.digitalapplied.com/blog/google-ai-overviews-antitrust-suits-dismissed) **[secondary]**
- **EU AI Act, general-purpose AI (GPAI) obligations:**
  - They apply from **2 Aug 2025**: technical documentation, a public training-data summary on an AI Office template, and a copyright policy.
  - The AI Office gains full enforcement and fining powers on **2 Aug 2026**.
  - Models placed on the market before 2 Aug 2025 have until **2 Aug 2027**.
  - Training compute of 10²⁵ FLOP or more creates a presumption of systemic risk.
  - The Code of Practice is voluntary.
  - — [artificialintelligenceact.eu](https://artificialintelligenceact.eu/gpai-guidelines-overview/)

### Inferences
- US courts are rejecting the theory that Google owes publishers traffic under antitrust law. The leverage has shifted to (a) copyright suits against answer engines, mostly Perplexity, (b) EU competition law and (c) technical gatekeeping such as Cloudflare defaults and HTTP 402 or pay-per-use. A product launched in the EU should assume tighter publisher-consent norms than in the US.
- Payment models are shifting from per crawl to **per citation or answer** (Comet Plus, Cloudflare Pay-Per-Use with Ceramic/You.com, Google's 100-publisher pilot). An answer engine that wants clean access to premium content will likely need to budget for per-citation payments.

### Gaps
- I could not confirm the **filing date of the Dow Jones/NY Post v. Perplexity** suit. One tracker's text was garbled ("October 21, 22, 2025"); contemporaneous coverage I did not re-verify places it in October 2024.
- I found no reported status or rulings in the Britannica/Merriam-Webster, Yomiuri or Reddit cases.
- I could not confirm whether Penske has appealed.
- I could not verify Cloudflare Radar's exact crawl-to-refer ratios at the primary source.
- I found no outcome yet of the EU Commission probe.

---

## 6. What users value or distrust in AI answers vs. 10 blue links; where classic results still win

### Takeaway
Users value **follow-up questions, synthesis across outlets and translation**. Trust in AI answers is low: **20% overall** (DNR 2026) and about 50% among people who actually encounter AI search answers. Trust drops for health and politics, where people go back to traditional sources. Classic results keep the short and navigational queries (only 8% of 1–2-word queries trigger an AIO) and high-stakes verification.

### Cited Findings
- The most valued chatbot-for-news feature is asking **follow-up questions (42%)**. Users also value compiling stories from different outlets and translating. — [DNR 2026](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/dnr-executive-summary)
- **Trust:** 20% trust AI chatbot answers globally vs. 37% for news overall, and the UK is lowest at 6%. Among chatbot news users, trust is reportedly 44%. — [DNR 2026](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/dnr-executive-summary); [The Decoder](https://the-decoder.com/more-people-get-news-from-ai-chatbots-but-trust-remains-low/) **[secondary for 44%]**
- **Click-through claimed by users:**
  - 42% of chatbot news users say they always or often click through to sources (South Korea 56%, Denmark 26%), compared with 44% from search and 36% from social — [DNR 2026](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/dnr-executive-summary)
  - **Conflict:** some coverage reports "only 4% click through" — [TechTimes](https://www.techtimes.com/articles/318827/20260622/ai-chatbots-now-reach-one-ten-news-readers-only-4-click-back-sources.htm). The primary summary says 42%.
  - Self-reported clicking conflicts sharply with Pew's *observed* 1% click on links inside AI summaries — [Pew](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
- Chatbot users are less likely than search or social users to look for more detail. They are more likely to verify a story or check its source. — [DNR 2026](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/dnr-executive-summary)
- **Reuters Institute GenAI & News 2025:**
  - 33% always or often click source links in AI search answers, 37% sometimes, 28% rarely or never.
  - **50%** of those who saw AI answers trust them. Trust drops for health and politics, where many people check traditional sources.
  - Brand trust: ChatGPT 29%, Gemini 18%, Copilot 12%, Meta AI 12%.
  - — [Reuters Institute](https://reutersinstitute.politics.ox.ac.uk/generative-ai-and-news-report-2025-how-people-think-about-ais-role-journalism-and-society)
- **DNR 2025 expected effects of gen-AI on news (net score):** cheaper to make +29, more up-to-date +16, less transparent −8, less accurate −8, **less trustworthy −18** — [DNR 2025](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2025/dnr-executive-summary)
- **Query-type pattern:** AI summaries appear on 8% of 1–2-word searches, 53% of 10+-word searches, 60% of question-word searches and 36% of full-sentence searches — [Pew](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
- **Freshness/news:** the EBU found "outdated information" was among the major accuracy issues (20% of answers) — [VRT/EBU](https://communication.vrt.be/largest-study-of-its-kind-shows-ai-assistants-misrepresent-news-content-45-of-the-time-regardless-of-language-or-territory). Google was cautious about triggering AIO on news queries — [DNR 2025](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2025/dnr-executive-summary)
- Microsoft's design keeps classic results visible: Copilot Search places "cited sources and all relevant web results" at the top and bottom of the AI answer — [Bing blog](https://blogs.bing.com/search/April-2025/Introducing-Copilot-Search-in-Bing)

### Inferences
- Short keyword and navigational queries ("facebook login", brand names) rarely trigger AI answers (8% of 1–2-word queries), so classic ranking still dominates them. Long and question queries are where AI answers take over.
- Fresh news is the weakest area for AI answers: outdated facts, wrong attribution and confident errors. High-stakes topics (health, politics) push users back to traditional sources. Breaking news and YMYL ("your money or your life") topics are where links still win on trust.
- Local, shopping and transactional searches: the evidence gathered here is indirect. Google and Perplexity are pushing agentic shopping (Google's "Universal Cart"; Comet on Amazon), which suggests these intents are contested rather than safely held by blue links.

### Gaps
- I found no rigorous 2025–2026 study isolating **local** (maps/business) or **shopping** query satisfaction for AI answers vs. classic results. Google's I/O 2026 "Universal Cart" agentic shopping is reported only by secondary sources — [Passionfruit](https://www.getpassionfruit.com/blog/google-i-o-2026-every-announcement-and-what-it-means-for-seo-and-geo) **[secondary]**
- I found no direct user-preference experiment (AI answer vs. 10 blue links, same task) from an independent academic source in this session.

---

## 7. Agentic/"deep research" search products and the "search for AI agents" API market

### Takeaway
A new layer, **web search APIs built for LLMs and agents**, emerged after Bing's API shutdown and is now well funded:
- Exa: $2.2B valuation (May 2026)
- Parallel: $2B (Apr 2026)
- Tavily: bought by Nebius for about $275M (Feb 2026)
- Perplexity Search API, Brave, You.com, Linkup, and Cloudflare as a router

List prices have converged around **$1–$7 per 1,000 searches**. Deep or agentic research costs **$0.01–$2.50+ per task**. The model providers themselves charge $10–14 per 1,000 searches. I found no credible public market-size figure. The best proxies are vendor revenue (Exa about $10M ARR in Sept 2025, a Sacra estimate) and valuations.

### Cited Findings
**Pricing (official pages, fetched 22 Oct 2026, unless marked)**
- **Exa:**
  - Search lite $4/1k; auto/fast $7/1k; deep and deep-lite $12/1k
  - Contents $1/1k pages; Answer $5/1k; Monitors $15/1k
  - **Agent** $0.012–$1.00 per request (minimal to xhigh effort), or $0.10 per compute unit
  - Free tier: $10/month in credits
  - — [exa.ai/pricing](https://exa.ai/pricing)
- **Parallel:**
  - Search Turbo/Fast $1/1k; Basic/Advanced $5/1k; Extract $1/1k
  - **Task API** (deep research) Lite $5, Base $10, Core $25, Pro $100 and Ultra $300 per 1k, up to Ultra8x at $2,400/1k
  - FindAll from $0.25 + $0.03 per match; Monitor $3–10/1k
  - Up to 5,000 free requests/month
  - — [parallel.ai/pricing](https://parallel.ai/pricing)
- **Tavily ("Tavily by Nebius"):** free 1,000 credits/month; pay-as-you-go $0.008/credit; Project plan $30/month for 4,000 credits — [tavily.com/pricing](https://www.tavily.com/pricing). Basic search costs 1 credit and advanced 2 (about $8 and $16 per 1k) — [Keiro Labs](https://keirolabs.cloud/blog/web-search-apis-for-agents-2026) **[secondary]**
- **Brave Search API:**
  - Search $5/1k (50 QPS)
  - Answers $4/1k plus $5 per 1M tokens (2 QPS)
  - $5/month free credits
  - Rights to store or train on results only on plans with storage rights
  - Enterprise zero data retention (ZDR)
  - — [brave.com/search/api](https://brave.com/search/api/)
- **Perplexity Search API:** $5/1k, or $1/1k with `search_type: "fast"`. Up to 5 queries per request count as one billable request. — [Perplexity docs](https://docs.perplexity.ai/getting-started/pricing)
- **Linkup:** Search $0.005–0.006 per request (Fast/Standard/Deep); Fetch $0.001–0.006; **Research (async, 1–10 min) $0.25–$2.50 per request**; 4,000 free queries; SOC 2 Type II; ZDR on Enterprise — [linkup.so/pricing](https://www.linkup.so/pricing)
- **You.com Web Search API:** $5/1k calls (up to 100 results); full-page content $1/1k pages; $100 in free credits; claims own index, ZDR and SOC 2 — [you.com/apis](https://you.com/apis)
- **Model-provider built-in search:** OpenAI $10/1k calls ([OpenAI](https://developers.openai.com/api/docs/pricing)); Anthropic $10/1k searches ([Claude](https://platform.claude.com/docs/en/docs/about-claude/pricing)); Google grounding $14/1k after 5k free/month ([Gemini](https://ai.google.dev/gemini-api/docs/pricing)); Grounding with Bing reportedly $14/1k ([Olostep](https://www.olostep.com/blog/bing-search-api-alternatives) **[secondary]**)
- **Cloudflare Web Search API** (2 Oct 2026): Ceramic.ai $0.25/1k (default, ZDR), Linkup $5/1k (ZDR), Exa $7/1k (no ZDR); bring-your-own-key supported — [PPC Land](https://ppc.land/cloudflare-web-search-for-ai-agents-costs-0-25-to-7-per-1-000-requests/) **[secondary]**
- SERP-scraper APIs (SerpAPI etc.) cost about $25/month per 1k searches — [Sacra](https://sacra.com/research/exa-at-10m-growing-11x-yoy) **[secondary]**

**Funding / M&A (proxy for market size)**
- **Exa:**
  - $85M Series B at a $700M valuation, Sep 2025, led by Benchmark — [Latham & Watkins](https://www.lw.com/en/news/2025/09/latham-watkins-advises-exa-in-us85-million-series-b-financing-with-benchmark-and-lightspeed) [superseded valuation]
  - **$250M at $2.2B, May 2026, led by a16z** — [Bloomberg Law](https://news.bloomberglaw.com/private-equity/andreessen-backed-ai-search-startup-exa-valued-at-2-2-billion); [SiliconANGLE](https://siliconangle.com/2026/05/20/exa-labs-raises-250m-2-2b-valuation-ai-search-tools)
  - Revenue about $10M annualized in Sep 2025, up about 11× YoY from about $880k **[estimate, Sacra]**. Customers include Cursor, v0 and Lovable. — [Sacra](https://sacra.com/research/exa-at-10m-growing-11x-yoy)
- **Parallel Web Systems** (Parag Agrawal): Series A $100M at $740M [superseded]. **Series B $100M at $2B, late Apr 2026, led by Sequoia.** About $230M raised in total. — [TechCrunch](https://techcrunch.com/2026/04/29/parallel-web-systems-hits-2b-valuation-five-months-after-its-last-big-raise/)
- **Tavily:** Nebius agreed to acquire it on 10 Feb 2026. Bloomberg reports the price at **$275M**; Nebius did not disclose it. Tavily had raised $25M in total, including a $20M Series A in Aug 2025. — [BusinessWire](https://www.businesswire.com/news/home/20260210002813/en/Nebius-announces-agreement-to-acquire-Tavily-to-add-agentic-search-to-its-AI-cloud-platform); [Bloomberg](https://www.bloomberg.com/news/articles/2026-02-10/nebius-agrees-to-buy-ai-agent-search-company-tavily-for-275-million)
- **Jina AI** was acquired by Elastic in Oct 2025 — [Sacra](https://sacra.com/research/exa-at-10m-growing-11x-yoy) **[secondary]**

**Agentic consumer products**
- Perplexity's "Computer" agent (Feb 2026) with usage-based credits drove its 2026 revenue growth, according to Sacra **[estimate]** — [Sacra](https://sacra.com/c/perplexity/)
- At I/O 2026 Google previewed **"information agents"** that monitor the web in the background and send synthesized updates, starting with AI Pro and Ultra subscribers — [Nasdaq](https://www.nasdaq.com/articles/google-introduces-ai-enhanced-search-features-i-o-2026) **[secondary]**
- **Security risk of agentic browsers:** Brave showed an indirect prompt injection in **Perplexity Comet** (20 Aug 2025). A hidden Reddit comment made Comet's "Summarize" retrieve the user's email and a Gmail OTP and post them back, enabling account takeover. Perplexity's fixes were initially incomplete. Brave recommends treating page content as untrusted, confirming sensitive actions and isolating agentic browsing. — [Brave](https://brave.com/blog/comet-prompt-injection/)
- **Legal status of agents:** the Ninth Circuit's *Amazon v. Perplexity* ruling (4 Aug 2026) held that a user-directed agent routed through the user's machine is the *user* accessing the site under CFAA, which favours agentic browsers for now — [Cooley](https://www.cooley.com/news/insight/2026/2026-08-06-ninth-circuit-rules-on-ai-agent-access-to-third-party-websites-under-cfaa)

### Inferences
- **[estimate]** Exa's ARR was about $10M in late 2025, Tavily was bought for about $275M, and Perplexity's Search API serves 200M daily queries (its whole stack). Together these suggest the standalone "search-for-agents" API market was in the **tens to low hundreds of millions of dollars in annual revenue in 2025–26**, but valued at billions on expected agent growth. Treat this as an order-of-magnitude inference, not a sourced figure.
- Prices are commoditising toward $1/1k (Parallel and Perplexity fast) and even $0.25/1k (Ceramic via Cloudflare). Differentiation is moving to latency, own-index freshness, ZDR/compliance (Linkup, Brave and You.com stress SOC 2/ZDR) and deep-research tiers that charge per task.
- EU angle: ZDR and SOC 2 offerings exist, but none of the pricing pages fetched state **EU data residency**. An EU-hosted product would need to confirm this contractually.

### Gaps
- I found **no credible published market-size figure** (TAM or revenue) for search APIs for AI agents. Analyst numbers, if they exist, were not found before the search budget ran out.
- I found no 2026 revenue figures for Parallel, Tavily, Brave API, You.com or Linkup, and no You.com funding or valuation data. The web-search quota was exhausted before I could check.
- I could not fetch pricing and launch details for OpenAI Deep Research, Google Gemini Deep Research and Perplexity Deep Research consumer tiers this session.
