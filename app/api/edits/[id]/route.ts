// =============================================================================
// Arrowhead 7 — Delete Edit
// =============================================================================
// DELETE /api/edits/[id]
// Hard-deletes an edit row. Only the owning user may delete their own edits.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabaseClient();

    const { error, count } = await supabase
      .from('edits')
      .delete({ count: 'exact' })
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) throw error;

    if (!count || count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete edit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
