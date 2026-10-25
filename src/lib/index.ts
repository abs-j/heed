// Entry point bundled to lib.js (IIFE) and exposed as globalThis.SD, so the service
// worker (importScripts), content script, options page and tests share one API.
import { localScore, sgdStep, DEFAULT_WEIGHTS } from "./model";
import { FEATURES } from "./features";
import * as scoring from "./scoring";

const SD = { ...scoring, localScore, sgdStep, DEFAULT_WEIGHTS, FEATURES };
export type SDApi = typeof SD;
(globalThis as unknown as { SD: SDApi }).SD = SD;
