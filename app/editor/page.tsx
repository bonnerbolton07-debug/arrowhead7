'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Logo, LogoIcon } from '@/components/ui/Logo';
import { getClient } from '@/lib/supabase/client';
import type { StyleDNA } from '@/types/edit';
import {
  EditorStrategyBanner,
  useStrategyBrief,
} from '@/components/strategy/EditorStrategyBanner';
import { PostRenderPlan } from '@/components/strategy/PostRenderPlan';
import type { StrategyPlatform } from '@/types/strategy';
import {
  CloudImportPanel,
  type ImportedSource,
} from '@/components/editor/CloudImportPanel';
import {
  uploadToR2,
  maybeCompressImage,
  type UploadProgress,
  type UploadResumeState,
  type UploadKind,
} from '@/lib/upload/client';
import { VaultPicker } from '@/components/vault/VaultPicker';
import { VaultIcon } from '@/components/ui/icons';
import type { VaultFile } from '@/lib/vault';
import type { SubscriptionTier } from '@/types';
import { canUseResolution, normalizeTier } from '@/lib/stripe/gating';

type Step = 'reference' | 'footage' | 'style' | 'configure' | 'render';

const STEPS: { id: Step; label: string }[] = [
  { id: 'reference', label: 'Reference' },
  { id: 'footage', label: 'Footage' },
  { id: 'style', label: 'Style DNA' },
  { id: 'configure', label: 'Configure' },
  { id: 'render', label: 'Render' },
];

type UploadState = 'idle' | 'uploading' | 'done' | 'error';
type AnalyzeState = 'idle' | 'analyzing' | 'done' | 'error';
type RenderState = 'idle' | 'submitting' | 'processing' | 'completed' | 'failed';

type Resolution = 'sd' | 'hd' | '1080' | '4k';
type Format = 'mp4' | 'webm';
type Platform = 'tiktok' | 'reels' | 'shorts' | 'youtube' | 'square';

type AnalyzedStyleDNA = Omit<StyleDNA, 'id' | 'created_at' | 'updated_at'>;

type CaptionStyle = 'tiktok-bold' | 'youtube-bar' | 'karaoke';
type CaptionState = 'idle' | 'transcribing' | 'done' | 'error' | 'unavailable';

type RefSource = 'upload' | 'url';
type RefKind = 'video' | 'image' | 'audio';
type RefStatus = 'uploading' | 'ready' | 'error';

interface ReferenceItem {
  id: string;
  kind: RefKind;
  source: RefSource;
  /** R2 key for uploads, external URL for url-sourced references */
  url: string;
  /** Local preview URL for thumbnails (object URL for uploads) */
  previewUrl?: string;
  label: string;
  status: RefStatus;
  progress?: number;
  /** File size in bytes. Set when an upload is in flight so the UI can show
   *  "12 MB / 50 MB" alongside the percentage. */
  totalBytes?: number;
  loadedBytes?: number;
  /** Multipart-aware status: when the upload is split into parts, surface the
   *  current part / total parts so the user can see "Part 2 / 6" instead of a
   *  bar that appears to be stalling. */
  partsCompleted?: number;
  totalParts?: number;
  uploadMode?: 'single' | 'multipart';
  /** Set when a part is currently retrying (attempt 2, 3…). */
  retryingAttempt?: number;
  /** Surfaced from the upload client when concurrency has been throttled. */
  currentConcurrency?: number;
  /** Persisted after every successful part so the "Resume upload" button
   *  can pick up where the network died. */
  resumeState?: UploadResumeState;
  /** Original File handle held in memory so resume doesn't require the user
   *  to re-pick the file. Not stored across navigations — refresh = reset. */
  file?: File;
  error?: string;
}

const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']);
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
]);
const ALLOWED_AUDIO_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
]);
const ALLOWED_MIME = new Set<string>([
  ...Array.from(ALLOWED_VIDEO_MIME),
  ...Array.from(ALLOWED_IMAGE_MIME),
  ...Array.from(ALLOWED_AUDIO_MIME),
]);

function makeId() {
  return `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferKindFromMime(mime: string): RefKind {
  if (ALLOWED_IMAGE_MIME.has(mime)) return 'image';
  if (ALLOWED_AUDIO_MIME.has(mime)) return 'audio';
  return 'video';
}

function inferKindFromUrl(url: string): RefKind {
  const path = url.toLowerCase().split('?')[0];
  if (/\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/.test(path)) return 'image';
  if (/\.(mp3|wav|m4a|aac|ogg|oga|flac|aiff?)$/.test(path)) return 'audio';
  return 'video';
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // matches server-side cap
const MAX_AUDIO_UPLOAD_BYTES = 100 * 1024 * 1024;
const STYLE_DNA_CLIENT_FALLBACK_MS = 20_000;
const MAX_PROJECT_REFERENCES = 100;
const MAX_PROJECT_SOURCE_ASSETS = 100;
const MAX_DEEP_STYLE_REFERENCES = 12;
const RENDER_PRIMARY_VIDEO_LIMIT = 1;
const RENDER_SUPPORTING_VISUAL_LIMIT = 4;
const RENDER_AUDIO_LAYER_LIMIT = 1;
const RENDER_STATUS_TIMEOUT_MS = 15_000;
const RENDER_MATCH_TIMEOUT_MS = 60_000;
const RENDER_SUBMIT_TIMEOUT_MS = 45_000;
const CAPTION_TRANSCRIBE_TIMEOUT_MS = 60_000;

function uploadKindFor(scope: 'reference' | 'source', kind: RefKind): UploadKind['kind'] {
  return `${scope}-${kind}` as UploadKind['kind'];
}

function countByKind(items: ReferenceItem[]) {
  return items.reduce(
    (counts, item) => {
      counts[item.kind] += 1;
      return counts;
    },
    { video: 0, image: 0, audio: 0 } as Record<RefKind, number>
  );
}

async function fetchJsonWithTimeout<T>(
  input: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  label: string
): Promise<{ res: Response; data: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    const data = await res.json().catch(() => ({})) as T;
    return { res, data };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`${label} timed out. Your edit is saved; refresh or try again from this screen.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function makeUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function validateMediaFile(file: File, context: 'reference' | 'source'): string | null {
  if (!ALLOWED_MIME.has(file.type)) {
    return context === 'reference'
      ? 'Format not supported — use video, image, music, or SFX files.'
      : 'Format not supported — use video, image, music, or SFX files.';
  }
  const kind = inferKindFromMime(file.type);
  const maxBytes = kind === 'audio' ? MAX_AUDIO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > maxBytes) {
    return kind === 'audio' ? 'Audio must be 100MB or smaller.' : 'File too large (max 500MB)';
  }
  return null;
}

function extractEditDirection(renderConfig: unknown): string {
  if (!renderConfig || typeof renderConfig !== 'object') return '';
  const merge = (renderConfig as { merge?: unknown }).merge;
  if (!Array.isArray(merge)) return '';
  const field = merge.find((item) => {
    if (!item || typeof item !== 'object') return false;
    return (item as { find?: unknown }).find === 'A7_EDIT_DIRECTION';
  }) as { replace?: unknown } | undefined;
  return typeof field?.replace === 'string' ? field.replace : '';
}

function friendlyUploadError(err: unknown, status?: number): string {
  if (status === 413) return 'File too large (max 500MB)';
  if (status === 401) return 'Session expired — please refresh the page';
  if (status === 415) return 'Format not supported — use MP4, MOV, or WebM';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/network/i.test(msg) || /failed to fetch/i.test(msg)) {
    return 'Upload failed — check your connection and try again';
  }
  if (/too large|exceeds/i.test(msg)) return 'File too large (max 500MB)';
  if (/unsupported|format/i.test(msg)) {
    return 'Format not supported — use MP4, MOV, or WebM';
  }
  if (/unauthorized/i.test(msg)) return 'Session expired — please refresh the page';
  return msg || 'Upload failed — check your connection and try again';
}

function buildClientFallbackStyleDNA(refs: ReferenceItem[]): AnalyzedStyleDNA {
  const hasImage = refs.some((r) => r.kind === 'image');
  const references = refs.map((r) => ({
    source_type: r.source,
    type: r.kind,
    url: r.url,
    platform: r.source === 'url' ? 'other' as const : undefined,
    weight: refs.length > 0 ? 1 / refs.length : 1,
  }));

  return {
    user_id: 'client-fallback',
    name: 'Quick Style DNA',
    references,
    color_profile: {
      temperature: hasImage ? 6 : 0,
      saturation: hasImage ? 112 : 105,
      contrast: 112,
      brightness: 100,
    },
    framing_profile: {
      dominant_shot_types: [
        { type: 'medium', weight: 0.45 },
        { type: 'closeup', weight: 0.35 },
        { type: 'wide', weight: 0.2 },
      ],
      uses_reframing: true,
      aspect_ratio_preference: '9:16',
      uses_split_screen: false,
      uses_picture_in_picture: false,
    },
    cut_pattern: {
      avg_cut_duration_ms: 1400,
      min_cut_duration_ms: 600,
      max_cut_duration_ms: 3000,
      median_cut_duration_ms: 1300,
      total_cuts: 18,
      cuts_per_minute: 40,
      cut_rhythm: 'variable',
      rhythm_consistency: 0.6,
      beat_sync: false,
      cut_types: [
        { type: 'hard-cut', weight: 0.7 },
        { type: 'j-cut', weight: 0.15 },
        { type: 'l-cut', weight: 0.1 },
        { type: 'match-cut', weight: 0.05 },
      ],
      duration_histogram: [0.1, 0.3, 0.35, 0.15, 0.07, 0.02, 0.01],
      has_breathing_moments: false,
    },
    pacing: {
      overall_energy: 'high',
      bpm_target: 120,
      builds_tension: true,
      has_drops: true,
      sections: [
        { start_pct: 0, end_pct: 0.2, energy: 'high', cuts_per_minute: 48, description: 'hook' },
        { start_pct: 0.2, end_pct: 0.75, energy: 'medium', cuts_per_minute: 36, description: 'body' },
        { start_pct: 0.75, end_pct: 1, energy: 'high', cuts_per_minute: 44, description: 'finish' },
      ],
    },
    energy_arc: {
      shape: 'build',
      curve: [0.45, 0.5, 0.55, 0.62, 0.68, 0.74, 0.8, 0.86, 0.9, 0.94],
      has_cold_open: true,
      climax_position: 0.85,
    },
    transition_preferences: [
      { type: 'cut', weight: 0.72 },
      { type: 'dissolve', weight: 0.12, duration_ms: 240 },
      { type: 'whip', weight: 0.1, duration_ms: 160 },
      { type: 'zoom', weight: 0.06, duration_ms: 180 },
    ],
    audio_sync_strategy: 'energy-match',
    audio_edit_relationship: {
      cuts_on_beats: false,
      cuts_on_vocals: false,
      j_cut_frequency: 0.12,
      l_cut_frequency: 0.1,
      silence_as_punctuation: false,
      sound_effects_on_transitions: false,
      music_ducks_under_speech: false,
      bass_drop_sync: true,
    },
    motion_profile: {
      uses_speed_ramps: true,
      speed_ramp_style: 'smooth',
      uses_zoom_punches: true,
      zoom_punch_frequency: 3,
      uses_shake: false,
      uses_parallax: hasImage,
      dominant_movement: 'mixed',
    },
    narrative_structure: {
      has_hook: true,
      hook_duration_ms: 2500,
      has_intro_sequence: false,
      has_outro_cta: true,
      segment_count: 3,
      uses_callbacks: false,
      storytelling_style: 'montage',
    },
    raw_analysis: {
      fallback: 'client-watchdog',
      reason: 'analysis-timeout-or-network-failure',
      reference_count: refs.length,
      image_count: refs.filter((r) => r.kind === 'image').length,
      video_count: refs.filter((r) => r.kind === 'video').length,
    },
    confidence_score: 0.22,
  };
}

export default function EditorPage() {
  return (
    <Suspense fallback={<EditorLoadingShell />}>
      <EditorPageInner />
    </Suspense>
  );
}

function EditorLoadingShell() {
  return (
    <div className="min-h-screen bg-a7-base flex items-center justify-center text-a7-text">
      <div className="text-center">
        <Logo variant="teal" size="md" animate />
        <p className="mt-4 text-sm text-a7-text/50">Loading editor...</p>
      </div>
    </div>
  );
}

