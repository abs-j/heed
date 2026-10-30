import assert from "node:assert/strict";
import { test } from "node:test";
import "../lib.js";

const SD = globalThis.SD;
const score = (t, alt) => SD.thirst.localThirst(t, alt).score;

// Synthetic posts written for this test, not collected data: they pin the intent (bait asks and
// suggestive framing fold; training, sport, travel, craft and ordinary captions do not).
const BAIT = [
  ["Feeling cute 😏 rate me 1-10 #bikini #baddie", ""],
  ["thoughts? 🥵", "May be an image of 1 person, bikini and beach"],
  ["New pic 😉 be honest, am I your type? 🔥 #thirsttrap", "May be a selfie of 1 person and lingerie"],
  ["🍑😏", "May be an image of 1 person, swimsuit and bare back"],
  ["Who's up? Guess my age 😈 #sexy #mirrorselfie", ""],
  ["Gym mirror selfie, abs out. Rate it 💦 #shirtless #gymcrush", ""]
];
const FINE = [
  ["Beginner leg day workout: 4 sets of squats, 3 sets of lunges, rest 90 seconds. Form tips below. #fitness", "May be an image of 1 person in a gym"],
  ["Won gold in the 200m freestyle at the regional swim meet today! So proud of the whole swim team.", "May be an image of 3 people, swimwear and pool"],
  ["Sunset hike to the lake with friends. Beach day tomorrow, can't wait for the trip.", "May be an image of 2 people and beach"],
  ["Our new summer collection is live. Photo by @lenz, styled by Ana. Swimwear designed in Lisbon.", "May be an image of 1 person and bikini"],
  ["Breast cancer awareness month: join our 5k fundraiser on Saturday.", ""],
  ["Made this banana bread recipe with my daughter this weekend. Ingredients in the comments.", ""],
  ["Ate here yesterday, the pasta was unreal 🔥", "May be an image of food"],
  ["Back from the gym, finally hit a 100kg squat PR after eight months of training.", "May be an image of 1 person in a gym"],
  ["Shirtless dad jokes at the lake today 😂 my kids threw me in the water", "May be an image of 3 people and lake"]
];

test("bait asks and suggestive framing clear the default line", () => {
  for (const [t, a] of BAIT) assert.ok(score(t, a) >= 70, `${score(t, a)} for: ${t}`);
});

test("training, sport, travel, craft and ordinary captions stay well under the line", () => {
  for (const [t, a] of FINE) assert.ok(score(t, a) < 40, `${score(t, a)} for: ${t}`);
});

test("one weak signal alone never folds a post", () => {
  assert.ok(score("Sunday vibes 😉", "May be an image of 1 person and coffee") < 50);
  assert.ok(score("Fit check 🔥", "May be an image of 1 person in a jacket") < 50);
});

test("what the photo shows (alt text) raises the score, a long real caption lowers it", () => {
  assert.ok(score("feeling cute", "May be an image of 1 person and bikini") > score("feeling cute", ""));
  const long = "feeling cute but honestly this was the day after we finished the renovation of our kitchen and my sister drove four hours to help paint the walls";
  assert.ok(score(long, "May be an image of 1 person and bikini") < score("feeling cute", "May be an image of 1 person and bikini"));
});

test("reader votes pull the scorer towards their meaning, within the anchored range", () => {
  const votes = [
    ...["Gym selfie before work 💪 #gymcrush", "Post workout 💪 #gymgirl #abs", "Leg day done 💪 #gymcrush", "Arms day 💪 #gymcrush #abs"].map((text) => ({ text, label: "not_thirst" })),
    ...["rate me 1-10", "Rate my fit 1-10 😏", "rate this 1-10 please", "be honest rate me"].map((text) => ({ text, label: "thirst" }))
  ];
  const w = SD.thirst.refitThirst(votes);
  assert.equal(w.trained.n, 8);
  const before = SD.thirst.localThirst("Post workout 💪 #gymcrush #abs").score;
  const after = SD.thirst.localThirst("Post workout 💪 #gymcrush #abs", "", w).score;
  assert.ok(after < before, `${before} -> ${after}`);
  for (const f of SD.thirst.THIRST_FEATURES) assert.ok(Math.abs(w.w[f.id] - f.prior) <= 1.5 + 1e-6);
});

test("router asks the AI model when thirst is unsure, settles locally when sure", () => {
  const o = { mode: "tiered", low: 20, high: 90, llmReady: true };
  assert.equal(SD.router.route(5, { ...o, thirst: { on: true, score: 50 } }).use, "llm");
  assert.equal(SD.router.route(5, { ...o, thirst: { on: true, score: 10 } }).use, "local");
  assert.equal(SD.router.route(5, { ...o, thirst: { on: false, score: 50 } }).use, "local");
});

test("Instagram: hashtags and emoji are how people write there, so ordinary captions don't count as slop", () => {
  const caption = "Golden hour ✨ #photography #sunset #travel #nature";
  assert.ok(SD.localScore(caption).score >= 60, "on X this reads as hashtag spam");
  assert.ok(SD.localScore(caption, undefined, "instagram").score < 40);
  assert.ok(SD.localScore("😍😍😍", undefined, "instagram").score < 50);
  // The real slop signals still apply.
  assert.ok(SD.localScore("Link in bio! New drop 🔥 #ad", undefined, "instagram").score >= 70);
});
