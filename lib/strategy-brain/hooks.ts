// =============================================================================
// Arrowhead 7 — Strategy Brain: Hook Engineering Library
// =============================================================================
// Curated, categorized opening patterns for the first 1-3 seconds of a post.
// The library is hand-authored — the engine never invents hook patterns at
// runtime. It picks from this list based on niche / platform / category.

import type {
  HookCategory,
  HookTemplate,
  StrategyPlatform,
} from '@/types/strategy';

const ALL_PLATFORMS: StrategyPlatform[] = [
  'youtube',
  'tiktok',
  'instagram',
  'twitter',
  'facebook',
  'linkedin',
];

const SHORT_FORM: StrategyPlatform[] = ['tiktok', 'instagram'];
const VIDEO_PLATFORMS: StrategyPlatform[] = ['youtube', 'tiktok', 'instagram'];

export const HOOK_LIBRARY: HookTemplate[] = [
  // ─── Curiosity ──────────────────────────────────────────────────────────
  {
    id: 'curiosity-nobody-tells',
    name: 'Nobody Tells You',
    category: 'curiosity',
    pattern: 'The thing nobody tells you about [TOPIC]…',
    example: 'The thing nobody tells you about getting your first 10k followers…',
    best_for_platforms: ALL_PLATFORMS,
    best_for_niches: [],
    attention_seconds: 2,
    description: 'Implies insider knowledge. Pairs with a slow zoom or direct address.',
  },
  {
    id: 'curiosity-gap-question',
    name: 'Open Loop',
    category: 'curiosity',
    pattern: 'Why does [SURPRISING THING] happen when you [COMMON ACTION]?',
    example: 'Why does your phone get hot when you charge it overnight?',
    best_for_platforms: VIDEO_PLATFORMS,
    best_for_niches: ['tech', 'education', 'science'],
    attention_seconds: 3,
    description: 'Cliffhanger that promises an answer at the end. Forces a watch.',
  },
  {
    id: 'curiosity-secret',
    name: 'The Secret',
    category: 'curiosity',
    pattern: "Here's the secret [EXPERTS] don't want you to know…",
    example: "Here's the secret video editors don't want you to know…",
    best_for_platforms: SHORT_FORM,
    best_for_niches: [],
    attention_seconds: 2,
    description: 'Use sparingly — high CTR but feels clickbait if overused.',
  },

  // ─── Value ──────────────────────────────────────────────────────────────
  {
    id: 'value-quick-win',
    name: 'Quick Win',
    category: 'value',
    pattern: 'How to [OUTCOME] in [TIME] without [PAIN POINT]',
    example: 'How to edit a 60-sec reel in under 5 minutes without overthinking it.',
    best_for_platforms: ALL_PLATFORMS,
    best_for_niches: ['productivity', 'business', 'fitness', 'cooking'],
    attention_seconds: 3,
    description: 'Specific outcome + time constraint + removed friction. Classic.',
  },
  {
    id: 'value-mistake',
    name: 'Stop Doing This',
    category: 'value',
    pattern: 'Stop doing [COMMON THING] — do [BETTER THING] instead.',
    example: "Stop cutting on every beat — cut on the vocal stress instead.",
    best_for_platforms: ALL_PLATFORMS,
    best_for_niches: [],
    attention_seconds: 2,
    description: 'Pattern-interrupt + actionable swap. Works for any niche.',
  },
  {
    id: 'value-tools',
    name: 'Tools/Tactics List',
    category: 'value',
    pattern: '[NUMBER] [TOOLS / TACTICS] every [AUDIENCE] should be using.',
    example: '5 free tools every creator should be using in 2026.',
    best_for_platforms: VIDEO_PLATFORMS,
    best_for_niches: ['tech', 'business', 'creator', 'marketing'],
    attention_seconds: 3,
    description: 'Promises a list. Reveal one item every 2-4 seconds to drive watch time.',
  },

  // ─── Controversy ────────────────────────────────────────────────────────
  {
    id: 'controversy-unpopular-opinion',
    name: 'Unpopular Opinion',
    category: 'controversy',
    pattern: 'Unpopular opinion: [COMMON BELIEF] is wrong.',
    example: 'Unpopular opinion: cold opens are overused.',
    best_for_platforms: ['twitter', 'linkedin', 'tiktok', 'instagram'],
    best_for_niches: [],
    attention_seconds: 2,
    description: 'Drives comments. Be ready to defend — the algorithm rewards reply chains.',
  },
  {
    id: 'controversy-everyone-wrong',
    name: 'Everyone Is Wrong',
    category: 'controversy',
    pattern: 'Everyone is wrong about [TOPIC]. Here\'s what\'s actually true.',
    example: 'Everyone is wrong about morning routines. Here\'s what actually works.',
    best_for_platforms: ['twitter', 'linkedin', 'youtube'],
    best_for_niches: ['business', 'productivity'],
    attention_seconds: 3,
    description: 'High polarity. Use when you have data or first-hand experience to back it.',
  },

  // ─── Storytelling ───────────────────────────────────────────────────────
  {
    id: 'story-i-tried',
    name: 'I Tried X for N Days',
    category: 'storytelling',
    pattern: 'I tried [THING] for [DURATION]. Here\'s what happened.',
    example: 'I posted a TikTok every day for 90 days. Here\'s what happened.',
    best_for_platforms: VIDEO_PLATFORMS,
    best_for_niches: [],
    attention_seconds: 3,
    description: 'Personal experiment frame. Show a transformation/result.',
  },
  {
    id: 'story-pov',
    name: 'POV',
    category: 'storytelling',
    pattern: 'POV: [SCENARIO]',
    example: 'POV: you\'re editing your first viral video and the music doesn\'t match.',
    best_for_platforms: SHORT_FORM,
    best_for_niches: [],
    attention_seconds: 2,
    description: 'Immersive 2nd-person framing. Works best with sound design.',
  },

  // ─── Pattern-interrupt ──────────────────────────────────────────────────
  {
    id: 'pattern-stop-scroll',
    name: 'Stop Scrolling',
    category: 'pattern-interrupt',
    pattern: 'Stop scrolling if you [SPECIFIC CONDITION].',
    example: 'Stop scrolling if you\'ve ever struggled to finish an edit.',
    best_for_platforms: SHORT_FORM,
    best_for_niches: [],
    attention_seconds: 1,
    description: 'Direct-address loop break. Specific condition = qualified viewer.',
  },
  {
    id: 'pattern-wait-watch',
    name: 'Wait For It',
    category: 'pattern-interrupt',
    pattern: 'Wait for it…',
    example: 'Wait for the transition at 0:08…',
    best_for_platforms: SHORT_FORM,
    best_for_niches: [],
    attention_seconds: 2,
    description: 'Promise of payoff. Make sure the payoff actually delivers.',
  },

  // ─── Authority ──────────────────────────────────────────────────────────
  {
    id: 'authority-credential',
    name: 'Credential Drop',
    category: 'authority',
    pattern: 'As a [ROLE/CREDENTIAL], here\'s what I\'d do if I were [STARTING OVER].',
    example: 'As a video editor with 10 years in, here\'s what I\'d do if I were starting today.',
    best_for_platforms: ['linkedin', 'youtube', 'twitter'],
    best_for_niches: ['business', 'career', 'creator'],
    attention_seconds: 3,
    description: 'Front-load credibility. Pair with a clean talking-head shot.',
  },

  // ─── Visual shock ───────────────────────────────────────────────────────
  {
    id: 'visual-before-after',
    name: 'Before / After',
    category: 'visual-shock',
    pattern: '[BEFORE state visible for 1s, then sharp cut to AFTER]',
    example: 'Raw footage → fully edited cut in one whip pan.',
    best_for_platforms: VIDEO_PLATFORMS,
    best_for_niches: ['creator', 'design', 'fitness', 'cooking'],
    attention_seconds: 1,
    description: 'Purely visual hook. No words. Let the transformation do the work.',
  },
  {
    id: 'visual-zoom-in',
    name: 'Zoom Punch',
    category: 'visual-shock',
    pattern: '[Snap-zoom into a single element on screen]',
    example: 'Snap-zoom on a stat or a face right at frame 1.',
    best_for_platforms: SHORT_FORM,
    best_for_niches: [],
    attention_seconds: 1,
    description: 'Mechanical attention grab. Combine with a single bold caption word.',
  },

  // ─── Numbered list ──────────────────────────────────────────────────────
  {
    id: 'list-top-n',
    name: 'Top N Countdown',
    category: 'numbered-list',
    pattern: 'Top [N] [THINGS] in [DOMAIN] — ranked.',
    example: 'Top 3 transitions every editor should master — ranked.',
    best_for_platforms: VIDEO_PLATFORMS,
    best_for_niches: [],
    attention_seconds: 3,
    description: 'Specific number ⇒ measurable promise. Countdown drives watch-through.',
  },
];

