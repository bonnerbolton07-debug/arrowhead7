'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Logo, LogoIcon } from '@/components/ui/Logo';
import { getClient } from '@/lib/supabase/client';
import type { StyleDNA } from '@/types/edit';
import {
  EditorStrategyBanner,
  useStrategyBrief,
} from '@/components/strategy/EditorStrategyBanner';
import { PostRenderPlan } from '@/components/strategy/PostRenderPlan';
import type { StrategyPlatform } from '@/types/strategy';

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
type RefKind = 'video' | 'image';
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
const ALLOWED_MIME = new Set<string>([
  ...Array.from(ALLOWED_VIDEO_MIME),
  ...Array.from(ALLOWED_IMAGE_MIME),
]);

function makeId() {
  return `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferKindFromMime(mime: string): RefKind {
  return ALLOWED_IMAGE_MIME.has(mime) ? 'image' : 'video';
}

function inferKindFromUrl(url: string): RefKind {
  const path = url.toLowerCase().split('?')[0];
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/.test(path) ? 'image' : 'video';
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export default function EditorPage() {
  const strategyBrief = useStrategyBrief();
  const [step, setStep] = useState<Step>('reference');

  // Step 1 — References (multiple videos and/or images)
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [pendingUrl, setPendingUrl] = useState('');
  const [referenceError, setReferenceError] = useState<string | null>(null);

  // Derived: do we have at least one ready reference?
  const readyRefs = references.filter((r) => r.status === 'ready');
  const hasReadyRef = readyRefs.length > 0;
  // First soundtrack candidate: the highest-priority *video* reference uploaded
  // to R2 (so we can shell it back to the soundtrack generator if requested).
  const soundtrackR2Key = readyRefs.find((r) => r.kind === 'video' && r.source === 'upload')?.url ?? null;

  // Step 2 — Footage
  const [footageFile, setFootageFile] = useState<File | null>(null);
  const [footageUploadState, setFootageUploadState] = useState<UploadState>('idle');
  const [footageProgress, setFootageProgress] = useState(0);
  const [footageR2Key, setFootageR2Key] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [footageError, setFootageError] = useState<string | null>(null);

  // Step 3 — Style DNA analysis
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>('idle');
  const [styleDNA, setStyleDNA] = useState<AnalyzedStyleDNA | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeStage, setAnalyzeStage] = useState<string>('');
  const [analyzeElapsed, setAnalyzeElapsed] = useState<number>(0);

  // Step 4 — Configure
  const [resolution, setResolution] = useState<Resolution>('1080');
  const [format, setFormat] = useState<Format>('mp4');
  const [platform, setPlatform] = useState<Platform>('reels');
  const [targetDuration, setTargetDuration] = useState<number>(30);
  const [generateSoundtrack, setGenerateSoundtrack] = useState<boolean>(false);
  const [hookText, setHookText] = useState<string>('');
  const [ctaText, setCtaText] = useState<string>('');
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
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

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

  const uploadReferenceFile = useCallback(async (file: File) => {
    if (!ALLOWED_MIME.has(file.type)) {
      setReferenceError('Supported types: MP4/MOV/AVI/WebM or JPG/PNG/WebP/GIF/HEIC/AVIF.');
      return;
    }
    setReferenceError(null);

    const kind = inferKindFromMime(file.type);
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
      },
    ]);

    try {
      const presignRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          kind: kind === 'image' ? 'reference-image' : 'reference-video',
        }),
      });
      if (!presignRes.ok) {
        const body = await presignRes.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to get presigned URL');
      }
      const { uploadUrl, key } = await presignRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            updateReference(id, { progress: Math.round((e.loaded / e.total) * 100) });
          }
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
      });

      updateReference(id, { status: 'ready', url: key, progress: 100 });
    } catch (err) {
      updateReference(id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  }, [updateReference]);

  const addReferenceUrl = useCallback(() => {
    const trimmed = pendingUrl.trim();
    if (!trimmed) return;
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
  }, [pendingUrl]);

  // ─── Step 2: Footage Upload ─────────────────────────────────────────────
  const uploadFootage = useCallback(async (file: File) => {
    if (!ALLOWED_MIME.has(file.type)) {
      setFootageError('Use MP4, MOV, AVI, or WebM.');
      return;
    }
    setFootageFile(file);
    setFootageError(null);
    setFootageUploadState('uploading');
    setFootageProgress(0);
    try {
      const presignRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (!presignRes.ok) throw new Error('Failed to get presigned URL');
      const { uploadUrl, key, editId: newEditId } = await presignRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setFootageProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
      });

      setFootageR2Key(key);
      setEditId(newEditId);
      setFootageUploadState('done');
      setFootageProgress(100);

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
      setFootageError(err instanceof Error ? err.message : 'Upload failed');
      setFootageUploadState('error');
    }
  }, [readyRefs]);

  // ─── Step 3: Style DNA analysis (real) ─────────────────────────────────
  useEffect(() => {
    if (step !== 'style' || analyzeState !== 'idle') return;
    if (readyRefs.length === 0) return;

    let cancelled = false;
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
      const stageTimer = setInterval(() => {
        stageIdx = Math.min(stageIdx + 1, stages.length - 1);
        if (!cancelled) setAnalyzeStage(stages[stageIdx]);
      }, 1500);

      try {
        // Weight each reference equally; videos drive temporal fields, images
        // contribute to color. (See analyzer.ts blendAnalyses for details.)
        const payload = readyRefs.map((r) => ({ url: r.url, type: r.kind }));
        const controller = new AbortController();
        // Server has a 60s hard cap plus a 40s per-reference fallback, so 75s
        // on the client should always outlive the server response. If we hit
        // this timeout, something is wedged at the network layer.
        const fetchTimeout = setTimeout(() => controller.abort(), 75_000);
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
          clearTimeout(fetchTimeout);
          if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
            throw new Error('Style DNA analysis timed out. Please try a shorter video or upload a smaller file.');
          }
          throw fetchErr;
        }
        clearTimeout(fetchTimeout);
        clearInterval(stageTimer);
        clearInterval(elapsedTimer);
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Analysis failed (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        setStyleDNA(data.styleDNA as AnalyzedStyleDNA);
        setAnalyzeStage('Style DNA captured');
        setAnalyzeState('done');
      } catch (err) {
        clearInterval(stageTimer);
        clearInterval(elapsedTimer);
        if (cancelled) return;
        setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed');
        setAnalyzeState('error');
      }
    };
    void run();
    return () => {
      cancelled = true;
      clearInterval(elapsedTimer);
    };
  }, [step, analyzeState, readyRefs]);

  // ─── Step 5: Render & poll ─────────────────────────────────────────────
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

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
      const res = await fetch(`/api/shotstack/status?jobId=${encodeURIComponent(jobId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Status check failed: ${res.status}`);
      }
      const data = await res.json();
      if (typeof data.progress === 'number') setRenderProgress(data.progress);

      if (data.status === 'completed') {
        setRenderState('completed');
        setOutputUrl(data.playbackUrl || null);
        stopPolling();
        return;
      }
      if (data.status === 'failed') {
        setRenderState('failed');
        setRenderError(data.error || 'Render failed');
        stopPolling();
        return;
      }
      pollTimer.current = setTimeout(() => pollStatus(jobId), 3000);
    } catch (err) {
      setRenderState('failed');
      setRenderError(err instanceof Error ? err.message : 'Status check failed');
      stopPolling();
    }
  }, [stopPolling]);

  const buildMatch = useCallback(async (captionsPayload?: unknown): Promise<{ ok: boolean; error?: string }> => {
    if (!editId || !styleDNA) {
      const msg = 'Style DNA missing — go back and run analysis';
      setMatchError(msg);
      return { ok: false, error: msg };
    }
    setMatchState('matching');
    setMatchError(null);
    try {
      const res = await fetch('/api/style-dna/match', {
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
            generateSoundtrack,
            referenceSoundtrackKey: generateSoundtrack && soundtrackR2Key ? soundtrackR2Key : undefined,
            captions: captionsPayload
              ? { transcription: captionsPayload, style: captionStyle }
              : undefined,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Match failed (${res.status})`);
      setMatchState('ready');
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Match failed';
      setMatchError(msg);
      setMatchState('error');
      return { ok: false, error: msg };
    }
  }, [editId, styleDNA, targetDuration, platform, format, resolution, hookText, ctaText, generateSoundtrack, soundtrackR2Key, captionStyle]);

  const transcribeForCaptions = useCallback(async (): Promise<unknown | null> => {
    if (!autoCaptions || !footageR2Key) return null;
    if (captionState === 'done' && captionTranscription) return captionTranscription;

    setCaptionState('transcribing');
    setCaptionError(null);
    try {
      const res = await fetch('/api/captions/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaUrl: footageR2Key }),
      });
      const data = await res.json();
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
  }, [autoCaptions, footageR2Key, captionState, captionTranscription]);

  const startRender = useCallback(async () => {
    if (!editId || !footageR2Key) {
      setRenderError('Upload footage before rendering.');
      return;
    }
    if (!styleDNA) {
      setRenderError('Style DNA is missing — go back and analyze the reference.');
      return;
    }
    setRenderState('submitting');
    setRenderError(null);
    setRenderProgress(0);

    try {
      // Optional: run Whisper transcription so the match step can layer in captions.
      const transcription = autoCaptions ? await transcribeForCaptions() : null;

      // Build the render config from Style DNA + source footage (server-side).
      const matched = await buildMatch(transcription ?? undefined);
      if (!matched.ok) {
        setRenderState('failed');
        setRenderError(matched.error || 'Failed to compose render plan');
        return;
      }

      const res = await fetch('/api/shotstack/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Render submit failed: ${res.status}`);

      setRenderJobId(data.jobId);
      setRenderState('processing');
      pollStatus(data.jobId);
    } catch (err) {
      setRenderState('failed');
      setRenderError(err instanceof Error ? err.message : 'Render failed');
    }
  }, [editId, footageR2Key, styleDNA, buildMatch, pollStatus, autoCaptions, transcribeForCaptions]);

  // ─── UI helpers ────────────────────────────────────────────────────────
  const canAdvance = (() => {
    switch (step) {
      case 'reference': return hasReadyRef;
      case 'footage':   return footageUploadState === 'done';
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
          <span className="font-medium text-a7-text text-sm sm:text-base truncate">New Edit</span>
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
        {strategyBrief && <EditorStrategyBanner brief={strategyBrief} />}
        {step === 'reference' && (
          <div className="w-full max-w-2xl">
            <h2 className="text-lg sm:text-xl font-bold mb-2 text-center text-a7-text break-words">Add Your References</h2>
            <p className="text-a7-text/40 text-xs sm:text-sm mb-6 sm:mb-8 text-center px-2">
              Drop in 3&ndash;4 reference videos and a couple mood-board images. A7 blends them into one Style DNA.
            </p>

            <ReferenceDropZone
              onFiles={(files) => files.forEach(uploadReferenceFile)}
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
                placeholder="https://www.instagram.com/reel/... or image URL"
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
            <h2 className="text-lg sm:text-xl font-bold mb-2 text-center text-a7-text break-words">Upload Your Footage</h2>
            <p className="text-a7-text/40 text-xs sm:text-sm mb-6 sm:mb-8 text-center px-2">
              Drop in the raw video you want edited.
            </p>

            <DropZone
              accept="video/*"
              file={footageFile}
              uploadState={footageUploadState}
              onFile={uploadFootage}
              progress={footageProgress}
            />

            {footageError && (
              <p className="mt-3 text-sm" style={{ color: '#E8B06A' }}>{footageError}</p>
            )}

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
                  <p className="text-a7-text/25 text-[10px] text-center mt-1">
                    {analyzeElapsed}s elapsed · auto-falls back at 40s
                  </p>
                )}

                {analyzeState === 'error' && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={() => setAnalyzeState('idle')}
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
                  { value: '4k', label: '4K' },
                ]}
              />
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
                <div className="flex gap-3 mt-6">
                  <a
                    href={outputUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={classNames(
                      'flex-1 py-3 rounded-md font-medium text-sm transition-all text-center',
                      !outputUrl && 'opacity-50 pointer-events-none'
                    )}
                    style={{
                      background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
                      border: '1px solid rgba(245,240,232,0.06)',
                      color: 'rgba(245,240,232,0.5)',
                    }}
                  >
                    Open
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
                      setRenderProgress(0);
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
      </main>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function DropZone({
  file,
  uploadState,
  onFile,
  progress,
  accept,
}: {
  file: File | null;
  uploadState: UploadState;
  onFile: (file: File) => void;
  progress?: number;
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
          <p className="text-a7-text/20 text-xs">MP4, MOV, AVI, WebM up to 2GB</p>
        </>
      )}

      {file && uploadState === 'uploading' && (
        <>
          <p className="text-a7-text text-sm mb-2 truncate">{file.name}</p>
          <div
            className="w-full rounded-full h-1.5 mb-2"
            style={{ background: 'linear-gradient(90deg, #1A1918, #10100E)' }}
          >
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${typeof progress === 'number' ? Math.max(progress, 3) : 50}%`,
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
              }}
            />
          </div>
          <p className="text-a7-text/30 text-xs">
            Uploading{typeof progress === 'number' ? ` ${progress}%` : '...'}
          </p>
        </>
      )}

      {file && uploadState === 'done' && (
        <>
          <p className="text-a7-text text-sm mb-1 truncate">{file.name}</p>
          <p className="text-grad-teal text-xs">Uploaded</p>
        </>
      )}

      {file && uploadState === 'error' && (
        <>
          <p className="text-a7-text text-sm mb-1 truncate">{file.name}</p>
          <p className="text-xs" style={{ color: '#E8B06A' }}>Upload failed &mdash; click to retry</p>
        </>
      )}
    </label>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-xs text-a7-text/40 mb-2 uppercase tracking-wider">{label}</div>
      {children}
    </div>
  );
}

function ReferenceDropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
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
        accept="video/*,image/*"
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
      <p className="text-a7-text/50 text-sm mb-1">Drop videos and images — or click to choose</p>
      <p className="text-a7-text/20 text-xs">MP4/MOV/WebM up to 2GB · JPG/PNG/WebP/HEIC/AVIF</p>
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
}: {
  item: ReferenceItem;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
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
        {!item.previewUrl && (
          <span className="text-[10px] uppercase tracking-wider text-a7-text/40">
            {item.kind === 'image' ? 'IMG' : 'VID'}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider"
            style={{
              background: item.kind === 'image' ? 'rgba(184,115,51,0.12)' : 'rgba(45,212,191,0.12)',
              color: item.kind === 'image' ? '#D4944A' : '#5BE8D5',
              border: `1px solid ${item.kind === 'image' ? 'rgba(184,115,51,0.25)' : 'rgba(45,212,191,0.25)'}`,
            }}
          >
            {item.kind}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-a7-text/30">
            {item.source}
          </span>
          {isReady && <span className="text-[10px] text-grad-teal">ready</span>}
          {isUploading && (
            <span className="text-[10px] text-a7-text/40">
              uploading {item.progress ?? 0}%
            </span>
          )}
          {isError && (
            <span className="text-[10px]" style={{ color: '#E8B06A' }}>
              {item.error || 'error'}
            </span>
          )}
        </div>
        <div className="text-xs text-a7-text/70 truncate">{item.label}</div>
        {isUploading && (
          <div
            className="mt-1 w-full h-1 rounded-full overflow-hidden"
            style={{ background: 'rgba(245,240,232,0.06)' }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.max(item.progress ?? 0, 5)}%`,
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
              }}
            />
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
  options: { value: T; label: string }[];
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
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 min-w-0 px-3 sm:px-4 py-2 rounded text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${active ? 'text-a7-void' : 'text-a7-text/50 hover:text-a7-text'}`}
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
        className="flex-1 py-3 rounded-md font-medium transition-all text-a7-void disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
          boxShadow: disabled ? 'none' : '0 0 20px rgba(45,212,191,0.25)',
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
