# Web search market landscape, business models and the shift to AI assistants (as of 22 Oct 2026)

Research notes for a small EU (Bulgaria-based) studio judging where a new search engine could realistically win. Every figure carries its source and the period it covers.

**Method note on StatCounter numbers.** Most share figures below come from StatCounter Global Stats. I took them from the public pages and from StatCounter's own CSV export of the same charts (`gs.statcounter.com/chart.php?...&csv=1`), pulled on 22 Oct 2026.
- "2026 YTD" means the year-to-date aggregate StatCounter served on 22 Oct 2026. The latest full month is Sept 2026.
- StatCounter revises figures for up to 45 days. As a result, the CSV and page values can differ by about 0.05 pp. Example: Bulgaria, Sept 2026, Google 95.94% in the CSV vs 95.98% on the page.
- **Search volume and search-engine market share were checked at the end of the research. AI-assistant demand was not.** The run hit the shared WebSearch quota (200 calls per turn across all agents). After that only direct fetches of known primary URLs were possible, which leaves several gaps, listed per section.

---

## 1. Market shares (global, Europe/EU, Bulgaria; desktop vs mobile) and movement 2022→2026

### Takeaway
Google still holds about 90% of search referrals worldwide, about 89% in Europe and about 96% in Bulgaria (Sept 2026), and on mobile it is about 95–98% everywhere.
- **Where Google lost share since 2022, Bing gained it, almost entirely on desktop.** Western-EU countries such as Germany and France show the clearest moves.
- **Bulgaria has been flat.** Google sat at 95.9–96.6% in every year from 2022 to 2026. Every engine other than Google and Bing combined holds under 1% in Bulgaria.
- **Only three local engines beat Google on their home turf:** Yandex in Russia, Baidu in China and Naver in South Korea. Seznam in Czechia is the only EU example of a sizeable local engine, at about 13%.

### Cited Findings

