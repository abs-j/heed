import assert from "node:assert/strict";
import { test } from "node:test";
import "../lib.js";

const { interest: I } = globalThis.SD;

// A reader who doesn't care about token/crypto chatter (even when well written) and likes
// retro-computing posts.
const less = [
  "New token presale opens tonight with an airdrop for early wallets",
  "Airdrop snapshot for the token launch is Friday, whitelist closes soon",
  "The token presale allocation is live, airdrop wallets get priority",
  "Another token launch: presale, whitelist and airdrop details inside",
].map((text) => ({ text, label: "less" }));
const more = [
  "Restored a 1989 Amiga today, the capacitors had leaked across the board",
  "Wrote a tiny assembler for the 6502 over the weekend, 300 lines of C",
  "Found an old Commodore manual with handwritten notes in the margins",
].map((text) => ({ text, label: "more" }));
const kept = [
  { text: "Fixed the flaky integration test by seeding the random generator" },
  { text: "Marathon training week nine, forty two miles and one blister" },
];

test("an unseen post resembling 'less of this' is flagged; unrelated and liked ones are not", () => {
  const lex = I.buildInterest([...less, ...more], kept);
  const tok = I.interestOf("Token presale tomorrow, airdrop snapshot for whitelist wallets", lex);
  const other = I.interestOf("The city approved the new bus route, service starts in March", lex);
  const liked = I.interestOf("Cleaning the keyboard of an old Commodore 64 with isopropyl alcohol", lex);
  assert.ok(tok >= I.INTEREST_FOLD, `token ${tok}`);
  assert.ok(Math.abs(other) < I.INTEREST_FOLD, `other ${other}`);
  assert.ok(liked < tok, `liked ${liked}`);
  assert.equal(I.interestVerdict(tok), "less");
});

test("too few votes on either side means no opinion", () => {
  const lex = I.buildInterest(less.slice(0, 1), []);
  assert.equal(I.interestOf("Token presale airdrop whitelist", lex), 0);
  assert.equal(I.interestOf("anything", undefined), 0);
});
