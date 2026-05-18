import { randomUUID } from 'node:crypto';
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase/server';

export type PipelineEventStatus =
  | 'started'
  | 'progress'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'timeout';

export interface PipelineEvent {
  userId: string;
  requestId: string;
  area: 'cloud_import' | 'render' | 'oauth' | 'vault';
  provider?: string | null;
  operation: string;
  stage: string;
  status: PipelineEventStatus;
  httpStatus?: number | null;
  reason?: string | null;
  message?: string | null;
  fileSizeBytes?: number | null;
  contentType?: string | null;
  folder?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}

export function createPipelineRequestId(prefix = 'pipe'): string {
  return `${prefix}_${randomUUID()}`;
}

function safeText(value: string | null | undefined, max = 500): string | null {
  if (!value) return null;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/access_token["'=:\s]+[^"'\s,}]+/gi, 'access_token=[redacted]')
    .replace(/refresh_token["'=:\s]+[^"'\s,}]+/gi, 'refresh_token=[redacted]')
    .slice(0, max);
}

function safeMetadata(metadata: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (/url|email|name|path|r2_?key|file_?id|token|secret|authorization|cookie|code/i.test(key)) {
      continue;
    }
    if (typeof value === 'string') out[key] = safeText(value, 200);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) out[key] = value;
  }
  return out;
}

export async function recordPipelineEvent(event: PipelineEvent): Promise<void> {
  const userTail = event.userId.slice(-8);
  const row = {
    user_id: event.userId,
    request_id: event.requestId,
    area: event.area,
    provider: event.provider ?? null,
    operation: event.operation,
    stage: event.stage,
    status: event.status,
    http_status: event.httpStatus ?? null,
    reason: safeText(event.reason, 120),
    message: safeText(event.message, 500),
    file_size_bytes: event.fileSizeBytes ?? null,
    content_type: event.contentType ?? null,
    folder: event.folder ?? null,
    duration_ms: event.durationMs ?? null,
    metadata: safeMetadata(event.metadata),
  };

  const logLevel =
    event.status === 'failed' || event.status === 'timeout'
      ? 'error'
      : event.status === 'blocked'
        ? 'warn'
        : 'info';
  console[logLevel]('[a7:pipeline]', {
    ...row,
    user_id: undefined,
    user_tail: userTail,
  });

  if (!isSupabaseConfigured()) return;
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from('pipeline_events').insert(row);
    if (error && error.code !== '42P01') {
      console.warn('[a7:pipeline] event persistence failed', {
        request_id: event.requestId,
        stage: event.stage,
        status: event.status,
        error: error.message,
      });
    }
  } catch (error) {
    console.warn('[a7:pipeline] event persistence threw', {
      request_id: event.requestId,
      stage: event.stage,
      status: event.status,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}
