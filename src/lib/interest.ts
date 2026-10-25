// "Not for you" / "More of this": a personal-interest signal that is separate from quality.
// A well-made post about something you don't care about is not slop, but you may still want
// it to cost less attention. "Less" votes (reason: not for me / repetitive) are contrasted with
// posts you kept (More-of-this votes and Not-slop votes) using the same leave-one-out taste
// lexicon as the quality model, so only words that really set the two sides apart count.
import { buildLexicon, tasteOf, type Lexicon, type VoteLike } from "./learn";

export interface TasteVote { text: string; label: "less" | "more" }

export const INTEREST_FOLD = 0.6;   // |interest| at which a post is folded / highlighted

// Lexicon with "less" posts on the slop side and kept posts on the other.
export function buildInterest(taste: TasteVote[], kept: { text: string }[]): Lexicon {
  const rows: VoteLike[] = [
    ...taste.filter((v) => v.label === "less").map((v) => ({ text: v.text, label: "slop" })),
    ...taste.filter((v) => v.label === "more").map((v) => ({ text: v.text, label: "not_slop" })),
    ...kept.map((v) => ({ text: v.text, label: "not_slop" })),
  ];
  return buildLexicon(rows);
}

// [-1, 1]: positive = resembles what you want less of, negative = resembles what you want more of.
export const interestOf = (text: string, lex: Lexicon | undefined) => tasteOf(text, lex);

export type Interest = "less" | "more" | null;
export const interestVerdict = (score: number): Interest =>
  score >= INTEREST_FOLD ? "less" : score <= -INTEREST_FOLD ? "more" : null;
