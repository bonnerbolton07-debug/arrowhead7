// =============================================================================
// Arrowhead 7 — Platform Formatting Rules
// =============================================================================
// Per-platform caption length limits, hashtag rules, and aspect-ratio hints.

export type DistributionPlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'twitter';

interface PlatformLimits {
  maxCaptionChars: number;
  maxHashtags: number;
  hashtagPrefix: '#';
  preferredAspectRatio: string;
}

export const PLATFORM_LIMITS: Record<DistributionPlatform, PlatformLimits> = {
  youtube: {
    maxCaptionChars: 5000,
    maxHashtags: 15,
    hashtagPrefix: '#',
    preferredAspectRatio: '16:9',
  },
  tiktok: {
    maxCaptionChars: 2200,
    maxHashtags: 30,
    hashtagPrefix: '#',
    preferredAspectRatio: '9:16',
  },
  instagram: {
    maxCaptionChars: 2200,
    maxHashtags: 30,
    hashtagPrefix: '#',
    preferredAspectRatio: '9:16',
  },
  twitter: {
    maxCaptionChars: 280,
    maxHashtags: 10,
    hashtagPrefix: '#',
    preferredAspectRatio: '16:9',
  },
};

function normalizeHashtag(tag: string): string {
  const stripped = tag.replace(/^#+/, '').replace(/\s+/g, '');
  return stripped ? `#${stripped}` : '';
}

export function formatCaption(
  platform: DistributionPlatform,
  caption: string,
  hashtags: string[] = []
): string {
  const limits = PLATFORM_LIMITS[platform];
  const cleanedTags = hashtags
    .map(normalizeHashtag)
    .filter(Boolean)
    .slice(0, limits.maxHashtags);

  const trailer = cleanedTags.length ? `\n\n${cleanedTags.join(' ')}` : '';
  const max = limits.maxCaptionChars;

  if (caption.length + trailer.length <= max) {
    return caption + trailer;
  }
  // Truncate the caption (not the hashtags) to fit.
  const room = Math.max(0, max - trailer.length - 1);
  return caption.slice(0, room).trimEnd() + (room > 0 ? '…' : '') + trailer;
}