**StatCounter methodology and limits**
- StatCounter measures search-engine referrals, not searches performed: "Our search engine stats are based on what we call search engine referrals, not the number of searches performed." Only page views on sites running StatCounter code count, and "If that person never clicks on any website result then no search engine referral will be tracked". So zero-click searches and AI answers are invisible. Data are unweighted and can be revised for 45 days. The sample is billions of page views a month across more than 1M sites; for example, 5.3B page views and 885M search referrals in July 2022. — [StatCounter FAQ](https://gs.statcounter.com/faq)
- **AI traffic is barely visible to StatCounter.** It cannot see Bing Chat queries, only "learn more" click-throughs, which are under 0.01% of traffic. The AI browsers Comet, Dia and ChatGPT Atlas identify as Chrome and are recorded as Chrome. — [StatCounter FAQ](https://gs.statcounter.com/faq)
- **Brave Search has no separate line in StatCounter's tables.** It does not appear in any of the worldwide, Europe or Bulgaria CSV exports pulled on 22 Oct 2026, so its share is hidden in "Other". — [StatCounter worldwide](https://gs.statcounter.com/search-engine-market-share)
- **Cloudflare Radar gives a cross-check that is not panel-based.** For full-year 2025 it reports Google "nearly 90%", Bing 3.1%, Yandex 2.0%, Baidu 1.4% and DuckDuckGo 1.2%. On desktop: Google about 80%, Bing nearly 11%. On Windows: Google 76%, Bing about 14%. On mobile: Google almost 93%. — [Cloudflare Radar 2025 Year in Review](https://blog.cloudflare.com/radar-2025-year-in-review/)

**Worldwide, Sept 2026, all devices** — [StatCounter worldwide](https://gs.statcounter.com/search-engine-market-share)

| Engine | Share |
|---|---|
| Google | 89.94% |
| Bing | 5.29% |
| Yahoo! | 1.36% |
| Yandex | 1.30% |
| DuckDuckGo | 0.74% |
| Baidu | 0.44% |

- **Smaller engines worldwide, Sept 2026 CSV:** Naver 0.26%, CocCoc 0.20%, Ecosia 0.17%, Seznam 0.07%, Qwant 0.03%, StartPage 0.01%. — [StatCounter worldwide](https://gs.statcounter.com/search-engine-market-share)
- **Bing's 5.29% in Sept 2026 is its highest month since Jan 2022.** It started that series at 2.88% in Jan 2022. Google's lowest month in the series was Oct 2024, at 89.34%. — [StatCounter worldwide, monthly 2022–2026](https://gs.statcounter.com/search-engine-market-share)
- **Worldwide desktop, Sept 2026:** Google 78.12%, Bing 14.62%, Yahoo! 3.35%, Yandex 1.51%, DuckDuckGo 0.94%, Baidu 0.37%. — [StatCounter desktop worldwide](https://gs.statcounter.com/search-engine-market-share/desktop/worldwide)
- **Worldwide mobile, Sept 2026:** Google 95.68%, Yandex 1.21%, Bing 0.69%, DuckDuckGo 0.64%, Baidu 0.48%, Yahoo! 0.45%. — [StatCounter mobile worldwide](https://gs.statcounter.com/search-engine-market-share/mobile/worldwide)

**Worldwide yearly averages, all devices** — [StatCounter worldwide yearly](https://gs.statcounter.com/search-engine-market-share/all/worldwide/2022)

| Year | Google | Bing | Yandex | Yahoo! | Baidu | DuckDuckGo | Naver | Ecosia |
|---|---|---|---|---|---|---|---|---|
| 2022 | 92.07% | 3.19% | 1.07% | 1.36% | 0.94% | 0.65% | 0.16% | 0.12% |
| 2023 | 92.38% | 2.97% | 1.35% | 1.16% | 0.76% | 0.54% | 0.21% | 0.09% |
| 2024 | 90.67% | 3.74% | 1.94% | 1.22% | 0.87% | 0.61% | 0.34% | 0.10% |
| 2025 | 89.91% | 4.02% | 2.24% | 1.37% | 0.70% | 0.82% | 0.29% | 0.13% |
| 2026 YTD | 90.47% | 4.82% | 1.21% | 1.35% | 0.52% | 0.71% | 0.25% | 0.15% |

- **Worldwide desktop, Google:** 84.73% (2022), then 80.58% (2024), then 83.72% (2026 YTD).
- **Worldwide desktop, Bing:** 8.63%, then 11.28%, then 10.33% over the same years.
- **Worldwide mobile, Google:** 95.59% (2022), then 94.14% (2025), then 95.49% (2026 YTD). — [StatCounter worldwide yearly](https://gs.statcounter.com/search-engine-market-share/all/worldwide/2022)

**Europe region, Sept 2026, all devices.** StatCounter's "Europe" includes non-EU countries; the Yandex share shows Russia is in it. — [StatCounter Europe](https://gs.statcounter.com/search-engine-market-share/all/europe)

| Engine | Share |
|---|---|
| Google | 88.97% |
| Bing | 5.34% |
| Yandex | 2.39% |
| Yahoo! | 1.56% |
| DuckDuckGo | 0.78% |
| Ecosia | 0.48% |

- **Smaller engines in Europe, Sept 2026 CSV:** Seznam 0.28%, Qwant 0.12%, StartPage 0.01%. — [StatCounter Europe](https://gs.statcounter.com/search-engine-market-share/all/europe)
- **Europe low and high points:** Google's lowest month was Mar 2026, at 87.12%. In the same month Bing hit its high of 5.79%. — [StatCounter Europe](https://gs.statcounter.com/search-engine-market-share/all/europe)

**Europe yearly averages, all devices** — [StatCounter Europe yearly](https://gs.statcounter.com/search-engine-market-share/all/europe/2022)

| Year | Google | Bing | Yandex | Yahoo! | DuckDuckGo | Ecosia | Seznam | Qwant | StartPage |
|---|---|---|---|---|---|---|---|---|---|
| 2022 | 92.17% | 3.76% | 1.73% | 0.96% | 0.58% | 0.33% | 0.16% | 0.09% | 0.04% |
| 2023 | 92.19% | 3.40% | 2.26% | 0.99% | 0.52% | 0.26% | 0.17% | 0.06% | 0.03% |
| 2024 | 90.98% | 3.81% | 3.03% | 0.93% | 0.59% | 0.31% | 0.17% | 0.07% | 0.01% |
| 2025 | 89.65% | 4.29% | 3.28% | 1.12% | 0.84% | 0.39% | 0.20% | 0.10% | 0.01% |
| 2026 YTD | 88.36% | 5.43% | 2.72% | 1.58% | 0.88% | 0.51% | 0.28% | 0.13% | 0.02% |

- **Europe desktop, Google:** 84.49% (2022), 79.91% (2024), 79.28% (2026 YTD). Bing on desktop: 8.98%, 11.06%, 11.34%.
- **Europe mobile, Google:** 96.76% (2022), 95.38% (2026 YTD). Ecosia on mobile: 0.26%, then 0.51%. DuckDuckGo on mobile: 0.45%, then 0.70%. — [StatCounter Europe yearly](https://gs.statcounter.com/search-engine-market-share/all/europe/2022)

**Selected EU countries, all devices, yearly 2022 → 2026 YTD**

| Country | Google | Bing | Other notable movers | Desktop / mobile, 2026 YTD | Source |
|---|---|---|---|---|---|
| Germany | 90.42% → 84.04% | 5.72% → 8.08% | Yahoo! 0.77% → 2.23%; DuckDuckGo 0.99% → 1.63%; Ecosia 0.94% → 1.38%; StartPage 0.26% → 0.09% | Desktop: Google 72.21%, Bing 16.95% | [StatCounter Germany](https://gs.statcounter.com/search-engine-market-share/all/germany) |
| France | 91.17% → 88.05% | 4.79% → 5.59% | Yahoo! 1.30% → 2.63%; Ecosia 0.90% → 1.35%; Qwant 0.79% → 0.92% (Qwant desktop 1.34%); DuckDuckGo 0.53% → 0.75% | Mobile: Qwant 0.64% | [StatCounter France](https://gs.statcounter.com/search-engine-market-share/all/france) |
| Czechia | 82.68% → 80.49% | 3.49% → 4.46% | Seznam 12.43% → 13.47% | Seznam: desktop 13.86%, mobile 12.83% | [StatCounter Czech Republic](https://gs.statcounter.com/search-engine-market-share/all/czech-republic) |

- **Two measures of Seznam disagree.** Cloudflare Radar puts Czechia at Google 84% and Seznam 7.7% for 2025, against StatCounter's 11.78% for 2025. — [Cloudflare Radar 2025](https://blog.cloudflare.com/radar-2025-year-in-review/)

**Bulgaria, Sept 2026, all devices** — [StatCounter Bulgaria](https://gs.statcounter.com/search-engine-market-share/all/bulgaria)

| Engine | Share |
|---|---|
| Google | 95.98% |
| Bing | 3.04% |
| Yandex | 0.41% |
| DuckDuckGo | 0.24% |
| Yahoo! | 0.12% |
| Ecosia | 0.08% |

- **Other Bulgarian engines, Sept 2026 CSV:** Qwant 0.05%, Petal Search 0.04%, Mail.ru 0.02%. — [StatCounter Bulgaria](https://gs.statcounter.com/search-engine-market-share/all/bulgaria)
- **Bulgaria, Sept 2026, by device:** desktop Google 91.36%, Bing 7.20%, Yandex 0.52%, DuckDuckGo 0.37%, Yahoo! 0.32%, Ecosia 0.09%. — [StatCounter desktop Bulgaria](https://gs.statcounter.com/search-engine-market-share/desktop/bulgaria)

**Bulgaria yearly, all devices** — [StatCounter Bulgaria yearly](https://gs.statcounter.com/search-engine-market-share/all/bulgaria/2022)

| Year | Google | Bing | Yandex | Yahoo! | DuckDuckGo | Ecosia | Qwant |
|---|---|---|---|---|---|---|---|
| 2022 | 96.12% | 3.14% | 0.14% | 0.26% | 0.16% | 0.03% | 0.01% |
| 2023 | 96.62% | 2.74% | 0.17% | 0.20% | 0.13% | 0.02% | 0.00% |
| 2024 | 95.93% | 3.24% | 0.26% | 0.18% | 0.19% | 0.04% | 0.04% |
| 2025 | 95.73% | 3.24% | 0.38% | 0.17% | 0.27% | 0.05% | 0.05% |
| 2026 YTD | 95.84% | 3.20% | 0.34% | 0.13% | 0.26% | 0.08% | 0.05% |

**Bulgaria yearly by device**

| Year | Desktop Google | Desktop Bing | Mobile Google | Mobile Bing | Mobile DuckDuckGo | Mobile Ecosia |
|---|---|---|---|---|---|---|
| 2022 | 91.99% | 6.78% | 98.14% | 1.37% | 0.10% | 0.02% |
| 2023 | 92.58% | 6.33% | 98.44% | 1.12% | 0.10% | 0.02% |
| 2024 | 90.98% | 7.51% | 97.91% | 1.54% | 0.14% | 0.03% |
| 2025 | 90.95% | 7.36% | 97.79% | 1.48% | 0.19% | 0.04% |
| 2026 YTD | 93.13% | 5.60% | 97.58% | 1.67% | 0.21% | 0.08% |

Source: [StatCounter desktop Bulgaria](https://gs.statcounter.com/search-engine-market-share/desktop/bulgaria); [StatCounter mobile Bulgaria](https://gs.statcounter.com/search-engine-market-share/mobile/bulgaria)

- **Bulgaria's monthly range is narrow.** Google's lowest month was Nov 2025, at 94.92%; the same month was Bing's high, at 4.03%. Jan 2022 read Google 95.88% and Bing 3.26%. — [StatCounter Bulgaria](https://gs.statcounter.com/search-engine-market-share/all/bulgaria)

**Home markets where a local engine leads, all devices, 2022 → 2026 YTD**
- **Russia:** Yandex 49.23% → 71.45%; Google 47.48% → 26.79%. — [StatCounter Russia](https://gs.statcounter.com/search-engine-market-share/all/russian-federation). Cloudflare puts Russia in 2025 at Yandex 65%, Google 34%. — [Cloudflare Radar 2025](https://blog.cloudflare.com/radar-2025-year-in-review/)
- **China:** Baidu 73.71% → 51.24%; Bing 9.63% → 19.81%; Haosou 3.17% → 13.81%. Treat the China series with caution: StatCounter reports Yandex at 10.85% in China for 2026 YTD, which looks like a measurement artefact. — [StatCounter China](https://gs.statcounter.com/search-engine-market-share/all/china)
- **South Korea:** Naver 23.89% → 46.12% (2025) → 43.64% (2026 YTD); Google 70.77% → 45.45% (2025) → 46.88% (2026 YTD). On mobile, 2026 YTD: Naver 65.31%, Google 30.86%. — [StatCounter South Korea](https://gs.statcounter.com/search-engine-market-share/all/south-korea)

### Inferences
- **Google's 2022→2026 losses (about −1.6 pp worldwide, about −3.8 pp in Europe) went overwhelmingly to Bing and Yahoo.** Both are Microsoft-index products; Yahoo is Bing-syndicated, which is general knowledge not verified here. The gains are mostly on desktop, consistent with Windows/Edge defaults and Copilot. Pure privacy or green alternatives gained only tenths of a point: DuckDuckGo +0.30 pp and Ecosia +0.18 pp in Europe.
- **Bulgaria is among the hardest markets in the EU for an alternative engine.** Mobile is about 97.6% Google, and the whole non-Google/non-Bing pool was about 1% in Sept 2026 (100 − 95.94 − 3.07 = 0.99%, my calculation from the StatCounter CSV). Desktop is the only surface with any contestability (Bing 5.6–7.5%).
- **Local engines win only with a strong language, content or ecosystem moat** (Naver, Seznam, Yandex, Baidu). Seznam (about 13% in Czechia) is the closest EU analogue for what a Bulgarian-language engine would need. Seznam also runs a large Czech portal and content ecosystem; that is general knowledge, not verified in this run.
- **StatCounter measures clicks out of search, not queries.** Rising zero-click and AI-answer behaviour therefore biases it, and it cannot see ChatGPT or Perplexity "searches".

### Gaps
- **StatCounter has no EU-27 aggregate**; "Europe" includes Russia, the UK and others. Country-level data were pulled only for BG, DE, FR, CZ (all devices) and DE/FR/IT/ES/NL (mobile).
- **No Similarweb share data** was retrieved; the search quota ran out.
- **Brave Search share is not broken out by StatCounter**, so no comparable share figure exists.

---

## 2. Publicly stated query volumes

### Takeaway
Google is in a different order of magnitude. Its last publicly stated figure is ">5 trillion searches/year", about 14B/day (Google, March 2025).
- **Brave Search (only independent index among the alternatives):** about 2.5B queries/month in Aug 2026, about 81M/day.
- **DuckDuckGo:** has removed its public traffic page; third-party estimates are about 100M/day.
- **Kagi:** about 1.05M queries/day from about 75.7k members.
- **Perplexity:** last official figure was 780M/month (May 2025).
- **ChatGPT:** about 1.2B weekly users (Sept 2026, secondary sourcing), but only part of its use is search-like.

### Cited Findings

**Google**
- Google reported more than 5 trillion searches per year, which SparkToro converts to over 14B/day (published 11 Mar 2025). — [SparkToro, Mar 2025](https://sparktoro.com/blog/new-research-google-search-grew-20-in-2024-receives-373x-more-searches-than-chatgpt/)
- Google's 10-Q attributes Search & other growth to "increases in search queries resulting from growth in user adoption and usage on mobile devices" (Q2 2026). — [Alphabet 10-Q Q2 2026](https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000071/goog-20260630.htm)
- Paid clicks rose 13% year on year in Q2 2026 and 13% in H1 2026. Cost-per-click rose 3% in Q2 and 4% in H1. — [Alphabet 10-Q Q2 2026](https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000071/goog-20260630.htm)
- "Search usage hit an all-time high during the World Cup this year" (Pichai, Q2 2026 call, 22 Jul 2026). — [Alphabet Q2 2026 call transcript](https://s206.q4cdn.com/479360582/files/doc_events/2026/Jul/22/2026_Q2_Earnings_Transcript.pdf)

**Brave Search**
- 2.51B queries in Aug 2026, with an all-time daily high of more than 85.5M on 31 Aug 2026. Brave's claim, relayed in a 3 Sep 2026 article.
- Same article: Brave browser at 126.25M MAU and 53M peak DAU (Aug 2026, per Brendan Eich on X), with about 8% of Brave searches coming from rival browsers. — [PiunikaWeb, 3 Sep 2026](https://piunikaweb.com/2026/09/03/brave-browser-126-million-users-august-2026/)
- 2.46B monthly queries in July 2026. — [PPC Land](https://ppc.land/brave-search-gains-a-spot-on-chromes-engine-list-at-2-46-billion-queries/)
- Brave's API page claims "100s of millions" of daily queries and "150 billion" total queries answered (page as of 22 Oct 2026). — [Brave Search API](https://brave.com/search/api/)

**DuckDuckGo**
- `duckduckgo.com/traffic`, the former public query-stats page, now redirects (HTTP 301) to the DuckDuckGo homepage; checked 22 Oct 2026. — [duckduckgo.com/traffic](https://duckduckgo.com/traffic)
- Third-party estimates: about 100M searches/day and about 36B/year (Loopex, Q2 2026 page). — [Loopex Digital](https://www.loopexdigital.com/blog/duckduckgo-statistics)
- SparkToro's estimate: about 108M/day, derived from StatCounter's ~0.7% share (Mar 2025). — [SparkToro, Mar 2025](https://sparktoro.com/blog/new-research-google-search-grew-20-in-2024-receives-373x-more-searches-than-chatgpt/)
- Both DuckDuckGo figures are estimates, not company disclosures.

**Kagi** (live stats page as of 22 Oct 2026) — [Kagi stats](https://kagi.com/stats)
- 75,675 members, 10,160 families, 399 teams, 3,238 Orion+ members.
- 1,046,700 queries in the past day; 21,404 Assistant threads in the past day.
- Membership is nearly flat in October: 75,604 on 8 Oct, 75,675 on 22 Oct.

**Perplexity**
- 780M queries in May 2025, with more than 20% month-on-month growth. CEO Aravind Srinivas disclosed this at Bloomberg Tech on 5 Jun 2025.
- As of 11 Jun 2026, Perplexity had released no comparable company-wide monthly figure. 2026 numbers circulating online, from 1.2B to 4B+ a month, are estimates. — [Perplexity AI Magazine, Jun 2026](https://perplexityaimagazine.com/perplexity-hub/perplexity-ai-monthly-queries/)

**ChatGPT**
- 800M weekly active users, announced by Altman at DevDay on 6 Oct 2025. — [TechCrunch, 6 Oct 2025](https://techcrunch.com/2025/10/06/sam-altman-says-chatgpt-has-hit-800m-weekly-active-users)
- 1.2B weekly users, reported from DevDay on 29 Sep 2026 (slide and recap). These are secondary sources only; I could not open an OpenAI primary page. — [FourWeekMBA](https://fourweekmba.com/ai-chatgpt-12b-weekly-users-devday-2026-distribution/); [Pasquale Pillitteri live coverage](https://pasqualepillitteri.it/es/news/19276/openai-devday-2026-keynote-esta-noche-directo)
- ChatGPT search-like volume, 2024 estimate: at most 37.5M search-like prompts/day. Basis: about 1B messages/day (Altman, Dec 2024) ÷ 8 messages per conversation × 30% search-like intent (Semrush).
- On that basis Google had about 373× ChatGPT's search volume, and all AI tools combined were under 2% of search. — [SparkToro/Datos, Mar 2025](https://sparktoro.com/blog/new-research-google-search-grew-20-in-2024-receives-373x-more-searches-than-chatgpt/)

### Inferences
- **Order-of-magnitude ladder, daily queries.** This is my arithmetic from the figures above, not a single source:

| Engine | Daily queries | Basis |
|---|---|---|
| Google | ~14B | stated |
| Brave | ~81M | 2.51B ÷ 31 |
| DuckDuckGo | ~100M | estimate |
| Perplexity | ~26M | May 2025; 780M ÷ 30 |
| Kagi | ~1.05M | stated |

- **What Kagi's model yields: estimated revenue roughly $5–23M/yr.** At $5–25/month list prices (section 3), 75.7k members give about $4.5M–$22.7M/yr; a member mix weighted to the $10 plan suggests about $9M/yr. This is my estimate from list prices × members; Kagi's plan mix is unpublished and tax and family-plan pricing are ignored.
- **The Kagi case shows the ceiling of the paid-search niche.** After several years it serves about 1M queries/day, which is about 0.007% of Google's stated volume.

### Gaps
- **No official 2026 query figures** were found for DuckDuckGo, Perplexity, Ecosia, Qwant, Startpage, Naver or Seznam.
- **Google has not restated a total query count since the March 2025 ">5 trillion" figure**, at least in the material retrieved.
- **ChatGPT's share of usage that is search** (it has a "search" feature) was not found as a 2026 figure. See section 4 for the 2025 NBER/OpenAI usage study.

---

## 3. How each engine makes money

### Takeaway
Search is still an advertising business dominated by one firm.
- **Google:** Search & other earned about $63B per quarter in mid-2026 (+17% YoY). Google pays about $16B per quarter in total TAC (Q2 2026, all partners), largely to distribution partners led by Apple.
- **Microsoft:** Search advertising was about $15B in FY26 (+9%) and is the ad supplier behind most alternatives, including DuckDuckGo and Ecosia.
- **Alternatives either resell Bing/Google ads on syndicated results** (DuckDuckGo, Ecosia, Startpage, Qwant), **or charge subscriptions** (Kagi, Brave Premium, DuckDuckGo subscription), **or sell index/API access to AI firms** (Brave).
- **Default-placement payments, about $20B/yr to Apple, remain legal in the US** after the 2025 remedies ruling. Only exclusive deals are banned.

### Cited Findings

**Alphabet / Google**

| Line, $M | Q2 2025 | Q2 2026 | YoY | Source |
|---|---|---|---|---|
| Google Search & other | 54,190 | 63,271 | +16.8% | [Alphabet 10-Q Q2 2026](https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000071/goog-20260630.htm) |
| Total TAC | 14,705 | 16,179 | +10% | [Alphabet 10-Q Q2 2026](https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000071/goog-20260630.htm) |
| Total Alphabet revenue | 96,428 | 119,796 | +24% | [Alphabet 10-Q Q2 2026](https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000071/goog-20260630.htm) |

- **Six months to June:** Search & other was $104,892M in H1 2025 and $123,670M in H1 2026. TAC was $28,453M and $31,407M. Total Google advertising was $81,629M in Q2 2026, against $71,340M a year earlier. — [Alphabet 10-Q Q2 2026](https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000071/goog-20260630.htm)
- **TAC rate fell from 20.6% to 19.8%** (Q2 2025 → Q2 2026, TAC as a share of Google advertising revenue). The cause given is "revenue mix shift from Google Network properties to Google Search & other properties". The TAC rate on Search & other was "substantially consistent".
- **TAC is mainly paid to distribution partners.** The growth in TAC was "largely due to an increase in TAC paid to distribution partners". Those partners are "browser providers, mobile carriers, original equipment manufacturers, and software developers". — [Alphabet 10-Q Q2 2026](https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000071/goog-20260630.htm)
- **Q4 2025:** Search & other $63,073M, against $54,034M in Q4 2024. Total TAC $16,597M, against $14,848M. — [Alphabet Q4 2025 earnings release (8-K Ex. 99.1)](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000012/googexhibit991q42025.htm)
- **FY2025 Search & other is about $224.5B, derived by summing quarters.**
  - Q1 2025: $50.7B, calculated as H1 2025 $104,892M minus Q2 $54,190M.
  - Q2 2025: $54.2B.
  - Q3 2025: about $56.5B. — [CNBC, 29 Oct 2025](https://www.cnbc.com/2025/10/29/alphabet-google-q3-earnings.html)
  - Q4 2025: $63.1B.
  - This total is my sum, not a reported figure.
- **Q3 2026 results are not yet out.** They are scheduled for 28 Oct 2026. — [MarketBeat](https://www.marketbeat.com/earnings/reports/2026-10-28-alphabet-inc-stock/)

**Default-placement payments (US v. Google evidence)**
- Google paid $26.3B in 2021 to be the default search engine across browsers and phones, all partners combined (Raghavan testimony). — [CNBC, 27 Oct 2023](https://www.cnbc.com/2023/10/27/google-paid-26-billion-in-2021-to-become-a-default-search-engine.html)
- Google paid Apple $20B in 2022 to be the default in Safari, per unsealed court filings. — [AppleInsider, 1 May 2024](https://appleinsider.com/articles/24/05/01/google-paid-apple-20-billion-to-be-default-search-engine-in-2022)
- Microsoft offered to share 90% of its ad revenue with Apple to make Bing the Safari default, per the same unsealed documents. — [Gulf News/Bloomberg](https://gulfnews.com/amp/gulfnews/technology/companies/googles-payments-to-apple-reached-20-billion-in-2022-antitrust-court-documents-show-1.1714660457987)
- **Remedies ruling, 2 Sep 2025 (Judge Mehta, 230 pages).** — [Hughes Hubbard, 3 Sep 2025](https://www.hugheshubbard.com/news/court-issues-remedies-ruling-in-united-states-v-google-search-case)
  - It bans exclusive search distribution deals.
  - It "does not prohibit payment for default status".
  - Google must share parts of its search index and user-interaction data with "qualified competitors" at marginal cost. Ads data is excluded.
  - Divestiture of Chrome and Android was rejected.
- **Final judgment entered Dec 2025.** It "imposes restrictions on how Google distributes its services and requires Google to share certain search data with and offer syndication services to certain competitors". Google appealed in Jan 2026; the DOJ and states appealed in Feb 2026. — [Alphabet 10-Q Q2 2026](https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000071/goog-20260630.htm)
- **A 12-month cap on default contracts is reported only by a blog, unverified.** — [Implicator.ai](https://www.implicator.ai/google-avoids-breakup-faces-data-sharing-mandate/)

**Microsoft (Bing, Copilot, Edge, MSN, third-party affiliates)**
- **Search advertising revenue (renamed from "Search and news advertising"):**

| Fiscal year (to June) | Revenue |
|---|---|
| FY2024 | $12,306M |
| FY2025 | $13,878M |
| FY2026 | $15,176M (+$1.3B, +9%) |

- **FY2026 search revenue excluding TAC grew 12%**, "driven by higher search volume and revenue per search, as well as benefit from third-party partnerships". — [Microsoft 10-K FY2026](https://www.sec.gov/Archives/edgar/data/0000789019/000119312526323660/msft-20260630.htm)
- The segment comprises "Bing, Copilot, Microsoft News, Microsoft Edge, and third-party affiliates". — [Microsoft 10-K FY2026](https://www.sec.gov/Archives/edgar/data/0000789019/000119312526323660/msft-20260630.htm)
- **Q4 FY2026 (Apr–Jun 2026):** search revenue excluding TAC +10%, or +9% in constant currency. Guidance for the next quarter was "mid-single digits", lower because of third-party partnerships. — [Search Engine Roundtable](https://www.seroundtable.com/microsoft-earnings-41786.html)

**DuckDuckGo**
- "The majority of our revenue is from private ads on our search engine." Ads are keyword/page-based, not profile-based. Most ad clicks are handled by Microsoft's ad network, with a similar TripAdvisor arrangement. "We also make money from subscription fees." — [DuckDuckGo help: How DuckDuckGo makes money](https://duckduckgo.com/duckduckgo-help-pages/company/how-duckduckgo-makes-money)
- **Subscription, US/UK/EU/Canada (Oct 2026):**
  - Plus: VPN, advanced Duck.ai models, Identity Theft Restoration, and Personal Information Removal (US only).
  - Pro: adds frontier models (Claude 4.8 Opus, GPT-5.6 Sol) and 2× Duck.ai limits.
  - Prices were not shown on the help page. — [DuckDuckGo subscription help](https://duckduckgo.com/duckduckgo-help-pages/privacy-pro/)

**Kagi** (prices plus sales tax; annual billing 10% off) — [Kagi pricing](https://kagi.com/pricing)

| Plan | Price | Searches | AI included |
|---|---|---|---|
| Trial | Free | 100 | 100 Assistant interactions |
| Starter | $5/mo | 300 | Assistant, Quick mode |
| Professional | $10/mo | Unlimited | Assistant, Quick mode |
| Ultimate | $25/mo | Unlimited | Premium AI, Research mode, flagship models |

- Kagi is listed as a Brave Search API customer. — [Brave Search API](https://brave.com/search/api/)

**Brave Search**
- **API pricing (22 Oct 2026):**
  - Search: $5 per 1,000 requests, 50 queries/s, $5 free credit per month.
  - Answers: $4 per 1,000 requests plus $5 per million tokens, 2 queries/s.
  - Enterprise: custom pricing, zero data retention.
  - The hero section says "up to $20 in free calls every month", which is inconsistent with the $5 per-plan credit.
  - Brave claims "Zero dependencies on Google or Bing". Named customers include AWS, Cohere, Mistral AI, Snowflake, you.com and Kagi, plus "a top-3 foundation model" that is not named. — [Brave Search API](https://brave.com/search/api/)
- **Brave's revenue sources, per Eich (Sep 2026):** "search ads + API, browser ads, premium products, [and] crypto deals". No dollar figures were given. — [PiunikaWeb, 3 Sep 2026](https://piunikaweb.com/2026/09/03/brave-browser-126-million-users-august-2026/)
- **Brave Search Premium** gives ad-free results and is available only in the Brave browser. No price is shown on the help page. — [Brave Search Premium help](https://search.brave.com/help/premium)

**Ecosia (steward-owned; monthly public financial reports)**
- **Ownership model:** "Ecosia is a not-for-profit business. We don't pay out dividends and cannot be bought. That way, we're able to use 100% of our profits for the planet." — [Ecosia financial reports](https://blog.ecosia.org/ecosia-financial-reports-tree-planting-receipts/)
- **Total income by year**, summed by me from Ecosia's monthly report data feed (`cdn-blog-en.ecosia.org/financial-reports/data.json`, which backs the reports page; retrieved 22 Oct 2026). — [Ecosia financial reports](https://blog.ecosia.org/ecosia-financial-reports-tree-planting-receipts/)

| Year | Total income |
|---|---|
| 2021 | €28.07M |
| 2022 | €34.50M |
| 2023 | €35.36M |
| 2024 | €34.44M |
| 2025 | €43.24M (avg €3.60M/month) |
| Jan–Sep 2026 | €34.85M (avg €3.87M/month; Sept 2026 alone €4.04M) |

- **Sept 2026 spending breakdown:** — [Ecosia financial reports](https://blog.ecosia.org/ecosia-financial-reports-tree-planting-receipts/)
  - Trees: €1.36M.
  - Green investments: €0.82M; cumulative total €37.75M.
  - Operational costs: €0.84M, of which personnel €0.52M and servers/software €0.20M.
  - Taxes: €0.78M, of which corporate tax €0.50M.
  - "Search index": €116k.
  - Marketing: €120k.
- **Index sourcing:** Ecosia relies on "a mix of both Google and Bing libraries". With Qwant it is building the European Search Perspective (EUSP), "privacy-first" and available to others. EUSP started in France and Germany (article dated 3 Dec 2024). A teaser dated 30 Jul 2026 says "EUSP search results are now live in Germany". — [Ecosia blog: EUSP](https://blog.ecosia.org/eusp/)

**Qwant**
- Qwant positions itself as "The search engine where you are the user, not the product!" It offers free AI short answers and page summaries with an account, and runs a "Qwant Advertising" service. The About page gives no ownership or financial data. — [Qwant About](https://about.qwant.com/en/)
- Qwant co-builds the EUSP index with Ecosia. — [Ecosia blog: EUSP](https://blog.ecosia.org/eusp/)

**Startpage**
- Not retrievable: `startpage.com` blocks this fetcher. No sourced data on its business model or owner.

### Inferences
- **Google's Search & other revenue is about 16× Microsoft's whole search-advertising line.** Google's estimated FY2025 Search & other is about $224.5B; Microsoft's FY2025 search advertising (Jul 2024–Jun 2025) was $13.9B. This is my ratio from the figures above. Every syndication-based alternative (DuckDuckGo, Ecosia, Qwant, Startpage) ultimately depends on Microsoft or Google ad and index feeds. Its margin is set by the supplier.
- **Ecosia shows what a well-known EU alternative earns.** At about 0.5% of European referrals, its income is about €43M/yr (2025). That is roughly $50M, about 0.02% of Google's estimated FY2025 Search revenue. Even a 1% EU share would likely mean tens of millions of euros a year, not hundreds. This is a rough inference only; ad yield differs by country and Ecosia's share is concentrated in DE/FR.
- **Selling an index or API to AI developers is a real monetisation path.** Brave prices it at $5/1k queries. The US remedies (index/data sharing, syndication) and the EU DMA search-data sharing obligation (see section 5) may lower the cost of building a rival index.

### Gaps
- **DuckDuckGo revenue and profitability:** no 2025–2026 figure retrieved.
- **No financial data retrieved** for Brave, Kagi, Qwant or Startpage revenue, or for Naver, Yandex and Baidu search revenue (search quota exhausted).
- **Google→Samsung and Google→Mozilla payment amounts** from trial evidence were not retrieved with a source, so they are omitted rather than stated from memory.
- **Brave Search Premium price** and **DuckDuckGo subscription prices** are not shown on the fetched pages.

---

## 4. How fast demand is shifting to AI answer engines and assistants

### Takeaway
AI assistants have reached search-scale user numbers: ChatGPT has about 1.2B weekly users (Sept 2026, secondary sourcing), and Google's own AI Mode has more than 1B monthly users. But no public data show the 25% fall in traditional search volume that Gartner predicted for 2026.
- **Google says total queries and paid clicks are still growing** (+13% paid clicks YoY in Q2 2026), and Search revenue grew 17%.
- **The shift shows up instead as fewer clicks per search:** about 58–60% zero-click, and AI crawlers take far more than they refer back.
- **There are local signals of decline,** such as Apple's report of a first-ever Safari search dip in April 2025.

### Cited Findings

**Gartner prediction**
- On 19 Feb 2024 Gartner predicted that traditional search-engine volume will drop 25% by 2026, with search marketing losing share to AI chatbots and other virtual agents.
- The page returned a bot-check (HTTP 403) when fetched on 22 Oct 2026. The wording here is the press release title, recorded via its URL. — [Gartner press release, 19 Feb 2024](https://www.gartner.com/en/newsroom/press-releases/2024-02-19-gartner-predicts-search-engine-volume-will-drop-25-percent-by-2026-due-to-ai-chatbots-and-other-virtual-agents)

**What Google's own 2026 data show**
- Search & other +16.8% YoY in Q2 2026; paid clicks +13%; CPC +3%. — [Alphabet 10-Q Q2 2026](https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000071/goog-20260630.htm)
- Pichai on the Q2 2026 call (22 Jul 2026), all from the transcript: — [Alphabet Q2 2026 call transcript](https://s206.q4cdn.com/479360582/files/doc_events/2026/Jul/22/2026_Q2_Earnings_Transcript.pdf)
  - "Since expanding AI Mode globally last October, we've surpassed one billion monthly active users."
  - "just like AI Overviews, AI Mode is driving an incremental increase in Search queries overall".
  - "we're now sending billions of clicks to websites every week through AI features in Search".
  - AI Overviews and AI Mode have been unified into "one seamless search experience".
  - The Gemini app has 950M MAU, with daily users tripling over the year.
- **AI Overviews reach, about 2.5B monthly users, is not confirmed.** It is attributed by secondary outlets to I/O in May 2026, but the figure does not appear in the Q2 2026 transcript. — [Motley Fool, 21 Aug 2026](https://www.fool.com/investing/2026/08/21/sundar-pichai-alphabets-ai-billion-users/)
- **AI Mode had 75M+ daily users at Q3 2025.** Secondary source; the Q3 2025 transcript was not retrieved. — [Writtenly Hub](https://www.writtenlyhub.com/news/google-ai-mode-1-billion-users-adoption-data)

**Apple's 2025 testimony**
- Eddy Cue testified on 7 May 2025 that Google searches in Safari declined in April 2025 for the first time, and attributed it to AI. He said Apple would add AI providers to Safari's search list. He gave no volume numbers.
- Google replied the same day: "We continue to see overall query growth in Search … an increase in total queries coming from Apple's devices and platforms." — [MacTrast, 8 May 2025](https://www.mactrast.com/2025/05/google-says-apple-vps-claim-of-safari-search-traffic-decline-is-incorrect/)
- **Reports of Alphabet's share-price drop that day conflict:** about 7.5% according to MacStories, 0.51% according to MacTrast. — [MacStories](https://www.macstories.net/news/eddy-cue-causes-a-stir-for-google/); [MacTrast](https://www.mactrast.com/2025/05/google-says-apple-vps-claim-of-safari-search-traffic-decline-is-incorrect/)

**ChatGPT usage**
- ChatGPT had 800M weekly active users in Oct 2025. — [TechCrunch, 6 Oct 2025](https://techcrunch.com/2025/10/06/sam-altman-says-chatgpt-has-hit-800m-weekly-active-users)
- 1.2B weekly users were reported from DevDay on 29 Sep 2026; secondary sources only. — [FourWeekMBA](https://fourweekmba.com/ai-chatgpt-12b-weekly-users-devday-2026-distribution/)
- **NBER/OpenAI usage study ("How People Use ChatGPT", Sep 2025):** — [NBER w34255](https://www.nber.org/papers/w34255)
  - About 10% of the world's adult population had adopted ChatGPT by July 2025.
  - The non-work share of messages rose from 53% to more than 70%.
  - "Practical Guidance", "Seeking Information" and "Writing" together make up nearly 80% of conversations.

**StatCounter AI-chatbot referral shares, Sept 2026.** These are shares of referral clicks from chatbots, not usage. — [StatCounter AI chatbot market share](https://gs.statcounter.com/ai-chatbot-market-share)

| Region | ChatGPT | Gemini | Perplexity | Copilot | Claude |
|---|---|---|---|---|---|
| Worldwide | 80.47% | 10.94% | 5.84% | 1.78% | 0.95% |
| Europe | 78.82% | 12.82% | 3.72% | 3.20% | 1.41% |
| Bulgaria | 81.07% | 14.31% | 2.88% | 1.04% | 0.70% |

- **Worldwide trend:** in Apr 2025, ChatGPT had 84.21%, Perplexity 12.07% and Gemini 2.31%. Gemini grew from 2.31% (Apr 2025) to 10.94% (Sept 2026), while Perplexity fell from 12.07% to 5.84%. — [StatCounter AI chatbot market share](https://gs.statcounter.com/ai-chatbot-market-share)

**Zero-click and referral economics**
- **SparkToro/Datos 2024 zero-click study** (published 2 Jul 2024; clickstream from Sep 2022 to May 2024; panel excludes iPhones): — [SparkToro, Jul 2024](https://sparktoro.com/blog/2024-zero-click-search-study-for-every-1000-us-google-searches-only-374-clicks-go-to-the-open-web-in-the-eu-its-360/)
  - Zero-click share: 58.5% of US and 59.7% of EU Google searches end with no click.
  - Per 1,000 Google searches, 374 clicks go to the open web in the US and 360 in the EU. These figures follow the article's title and URL; the fetched summary had the two reversed.
  - Almost 30% of US clicks go to Google-owned properties.
- **Datos US panel:** Google searches per searcher grew 21.64% in 2024 against 2023 (published 11 Mar 2025). — [SparkToro, Mar 2025](https://sparktoro.com/blog/new-research-google-search-grew-20-in-2024-receives-373x-more-searches-than-chatgpt/)
- **Cloudflare Radar crawl-to-referral ratios, 2025** (HTML pages crawled per visit referred back; measured from 1 Jul 2025): — [Cloudflare Radar 2025](https://blog.cloudflare.com/radar-2025-year-in-review/)

| Platform | Ratio |
|---|---|
| Anthropic | up to 500,000:1; about 25,000–100,000:1 later in the year |
| OpenAI | peak 3,700:1 |
| Perplexity | under 200:1 from September |
| Microsoft | about 50–70:1 |
| Google | 3:1 to 30:1 |

- **Googlebot was the highest-volume crawler,** at 4.5% of HTML requests. — [Cloudflare Radar 2025](https://blog.cloudflare.com/radar-2025-year-in-review/)

### Inferences
- **Gartner's −25% does not show in any retrieved public metric for Google, at least as of Q2 2026.** Google's queries, paid clicks and revenue are growing, and StatCounter's Google share fell only about 2 pp from Jan 2022 to Sept 2026. The substitution is real but works mainly through:
  - fewer clicks per query (zero-click, AI Overviews);
  - new AI surfaces inside Google (AI Mode >1B MAU), which keep demand in-house;
  - a parallel assistant channel (ChatGPT, Gemini app) whose search-like share is a minority of its use.
- **For a new engine, the "AI answer" layer is now the competitive baseline.** Google bundles it into Search, so a links-only engine competes with Google's AI answers, not just its links. The cheapest path is to plug into existing index/answer APIs, such as Brave's $5/1k and $4/1k plus tokens, or EUSP if it opens to third parties.
- **In Bulgaria, ChatGPT and Gemini dominate AI-chatbot referrals** (95%+ combined, Sept 2026), with Gemini's share higher than worldwide.

### Gaps
- **Similarweb figures** (ChatGPT visits, Google vs ChatGPT referral volumes) were not retrieved; the search quota was exhausted.
- **No 2025–2026 SparkToro/Datos update** on zero-click with numbers was found. The Aug 2026 SparkToro post contains no data.
- **No official 2026 ChatGPT search-usage share or query count.**
- **No retrieved Google primary source for the AI Overviews MAU figure in 2026.**
- **No Bulgaria-specific data on AI-assistant adoption**, other than the StatCounter chatbot referral split.

---

## 5. Effect of the EU DMA choice screens (2024+) on alternative engines' EU share

### Takeaway
After the choice screens rolled out (from late Feb/Mar 2024), StatCounter shows small but real gains for DuckDuckGo, Ecosia and Qwant on mobile in large EU markets. Their mobile shares roughly doubled from very low bases (+0.1 to +0.6 pp) between early 2024 and mid-2025, and some gains were partly given back by 2026. Google's mobile share fell only about 0.3 to 3 pp depending on the country, much of it to Yandex. In Bulgaria the effect is near-invisible: DuckDuckGo mobile went from 0.10% to 0.21% and Ecosia from 0.02% to 0.08% between 2023 and 2026 YTD.

### Cited Findings

**Rollout and regulatory context**
- Ecosia announced on 27 Feb 2024 that "Starting this week in the EU," Google and Apple would begin showing choice screens. The screens cover iPhones on iOS 17.4+, Chrome on desktop and mobile, and new Android device setups, rolling out "over the next few weeks and months". The post contains no effect data. — [Ecosia blog: choice screen](https://blog.ecosia.org/choice-screen/)
- The EC opened DMA non-compliance investigations against Google (Search, Play) in March 2024 and issued preliminary findings of non-compliance in March 2025. Alphabet says the DMA mandates "the sharing of search data with third-party search engines". — [Alphabet 10-Q Q2 2026](https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000071/goog-20260630.htm)

**StatCounter mobile shares before and after the choice screens.** These are my averages of StatCounter monthly mobile data for four windows:
1. Dec 2023–Feb 2024 (pre-DMA)
2. Jun–Aug 2024
3. Jun–Aug 2025
4. Jul–Sep 2026

| Market | Engine | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Europe region | Google | 96.06% | 95.88% | 95.00% | 95.77% |
| Europe region | DuckDuckGo | 0.37% | 0.43% | 0.71% | 0.65% |
| Europe region | Ecosia | 0.21% | 0.26% | 0.39% | 0.47% |
| Europe region | Qwant | 0.02% | 0.03% | 0.08% | 0.09% |
| Europe region | Seznam | 0.09% | 0.22% | 0.28% | 0.35% |
| Germany | Google | 96.61% | 95.76% | 92.85% | 95.52% |
| Germany | DuckDuckGo | 0.51% | 0.66% | 1.17% | 0.89% |
| Germany | Ecosia | 0.55% | 0.74% | 1.17% | 0.98% |
| Germany | Yandex | 1.32% | 1.61% | 3.38% | 1.80% |
| France | Google | 96.38% | 95.30% | 93.35% | 96.11% |
| France | Ecosia | 0.70% | 1.12% | 1.40% | 1.36% |
| France | Qwant | 0.18% | 0.25% | 0.58% | 0.63% |
| France | DuckDuckGo | 0.59% | 0.72% | 1.16% | 0.64% |
| Netherlands | Google | 97.24% | 96.73% | 93.10% | 94.45% |
| Netherlands | DuckDuckGo | 0.79% | 0.94% | 1.84% | 1.43% |
| Netherlands | Ecosia | 0.27% | 0.38% | 0.70% | 0.63% |
| Italy | DuckDuckGo | 0.25% | 0.39% | 0.55% | 0.62% |
| Italy | Ecosia | 0.15% | 0.21% | 0.31% | 0.47% |
| Spain | DuckDuckGo | 0.18% | 0.25% | 0.35% | 0.34% |
| Spain | Ecosia | 0.10% | 0.10% | 0.14% | 0.18% |

Sources: [StatCounter mobile Europe](https://gs.statcounter.com/search-engine-market-share/mobile/europe); [Germany](https://gs.statcounter.com/search-engine-market-share/mobile/germany); [France](https://gs.statcounter.com/search-engine-market-share/mobile/france); [Netherlands](https://gs.statcounter.com/search-engine-market-share/mobile/netherlands); [Italy](https://gs.statcounter.com/search-engine-market-share/mobile/italy); [Spain](https://gs.statcounter.com/search-engine-market-share/mobile/spain)

- **Bulgaria, mobile yearly:** — [StatCounter mobile Bulgaria](https://gs.statcounter.com/search-engine-market-share/mobile/bulgaria)

| Year | DuckDuckGo | Ecosia | Qwant | Google |
|---|---|---|---|---|
| 2023 | 0.10% | 0.02% | 0.00% | 98.44% |
| 2024 | 0.14% | 0.03% | 0.02% | 97.91% |
| 2025 | 0.19% | 0.04% | 0.04% | 97.79% |
| 2026 YTD | 0.21% | 0.08% | 0.05% | 97.58% |

- **Ecosia's income** was flat from 2022 to 2024 (€34.4–35.4M/yr), then rose to €43.2M in 2025 (+25.5% vs 2024). Average monthly income in Jan–Sep 2026 was €3.87M, against €3.60M in 2025. — [Ecosia financial reports](https://blog.ecosia.org/ecosia-financial-reports-tree-planting-receipts/)

### Inferences
- **The choice screens made a measurable but small dent.** Alternatives gained mostly in the second half of 2024 and in 2025, consistent with screens appearing on new devices and browser resets rather than all at once.
- **The biggest beneficiaries were engines with an EU home-market identity.** Ecosia's mobile share in France doubled. Qwant grew in France. Seznam's Europe-wide mobile share tripled from a tiny base.
- **Ecosia's 2025 income jump (+25%) fits a choice-screen effect.** This is a plausible correlation only; Ecosia's reports do not attribute it.
- **Some 2025 gains look partly like noise.** Yandex spiked in DE/NL/FR mobile in 2025, then reverted, which suggests StatCounter panel effects. Treat month-to-month moves under about 0.2 pp as noise.
- **For Bulgaria, a choice screen alone is not a go-to-market.** Alternatives together are still under 0.5% of mobile referrals two and a half years after the screens appeared.

### Gaps
- **Not found:** statements or numbers from DuckDuckGo, Ecosia, Qwant, Brave or the European Commission quantifying choice-screen effects. Examples would be selection rates, installs, or the EC's DMA review data. The WebSearch quota was exhausted before these could be located; only direct fetches of known URLs remained possible.
- **The choice-screen effect cannot be cleanly separated** from other drivers, such as AI-related churn, Yandex panel artefacts and marketing, using StatCounter alone.
