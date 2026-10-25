// Topics: "I want to see less news" without writing a rule. Posts are tagged on-device with a
// small set of broad topics; every 👍/👎 moves the preference for the post's topic, newer
// reactions counting more, so a 👍 on a hidden post later brings the topic back. Topic
// preferences only ever fold a post as "seeing less <topic>"; slop and rage verdicts and the
// reader's own thumbs always win over them.

export interface Topic { id: string; label: string; re: RegExp; strong?: RegExp }

const w = (s: string) => new RegExp(`\\b(?:${s})\\b`, "gi");

export const TOPICS: Topic[] = [
  { id: "news", label: "News", strong: /\b(?:breaking|just in|developing|according to)\b|🚨/i,
    re: w("reported|reports?|announced|officials?|spokes\\w+|statement|confirmed|authorities|police|briefing|press conference|investigation|killed|dead|arrested|evacuat\\w+|earthquake|wildfire|hurricane|strikes?|ceasefire|headline|sources? say") },
  { id: "politics", label: "Politics",
    re: w("election|votes?|voted|senate|congress|parliament|president|prime minister|trump|biden|harris|democrats?|republicans?|liberals?|conservatives?|policy|tariffs?|immigration|border|campaign|governor|ballot|maga|left-wing|right-wing|labor party|government") },
  { id: "sports", label: "Sports",
    re: w("nba|nfl|mlb|nhl|premier league|playoffs?|touchdown|quarterback|goals?|scored|lakers|celtics|bucks|heat|spurs|season|coach|draft|fixtures?|world series|final|halftime|championship|league|tournament|wembanyama") },
  { id: "crypto", label: "Crypto",
    re: w("bitcoin|btc|eth|ethereum|crypto|tokens?|airdrops?|presale|memecoin|solana|nfts?|defi|wallets?|altcoins?|whitelist") },
  { id: "tech", label: "Tech & AI",
    re: w("ai|llms?|gpt|openai|anthropic|claude|gemini|startups?|software|apps?|api|open source|nvidia|chips?|developers?|code|python|rust|javascript|programming|robots?|grok|model|compiler|database") },
  { id: "finance", label: "Markets & finance",
    re: w("stocks?|markets?|fed|rates?|inflation|earnings|etf|s&p|nasdaq|ipo|invest\\w*|revenue|portfolio|bonds?|economy|gdp|recession|dollar|shares|dividend") },
  { id: "entertainment", label: "Entertainment",
    re: w("movies?|film|trailer|series|finale|netflix|album|songs?|tour|concert|oscars?|box office|streaming|episodes?|anime|marvel|zelda|nintendo|playstation|xbox|gameplay|season \\d") },
  { id: "culture", label: "Culture war",
    re: w("woke|dei|trans|gender|abortion|racis[mt]|feminis\\w+|islam|muslims?|christians?|atheists?|religion|white people|black people|immigrants?|boomers?|gen ?z|liberals?|conservatives?") },
  { id: "health", label: "Health",
    re: w("health|doctors?|cancer|vaccines?|diet|fasting|sleep|exercise|mental health|therapy|supplements?|nutrition|gut|workout") },
  { id: "science", label: "Science",
    re: w("nasa|space|physics|climate|research|study|paper|astronomy|species|quantum|biology|researchers?|telescope|experiment") },
];

const count = (s: string, re: RegExp) => new Set((s.toLowerCase().match(re) || [])).size;

// The post's topics, strongest first. A topic needs two distinct keywords (or one in a very
// short post, or a strong marker like "BREAKING"), so passing mentions don't tag a post.
export function topicsOf(text: string): string[] {
  const short = text.trim().split(/\s+/).length <= 12;
  const scored: [string, number][] = [];
  for (const t of TOPICS) {
    const n = count(text, t.re) + (t.strong?.test(text) ? 2 : 0);
    if (n >= 2 || (n >= 1 && short)) scored.push([t.id, n]);
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]);
}

export interface Reaction { text: string; label: "less" | "more"; ts?: number }
export interface TopicPref { id: string; pref: number; likes: number; dislikes: number; manual?: "less" | "more" }
export const TOPIC_FOLD = -0.5;
export const HALF_LIFE_DAYS = 45;

// Preference in [-1, 1] per topic from the reader's reactions: newer reactions weigh more, and a
// pinch of smoothing means one 👎 nudges (-0.4) while two clearly fold (-0.57). Manual choices
// from Settings override the learned value.
export function topicPrefs(reactions: Reaction[], manual: Record<string, "less" | "more"> = {}, now = Date.now()): Record<string, TopicPref> {
  const acc: Record<string, { l: number; d: number }> = {};
  for (const r of reactions) {
    const age = r.ts ? Math.max(0, (now - r.ts) / 864e5) : 0;
    const wgt = Math.pow(0.5, age / HALF_LIFE_DAYS);
    const top = topicsOf(r.text)[0];
    if (!top) continue;
    const a = (acc[top] ||= { l: 0, d: 0 });
    if (r.label === "more") a.l += wgt; else a.d += wgt;
  }
  const out: Record<string, TopicPref> = {};
  for (const t of TOPICS) {
    const a = acc[t.id] || { l: 0, d: 0 };
    let pref = (a.l - a.d) / (a.l + a.d + 1.5);
    const m = manual[t.id];
    if (m) pref = m === "less" ? -0.9 : 0.9;
    out[t.id] = { id: t.id, pref: Math.round(pref * 100) / 100, likes: Math.round(a.l * 10) / 10, dislikes: Math.round(a.d * 10) / 10, manual: m };
  }
  return out;
}

// "Seeing less news": the post's main topic is one the reader has turned down.
export function topicVerdict(text: string, prefs: Record<string, TopicPref>): { id: string; label: string; less: boolean; more: boolean } | null {
  const top = topicsOf(text)[0];
  if (!top || !prefs[top]) return null;
  const p = prefs[top].pref;
  return { id: top, label: TOPICS.find((t) => t.id === top)!.label, less: p <= TOPIC_FOLD, more: p >= -TOPIC_FOLD };
}