/** Filter the hook library by category / platform / niche. */
export function filterHooks(opts: {
  category?: HookCategory;
  platform?: StrategyPlatform;
  niche?: string;
} = {}): HookTemplate[] {
  return HOOK_LIBRARY.filter((h) => {
    if (opts.category && h.category !== opts.category) return false;
    if (opts.platform && !h.best_for_platforms.includes(opts.platform)) return false;
    if (
      opts.niche &&
      h.best_for_niches.length > 0 &&
      !h.best_for_niches.includes(opts.niche.toLowerCase())
    ) {
      return false;
    }
    return true;
  });
}

export function getHook(id: string): HookTemplate | undefined {
  return HOOK_LIBRARY.find((h) => h.id === id);
}

/** Deterministic pick used by the recommendation engine. */
export function pickHookForSlot(opts: {
  platform: StrategyPlatform;
  niche?: string;
  contentType: string;
  seed: number;
}): HookTemplate {
  const categoryByContent: Record<string, HookCategory> = {
    educational: 'value',
    entertaining: 'storytelling',
    trending: 'pattern-interrupt',
    series: 'curiosity',
    promotional: 'authority',
    community: 'storytelling',
  };
  const category = categoryByContent[opts.contentType] ?? 'value';
  const candidates = filterHooks({
    category,
    platform: opts.platform,
    niche: opts.niche,
  });
  const pool = candidates.length > 0 ? candidates : filterHooks({ platform: opts.platform });
  const fallback = pool.length > 0 ? pool : HOOK_LIBRARY;
  return fallback[opts.seed % fallback.length];
}