function EditorPageInner() {
  const strategyBrief = useStrategyBrief();
  const searchParams = useSearchParams();
  const resumeId = searchParams?.get('id') ?? null;
  const isVariantRequest = searchParams?.get('variant') === '1';
  const [step, setStep] = useState<Step>('reference');
  const [resumeState, setResumeState] = useState<'idle' | 'loading' | 'done' | 'error'>(
    resumeId ? 'loading' : 'idle'
  );
  const [resumeError, setResumeError] = useState<string | null>(null);

  // Step 1 — References (multiple videos, images, audio, and URLs)
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [pendingUrl, setPendingUrl] = useState('');
  const [referenceError, setReferenceError] = useState<string | null>(null);

  // Derived: do we have at least one ready reference?
  const readyRefs = useMemo(
    () => references.filter((r) => r.status === 'ready'),
    [references]
  );
  const readyRefsKey = useMemo(
    () => readyRefs.map((r) => `${r.kind}:${r.source}:${r.url}`).join('|'),
    [readyRefs]
  );
  const referenceCounts = useMemo(() => countByKind(references), [references]);
  const hasReadyRef = readyRefs.length > 0;
  // First soundtrack candidate: uploaded music/SFX wins, with video as fallback.
  const soundtrackR2Key =
    readyRefs.find((r) => r.kind === 'audio' && r.source === 'upload')?.url
    ?? readyRefs.find((r) => r.kind === 'video' && r.source === 'upload')?.url
    ?? null;

  // Step 2 — Footage
  const [footageFile, setFootageFile] = useState<File | null>(null);
  const [footageUploadState, setFootageUploadState] = useState<UploadState>('idle');
  const [footageProgress, setFootageProgress] = useState<UploadProgress | null>(null);
  const [footageR2Key, setFootageR2Key] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [footageError, setFootageError] = useState<string | null>(null);
  const [footageResumeState, setFootageResumeState] = useState<UploadResumeState | null>(null);
  const [sourceAssets, setSourceAssets] = useState<ReferenceItem[]>([]);

  const readySourceAssets = useMemo(
    () => sourceAssets.filter((r) => r.status === 'ready'),
    [sourceAssets]
  );
  const sourceCounts = useMemo(() => countByKind(sourceAssets), [sourceAssets]);
  const primarySourceAsset = readySourceAssets.find((r) => r.kind === 'video') ?? null;
  const primarySourceKey = footageR2Key ?? primarySourceAsset?.url ?? null;
  const hasReadySourceVideo = Boolean(primarySourceKey);

  // Step 3 — Style DNA analysis
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>('idle');
  const [styleDNA, setStyleDNA] = useState<AnalyzedStyleDNA | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeStage, setAnalyzeStage] = useState<string>('');
  const [analyzeElapsed, setAnalyzeElapsed] = useState<number>(0);
  const [analyzeRunNonce, setAnalyzeRunNonce] = useState(0);

  // Step 4 — Configure
  const [resolution, setResolution] = useState<Resolution>('1080');
  const [format, setFormat] = useState<Format>('mp4');
  const [platform, setPlatform] = useState<Platform>('reels');
  const [targetDuration, setTargetDuration] = useState<number>(30);
  const [generateSoundtrack, setGenerateSoundtrack] = useState<boolean>(false);
  const [hookText, setHookText] = useState<string>('');
  const [ctaText, setCtaText] = useState<string>('');
  const [editPrompt, setEditPrompt] = useState<string>('');
  const [variantSourceId, setVariantSourceId] = useState<string | null>(null);
  const [variantNotice, setVariantNotice] = useState<string | null>(null);
  const [matchState, setMatchState] = useState<'idle' | 'matching' | 'ready' | 'error'>('idle');
  const [matchError, setMatchError] = useState<string | null>(null);
  const [autoCaptions, setAutoCaptions] = useState(false);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('tiktok-bold');
  const [captionState, setCaptionState] = useState<CaptionState>('idle');
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [captionTranscription, setCaptionTranscription] = useState<unknown>(null);

  // Step 5 — Render
  const [renderState, setRenderState] = useState<RenderState>('idle');
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderNotice, setRenderNotice] = useState<string | null>(null);
  const [renderStartedAtMs, setRenderStartedAtMs] = useState<number | null>(null);
  const [renderElapsedSec, setRenderElapsedSec] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [exportVaultFileId, setExportVaultFileId] = useState<string | null>(null);
  const renderPollFailures = useRef(0);
  const activePollJobRef = useRef<string | null>(null);

  // Vault pickers
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [footagePickerOpen, setFootagePickerOpen] = useState(false);

  // Subscription tier — drives feature gates like the 4K resolution option.
  // Default to 'free' until we know better; the option is locked client-side
  // for UX, but the render route is the source of truth on tier limits.
  const [tier, setTier] = useState<SubscriptionTier>('free');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('profiles')
          .select('subscription_tier')
          .eq('id', user.id)
          .single();
        if (cancelled) return;
        setTier(normalizeTier(data?.subscription_tier as string | null | undefined));
      } catch {
        // Silently fall back to 'free' — gating is enforced server-side.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canUse4K = canUseResolution(tier, '4k');

  // If the user previously selected 4K and downgrades (or we re-detect a
  // lower tier), drop them back to 1080 so the locked option doesn't stay
  // chosen.
  useEffect(() => {
    if (resolution === '4k' && !canUse4K) setResolution('1080');
  }, [resolution, canUse4K]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  // ─── Step 1: Reference uploads / URL adds (multi-reference) ─────────────
  const updateReference = useCallback((id: string, patch: Partial<ReferenceItem>) => {
    setReferences((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const removeReference = useCallback((id: string) => {
    setReferences((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target?.previewUrl && target.source === 'upload') {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {
          // ignore
        }
      }
      return prev.filter((r) => r.id !== id);
    });
  }, []);

  const moveReference = useCallback((id: string, delta: number) => {
    setReferences((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx < 0) return prev;
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  /** Run the actual uploadToR2 call. Factored so retry-from-resume can call
   *  it with the same File and a `resumeFrom` state. */
  const runReferenceUpload = useCallback(async (
    id: string,
    file: File,
    kind: RefKind,
    resumeFrom?: UploadResumeState,
  ) => {
    updateReference(id, {
      status: 'uploading',
      error: undefined,
      progress: resumeFrom
        ? Math.round((resumeFrom.completedParts.length / resumeFrom.totalParts) * 100)
        : 0,
    });
    try {
      const { key } = await uploadToR2(file, {
        kind: uploadKindFor('reference', kind),
        resumeFrom,
        onProgress: (p: UploadProgress) =>
          updateReference(id, {
            progress: p.pct,
            loadedBytes: p.loadedBytes,
            totalBytes: p.totalBytes,
            partsCompleted: p.partsCompleted,
            totalParts: p.totalParts,
            uploadMode: p.mode,
            retryingAttempt: p.retryingAttempt,
            currentConcurrency: p.currentConcurrency,
          }),
        onResumeStateChange: (state) => updateReference(id, { resumeState: state }),
      });
      updateReference(id, {
        status: 'ready',
        url: key,
        progress: 100,
        loadedBytes: file.size,
        totalBytes: file.size,
        retryingAttempt: undefined,
      });
    } catch (err) {
      updateReference(id, {
        status: 'error',
        error: friendlyUploadError(err),
        retryingAttempt: undefined,
      });
    }
  }, [updateReference]);

  const uploadReferenceFile = useCallback(async (rawFile: File) => {
    if (references.length >= MAX_PROJECT_REFERENCES) {
      setReferenceError(`This edit can hold ${MAX_PROJECT_REFERENCES} references. Remove one to add another.`);
      return;
    }
    const validationError = validateMediaFile(rawFile, 'reference');
    if (validationError) {
      setReferenceError(validationError);
      return;
    }
    setReferenceError(null);

    const kind = inferKindFromMime(rawFile.type);
    // For mood-board images we compress client-side before upload — the
    // original is often a multi-MB HEIC/PNG that Style DNA never needs at
    // full resolution. Videos pass through; multipart handles the size.
    const file = kind === 'image' ? await maybeCompressImage(rawFile) : rawFile;

    const id = makeId();
    const previewUrl = URL.createObjectURL(file);
    setReferences((prev) => [
      ...prev,
      {
        id,
        kind,
        source: 'upload',
        url: '',
        previewUrl,
        label: file.name,
        status: 'uploading',
        progress: 0,
        file,
        totalBytes: file.size,
        loadedBytes: 0,
      },
    ]);

    await runReferenceUpload(id, file, kind);
  }, [references.length, runReferenceUpload]);

  const uploadReferenceFiles = useCallback((files: File[]) => {
    const remaining = MAX_PROJECT_REFERENCES - references.length;
    if (remaining <= 0) {
      setReferenceError(`This edit can hold ${MAX_PROJECT_REFERENCES} references. Remove one to add another.`);
      return;
    }
    const selected = files.slice(0, remaining);
    if (selected.length < files.length) {
      setReferenceError(`Added ${selected.length}; this edit can hold ${MAX_PROJECT_REFERENCES} references total.`);
    } else {
      setReferenceError(null);
    }
    selected.forEach((file) => void uploadReferenceFile(file));
  }, [references.length, uploadReferenceFile]);

  /** Resume a multipart upload that hard-failed. Called from the "Tap to
   *  retry" button on the upload row. Reuses the same R2 multipart UploadId
   *  so the parts that already succeeded don't get re-uploaded. */
  const retryReferenceUpload = useCallback((id: string) => {
    setReferences((prev) => {
      const target = prev.find((r) => r.id === id);
      if (!target || !target.file) return prev;
      // Fire-and-forget — the upload writes its progress into state via callbacks.
      void runReferenceUpload(id, target.file, target.kind, target.resumeState);
      return prev;
    });
  }, [runReferenceUpload]);

  const addReferenceUrl = useCallback(() => {
    const trimmed = pendingUrl.trim();
    if (!trimmed) return;
    if (references.length >= MAX_PROJECT_REFERENCES) {
      setReferenceError(`This edit can hold ${MAX_PROJECT_REFERENCES} references. Remove one to add another.`);
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setReferenceError('Enter a valid URL (https://...)');
      return;
    }
    setReferenceError(null);
    setReferences((prev) => [
      ...prev,
      {
        id: makeId(),
        kind: inferKindFromUrl(trimmed),
        source: 'url',
        url: trimmed,
        label: trimmed,
        status: 'ready',
      },
    ]);
    setPendingUrl('');
  }, [pendingUrl, references.length]);

  const addReferencesFromVault = useCallback((picked: VaultFile[]) => {
    const remaining = MAX_PROJECT_REFERENCES - references.length;
    if (remaining <= 0) {
      setReferenceError(`This edit can hold ${MAX_PROJECT_REFERENCES} references. Remove one to add another.`);
      return;
    }
    const usable = picked
      .filter((f) => f.kind === 'video' || f.kind === 'image' || f.kind === 'audio')
      .slice(0, remaining);
    if (usable.length < picked.length) {
      setReferenceError(`Added ${usable.length}; this edit can hold ${MAX_PROJECT_REFERENCES} references total.`);
    } else {
      setReferenceError(null);
    }
    setReferences((prev) => [
      ...prev,
      ...usable.map<ReferenceItem>((f) => ({
        id: makeId(),
        kind: f.kind === 'audio' ? 'audio' : f.kind === 'image' ? 'image' : 'video',
        source: 'upload',
        url: f.r2_key,
        label: f.filename,
        status: 'ready',
      })),
    ]);
  }, [references.length]);

  // ─── Step 2: Source media uploads ───────────────────────────────────────
  const updateSourceAsset = useCallback((id: string, patch: Partial<ReferenceItem>) => {
    setSourceAssets((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const removeSourceAsset = useCallback((id: string) => {
    setSourceAssets((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target?.previewUrl && target.source === 'upload') {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {
          // ignore
        }
      }
      const next = prev.filter((r) => r.id !== id);
      const nextPrimary = next.find((r) => r.status === 'ready' && r.kind === 'video') ?? null;
      setFootageR2Key(nextPrimary?.url ?? null);
      if (!nextPrimary) {
        setFootageFile(null);
        setFootageUploadState('idle');
        setFootageProgress(null);
      }
      return next;
    });
  }, []);

  const moveSourceAsset = useCallback((id: string, delta: number) => {
    setSourceAssets((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx < 0) return prev;
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  const persistDraftEdit = useCallback(async (
    draftEditId: string,
    primaryKey: string,
    title: string,
  ) => {
    try {
      const supabase = getClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('edits').upsert({
          id: draftEditId,
          user_id: user.id,
          title: title.replace(/\.[^.]+$/, ''),
          status: 'draft',
          source_video_url: primaryKey,
          reference_urls: readyRefs.map((r) => r.url),
        });
      }
    } catch {
      // Non-fatal — render route will still create what it needs.
    }
  }, [readyRefs]);

  const runSourceAssetUpload = useCallback(async (
    id: string,
    file: File,
    kind: RefKind,
    targetEditId: string,
    resumeFrom?: UploadResumeState,
  ) => {
    updateSourceAsset(id, {
      status: 'uploading',
      error: undefined,
      progress: resumeFrom
        ? Math.round((resumeFrom.completedParts.length / resumeFrom.totalParts) * 100)
        : 0,
    });
    try {
      const { key } = await uploadToR2(file, {
        kind: uploadKindFor('source', kind),
        editId: targetEditId,
        resumeFrom,
        onProgress: (p: UploadProgress) => {
          updateSourceAsset(id, {
            progress: p.pct,
            loadedBytes: p.loadedBytes,
            totalBytes: p.totalBytes,
            partsCompleted: p.partsCompleted,
            totalParts: p.totalParts,
            uploadMode: p.mode,
            retryingAttempt: p.retryingAttempt,
            currentConcurrency: p.currentConcurrency,
          });
          if (kind === 'video') setFootageProgress(p);
        },
        onResumeStateChange: (state) => updateSourceAsset(id, { resumeState: state }),
      });

      updateSourceAsset(id, {
        status: 'ready',
        url: key,
        progress: 100,
        loadedBytes: file.size,
        totalBytes: file.size,
        retryingAttempt: undefined,
      });

      if (kind === 'video') {
        setFootageR2Key((current) => current ?? key);
        setFootageFile((current) => current ?? file);
        setFootageResumeState(null);
        setFootageUploadState('done');
        setFootageProgress({
          pct: 100,
          loadedBytes: file.size,
          totalBytes: file.size,
          mode: 'single',
        });
        await persistDraftEdit(targetEditId, key, file.name);
      }
    } catch (err) {
      updateSourceAsset(id, {
        status: 'error',
        error: friendlyUploadError(err),
        retryingAttempt: undefined,
      });
      if (kind === 'video') {
        setFootageError(friendlyUploadError(err));
        setFootageUploadState('error');
      }
    }
  }, [persistDraftEdit, updateSourceAsset]);

  const uploadSourceFiles = useCallback(async (rawFiles: File[]) => {
    const remaining = MAX_PROJECT_SOURCE_ASSETS - sourceAssets.length;
    if (remaining <= 0) {
      setFootageError(`This edit can hold ${MAX_PROJECT_SOURCE_ASSETS} source media items. Remove one to add another.`);
      return;
    }
    const filesToProcess = rawFiles.slice(0, remaining);
    if (filesToProcess.length < rawFiles.length) {
      setFootageError(`Added ${filesToProcess.length}; this edit can hold ${MAX_PROJECT_SOURCE_ASSETS} source media items total.`);
    }
    const targetEditId = editId ?? makeUuid();
    setEditId(targetEditId);

    for (const rawFile of filesToProcess) {
      const validationError = validateMediaFile(rawFile, 'source');
      if (validationError) {
        setFootageError(validationError);
        continue;
      }
      setFootageError(null);
      const kind = inferKindFromMime(rawFile.type);
      const file = kind === 'image' ? await maybeCompressImage(rawFile) : rawFile;
      const id = makeId();
      const previewUrl = kind === 'audio' ? undefined : URL.createObjectURL(file);
      setSourceAssets((prev) => [
        ...prev,
        {
          id,
          kind,
          source: 'upload',
          url: '',
          previewUrl,
          label: file.name,
          status: 'uploading',
          progress: 0,
          file,
          totalBytes: file.size,
          loadedBytes: 0,
        },
      ]);
      if (kind === 'video') {
        setFootageFile(file);
        setFootageUploadState('uploading');
      }
      await runSourceAssetUpload(id, file, kind, targetEditId);
    }
  }, [editId, runSourceAssetUpload, sourceAssets.length]);

  const retrySourceAssetUpload = useCallback((id: string) => {
    setSourceAssets((prev) => {
      const target = prev.find((r) => r.id === id);
      if (!target || !target.file) return prev;
      const targetEditId = editId ?? makeUuid();
      setEditId(targetEditId);
      void runSourceAssetUpload(id, target.file, target.kind, targetEditId, target.resumeState);
      return prev;
    });
  }, [editId, runSourceAssetUpload]);

  // ─── Legacy single-footage upload path ──────────────────────────────────
  const runFootageUpload = useCallback(async (file: File, resumeFrom?: UploadResumeState) => {
    setFootageError(null);
    setFootageUploadState('uploading');
    setFootageProgress({
      pct: resumeFrom
        ? Math.round((resumeFrom.completedParts.length / resumeFrom.totalParts) * 100)
        : 0,
      loadedBytes: 0,
      totalBytes: file.size,
      mode: resumeFrom ? 'multipart' : 'single',
    });
    try {
      const { key, editId: newEditId } = await uploadToR2(file, {
        kind: 'source-video',
        resumeFrom,
        onProgress: (p) => setFootageProgress(p),
        onResumeStateChange: (state) => setFootageResumeState(state),
      });

      setFootageR2Key(key);
      setEditId(newEditId);
      setSourceAssets((prev) => [
        ...prev,
        {
          id: makeId(),
          kind: 'video',
          source: 'upload',
          url: key,
          previewUrl: URL.createObjectURL(file),
          label: file.name,
          status: 'ready',
          progress: 100,
          file,
          totalBytes: file.size,
          loadedBytes: file.size,
        },
      ]);
      setFootageResumeState(null);
      setFootageUploadState('done');
      setFootageProgress({
        pct: 100,
        loadedBytes: file.size,
        totalBytes: file.size,
        mode: 'single',
      });

      // Persist a draft edit row so render has something to attach to.
      try {
        const supabase = getClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('edits').upsert({
            id: newEditId,
            user_id: user.id,
            title: file.name.replace(/\.[^.]+$/, ''),
            status: 'draft',
            source_video_url: key,
            reference_urls: readyRefs.map((r) => r.url),
          });
        }
      } catch {
        // Non-fatal — render route will still create what it needs.
      }
    } catch (err) {
      setFootageError(friendlyUploadError(err));
      setFootageUploadState('error');
    }
  }, [readyRefs]);

  const uploadFootage = useCallback(async (file: File) => {
    if (sourceAssets.length >= MAX_PROJECT_SOURCE_ASSETS) {
      setFootageError(`This edit can hold ${MAX_PROJECT_SOURCE_ASSETS} source media items. Remove one to add another.`);
      return;
    }
    const validationError = validateMediaFile(file, 'source');
    if (validationError || inferKindFromMime(file.type) !== 'video') {
      setFootageError(validationError || 'At least one video clip is required as the primary edit source.');
      return;
    }
    setFootageFile(file);
    setFootageResumeState(null);
    await runFootageUpload(file);
  }, [runFootageUpload, sourceAssets.length]);

  /** Resume a multipart footage upload that hard-failed. */
  const retryFootageUpload = useCallback(() => {
    if (!footageFile) return;
    void runFootageUpload(footageFile, footageResumeState ?? undefined);
  }, [footageFile, footageResumeState, runFootageUpload]);

  /**
   * Cloud import handler — accepts a source that the vault-pull pipeline
   * already streamed into R2 and slots it into the same state the local
   * upload path uses. The user's phone never touches the bytes.
   */
  const acceptCloudImport = useCallback(
    async (src: ImportedSource) => {
      if (sourceAssets.length >= MAX_PROJECT_SOURCE_ASSETS) {
        setFootageError(`This edit can hold ${MAX_PROJECT_SOURCE_ASSETS} source media items. Remove one to add another.`);
        return;
      }
      const importedKind = inferKindFromMime(src.mimeType);
      const targetEditId = editId ?? src.editId;
      setFootageError(null);
      if (importedKind === 'video') setFootageR2Key(src.key);
      setEditId(targetEditId);
      setSourceAssets((prev) => [
        ...prev,
        {
          id: makeId(),
          kind: importedKind,
          source: 'upload',
          url: src.key,
          label: src.name,
          status: 'ready',
          progress: 100,
          totalBytes: src.size,
          loadedBytes: src.size,
        },
      ]);
      setFootageProgress({
        pct: 100,
        loadedBytes: src.size,
        totalBytes: src.size,
        mode: 'single',
      });
      if (importedKind === 'video') setFootageUploadState('done');
      try {
        const synthetic = new File([new Uint8Array(0)], src.name, {
          type: src.mimeType,
        });
        if (importedKind === 'video') setFootageFile(synthetic);
      } catch {
        if (importedKind === 'video') setFootageFile(null);
      }
      try {
        const supabase = getClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && importedKind === 'video') {
          await supabase.from('edits').upsert({
            id: targetEditId,
            user_id: user.id,
            title: src.name.replace(/\.[^.]+$/, ''),
            status: 'draft',
            source_video_url: src.key,
            reference_urls: readyRefs.map((r) => r.url),
          });
        }
      } catch {
        // Non-fatal — render route falls back to its own row creation.
      }
    },
    [editId, readyRefs, sourceAssets.length]
  );

  /**
   * Vault picker handler — same idea as `acceptCloudImport`, but the source
   * is already a registered `vault_files` row so we have its R2 key and
   * metadata in hand without a fresh round-trip.
   */
  const pickVaultFootage = useCallback(
    async (picked: VaultFile[]) => {
      const remaining = MAX_PROJECT_SOURCE_ASSETS - sourceAssets.length;
      if (remaining <= 0) {
        setFootageError(`This edit can hold ${MAX_PROJECT_SOURCE_ASSETS} source media items. Remove one to add another.`);
        return;
      }
      const usable = picked
        .filter((f) => f.kind === 'video' || f.kind === 'image' || f.kind === 'audio')
        .slice(0, remaining);
      const selectedVideo = usable.find((f) => f.kind === 'video');
      const currentPrimaryKey = primarySourceKey;
      const primaryFile = selectedVideo ?? (currentPrimaryKey
        ? usable.find((f) => f.r2_key === currentPrimaryKey)
        : undefined);
      if (usable.length === 0 || (!selectedVideo && !currentPrimaryKey)) {
        setFootageError('Pick at least one video clip. Images, music, and SFX can be added with it.');
        return;
      }
      if (usable.length < picked.length) {
        setFootageError(`Added ${usable.length}; this edit can hold ${MAX_PROJECT_SOURCE_ASSETS} source media items total.`);
      } else {
        setFootageError(null);
      }
      const newEditId = editId ?? (
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)
      );
      try {
        if (selectedVideo) {
          const synthetic = new File([new Uint8Array(0)], selectedVideo.filename, {
            type: selectedVideo.content_type,
          });
          setFootageFile(synthetic);
        }
      } catch {
        if (selectedVideo) setFootageFile(null);
      }
      if (selectedVideo) setFootageR2Key(selectedVideo.r2_key);
      setEditId(newEditId);
      setSourceAssets((prev) => [
        ...prev,
        ...usable.map<ReferenceItem>((f) => ({
          id: makeId(),
          kind: f.kind === 'audio' ? 'audio' : f.kind === 'image' ? 'image' : 'video',
          source: 'upload',
          url: f.r2_key,
          label: f.filename,
          status: 'ready',
          progress: 100,
          totalBytes: f.size_bytes,
          loadedBytes: f.size_bytes,
        })),
      ]);
      setFootageUploadState('done');
      setFootageProgress({
        pct: 100,
        loadedBytes: (selectedVideo ?? primaryFile)?.size_bytes ?? 0,
        totalBytes: (selectedVideo ?? primaryFile)?.size_bytes ?? 0,
        mode: 'single',
      });

      try {
        const supabase = getClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && selectedVideo) {
          await supabase.from('edits').upsert({
            id: newEditId,
            user_id: user.id,
            title: selectedVideo.filename.replace(/\.[^.]+$/, ''),
            status: 'draft',
            source_video_url: selectedVideo.r2_key,
            reference_urls: readyRefs.map((r) => r.url),
          });
        }
      } catch {
        // Non-fatal
      }
    },
    [editId, primarySourceKey, readyRefs, sourceAssets.length]
  );
  // ─── Resume from ?id= ──────────────────────────────────────────────────
  // When the editor is opened from a recent-edit card, hydrate state from the
  // existing edit row so the user lands on the appropriate step.
  useEffect(() => {
    if (!resumeId || resumeState !== 'loading') return;
    let cancelled = false;
    const run = async () => {
      try {
        const supabase = getClient();
        const { data: edit, error } = await supabase
          .from('edits')
          .select('id, status, source_video_url, reference_urls, style_dna_id, render_config, output_video_url, title')
          .eq('id', resumeId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !edit) {
          setResumeError(error?.message || 'Edit not found.');
          setResumeState('error');
          return;
        }

        let activeEditId = edit.id as string;
        const refUrls: string[] = Array.isArray(edit.reference_urls) ? edit.reference_urls : [];
        const restoredPrompt = extractEditDirection(edit.render_config);
        if (restoredPrompt) setEditPrompt(restoredPrompt);

        if (isVariantRequest) {
          const { data: auth } = await supabase.auth.getUser();
          const userId = auth.user?.id;
          if (!userId) {
            setResumeError('Sign in again to create a variation.');
            setResumeState('error');
            return;
          }
          const { data: variant, error: variantError } = await supabase
            .from('edits')
            .insert({
              user_id: userId,
              title: `${(edit.title as string) || 'Untitled Edit'} Variation`,
              status: 'draft',
              source_video_url: edit.source_video_url,
              reference_urls: refUrls,
              style_dna_id: edit.style_dna_id,
            })
            .select('id')
            .single();
          if (variantError || !variant) {
            setResumeError(variantError?.message || 'Could not create variation.');
            setResumeState('error');
            return;
          }
          activeEditId = variant.id as string;
          setVariantSourceId(edit.id as string);
          setVariantNotice('Variation draft created. Change the direction, add media, then render a new version.');
          setRenderState('idle');
          setOutputUrl(null);
          setExportVaultFileId(null);
        }

        setEditId(activeEditId);

        // Restore references (text array of R2 keys or external URLs)
        if (refUrls.length > 0) {
          setReferences(
            refUrls.map((u) => {
              const isExternal = /^https?:\/\//i.test(u);
              return {
                id: makeId(),
                kind: inferKindFromUrl(u),
                source: isExternal ? 'url' : 'upload',
                url: u,
                label: isExternal ? u : u.split('/').pop() || u,
                status: 'ready' as RefStatus,
                progress: 100,
              };
            })
          );
        }

        // Restore footage
        if (edit.source_video_url) {
          setFootageR2Key(edit.source_video_url);
          setSourceAssets((prev) => [
            ...prev,
            {
              id: makeId(),
              kind: 'video',
              source: 'upload',
              url: edit.source_video_url,
              label: edit.title || edit.source_video_url.split('/').pop() || 'source video',
              status: 'ready',
              progress: 100,
            },
          ]);
          setFootageUploadState('done');
          setFootageProgress({
            pct: 100,
            loadedBytes: 0,
            totalBytes: 0,
            mode: 'single',
          });
        }

        // Restore style DNA if present
        if (edit.style_dna_id) {
          const { data: dna } = await supabase
            .from('style_dna')
            .select('*')
            .eq('id', edit.style_dna_id)
            .maybeSingle();
          if (!cancelled && dna) {
            // The analyzer effect short-circuits when analyzeState !== 'idle'.
            setStyleDNA(dna as AnalyzedStyleDNA);
            setAnalyzeState('done');
            setAnalyzeStage('Style DNA captured');
          }
        }

        const { data: latestJob } = await supabase
          .from('render_jobs')
          .select('id, status, progress, error_message, started_at')
          .eq('edit_id', activeEditId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Pick a starting step based on what's available
        if (!isVariantRequest && latestJob && ['pending', 'processing', 'uploading'].includes(latestJob.status as string)) {
          setRenderJobId(latestJob.id as string);
          setRenderState('processing');
          setRenderProgress(Number(latestJob.progress ?? 0));
          setRenderStartedAtMs(
            latestJob.started_at ? new Date(latestJob.started_at as string).getTime() : Date.now()
          );
          setRenderNotice('Reconnected to your active render. You can leave this tab and come back safely.');
          setStep('render');
        } else if (!isVariantRequest && latestJob?.status === 'failed') {
          setRenderJobId(latestJob.id as string);
          setRenderState('failed');
          setRenderProgress(Number(latestJob.progress ?? 0));
          setRenderStartedAtMs(null);
          setRenderError(
            (latestJob.error_message as string | null) ||
              'Render failed. Your project is saved and you can try again.'
          );
          setStep('render');
        } else if (isVariantRequest && edit.style_dna_id && edit.source_video_url) {
          const startOnMedia = typeof window !== 'undefined' && window.location.hash === '#media';
          setStep(startOnMedia ? 'reference' : 'configure');
        } else if (edit.status === 'completed' && edit.output_video_url) {
          setOutputUrl(edit.output_video_url);
          setRenderState('completed');
          setRenderProgress(100);
          setStep('render');
        } else if (edit.style_dna_id && edit.source_video_url) {
          setStep('configure');
        } else if (edit.source_video_url) {
          setStep('style');
        } else if (refUrls.length > 0) {
          setStep('footage');
        } else {
          setStep('reference');
        }

        setResumeState('done');
      } catch (err) {
        if (cancelled) return;
        setResumeError(err instanceof Error ? err.message : 'Failed to load edit.');
        setResumeState('error');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [resumeId, resumeState, isVariantRequest]);

  // ─── Step 3: Style DNA analysis (real) ─────────────────────────────────
  useEffect(() => {
    if (step !== 'style' || analyzeState !== 'idle') return;
    if (readyRefs.length === 0) return;

    let cancelled = false;
    let stageTimer: ReturnType<typeof setInterval> | null = null;
    let fetchTimeout: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    const startedAt = Date.now();
    setAnalyzeElapsed(0);
    const elapsedTimer = setInterval(() => {
      if (!cancelled) setAnalyzeElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    const run = async () => {
      setAnalyzeState('analyzing');
      setAnalyzeError(null);
      const baseStage = `Blending ${readyRefs.length} reference${readyRefs.length === 1 ? '' : 's'}...`;
      setAnalyzeStage(baseStage);
      const stages = [
        baseStage,
        'Probing media metadata...',
        'Detecting scene cuts...',
        'Extracting audio waveform...',
        'Estimating BPM and beats...',
        'Sampling color palette...',
        'Composing Style DNA...',
      ];
      let stageIdx = 0;
      stageTimer = setInterval(() => {
        stageIdx = Math.min(stageIdx + 1, stages.length - 1);
        if (!cancelled) setAnalyzeStage(stages[stageIdx]);
      }, 1500);
      const completeWithFallback = (reason: string) => {
        if (cancelled) return;
        clearInterval(elapsedTimer);
        if (stageTimer) clearInterval(stageTimer);
        setStyleDNA(buildClientFallbackStyleDNA(readyRefs));
        setAnalyzeStage(`Quick Style DNA ready (${reason})`);
        setAnalyzeError(null);
        setAnalyzeState('done');
      };

      try {
        // Weight each reference equally; videos drive temporal fields, images
        // contribute to color. (See analyzer.ts blendAnalyses for details.)
        const payload = readyRefs
          .slice(0, MAX_DEEP_STYLE_REFERENCES)
          .map((r) => ({ url: r.url, type: r.kind }));
        controller = new AbortController();
        // Style DNA must never block the editing pipeline. If deep analysis
        // stalls, fall forward with deterministic Quick Style DNA.
        fetchTimeout = setTimeout(() => controller?.abort(), STYLE_DNA_CLIENT_FALLBACK_MS);
        let res: Response;
        try {
          res = await fetch('/api/style-dna/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ references: payload }),
            signal: controller.signal,
            // Keep the request alive even if the page is backgrounded briefly
            // on mobile (Safari aggressively pauses inactive tabs).
            keepalive: false,
          });
        } catch (fetchErr: unknown) {
          if (fetchTimeout) clearTimeout(fetchTimeout);
          if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
            completeWithFallback('analysis timed out');
            return;
          }
          throw fetchErr;
        }
        if (fetchTimeout) clearTimeout(fetchTimeout);
        if (stageTimer) clearInterval(stageTimer);
        clearInterval(elapsedTimer);
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.warn('[editor] Style DNA server failed, using fallback', body.error || res.status);
          completeWithFallback('server fallback');
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setStyleDNA(data.styleDNA as AnalyzedStyleDNA);
        setAnalyzeStage('Style DNA captured');
        setAnalyzeState('done');
      } catch (err) {
        if (stageTimer) clearInterval(stageTimer);
        if (fetchTimeout) clearTimeout(fetchTimeout);
        clearInterval(elapsedTimer);
        if (cancelled) return;
        console.warn('[editor] Style DNA analysis failed, using fallback', err);
        completeWithFallback('network fallback');
      }
    };
    void run();
    return () => {
      cancelled = true;
      controller?.abort();
      if (fetchTimeout) clearTimeout(fetchTimeout);
      if (stageTimer) clearInterval(stageTimer);
      clearInterval(elapsedTimer);
    };
    // Do not depend on analyzeState here. This effect owns the transition from
    // idle -> analyzing -> done; including analyzeState cancels the in-flight
    // request immediately after it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, readyRefsKey, analyzeRunNonce]);

  // ─── Step 5: Render & poll ─────────────────────────────────────────────
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if ((renderState !== 'submitting' && renderState !== 'processing') || !renderStartedAtMs) return;
    const updateElapsed = () => {
      setRenderElapsedSec(Math.max(0, Math.floor((Date.now() - renderStartedAtMs) / 1000)));
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [renderState, renderStartedAtMs]);

  // Release any object URLs held by reference rows when the page unmounts.
  useEffect(() => {
    return () => {
      references.forEach((r) => {
        if (r.previewUrl && r.source === 'upload') {
          try {
            URL.revokeObjectURL(r.previewUrl);
          } catch {
            // ignore
          }
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollStatus = useCallback(async (jobId: string) => {
    try {
      const { res, data } = await fetchJsonWithTimeout<{
        status?: string;
        progress?: number;
        error?: string;
        playbackUrl?: string | null;
        vaultFileId?: string | null;
        warning?: string;
      }>(
        `/api/shotstack/status?jobId=${encodeURIComponent(jobId)}`,
        { cache: 'no-store' },
        RENDER_STATUS_TIMEOUT_MS,
        'Render status check'
      );
      if (!res.ok) {
        throw new Error(data.error || `Status check failed: ${res.status}`);
      }
      if (data.warning) setRenderNotice(data.warning);
      else setRenderNotice(null);
      if (typeof data.progress === 'number') setRenderProgress(data.progress);

      if (data.status === 'completed') {
        renderPollFailures.current = 0;
        activePollJobRef.current = null;
        setRenderState('completed');
        setRenderStartedAtMs(null);
        setOutputUrl(data.playbackUrl || null);
        setExportVaultFileId(data.vaultFileId || null);
        setRenderNotice(null);
        stopPolling();
        return;
      }
      if (data.status === 'failed') {
        renderPollFailures.current = 0;
        activePollJobRef.current = null;
        setRenderState('failed');
        setRenderStartedAtMs(null);
        setRenderError(data.error || 'Render failed. Your project is saved and you can try again.');
        setRenderNotice(null);
        stopPolling();
        return;
      }
      pollTimer.current = setTimeout(() => pollStatus(jobId), 3000);
    } catch (err) {
      renderPollFailures.current += 1;
      if (renderPollFailures.current <= 5) {
        setRenderNotice('A7 is having trouble checking the renderer. Your job is still saved and will keep retrying.');
        pollTimer.current = setTimeout(() => pollStatus(jobId), 5000);
        return;
      }
      activePollJobRef.current = null;
      setRenderState('failed');
      setRenderStartedAtMs(null);
      setRenderError('A7 could not confirm render status after several retries. Your project is saved; try again from this screen.');
      stopPolling();
    }
  }, [stopPolling]);

  useEffect(() => {
    if (renderState !== 'processing' || !renderJobId) return;
    if (activePollJobRef.current === renderJobId) return;
    activePollJobRef.current = renderJobId;
    renderPollFailures.current = 0;
    void pollStatus(renderJobId);
  }, [renderState, renderJobId, pollStatus]);

  const buildMatch = useCallback(async (captionsPayload?: unknown): Promise<{ ok: boolean; error?: string }> => {
    if (!editId || !styleDNA) {
      const msg = 'Style DNA missing — go back and run analysis';
      setMatchError(msg);
      return { ok: false, error: msg };
    }
    setMatchState('matching');
    setMatchError(null);
    try {
      const { res, data: body } = await fetchJsonWithTimeout<{ error?: string }>(
        '/api/style-dna/match',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            editId,
            styleDNA,
            options: {
              targetDuration,
              platform,
              outputFormat: format,
              outputResolution: resolution,
              outputFps: 30,
              hookText: hookText.trim() || undefined,
              ctaText: ctaText.trim() || undefined,
              editPrompt: editPrompt.trim() || undefined,
              generateSoundtrack,
              referenceSoundtrackKey: generateSoundtrack && soundtrackR2Key ? soundtrackR2Key : undefined,
              sourceMedia: readySourceAssets.map((asset) => ({
                type: asset.kind,
                url: asset.url,
                label: asset.label,
              })),
              captions: captionsPayload
                ? { transcription: captionsPayload, style: captionStyle }
                : undefined,
            },
          }),
        },
        RENDER_MATCH_TIMEOUT_MS,
        'Render plan build'
      );
      if (!res.ok) throw new Error(body.error || `Match failed (${res.status})`);
      setMatchState('ready');
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Match failed';
      setMatchError(msg);
      setMatchState('error');
      return { ok: false, error: msg };
    }
  }, [editId, styleDNA, targetDuration, platform, format, resolution, hookText, ctaText, editPrompt, generateSoundtrack, soundtrackR2Key, readySourceAssets, captionStyle]);

  const transcribeForCaptions = useCallback(async (): Promise<unknown | null> => {
    if (!autoCaptions || !primarySourceKey || /^https?:\/\//i.test(primarySourceKey)) return null;
    if (captionState === 'done' && captionTranscription) return captionTranscription;

    setCaptionState('transcribing');
    setCaptionError(null);
    try {
      const { res, data } = await fetchJsonWithTimeout<{ error?: string; transcription?: unknown }>(
        '/api/captions/transcribe',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ r2Key: primarySourceKey }),
        },
        CAPTION_TRANSCRIBE_TIMEOUT_MS,
        'Caption transcription'
      );
      if (res.status === 503) {
        setCaptionState('unavailable');
        setCaptionError(data.error || 'Auto-captions are not configured.');
        return null;
      }
      if (!res.ok) {
        setCaptionState('error');
        setCaptionError(data.error || `Transcription failed: ${res.status}`);
        return null;
      }
      setCaptionTranscription(data.transcription);
      setCaptionState('done');
      return data.transcription;
    } catch (err) {
      setCaptionState('error');
      setCaptionError(err instanceof Error ? err.message : 'Transcription failed');
      return null;
    }
  }, [autoCaptions, primarySourceKey, captionState, captionTranscription]);

  const applyQuickStyleDNA = useCallback((reason = 'manual fallback') => {
    if (readyRefs.length === 0) return;
    setStyleDNA(buildClientFallbackStyleDNA(readyRefs));
    setAnalyzeStage(`Quick Style DNA ready (${reason})`);
    setAnalyzeError(null);
    setAnalyzeElapsed(0);
    setAnalyzeState('done');
  }, [readyRefs]);

  const startRender = useCallback(async () => {
    if (!editId || !primarySourceKey) {
      setRenderError('Upload at least one video clip before rendering.');
      return;
    }
    if (!styleDNA) {
      setRenderError('Style DNA is missing — go back and analyze the reference.');
      return;
    }
    setRenderState('submitting');
    setRenderError(null);
    setRenderNotice(null);
    setRenderProgress(0);
    setRenderStartedAtMs(Date.now());
    setRenderElapsedSec(0);

    try {
      // Optional: run Whisper transcription so the match step can layer in captions.
      const transcription = autoCaptions ? await transcribeForCaptions() : null;

      // Build the render config from Style DNA + source footage (server-side).
      const matched = await buildMatch(transcription ?? undefined);
      if (!matched.ok) {
        setRenderState('failed');
        setRenderStartedAtMs(null);
        setRenderError(matched.error || 'Failed to compose render plan');
        return;
      }

      const { res, data } = await fetchJsonWithTimeout<{
        error?: string;
        jobId?: string;
        duplicate?: boolean;
        fallback?: boolean;
      }>(
        '/api/shotstack/render',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ editId }),
        },
        RENDER_SUBMIT_TIMEOUT_MS,
        'Render submission'
      );
      if (!res.ok) throw new Error(data.error || `Render submit failed: ${res.status}`);

      if (!data.jobId) throw new Error('Renderer did not return a job id. Your edit is saved; try again.');
      setRenderJobId(data.jobId);
      if (data.duplicate) {
        setRenderNotice('Render was already processing. A7 reconnected instead of starting a duplicate job.');
      } else if (data.fallback) {
        setRenderNotice('A7 used a simplified render plan so you still get an export.');
      }
      setRenderState('processing');
    } catch (err) {
      setRenderState('failed');
      setRenderStartedAtMs(null);
      setRenderError(err instanceof Error ? err.message : 'Render failed. Your project is saved and you can try again.');
    }
  }, [editId, primarySourceKey, styleDNA, buildMatch, autoCaptions, transcribeForCaptions]);

  // ─── UI helpers ────────────────────────────────────────────────────────
  const canAdvance = (() => {
    switch (step) {
      case 'reference': return hasReadyRef;
      case 'footage':   return hasReadySourceVideo;
      case 'style':     return analyzeState === 'done';
      case 'configure': return true;
      case 'render':    return false;
    }
  })();

  const next = () => {
    const i = STEPS.findIndex((s) => s.id === step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1].id);
  };
  const back = () => {
    const i = STEPS.findIndex((s) => s.id === step);
    if (i > 0) setStep(STEPS[i - 1].id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void flex flex-col overflow-x-hidden">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(45,212,191,0.03) 0%, transparent 50%)' }}
      />

      <header className="relative border-b border-a7-text/[0.04]">
        <div
          className="absolute bottom-0 left-4 right-4 sm:left-6 sm:right-6 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.12), rgba(184,115,51,0.08), transparent)' }}
        />
        {/* Top row: dashboard link + title + edit id. Stacks tight on mobile,
            spreads out on larger screens. */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-3 sm:pt-4 pb-2 sm:pb-3">
          <a
            href="/dashboard"
            className="flex items-center gap-2 sm:gap-3 text-a7-text/40 hover:text-a7-text text-xs sm:text-sm transition-colors min-w-0"
          >
            <LogoIcon size={22} variant="dual" />
            <span className="hidden xs:inline truncate">&larr; Dashboard</span>
          </a>
          <span className="font-medium text-a7-text text-sm sm:text-base truncate">{resumeId ? 'Resume Edit' : 'New Edit'}</span>
          <span className="text-[10px] sm:text-sm text-a7-text/40 truncate text-right max-w-[40%]">
            {editId ? `Edit ${editId.slice(0, 8)}` : ''}
          </span>
        </div>
        {/* Stepper row: horizontal scroll on small screens, shows dots+labels
            on sm+ and dots+full labels on md+. Always fits the viewport. */}
        <nav
          aria-label="Edit progress"
          className="px-3 sm:px-6 pb-3 sm:pb-4 overflow-x-auto no-scrollbar"
        >
          <ol className="flex items-center gap-2 sm:gap-3 min-w-max mx-auto justify-center w-fit">
            {STEPS.map((s, i) => {
              const isActive = step === s.id;
              const isDone = i < stepIndex;
              return (
                <li key={s.id} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <span
                    className="w-2 h-2 rounded-full transition-all shrink-0"
                    style={
                      isActive
                        ? { background: 'linear-gradient(135deg, #2DD4BF, #5BE8D5)', boxShadow: '0 0 8px rgba(45,212,191,0.5)' }
                        : isDone
                        ? { background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)' }
                        : { background: 'rgba(245,240,232,0.1)' }
                    }
                  />
                  <span
                    className={`text-[10px] sm:text-xs whitespace-nowrap ${isActive ? 'text-a7-text' : 'text-a7-text/30'}`}
                  >
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span
                      className="ml-1 sm:ml-2 h-px w-4 sm:w-6 shrink-0"
                      style={{ background: isDone ? 'rgba(45,212,191,0.4)' : 'rgba(245,240,232,0.08)' }}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 md:px-8 py-6 sm:py-8 relative z-10 w-full">
        {resumeState === 'loading' ? (
          <div className="text-center">
            <div className="inline-block w-8 h-8 rounded-full border-2 border-a7-text/10 border-t-grad-teal animate-spin mb-4" />
            <p className="text-a7-text/40 text-sm">Loading your edit...</p>
          </div>
        ) : resumeState === 'error' ? (
          <div className="text-center max-w-md">
            <p className="text-sm mb-2" style={{ color: '#E8B06A' }}>
              {resumeError || 'Could not load this edit.'}
            </p>
            <a href="/editor" className="text-grad-teal text-sm underline">Start a new edit</a>
          </div>
        ) : (
          <>
        {strategyBrief && <EditorStrategyBanner brief={strategyBrief} />}
        {step === 'reference' && (
          <div className="w-full max-w-2xl">
            <h2 className="text-lg sm:text-xl font-bold mb-2 text-center text-a7-text break-words">Add Your References</h2>
            <p className="text-a7-text/40 text-xs sm:text-sm mb-6 sm:mb-8 text-center px-2">
              Add the edits, images, music, SFX, and social links that define the taste of the cut.
            </p>

            <MediaLimitGuide
              title="Reference limits for one edit"
              summary={`${references.length}/${MAX_PROJECT_REFERENCES} references added`}
              counts={referenceCounts}
              rows={[
                { label: 'Total references', value: `Up to ${MAX_PROJECT_REFERENCES} per edit`, active: true },
                { label: 'Deep Style DNA', value: `First ${MAX_DEEP_STYLE_REFERENCES} ordered references` },
                { label: 'Allowed types', value: 'Video, image, music, SFX, social/media links' },
                { label: 'Best practice', value: 'Put the strongest emotional references first' },
              ]}
              note={`A7 saves the full reference set, then deeply analyzes the first ${MAX_DEEP_STYLE_REFERENCES} for Style DNA so the pipeline stays reliable.`}
            />

            <button
              type="button"
              onClick={() => setReferencePickerOpen(true)}
              className="w-full mb-4 px-5 py-4 rounded-xl flex items-center gap-4 text-left transition-all hover:scale-[1.005]"
              style={{
                background:
                  'linear-gradient(135deg, rgba(45,212,191,0.1), rgba(45,212,191,0.03))',
                border: '1px solid rgba(45,212,191,0.28)',
                boxShadow: '0 0 18px rgba(45,212,191,0.12)',
              }}
            >
              <VaultIcon size={22} gradient="teal" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-a7-text">Import from your vault</div>
                <div className="text-xs text-a7-text/50">
                  Your references and mood boards are already there. Pick and add.
                </div>
              </div>
              <span className="text-grad-teal text-sm">→</span>
            </button>

            <div className="text-[11px] uppercase tracking-wider text-a7-text/40 font-mono mb-2 text-center">
              or upload directly
            </div>

            <ReferenceDropZone
              onFiles={uploadReferenceFiles}
              title="Drop reference edits, images, music, or SFX"
              subtitle={`${MAX_PROJECT_REFERENCES} total refs · videos/images up to ${formatBytes(MAX_UPLOAD_BYTES)} each · audio up to ${formatBytes(MAX_AUDIO_UPLOAD_BYTES)} each`}
            />

            <div className="my-6 flex items-center gap-3">
              <span className="flex-1 h-px bg-a7-text/[0.06]" />
              <span className="text-xs text-a7-text/30">or paste a URL</span>
              <span className="flex-1 h-px bg-a7-text/[0.06]" />
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                value={pendingUrl}
                onChange={(e) => setPendingUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addReferenceUrl();
                  }
                }}
                placeholder="https://www.instagram.com/reel/... or media URL"
                className="flex-1 px-4 py-3 rounded-md text-sm bg-a7-base border border-a7-text/[0.08] text-a7-text placeholder:text-a7-text/20 focus:outline-none focus:border-grad-teal"
              />
              <button
                type="button"
                onClick={addReferenceUrl}
                disabled={!pendingUrl.trim()}
                className="px-4 py-3 rounded-md text-sm font-medium text-a7-void transition-all disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                  boxShadow: pendingUrl.trim() ? '0 0 14px rgba(45,212,191,0.25)' : 'none',
                }}
              >
                Add
              </button>
            </div>

            {referenceError && (
              <p className="mt-3 text-sm" style={{ color: '#E8B06A' }}>{referenceError}</p>
            )}

            {references.length > 0 && (
              <div className="mt-8">
                <div className="text-[11px] text-a7-text/40 uppercase tracking-wider mb-3">
                  {references.length} reference{references.length === 1 ? '' : 's'}
                  {readyRefs.length !== references.length &&
                    ` · ${readyRefs.length} ready`}
                </div>
                <p className="text-xs text-a7-text/35 mb-3">
                  Reorder these any time. The first {MAX_DEEP_STYLE_REFERENCES} drive deep Style DNA; the rest stay saved for taste, direction, and variations.
                </p>
                <div className="space-y-2">
                  {references.map((ref, idx) => (
                    <ReferenceRow
                      key={ref.id}
                      item={ref}
                      isFirst={idx === 0}
                      isLast={idx === references.length - 1}
                      onMoveUp={() => moveReference(ref.id, -1)}
                      onMoveDown={() => moveReference(ref.id, 1)}
                      onRemove={() => removeReference(ref.id)}
                      onRetry={() => retryReferenceUpload(ref.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            <NavButtons onNext={next} onBack={null} disabled={!canAdvance} nextLabel="Continue" />
          </div>
        )}

        {step === 'footage' && (
          <div className="w-full max-w-xl">
            <h2 className="text-lg sm:text-xl font-bold mb-2 text-center text-a7-text break-words">
              Add Source Media
            </h2>
            <p className="text-a7-text/40 text-xs sm:text-sm mb-6 sm:mb-8 text-center px-2">
              Add the raw clips and supporting layers A7 should turn into the final edit.
            </p>

            <MediaLimitGuide
              title="Raw footage limits for one edit"
              summary={`${sourceAssets.length}/${MAX_PROJECT_SOURCE_ASSETS} source media items added`}
              counts={sourceCounts}
              rows={[
                { label: 'Total source media', value: `Up to ${MAX_PROJECT_SOURCE_ASSETS} per edit`, active: true },
                { label: 'Required', value: `At least ${RENDER_PRIMARY_VIDEO_LIMIT} video clip` },
                { label: 'Rendered each time', value: `${RENDER_PRIMARY_VIDEO_LIMIT} primary video + ${RENDER_SUPPORTING_VISUAL_LIMIT} visual layers + ${RENDER_AUDIO_LAYER_LIMIT} audio layer` },
                { label: 'Allowed types', value: 'Video clips, images, music, SFX' },
              ]}
              note="Extra source media stays attached to the project for alternate cuts and prompt-directed variations."
            />

            <button
              type="button"
              onClick={() => setFootagePickerOpen(true)}
              className="w-full mb-4 px-5 py-4 rounded-xl flex items-center gap-4 text-left transition-all hover:scale-[1.005]"
              style={{
                background:
                  'linear-gradient(135deg, rgba(45,212,191,0.1), rgba(45,212,191,0.03))',
                border: '1px solid rgba(45,212,191,0.28)',
                boxShadow: '0 0 18px rgba(45,212,191,0.12)',
              }}
            >
              <VaultIcon size={22} gradient="teal" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-a7-text">Import from your vault</div>
                <div className="text-xs text-a7-text/50">
                  Use raw clips and supporting media you already staged in your vault.
                </div>
              </div>
              <span className="text-grad-teal text-sm">→</span>
            </button>

            <div className="text-[11px] uppercase tracking-wider text-a7-text/40 font-mono mb-2 text-center">
              or upload directly
            </div>

            <ReferenceDropZone
              onFiles={uploadSourceFiles}
              title="Drop source clips, images, music, or SFX"
              subtitle={`${MAX_PROJECT_SOURCE_ASSETS} source items · at least 1 video · video/image ${formatBytes(MAX_UPLOAD_BYTES)} max · audio ${formatBytes(MAX_AUDIO_UPLOAD_BYTES)} max`}
            />

            {sourceAssets.length > 0 && (
              <div className="mt-6">
                <div className="text-[11px] text-a7-text/40 uppercase tracking-wider mb-3">
                  {sourceAssets.length} source asset{sourceAssets.length === 1 ? '' : 's'}
                  {!hasReadySourceVideo && ' · add a video to continue'}
                </div>
                <p className="text-xs text-a7-text/35 mb-3">
                  For reliability, each render uses {RENDER_PRIMARY_VIDEO_LIMIT} primary video, up to {RENDER_SUPPORTING_VISUAL_LIMIT} supporting visuals, and {RENDER_AUDIO_LAYER_LIMIT} music/SFX layer. Extra media stays saved for future variations.
                </p>
                <div className="space-y-2">
                  {sourceAssets.map((asset, idx) => (
                    <ReferenceRow
                      key={asset.id}
                      item={asset}
                      isFirst={idx === 0}
                      isLast={idx === sourceAssets.length - 1}
                      onMoveUp={() => moveSourceAsset(asset.id, -1)}
                      onMoveDown={() => moveSourceAsset(asset.id, 1)}
                      onRemove={() => removeSourceAsset(asset.id)}
                      onRetry={() => retrySourceAssetUpload(asset.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            <p className="mt-3 text-[11px] text-a7-text/30 text-center">
              Cloud import currently pulls one direct media item at a time; add more from your vault or device above.
            </p>

            {footageError && (
              <p className="mt-3 text-sm" style={{ color: '#E8B06A' }}>{footageError}</p>
            )}

            <div className="my-6 flex items-center gap-3">
              <span className="flex-1 h-px bg-a7-text/[0.06]" />
              <span className="text-[11px] text-a7-text/30 uppercase tracking-wider">or pull from cloud</span>
              <span className="flex-1 h-px bg-a7-text/[0.06]" />
            </div>

            <CloudImportPanel onImported={acceptCloudImport} />

            <NavButtons onNext={next} onBack={back} disabled={!canAdvance} nextLabel="Continue" />
          </div>
        )}

        {step === 'style' && (
          <div className="w-full max-w-2xl">
            <h2 className="text-lg sm:text-xl font-bold mb-2 text-center text-a7-text break-words">
              {analyzeState === 'done' ? 'Style DNA Captured' : 'Analyzing Style DNA'}
            </h2>
            <p className="text-a7-text/40 text-xs sm:text-sm mb-6 sm:mb-8 text-center px-2">
              {analyzeState === 'done'
                ? 'Editing fingerprint ready. Review or adjust below.'
                : 'Extracting the editing fingerprint from your reference.'}
            </p>

            {analyzeState !== 'done' && (
              <>
                <div className="mb-6 flex justify-center">
                  <Logo variant="teal" size="md" animate={analyzeState === 'analyzing'} />
                </div>

                <div
                  className="w-full rounded-full h-2 mb-4 overflow-hidden"
                  style={{ background: 'linear-gradient(90deg, #1A1918, #10100E)' }}
                >
                  <div
                    className="h-2 rounded-full transition-all shimmer"
                    style={{
                      // Real elapsed-time progress: ramps from 5% to 95% over
                      // ~45s so the bar visibly moves while the server works.
                      // Clamped so it never reaches 100% before completion.
                      width: analyzeState === 'analyzing'
                        ? `${Math.min(95, 5 + (analyzeElapsed / 45) * 90)}%`
                        : analyzeState === 'error' ? '100%' : '0%',
                      background: analyzeState === 'error'
                        ? 'linear-gradient(135deg, #E8B06A, #B87333)'
                        : 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                      boxShadow: '0 0 15px rgba(45,212,191,0.4)',
                    }}
                  />
                </div>
                <p className="text-a7-text/40 text-xs text-center break-words px-2">
                  {analyzeState === 'error'
                    ? `Analysis failed: ${analyzeError ?? 'unknown error'}`
                    : analyzeStage || 'Working...'}
                </p>
                {analyzeState === 'analyzing' && (
                  <div className="mt-2 text-center">
                    <p className="text-a7-text/25 text-[10px]">
                      {analyzeElapsed}s elapsed · auto-falls forward at 20s
                    </p>
                    <button
                      type="button"
                      onClick={() => applyQuickStyleDNA('manual skip')}
                      className="mt-3 px-4 py-2 rounded-md text-xs font-medium transition-all text-a7-void"
                      style={{
                        background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                        boxShadow: '0 0 14px rgba(45,212,191,0.22)',
                      }}
                    >
                      Use Quick Style DNA
                    </button>
                  </div>
                )}

                {analyzeState === 'error' && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={() => {
                        setAnalyzeState('idle');
                        setAnalyzeRunNonce((n) => n + 1);
                      }}
                      className="px-4 py-2 rounded-md text-sm font-medium text-a7-void"
                      style={{ background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)' }}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </>
            )}

            {analyzeState === 'done' && styleDNA && (
              <StyleDNAPreview dna={styleDNA} />
            )}

            <NavButtons onNext={next} onBack={back} disabled={!canAdvance} nextLabel="Continue" />
          </div>
        )}

        {step === 'configure' && (
          <div className="w-full max-w-xl">
            <h2 className="text-lg sm:text-xl font-bold mb-2 text-center text-a7-text break-words">Render Settings</h2>
            <p className="text-a7-text/40 text-xs sm:text-sm mb-6 sm:mb-8 text-center px-2">
              Tune output and storytelling. Style DNA already shapes the cut.
            </p>

            {variantNotice && (
              <div
                className="mb-5 rounded-md px-4 py-3 text-sm text-left"
                style={{
                  background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(184,115,51,0.03))',
                  border: '1px solid rgba(45,212,191,0.22)',
                  color: 'rgba(245,240,232,0.72)',
                }}
              >
                {variantNotice}
              </div>
            )}

            <FieldGroup label={variantSourceId ? 'Variation direction' : 'Edit direction'}>
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="Example: make this punchier, open with the most intense moment, use music hits for cuts, keep captions minimal."
                maxLength={500}
                rows={4}
                className="w-full px-4 py-3 rounded-md text-sm bg-a7-base border border-a7-text/[0.08] text-a7-text placeholder:text-a7-text/20 focus:outline-none focus:border-grad-teal resize-none"
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-a7-text/30">
                <span>Applies to this render plan and each regenerated variation.</span>
                <span>{editPrompt.length}/500</span>
              </div>
            </FieldGroup>

            <FieldGroup label="Platform">
              <Segmented
                value={platform}
                onChange={(v) => setPlatform(v as Platform)}
                options={[
                  { value: 'reels', label: 'Reels 9:16' },
                  { value: 'tiktok', label: 'TikTok 9:16' },
                  { value: 'shorts', label: 'Shorts 9:16' },
                  { value: 'youtube', label: 'YouTube 16:9' },
                  { value: 'square', label: 'Square 1:1' },
                ]}
              />
            </FieldGroup>

            <FieldGroup label="Resolution">
              <Segmented
                value={resolution}
                onChange={(v) => setResolution(v as Resolution)}
                options={[
                  { value: 'sd', label: 'SD' },
                  { value: 'hd', label: 'HD 720' },
                  { value: '1080', label: '1080p' },
                  {
                    value: '4k',
                    label: '4K',
                    disabled: !canUse4K,
                    tooltip: canUse4K
                      ? undefined
                      : 'Upgrade to Pro or Studio to render at 4K.',
                  },
                ]}
              />
              {!canUse4K && (
                <p className="mt-2 text-[11px] text-a7-text/40">
                  4K renders are part of the{' '}
                  <a
                    href="/pricing"
                    className="font-medium hover:underline"
                    style={{ color: '#D4944A' }}
                  >
                    Pro &amp; Studio plans
                  </a>
                  .
                </p>
              )}
            </FieldGroup>

            <FieldGroup label="Format">
              <Segmented
                value={format}
                onChange={(v) => setFormat(v as Format)}
                options={[
                  { value: 'mp4', label: 'MP4' },
                  { value: 'webm', label: 'WebM' },
                ]}
              />
            </FieldGroup>

            <FieldGroup label={`Duration (${targetDuration}s)`}>
              <input
                type="range"
                min={5}
                max={120}
                step={1}
                value={targetDuration}
                onChange={(e) => setTargetDuration(Number(e.target.value))}
                className="w-full accent-grad-teal"
              />
            </FieldGroup>

            <FieldGroup label="Hook text (optional)">
              <input
                type="text"
                value={hookText}
                onChange={(e) => setHookText(e.target.value)}
                placeholder="3 seconds to stop the scroll..."
                maxLength={80}
                className="w-full px-4 py-2 rounded-md text-sm bg-a7-base border border-a7-text/[0.08] text-a7-text placeholder:text-a7-text/20 focus:outline-none focus:border-grad-teal"
              />
            </FieldGroup>

            <FieldGroup label="CTA text (optional)">
              <input
                type="text"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                placeholder="Follow for more"
                maxLength={80}
                className="w-full px-4 py-2 rounded-md text-sm bg-a7-base border border-a7-text/[0.08] text-a7-text placeholder:text-a7-text/20 focus:outline-none focus:border-grad-teal"
              />
            </FieldGroup>

            <FieldGroup label="Soundtrack">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={generateSoundtrack}
                  onChange={(e) => setGenerateSoundtrack(e.target.checked)}
                  className="w-4 h-4 accent-grad-teal"
                />
                <span className="text-sm text-a7-text/70">
                  Generate an original soundtrack matching the reference vibe
                </span>
              </label>
              <p className="mt-2 text-[11px] text-a7-text/30">
                Routed through Mubert / SOUNDRAW when configured. Zero copyright risk.
              </p>
            </FieldGroup>

            <FieldGroup label="Auto-Captions">
              <div className="flex items-center justify-between gap-4 mb-3">
                <span className="text-sm text-a7-text/60">
                  Transcribe speech and burn captions into the render.
                </span>
                <button
                  type="button"
                  onClick={() => setAutoCaptions((v) => !v)}
                  className="relative w-12 h-6 rounded-full transition-all"
                  style={{
                    background: autoCaptions
                      ? 'linear-gradient(135deg, #1a9e8f, #2DD4BF)'
                      : 'rgba(245,240,232,0.08)',
                    boxShadow: autoCaptions ? '0 0 12px rgba(45,212,191,0.3)' : 'none',
                  }}
                  aria-pressed={autoCaptions}
                  aria-label="Toggle auto-captions"
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                    style={{
                      left: autoCaptions ? 'calc(100% - 22px)' : '2px',
                      background: '#F5F0E8',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}
                  />
                </button>
              </div>

              {autoCaptions && (
                <Segmented
                  value={captionStyle}
                  onChange={(v) => setCaptionStyle(v as CaptionStyle)}
                  options={[
                    { value: 'tiktok-bold', label: 'TikTok Bold' },
                    { value: 'youtube-bar', label: 'YouTube Bar' },
                    { value: 'karaoke', label: 'Karaoke' },
                  ]}
                />
              )}

              {captionState === 'unavailable' && (
                <p className="mt-3 text-xs" style={{ color: '#E8B06A' }}>
                  Auto-captions are not configured on this server (missing OPENAI_API_KEY).
                </p>
              )}
              {captionState === 'error' && captionError && (
                <p className="mt-3 text-xs" style={{ color: '#E8B06A' }}>
                  {captionError}
                </p>
              )}
            </FieldGroup>

            <NavButtons onNext={next} onBack={back} disabled={!canAdvance} nextLabel="Continue" />
          </div>
        )}

        {step === 'render' && (
          <div className="w-full max-w-md text-center">
            {renderState === 'idle' && (
              <>
                <h2 className="text-xl font-bold mb-2 text-a7-text">Ready to Render</h2>
                <p className="text-a7-text/40 text-sm mb-8">
                  This will spend 1 credit. Cloud rendering usually takes 2&ndash;5 minutes.
                </p>
                {renderError && (
                  <p className="mb-4 text-sm" style={{ color: '#E8B06A' }}>
                    {renderError}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={back}
                    className="flex-1 py-3 rounded-md font-medium text-sm transition-all"
                    style={{
                      background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
                      border: '1px solid rgba(245,240,232,0.06)',
                      color: 'rgba(245,240,232,0.5)',
                    }}
                  >
                    Back
                  </button>
                  <button
                    onClick={startRender}
                    className="flex-1 py-3 rounded-md font-medium transition-all text-a7-void"
                    style={{
                      background: 'linear-gradient(135deg, #8B5A2B, #B87333, #D4944A)',
                      boxShadow: '0 0 20px rgba(184,115,51,0.3)',
                    }}
                  >
                    Render (1 Credit)
                  </button>
                </div>
              </>
            )}

            {(renderState === 'submitting' || renderState === 'processing') && (
              <>
                <div className="mb-6">
                  <Logo variant="teal" size="md" animate />
                </div>
                <h2 className="text-xl font-bold mb-2 text-a7-text">Rendering</h2>
                <p className="text-a7-text/40 text-sm mb-8">
                  Cloud rendering in progress.
                </p>
                <div
                  className="w-full rounded-full h-2 mb-4"
                  style={{ background: 'linear-gradient(90deg, #1A1918, #10100E)' }}
                >
                  <div
                    className="h-2 rounded-full shimmer transition-all"
                    style={{
                      width: `${Math.max(renderProgress, 5)}%`,
                      background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                      boxShadow: '0 0 15px rgba(45,212,191,0.4)',
                    }}
                  />
                </div>
                <p className="text-a7-text/30 text-xs">
                  {renderState === 'submitting' ? 'Submitting to renderer...' : `Rendering... ${renderProgress}%`}
                </p>
                <p className="mt-2 text-a7-text/25 text-[11px]">
                  {Math.floor(renderElapsedSec / 60)}m {String(renderElapsedSec % 60).padStart(2, '0')}s elapsed · your edit is saved and polling will recover after refresh.
                </p>
                {renderNotice && (
                  <p className="mt-3 text-xs" style={{ color: '#E8B06A' }}>
                    {renderNotice}
                  </p>
                )}
              </>
            )}

            {renderState === 'completed' && (
              <>
                <svg
                  viewBox="0 0 48 48"
                  width="56"
                  height="56"
                  className="mx-auto mb-4"
                  style={{ filter: 'drop-shadow(0 0 12px rgba(45,212,191,0.4))' }}
                >
                  <defs>
                    <linearGradient id="check-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#1a9e8f" />
                      <stop offset="100%" stopColor="#5BE8D5" />
                    </linearGradient>
                  </defs>
                  <circle cx="24" cy="24" r="22" fill="none" stroke="url(#check-grad)" strokeWidth="2" />
                  <polyline
                    points="14,24 21,32 34,16"
                    fill="none"
                    stroke="url(#check-grad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <h2 className="text-xl font-bold mb-2 text-a7-text">Edit Complete</h2>
                <p className="text-a7-text/40 text-sm mb-6">
                  Your video is ready.
                </p>
                <PostRenderPlan
                  preferredPlatform={strategyBrief?.platform as StrategyPlatform | undefined}
                />
                <ExportActions
                  outputUrl={outputUrl}
                  vaultFileId={exportVaultFileId}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <a
                    href={editId ? `/editor?id=${encodeURIComponent(editId)}&variant=1` : '/editor'}
                    className="py-3 rounded-md font-medium text-sm transition-all text-center"
                    style={{
                      background: 'linear-gradient(135deg, rgba(45,212,191,0.1), rgba(45,212,191,0.03))',
                      border: '1px solid rgba(45,212,191,0.25)',
                      color: '#5BE8D5',
                    }}
                  >
                    Make Variation
                  </a>
                  <a
                    href={editId ? `/editor?id=${encodeURIComponent(editId)}&variant=1#media` : '/editor'}
                    className="py-3 rounded-md font-medium text-sm transition-all text-center"
                    style={{
                      background: 'linear-gradient(135deg, rgba(184,115,51,0.1), rgba(184,115,51,0.03))',
                      border: '1px solid rgba(184,115,51,0.25)',
                      color: '#E8B06A',
                    }}
                  >
                    Add Media / Refs
                  </a>
                </div>
                <div className="flex gap-3 mt-3">
                  <a
                    href="/vault"
                    className="flex-1 py-3 rounded-md font-medium text-sm transition-all text-center"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(184,115,51,0.1), rgba(184,115,51,0.03))',
                      border: '1px solid rgba(184,115,51,0.25)',
                      color: '#E8B06A',
                    }}
                  >
                    View in Vault
                  </a>
                  <a
                    href={outputUrl || '#'}
                    download
                    className={classNames(
                      'flex-1 py-3 rounded-md font-medium text-sm transition-all text-center',
                      !outputUrl && 'opacity-50 pointer-events-none'
                    )}
                    style={{
                      background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
                      border: '1px solid rgba(45,212,191,0.25)',
                      color: '#5BE8D5',
                    }}
                  >
                    Download
                  </a>
                  <a
                    href="/dashboard"
                    className="flex-1 py-3 rounded-md font-medium transition-all text-a7-void text-center"
                    style={{
                      background: 'linear-gradient(135deg, #2DD4BF, #B87333)',
                      boxShadow: '0 0 20px rgba(45,212,191,0.2), 0 0 20px rgba(184,115,51,0.2)',
                    }}
                  >
                    Back to Dashboard
                  </a>
                </div>
              </>
            )}

            {renderState === 'failed' && (
              <>
                <h2 className="text-xl font-bold mb-2 text-a7-text">Render Failed</h2>
                <p className="text-sm mb-8" style={{ color: '#E8B06A' }}>
                  {renderError || 'Something broke. Your credit has been refunded.'}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={back}
                    className="flex-1 py-3 rounded-md font-medium text-sm transition-all"
                    style={{
                      background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
                      border: '1px solid rgba(245,240,232,0.06)',
                      color: 'rgba(245,240,232,0.5)',
                    }}
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      setRenderState('idle');
                      setRenderError(null);
                      setRenderNotice(null);
                      setRenderProgress(0);
                      setRenderStartedAtMs(null);
                      setRenderElapsedSec(0);
                    }}
                    className="flex-1 py-3 rounded-md font-medium transition-all text-a7-void"
                    style={{ background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)' }}
                  >
                    Try Again
                  </button>
                </div>
              </>
            )}
          </div>
        )}
          </>
        )}
      </main>

      <VaultPicker
        open={referencePickerOpen}
        defaultFolder="references"
        allowedKinds={['video', 'image', 'audio']}
        multiple
        onClose={() => setReferencePickerOpen(false)}
        onSelect={(picked) => addReferencesFromVault(picked)}
      />
      <VaultPicker
        open={footagePickerOpen}
        defaultFolder="footage"
        allowedKinds={['video', 'image', 'audio']}
        multiple
        onClose={() => setFootagePickerOpen(false)}
        onSelect={(picked) => void pickVaultFootage(picked)}
      />
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function ExportActions({
  outputUrl,
  vaultFileId,
}: {
  outputUrl: string | null;
  vaultFileId: string | null;
}) {
  const [shareBusy, setShareBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const doShare = async () => {
    if (!vaultFileId && !outputUrl) return;
    setShareBusy(true);
    setShareMessage(null);
    setShareError(null);
    try {
      let link = outputUrl ?? '';
      if (vaultFileId) {
        const res = await fetch(`/api/vault/files/${vaultFileId}`);
        if (res.ok) {
          const data = (await res.json()) as { downloadUrl?: string };
          if (data.downloadUrl) link = data.downloadUrl;
        }
      }
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        setShareMessage('Share link copied. It expires automatically.');
      } catch {
        setShareError('Could not copy automatically. Use Download to open the file, then copy the browser link.');
      }
    } finally {
      setShareBusy(false);
    }
  };

  const doDownload = async () => {
    setDownloadBusy(true);
    try {
      if (vaultFileId) {
        const res = await fetch(`/api/vault/files/${vaultFileId}`);
        if (res.ok) {
          const data = (await res.json()) as { downloadUrl?: string };
          if (data.downloadUrl) {
            window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
            return;
          }
        }
      }
      if (outputUrl) window.open(outputUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadBusy(false);
    }
  };

  const disabled = !outputUrl && !vaultFileId;

  return (
    <div className="mt-6">
      <div className="flex gap-3">
        <button
          onClick={doDownload}
          disabled={disabled || downloadBusy}
          className="flex-1 py-3 rounded-md font-medium text-sm transition-all disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, rgba(45,212,191,0.1), rgba(45,212,191,0.03))',
            border: '1px solid rgba(45,212,191,0.25)',
            color: '#5BE8D5',
          }}
        >
          {downloadBusy ? 'Preparing…' : 'Download'}
        </button>
        <button
          onClick={doShare}
          disabled={disabled || shareBusy}
          className="flex-1 py-3 rounded-md font-medium text-sm transition-all disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
            border: '1px solid rgba(245,240,232,0.08)',
            color: 'rgba(245,240,232,0.7)',
          }}
        >
          {shareBusy ? 'Copying…' : 'Share'}
        </button>
      </div>
      {(shareMessage || shareError) && (
        <p className="mt-3 text-xs" style={{ color: shareError ? '#E8B06A' : '#5BE8D5' }}>
          {shareError || shareMessage}
        </p>
      )}
    </div>
  );
}

function DropZone({
  file,
  uploadState,
  onFile,
  progress,
  error,
  canResume,
  onRetry,
  accept,
}: {
  file: File | null;
  uploadState: UploadState;
  onFile: (file: File) => void;
  progress?: UploadProgress | null;
  error?: string | null;
  /** When true, a multipart upload is paused mid-flight and we can pick up
   *  from the last successful part instead of re-uploading the entire file. */
  canResume?: boolean;
  /** Click handler for the Retry / Resume button rendered in the error state. */
  onRetry?: () => void;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className="relative overflow-hidden block border-2 border-dashed rounded-xl p-6 sm:p-10 md:p-12 text-center cursor-pointer transition-all hover:scale-[1.005]"
      style={{
        borderColor: dragging ? 'rgba(45,212,191,0.4)' : 'rgba(45,212,191,0.15)',
        background: 'linear-gradient(135deg, rgba(45,212,191,0.03), rgba(45,212,191,0.005))',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.2), transparent)' }}
      />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <svg viewBox="0 0 32 32" width="40" height="40" className="mx-auto mb-3 sm:mb-4 sm:w-12 sm:h-12">
        <defs>
          <linearGradient id="dz-upload-grad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="rgba(45,212,191,0.1)" />
            <stop offset="100%" stopColor="rgba(45,212,191,0.3)" />
          </linearGradient>
        </defs>
        <line x1="16" y1="24" x2="16" y2="6" stroke="url(#dz-upload-grad)" strokeWidth="2.5" strokeLinecap="round" />
        <polyline points="8,13 16,5 24,13" fill="none" stroke="url(#dz-upload-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="6" y1="28" x2="26" y2="28" stroke="url(#dz-upload-grad)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      {!file && (
        <>
          <p className="text-a7-text/40 text-sm mb-2">Drag & drop or click to choose</p>
          <p className="text-a7-text/20 text-xs">MP4, MOV, AVI, WebM up to 500MB</p>
        </>
      )}

      {file && uploadState === 'uploading' && (
        <UploadProgressView file={file} progress={progress ?? null} />
      )}

      {file && uploadState === 'done' && (
        <>
          <p className="text-a7-text text-sm mb-1 truncate" title={file.name}>{file.name}</p>
          <UploadProgressBar pct={100} state="done" />
          <p className="text-grad-teal text-xs mt-2">Uploaded · {formatBytes(file.size)}</p>
        </>
      )}

      {file && uploadState === 'error' && (
        <>
          <p className="text-a7-text text-sm mb-1 truncate" title={file.name}>{file.name}</p>
          <UploadProgressBar
            pct={Math.max(progress?.pct ?? 0, 4)}
            state="error"
          />
          <p className="text-xs mt-2 break-words" style={{ color: '#EF4444' }}>
            {error || 'Upload paused — network error'}
          </p>
          {canResume && progress && progress.partsCompleted !== undefined && progress.totalParts !== undefined && (
            <p className="text-[11px] text-a7-text/40 mt-1">
              {progress.partsCompleted} of {progress.totalParts} parts already uploaded — resume keeps them.
            </p>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={(e) => {
                // The drop zone is a <label>, so clicks bubble into the file
                // chooser. Stop propagation so the retry button doesn't also
                // open the file picker.
                e.preventDefault();
                e.stopPropagation();
                onRetry();
              }}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-all"
              style={{
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                color: '#0A0A0A',
                boxShadow: '0 0 14px rgba(45,212,191,0.3)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              {canResume ? 'Resume upload' : 'Retry upload'}
            </button>
          )}
        </>
      )}
    </label>
  );
}

/** Big, prominent in-flight progress display — shown above the drop zone glyph
 *  whenever an upload is in progress. Always shows the live percentage, bytes
 *  transferred, and (for multipart) which part is currently in flight. */
function UploadProgressView({
  file,
  progress,
}: {
  file: File;
  progress: UploadProgress | null;
}) {
  const pct = Math.max(progress?.pct ?? 0, 2);
  const loaded = progress?.loadedBytes ?? 0;
  const total = progress?.totalBytes ?? file.size;
  const isMulti = progress?.mode === 'multipart';
  return (
    <div className="space-y-2">
      <p className="text-a7-text text-sm font-medium truncate" title={file.name}>
        {file.name}
      </p>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-2xl sm:text-3xl font-bold tabular-nums"
          style={{
            background: 'linear-gradient(135deg, #5BE8D5, #2DD4BF)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {pct}%
        </span>
        <span className="text-[11px] sm:text-xs text-a7-text/50 tabular-nums truncate">
          {formatBytes(loaded)} / {formatBytes(total)}
        </span>
      </div>
      <UploadProgressBar pct={pct} state="uploading" />
      <p className="text-[11px] sm:text-xs text-a7-text/40">
        {progress?.retryingAttempt && progress.retryingAttempt > 1
          ? `Network hiccup — retrying part ${(progress.partsCompleted ?? 0) + 1} (attempt ${progress.retryingAttempt}/4)…`
          : isMulti
            ? `Uploading… part ${Math.min((progress?.partsCompleted ?? 0) + 1, progress?.totalParts ?? 1)} / ${progress?.totalParts ?? 1}${progress?.currentConcurrency && progress.currentConcurrency < 3 ? ' · throttled for slow network' : ''}`
            : 'Uploading…'}
      </p>
    </div>
  );
}

/** Branded, smoothly-transitioning progress bar. Used by every upload UI in
 *  the editor (drop zone + reference rows). The "shimmer" overlay keeps the
 *  bar feeling alive even when a multipart chunk is between part boundaries. */
function UploadProgressBar({
  pct,
  state,
}: {
  pct: number;
  state: 'uploading' | 'done' | 'error';
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fillBg =
    state === 'error'
      ? 'linear-gradient(135deg, #EF4444, #B91C1C)'
      : state === 'done'
      ? 'linear-gradient(135deg, #1a9e8f, #2DD4BF, #5BE8D5)'
      : 'linear-gradient(135deg, #1a9e8f, #2DD4BF)';
  const glow =
    state === 'error'
      ? '0 0 12px rgba(239,68,68,0.45)'
      : '0 0 12px rgba(45,212,191,0.45)';
  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{
        height: 10,
        background: 'linear-gradient(90deg, #1A1918, #10100E)',
        border: '1px solid rgba(245,240,232,0.05)',
      }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${state === 'uploading' ? 'shimmer' : ''}`}
        style={{
          width: `${clamped}%`,
          background: fillBg,
          boxShadow: glow,
          // ease-out so chunky multipart updates feel smooth instead of jumpy.
          transition: 'width 220ms cubic-bezier(0.22, 1, 0.36, 1), background 200ms ease-out',
        }}
      />
    </div>
  );
}

const MULTIPART_LABEL = 'Parallel multipart upload (~8MB per part, 4 concurrent)';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-xs text-a7-text/40 mb-2 uppercase tracking-wider">{label}</div>
      {children}
    </div>
  );
}

function MediaLimitGuide({
  title,
  summary,
  counts,
  rows,
  note,
}: {
  title: string;
  summary: string;
  counts: Record<RefKind, number>;
  rows: Array<{ label: string; value: string; active?: boolean }>;
  note: string;
}) {
  return (
    <section
      className="mb-5 rounded-lg p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.015))',
        border: '1px solid rgba(245,240,232,0.08)',
      }}
      aria-label={title}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-a7-text">{title}</h3>
          <p className="text-xs text-a7-text/45">{summary}</p>
        </div>
        <div className="text-xs text-a7-text/45 sm:text-right">
          {counts.video} video · {counts.image} image · {counts.audio} audio
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-md px-3 py-2"
            style={{
              background: row.active
                ? 'linear-gradient(135deg, rgba(45,212,191,0.12), rgba(45,212,191,0.035))'
                : 'rgba(245,240,232,0.025)',
              border: row.active
                ? '1px solid rgba(45,212,191,0.22)'
                : '1px solid rgba(245,240,232,0.05)',
            }}
          >
            <div className="text-[10px] uppercase tracking-wider text-a7-text/35">{row.label}</div>
            <div className="text-xs text-a7-text/70 mt-0.5">{row.value}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-a7-text/35">{note}</p>
    </section>
  );
}

function ReferenceDropZone({
  onFiles,
  title,
  subtitle,
}: {
  onFiles: (files: File[]) => void;
  title: string;
  subtitle: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) onFiles(files);
      }}
      className="relative overflow-hidden block border-2 border-dashed rounded-xl p-6 sm:p-8 md:p-10 text-center cursor-pointer transition-all hover:scale-[1.005]"
      style={{
        borderColor: dragging ? 'rgba(45,212,191,0.4)' : 'rgba(45,212,191,0.15)',
        background: 'linear-gradient(135deg, rgba(45,212,191,0.03), rgba(45,212,191,0.005))',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.2), transparent)' }}
      />
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*,audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onFiles(files);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <svg viewBox="0 0 32 32" width="36" height="36" className="mx-auto mb-2 sm:mb-3 sm:w-10 sm:h-10">
        <defs>
          <linearGradient id="multi-drop-grad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="rgba(45,212,191,0.1)" />
            <stop offset="100%" stopColor="rgba(45,212,191,0.3)" />
          </linearGradient>
        </defs>
        <line x1="16" y1="24" x2="16" y2="6" stroke="url(#multi-drop-grad)" strokeWidth="2.5" strokeLinecap="round" />
        <polyline points="8,13 16,5 24,13" fill="none" stroke="url(#multi-drop-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="6" y1="28" x2="26" y2="28" stroke="url(#multi-drop-grad)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <p className="text-a7-text/50 text-sm mb-1">{title}</p>
      <p className="text-a7-text/20 text-xs">{subtitle}</p>
    </label>
  );
}

function ReferenceRow({
  item,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  onRetry,
}: {
  item: ReferenceItem;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const isReady = item.status === 'ready';
  const isUploading = item.status === 'uploading';
  const isError = item.status === 'error';

  return (
    <div
      className="flex items-center gap-2 sm:gap-3 p-2 rounded-md min-w-0"
      style={{
        background: 'linear-gradient(135deg, rgba(245,240,232,0.025), rgba(245,240,232,0.005))',
        border: '1px solid rgba(245,240,232,0.06)',
      }}
    >
      <div
        className="w-12 h-12 sm:w-16 sm:h-16 rounded overflow-hidden flex items-center justify-center shrink-0"
        style={{
          background: 'linear-gradient(135deg, #10100E, #0C0C0A)',
          border: '1px solid rgba(45,212,191,0.08)',
        }}
      >
        {item.previewUrl && item.kind === 'image' && (
          // Local object URL preview for uploaded images
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt={item.label} className="w-full h-full object-cover" />
        )}
        {item.previewUrl && item.kind === 'video' && (
          <video
            src={item.previewUrl}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        )}
        {item.kind === 'audio' && (
          <span className="text-[10px] uppercase tracking-wider text-a7-text/40">
            AUD
          </span>
        )}
        {!item.previewUrl && item.kind !== 'audio' && (
          <span className="text-[10px] uppercase tracking-wider text-a7-text/40">
            {item.kind === 'image' ? 'IMG' : 'VID'}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span
            className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider"
            style={{
              background: item.kind === 'image'
                ? 'rgba(184,115,51,0.12)'
                : item.kind === 'audio'
                ? 'rgba(232,176,106,0.1)'
                : 'rgba(45,212,191,0.12)',
              color: item.kind === 'image' ? '#D4944A' : item.kind === 'audio' ? '#E8B06A' : '#5BE8D5',
              border: `1px solid ${item.kind === 'image' ? 'rgba(184,115,51,0.25)' : item.kind === 'audio' ? 'rgba(232,176,106,0.22)' : 'rgba(45,212,191,0.25)'}`,
            }}
          >
            {item.kind}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-a7-text/30">
            {item.source}
          </span>
          {isReady && <span className="text-[10px] text-grad-teal">ready</span>}
          {isUploading && (
            <span
              className="text-[11px] font-semibold tabular-nums"
              style={{
                background: 'linear-gradient(135deg, #5BE8D5, #2DD4BF)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {item.progress ?? 0}%
            </span>
          )}
          {isError && (
            <span className="text-[10px]" style={{ color: '#EF4444' }}>
              error
            </span>
          )}
        </div>
        <div
          className="text-xs text-a7-text/70 truncate"
          title={item.label}
        >
          {item.label}
        </div>
        {isUploading && (
          <div className="mt-1.5 space-y-1">
            <UploadProgressBar pct={Math.max(item.progress ?? 0, 2)} state="uploading" />
            <div className="flex items-center justify-between gap-2 text-[10px] text-a7-text/40 tabular-nums">
              <span className="truncate">
                {item.retryingAttempt && item.retryingAttempt > 1
                  ? `Retrying part ${(item.partsCompleted ?? 0) + 1} · attempt ${item.retryingAttempt}/4`
                  : item.uploadMode === 'multipart' && item.totalParts
                    ? `Part ${Math.min((item.partsCompleted ?? 0) + 1, item.totalParts)} / ${item.totalParts}${item.currentConcurrency && item.currentConcurrency < 3 ? ` · slow network` : ''}`
                    : 'Uploading…'}
              </span>
              {typeof item.totalBytes === 'number' && (
                <span>
                  {formatBytes(item.loadedBytes ?? 0)} / {formatBytes(item.totalBytes)}
                </span>
              )}
            </div>
          </div>
        )}
        {isError && (
          <div className="mt-1.5 space-y-1.5">
            {typeof item.totalParts === 'number' && (item.partsCompleted ?? 0) > 0 && (
              <UploadProgressBar pct={Math.max(item.progress ?? 0, 4)} state="error" />
            )}
            {item.error && (
              <p className="text-[11px] break-words" style={{ color: '#EF4444' }}>
                {item.error}
              </p>
            )}
            {item.resumeState && (
              <p className="text-[10px] text-a7-text/40">
                {item.resumeState.completedParts.length} of {item.resumeState.totalParts} parts already uploaded — resume keeps them.
              </p>
            )}
            {item.file && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-all"
                style={{
                  background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                  color: '#0A0A0A',
                  boxShadow: '0 0 10px rgba(45,212,191,0.3)',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                {item.resumeState ? 'Resume' : 'Retry'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <IconButton onClick={onMoveUp} disabled={isFirst} title="Move up">
          &uarr;
        </IconButton>
        <IconButton onClick={onMoveDown} disabled={isLast} title="Move down">
          &darr;
        </IconButton>
        <IconButton onClick={onRemove} title="Remove" danger>
          &times;
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  danger,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-7 h-7 rounded flex items-center justify-center text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
        border: `1px solid ${danger ? 'rgba(232,176,106,0.2)' : 'rgba(245,240,232,0.08)'}`,
        color: danger ? '#E8B06A' : 'rgba(245,240,232,0.6)',
      }}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; disabled?: boolean; tooltip?: string }[];
}) {
  return (
    <div
      className="flex flex-wrap rounded-md p-1 gap-1 max-w-full"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(245,240,232,0.04)',
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        const disabled = o.disabled === true;
        return (
          <button
            key={o.value}
            onClick={() => !disabled && onChange(o.value)}
            disabled={disabled}
            title={o.tooltip}
            className={`flex-1 min-w-0 px-3 sm:px-4 py-2 rounded text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              active ? 'text-a7-void' : 'text-a7-text/50 hover:text-a7-text'
            } ${disabled ? 'opacity-40 cursor-not-allowed hover:text-a7-text/50' : ''}`}
            style={
              active
                ? {
                    background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                    boxShadow: '0 0 12px rgba(45,212,191,0.2)',
                  }
                : {}
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  disabled,
  nextLabel,
}: {
  onBack: (() => void) | null;
  onNext: () => void;
  disabled: boolean;
  nextLabel: string;
}) {
  return (
    <div className="flex gap-3 mt-8">
      {onBack && (
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-md font-medium text-sm transition-all"
          style={{
            background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
            border: '1px solid rgba(245,240,232,0.06)',
            color: 'rgba(245,240,232,0.5)',
          }}
        >
          Back
        </button>
      )}
      <button
        onClick={onNext}
        disabled={disabled}
        className="flex-1 py-3 rounded-md font-medium transition-all disabled:cursor-not-allowed"
        style={{
          background: disabled
            ? 'linear-gradient(135deg, rgba(245,240,232,0.08), rgba(245,240,232,0.04))'
            : 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
          boxShadow: disabled ? 'none' : '0 0 20px rgba(45,212,191,0.25)',
          color: disabled ? 'rgba(245,240,232,0.28)' : '#0A0A0A',
        }}
      >
        {nextLabel}
      </button>
    </div>
  );
}

// ─── Style DNA preview ────────────────────────────────────────────────────

function StyleDNAPreview({ dna }: { dna: AnalyzedStyleDNA }) {
  const cut = dna.cut_pattern;
  const arc = dna.energy_arc;
  const color = dna.color_profile;
  const audio = dna.audio_edit_relationship;
  const palette = ((dna.raw_analysis as Record<string, unknown> | undefined)?.dominant_palette as string[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Cuts" value={String(cut.total_cuts)} sub={`${cut.cuts_per_minute.toFixed(1)} / min`} />
        <Stat label="Avg cut" value={`${(cut.avg_cut_duration_ms / 1000).toFixed(2)}s`} sub={cut.cut_rhythm} />
        <Stat label="BPM" value={dna.pacing.bpm_target ? Math.round(dna.pacing.bpm_target).toString() : '—'} sub={cut.beat_sync ? 'beat-synced' : 'free-time'} />
        <Stat label="Energy" value={dna.pacing.overall_energy} sub={`${arc.shape} arc`} />
      </div>

      <div>
        <div className="text-[11px] text-a7-text/40 uppercase tracking-wider mb-2">Energy arc</div>
        <Sparkline values={arc.curve} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-a7-text/40 uppercase tracking-wider mb-2">Cut vocabulary</div>
          <div className="flex flex-wrap gap-1.5">
            {cut.cut_types.slice(0, 5).map((c) => (
              <span
                key={c.type}
                className="px-2 py-1 rounded text-[11px] text-a7-text/80"
                style={{ background: 'rgba(45,212,191,0.07)', border: '1px solid rgba(45,212,191,0.15)' }}
              >
                {c.type} <span className="text-a7-text/40">{Math.round(c.weight * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-a7-text/40 uppercase tracking-wider mb-2">Color profile</div>
          <div className="flex flex-col gap-1 text-[11px] text-a7-text/60">
            <span>temperature: {color.temperature}</span>
            <span>saturation: {color.saturation}</span>
            <span>contrast: {color.contrast}</span>
            <span>brightness: {color.brightness}</span>
          </div>
        </div>
      </div>

      {palette.length > 0 && (
        <div>
          <div className="text-[11px] text-a7-text/40 uppercase tracking-wider mb-2">Palette</div>
          <div className="flex gap-1.5">
            {palette.slice(0, 6).map((hex, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded"
                style={{ background: hex, border: '1px solid rgba(245,240,232,0.06)' }}
                title={hex}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-[11px] text-a7-text/60">
        <Flag on={audio.cuts_on_beats}>cuts on beats</Flag>
        <Flag on={audio.cuts_on_vocals}>cuts on vocals</Flag>
        <Flag on={cut.has_breathing_moments}>breathing</Flag>
        <Flag on={arc.has_cold_open}>cold open</Flag>
        <Flag on={dna.pacing.builds_tension}>builds tension</Flag>
        <Flag on={dna.pacing.has_drops}>drops</Flag>
      </div>

      <p className="text-[11px] text-a7-text/30 text-center">
        Confidence {(dna.confidence_score * 100).toFixed(0)}%
      </p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-md px-3 py-2"
      style={{
        background: 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))',
        border: '1px solid rgba(45,212,191,0.08)',
      }}
    >
      <div className="text-[10px] uppercase tracking-wider text-a7-text/40">{label}</div>
      <div className="text-base font-semibold text-a7-text">{value}</div>
      {sub && <div className="text-[11px] text-a7-text/40 capitalize">{sub}</div>}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const w = 320;
  const h = 48;
  const maxV = Math.max(...values, 0.001);
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / maxV) * h}`)
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-12 rounded-md"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(45,212,191,0.08)',
      }}
    >
      <defs>
        <linearGradient id="spark-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke="#2DD4BF" strokeWidth="1.5" />
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill="url(#spark-grad)"
      />
    </svg>
  );
}

function Flag({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div
      className="px-2 py-1 rounded text-center"
      style={{
        background: on ? 'rgba(45,212,191,0.07)' : 'rgba(245,240,232,0.02)',
        border: `1px solid ${on ? 'rgba(45,212,191,0.2)' : 'rgba(245,240,232,0.04)'}`,
        color: on ? 'rgba(245,240,232,0.85)' : 'rgba(245,240,232,0.25)',
      }}
    >
      {children}
    </div>
  );
}
