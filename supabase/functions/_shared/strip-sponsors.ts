/**
 * Strip sponsor/ad text from podcast episode descriptions before AI processing.
 * Removes sportsbook disclaimers, ad reads, and hosting boilerplate that can
 * cause false positive category tagging (e.g., FanDuel sponsor → "betting" tag).
 */

// Patterns that indicate the start of a sponsor/ad block.
// Everything from the FIRST match onward is removed.
const CUTOFF_PATTERNS = [
  /Support\s+Us\s+By\s+Supporting\s+Our\s+Sponsors/i,
  /Sponsored\s+by\b/i,
  /Presented\s+by\b/i,
  /FANDUEL\s+DISCLAIMER/i,
  /DRAFTKINGS\s+DISCLAIMER/i,
  /Hosted\s+by\s+Simplecast/i,
  /Hosted\s+by\s+Megaphone/i,
  /See\s+pcm\.adswizz\.com/i,
  /See\s+omnystudio\.com/i,
  /Gambling\s+Problem\?\s+Call/i,
  /Learn\s+more\s+about\s+your\s+ad\s+choices/i,
  /Learn\s+more\s+about\s+your\s+ad-choices/i,
  /Privacy\s+Policy\s+at\s+https:\/\/art19\.com/i,
  /Go\s+to\s+https?:\/\/podcastchoices\.com/i,
];

// Regex to detect standalone sportsbook ad paragraphs (removed individually).
// Matches paragraphs that start with a sportsbook brand and contain gambling terms.
const SPORTSBOOK_AD_PATTERN = /(?:^|\n\n?)(?:FanDuel|DraftKings|BetMGM|Caesars\s+Sportsbook|PointsBet|bet365|BetRivers|Hard\s+Rock\s+Bet)\b[^]*?(?:21\+|wager|sportsbook|gambling|GAMBLER|1-800)[^]*?(?:\n\n|\n?$)/gi;

// Standalone disclaimer blocks (e.g., "21+ in select states …")
const DISCLAIMER_PATTERN = /(?:^|\n\n?)21\+\s+in\s+select\s+states[^]*?(?:\n\n|\n?$)/gi;

/**
 * Strip sponsor and ad text from an episode description.
 * Returns the cleaned description suitable for AI classification.
 */
export function stripSponsorText(description: string | null | undefined): string {
  if (!description) return '';

  let cleaned = description;

  // 1. Remove standalone sportsbook ad paragraphs first
  cleaned = cleaned.replace(SPORTSBOOK_AD_PATTERN, '\n\n');
  cleaned = cleaned.replace(DISCLAIMER_PATTERN, '\n\n');

  // 2. Find the earliest cutoff point and truncate
  let earliestIndex = cleaned.length;
  for (const pattern of CUTOFF_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match && match.index !== undefined && match.index < earliestIndex) {
      earliestIndex = match.index;
    }
  }

  if (earliestIndex < cleaned.length) {
    cleaned = cleaned.substring(0, earliestIndex);
  }

  // 3. Trim trailing whitespace/newlines
  cleaned = cleaned.trim();

  return cleaned;
}
