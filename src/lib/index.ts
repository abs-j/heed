// Entry point bundled to lib.js (IIFE) and exposed as globalThis.SD, so the service
// worker (importScripts), content script, options page and tests share one API.
import { localScore, sgdStep, DEFAULT_WEIGHTS } from "./model";
import { FEATURES } from "./features";
import * as scoring from "./scoring";
import * as providers from "./providers";
import * as router from "./router";

const SD = { ...scoring, localScore, sgdStep, DEFAULT_WEIGHTS, FEATURES, providers, router };
export type SDApi = typeof SD;
(globalThis as unknown as { SD: SDApi }).SD = SD;
