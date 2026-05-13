// =============================================================================
// Arrowhead 7 — Strategy Brain: Tier Gating
// =============================================================================
// Strategy Brain is Pro/Enterprise only. Starter (free / creator) users see a
// teaser with an upgrade CTA — they don't get personalized recommendations.

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isStrategyUnlocked } from '@/types/strategy';
import type { SubscriptionTier } from '@/types/channel';

export interface StrategyAccess {
  user_id: string;
  tier: SubscriptionTier;
  unlocked: boolean;
}

/**
 * Load the current user's tier. Returns null when Supabase isn't configured or
 * the user isn't signed in.
 */
export async function getUserTier(): Promise<StrategyAccess | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    const tier = (profile?.subscription_tier as SubscriptionTier) ?? 'free';
    return {
      user_id: user.id,
      tier,
      unlocked: isStrategyUnlocked(tier),
    };
  } catch {
    return null;
  }
}

export class StrategyAccessError extends Error {
  status: number;
  code: 'unauthorized' | 'locked';
  constructor(code: 'unauthorized' | 'locked', message: string) {
    super(message);
    this.code = code;
    this.status = code === 'unauthorized' ? 401 : 402;
  }
}

/**
 * For route handlers — throws when the user is locked out so the handler can
 * convert it to a 401/402 in one line.
 */
export async function requireStrategyAccess(): Promise<StrategyAccess> {
  const access = await getUserTier();
  if (!access) {
    throw new StrategyAccessError('unauthorized', 'Unauthorized');
  }
  if (!access.unlocked) {
    throw new StrategyAccessError(
      'locked',
      'Strategy Brain is a Pro feature.'
    );
  }
  return access;
}
