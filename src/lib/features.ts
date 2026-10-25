// Local feature extractor for the on-device slop classifier.
// Every feature maps a post to [0, 1]. `prior` is a hand-set log-odds weight that
// training (tools/train.mjs) pulls towards the data without discarding, so a tiny
// vote history can't flip the sign of something that is sensible a priori.

export interface Ctx {
  text: string;
  lower: string;
  words: string[];
  sentences: string[];
  lines: string[];
  chars: number;
}

export interface Feature {
  id: string;
  label: string;   // shown in "why this score" when the feature pushes towards slop
  prior: number;
  fn: (c: Ctx) => number;
}

const sat = (n: number, k: number) => Math.min(1, n / k);
const count = (s: string, re: RegExp) => (s.match(re) || []).length;

export function makeCtx(text: string): Ctx {
  const t = text.replace(/\r/g, "").trim();
  const words = t.toLowerCase().match(/[a-z0-9@#'’]+/g) || [];
  const sentences = t.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return { text: t, lower: t.toLowerCase(), words, sentences, lines, chars: t.length };
}

const re = (r: RegExp, k = 1) => (c: Ctx) => sat(count(c.text, r), k);

export const FEATURES: Feature[] = [
  // ---- structural / rhetorical templates
  { id: "reversal", label: "'not X, it's Y' reversal", prior: 1.6,
    fn: re(/\b(?:isn'?t|aren'?t|not|never|don'?t|doesn'?t)\b[^.\n]{2,50}?(?:[,;—–-]|\.)\s*(?:it'?s|they'?re|but|it is|this is|that'?s)\b/gi) },
  { id: "hook", label: "stock hook phrase", prior: 1.8,
    fn: re(/\b(?:here'?s the thing|nobody (?:is )?talks? about|nobody is ready|let that sink in|read that (?:again|twice)|the truth is|plot twist|hot take|unpopular opinion|buckle up|game[- ]?chang\w+|in today'?s (?:fast|digital|world)|at the end of the day|stop scrolling|you won'?t believe|will blow your mind|shock(?:ing|ed) (?:news|you)|they don'?t want you to know|the secret to|here'?s why|what (?:no one|nobody) tells you|i analy[sz]ed|so you don'?t have to)/gi) },
  { id: "cta", label: "engagement bait / call to action", prior: 2.2,
    fn: re(/\b(?:like (?:and|&) (?:rt|retweet|repost|share)|(?:like|rt|retweet|repost|follow|share|bookmark) (?:if|for|this|before)|follow (?:me )?for|turn on notifications|comment (?:below|your)|reply (?:below|with|'?\w+'? )|drop a [^\s]+|who else|tag (?:someone|a friend)|link in bio|check your dms?|dm me|rt if|bookmark this|save this|send (?:it|this) to someone)/gi) },
  { id: "grok", label: "@grok prompt-bait", prior: 2.4,
    fn: (c) => (/^\s*(?:hey\s+)?@grok\b|\b(?:hey|yo)\s+@grok\b|@grok,?\s+(?:is (?:this|it)|can you|pick|list|rank|explain|what)/i.test(c.text) ? 1 : 0) },
  { id: "replybait", label: "generic reply filler", prior: 2.4,
    fn: (c) => (c.words.length <= 14 && /^(?:this\.?|exactly\.?|great (?:point|post|thread)|well said|so true|love this|facts\.?|following|100%|agreed?\.?|thanks for sharing|check your dms?|absolutely\.?|couldn'?t agree more)/i.test(c.text) ? 1 : 0) },
  { id: "qbait", label: "closing question bait", prior: 1.5,
    fn: (c) => (/(?:thoughts|agree|am i wrong|right|who else|name one|drop a|your (?:take|answer)|reply below|what'?s yours|i'?ll wait|best answer)\s*[?.!:👇]*\s*(?:[👇🔥💯🙌]\s*)*$/i.test(c.text) ? 1 : 0) },
  { id: "thread", label: "thread / 👇 hook", prior: 1.4, fn: re(/🧵|👇|\(thread\)|\bthread\b[:\s]*$|\b1\s*\/\s*\d{1,2}\b/gim) },
  { id: "hype", label: "breaking / hype framing", prior: 1.6,
    fn: re(/\b(?:breaking|just in|shocking|massive|insane|unbelievable|everything (?:is )?about to change|changes? everything|nobody is talking|going viral|must[- ]see|jaw[- ]dropping)\b|🚨/gi, 2) },
  { id: "platitude", label: "generic motivational platitude", prior: 2.0,
    fn: re(/\b(?:success|journey|grind|mindset|discipline|consistency|consistent|never quit|keep going|keep growing|believe in yourself|future self|you are (?:enough|worthy|loved)|younger self|comfort zone|hard things|put in the work|generational wealth|take the leap|every expert was once|proud of yourself|hug a loved one|life is short|act like the person)\b/gi, 3) },
  { id: "buzz", label: "buzzword-heavy", prior: 1.5,
    fn: re(/\b(?:synerg|leverag|paradigm|ecosystem|scalab|disrupt|10x|supercharg|skyrocket|elevate|next level|ai[- ]powered|unlock|unleash|revolution|transform(?:ative|ing)?|game[- ]changer|cutting[- ]edge|seamless|empower)\w*/gi, 2) },
  { id: "listicle", label: "list formatting", prior: 0.7,
    fn: (c) => sat(c.lines.filter((l) => /^(?:\d{1,2}[.)]|[-•→✅❌🔹▪️▶➡️✔️*])\s*\S/.test(l)).length, 4) },
  { id: "punchy", label: "one-line-per-sentence formatting", prior: 0.9,
    fn: (c) => (c.lines.length >= 4 && c.lines.filter((l) => l.length < 70).length / c.lines.length > 0.75 ? 1 : 0) },
  { id: "fragments", label: "choppy fragment cadence", prior: 0.6,
    fn: (c) => (c.sentences.length >= 3 ? c.sentences.filter((s) => s.split(/\s+/).length <= 4).length / c.sentences.length : 0) },
  { id: "hashtags", label: "hashtags", prior: 1.0, fn: re(/(?:^|\s)#\w+/g, 3) },
  { id: "emoji", label: "emoji-heavy", prior: 0.7,
    fn: (c) => sat(count(c.text, /\p{Extended_Pictographic}/gu), 5) },
  { id: "excl", label: "exclamation spam", prior: 0.6, fn: re(/!{1,}/g, 4) },
  { id: "emdash", label: "em dashes", prior: 0.8, fn: (c) => sat(count(c.text, /[—–]/g), 3) },
  { id: "second", label: "generic 'you' address", prior: 0.9,
    fn: (c) => sat(c.words.filter((w) => w === "you" || w === "your" || w === "you're").length, 4) },
  { id: "absolutes", label: "absolute claims", prior: 0.6,
    fn: re(/\b(?:everyone|nobody|no one|always|never|most people|all of them|every single)\b/gi, 3) },
  { id: "promo", label: "promotional language", prior: 1.4,
    fn: re(/\b(?:launch(?:ed|ing)?|check it out|sign up|join (?:the|our)|free guide|link below|limited (?:time|spots)|stay tuned|coming soon|big things|something special|we'?re building)\b/gi, 2) },
  { id: "vague", label: "vague / content-free", prior: 1.2,
    fn: (c) => (c.words.length <= 12 && !/\d/.test(c.text) && !/@\w/.test(c.text) &&
      /\b(?:problem|interesting|things|stuff|this|that|think about|changes?)\b/i.test(c.text) &&
      !/\b(?:i|my|me|we|our)\b/i.test(c.text) ? 1 : 0) },

  // ---- evidence of a real, specific, human voice (negative weights)
  { id: "first", label: "first-person voice", prior: -1.3,
    fn: (c) => sat(c.words.filter((w) => /^(?:i|i'm|i’m|i've|i’ve|i'd|i'll|my|me|mine|we|our|myself)$/.test(w)).length, 3) },
  { id: "narrative", label: "personal narrative", prior: -1.0,
    fn: re(/\b(?:today|yesterday|last night|this morning|tonight|just (?:got|landed|finished|found|shipped|sold|had)|finally|my (?:wife|husband|kid|daughter|son|mum|mom|dad|cat|dog|boss|landlord|neighbou?r)|called me|told me|asked me)\b/gi, 2) },
  { id: "digits", label: "specific numbers", prior: -0.9,
    fn: (c) => sat(count(c.text, /\b\d[\d,.:%]*\b/g), 3) },
  { id: "units", label: "units / figures", prior: -0.8,
    fn: re(/\b\d[\d,.]*\s?(?:%|k|m|gb|mb|ms|mins?|minutes|hours?|days?|weeks?|years?|miles?|km|\$|usd|pts|points)\b|\$\s?\d/gi, 2) },
  { id: "proper", label: "named entities", prior: -0.8,
    fn: (c) => sat(count(c.text, /(?<=[a-z,;]\s)[A-Z][a-z]{2,}(?:\s[A-Z][a-z]+)*/g), 3) },
  { id: "tech", label: "technical detail", prior: -1.0,
    fn: re(/\b(?:api|sql|postgres|python|rust|node|ci|cache|benchmark|segfault|kernel|latency|query|deploy|bug|compiler|ablation|margin|10-k|guidance|rates?|ruling)\b|`[^`]+`/gi, 3) },
  { id: "slang", label: "casual slang", prior: -1.1,
    fn: re(/\b(?:lol|lmao|lmfao|wtf|tbh|ngl|idk|smh|imo|bruh|omg|ffs|ok(?:ay)?|honestly|genuinely|literally|kinda|gonna|wanna|dunno|haunted)\b/gi, 2) },
  { id: "profanity", label: "profanity", prior: -0.8, fn: re(/\b(?:fuck|shit|damn|hell|ass|crap|wtf)\w*/gi, 2) },
  { id: "ellipsis", label: "ellipsis", prior: -0.4, fn: re(/\.{3}|…/g) },
  { id: "lower", label: "lowercase casual style", prior: -0.7,
    fn: (c) => (c.text === c.lower && /[a-z]{5,}/.test(c.text) ? 1 : 0) },
  { id: "mention", label: "addresses a person", prior: -0.6,
    fn: (c) => (/(^|\s)@(?!grok\b)\w+/i.test(c.text) ? 1 : 0) },
  { id: "link", label: "link", prior: -0.5, fn: re(/https?:\/\/\S+/g) },
  { id: "hedge", label: "nuance / hedging", prior: -0.9,
    fn: re(/\b(?:although|however|but|though|except|only (?:applies|if)|turns out|apparently|seems?|probably|suspect|disagree|changed my mind|depends)\b/gi, 3) },
  { id: "question_real", label: "specific question", prior: -0.5,
    fn: (c) => (/\?\s*$/.test(c.text) && c.words.length >= 10 && !/thoughts|agree|am i wrong|who else/i.test(c.text) ? 1 : 0) },
  { id: "len", label: "length", prior: -0.6,
    fn: (c) => sat(Math.log10(Math.max(c.chars, 10)) - 1.5, 1) },
  { id: "ttr", label: "repetitive wording", prior: -0.0,
    fn: (c) => (c.words.length >= 10 ? 1 - new Set(c.words).size / c.words.length : 0) }
];

export const FEATURE_IDS = FEATURES.map((f) => f.id);

export function extract(text: string): number[] {
  const c = makeCtx(text);
  return FEATURES.map((f) => f.fn(c));
}
