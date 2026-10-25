// Entry point bundled to lib.js (IIFE) and exposed as globalThis.SD, so the service
// worker (importScripts), content script, options page and tests share one API.
import { localScore, sgdStep, DEFAULT_WEIGHTS, learn } from "./model";
import { FEATURES } from "./features";
import * as scoring from "./scoring";
import * as providers from "./providers";
import * as router from "./router";
import * as rage from "./rage";
import * as interest from "./interest";
import * as topics from "./topics";

const SD = { ...scoring, localScore, sgdStep, DEFAULT_WEIGHTS, learn, FEATURES, providers, router, rage, interest, topics };
export type SDApi = typeof SD;
(globalThis as unknown as { SD: SDApi }).SD = SD;
