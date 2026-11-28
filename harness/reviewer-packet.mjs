/**
 * Alias kompatibilitas untuk harness/reviewer-context.mjs (M4 / T2.4).
 */
export {
  stripThinkBlocks,
  stripBuilderNoise,
  buildStrippedReviewPacket,
  buildStrippedReviewPacket as buildReviewerPacket,
  formatStrippedReviewPacket,
  formatStrippedReviewPacket as formatReviewerPacket,
  sanitizeReviewerPrompt,
} from "./reviewer-context.mjs";
