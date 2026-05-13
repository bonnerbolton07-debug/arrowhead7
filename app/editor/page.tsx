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

const ALLOWED_MIME = new Set(['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']);

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export default function EditorPage() {
  const strategyBrief = useStrategyBrief();
  const [step, setStep] = useState<Step>('reference');

  // Step 1 — Reference
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceUploadState, setReferenceUploadState] = useState<UploadState>('idle');
  const [referenceR2Key, setReferenceR2Key] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);

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

  // Step 5 — Render
  const [renderState, setRenderState] = useState<RenderState>('idle');
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  // ─── Step 1: Reference Upload ───────────────────────────────────────────
  const uploadReference = useCallback(async (file: File) => {
    if (!ALLOWED_MIME.has(file.type)) {
      setReferenceError('Use MP4, MOV, AVI, or WebM.');
      return;
    }
    setReferenceFile(file);
    setReferenceError(null);
    setReferenceUploadState('uploading');
    try {
      const presignRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (!presignRes.ok) throw new Error('Failed to get presigned URL');
      const { uploadUrl, key } = await presignRes.json();

      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error('Reference upload failed');

      setReferenceR2Key(key);
      setReferenceUploadState('done');
    } catch (err) {
      setReferenceError(err instanceof Error ? err.message : 'Upload failed');
      setReferenceUploadState('error');
    }
  }, []);

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
            reference_urls: referenceR2Key ? [referenceR2Key] : (referenceUrl ? [referenceUrl] : []),
          });
        }
      } catch {
        // Non-fatal — render route will still create what it needs.
      }
    } catch (err) {
      setFootageError(err instanceof Error ? err.message : 'Upload failed');
      setFootageUploadState('error');
    }
  }, [referenceR2Key, referenceUrl]);

  // ─── Step 3: Style DNA analysis (real) ─────────────────────────────────
  useEffect(() => {
    if (step !== 'style' || analyzeState !== 'idle') return;
    const reference = referenceR2Key || referenceUrl.trim();
    if (!reference) return;

    let cancelled = false;
    const run = async () => {
      setAnalyzeState('analyzing');
      setAnalyzeError(null);
      setAnalyzeStage('Resolving reference...');
      // Animate stage labels so the user sees progress while the server works.
      const stages = [
        'Resolving reference...',
        'Probing video metadata...',
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
        const res = await fetch('/api/style-dna/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            references: [{ url: reference }],
          }),
        });
        clearInterval(stageTimer);
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
        if (cancelled) return;
        setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed');
        setAnalyzeState('error');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [step, analyzeState, referenceR2Key, referenceUrl]);

  // ─── Step 5: Render & poll ─────────────────────────────────────────────
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

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

  const buildMatch = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
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
            referenceSoundtrackKey: generateSoundtrack && referenceR2Key ? referenceR2Key : undefined,
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
  }, [editId, styleDNA, targetDuration, platform, format, resolution, hookText, ctaText, generateSoundtrack, referenceR2Key]);

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
      // Build the render config from Style DNA + source footage.
      const matched = await buildMatch();
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
  }, [editId, footageR2Key, styleDNA, buildMatch, pollStatus]);

  // ─── UI helpers ────────────────────────────────────────────────────────
  const canAdvance = (() => {
    switch (step) {
      case 'reference': return Boolean(referenceR2Key) || referenceUrl.trim().length > 0;
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
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void flex flex-col">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(45,212,191,0.03) 0%, transparent 50%)' }}
      />

      <header className="relative flex items-center justify-between px-6 py-4 border-b border-a7-text/[0.04]">
        <div
          className="absolute bottom-0 left-6 right-6 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.12), rgba(184,115,51,0.08), transparent)' }}
        />
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="flex items-center gap-3 text-a7-text/40 hover:text-a7-text text-sm transition-colors">
            <LogoIcon size={24} variant="dual" />
            <span>&larr; Dashboard</span>
          </a>
          <span className="text-a7-text/10">|</span>
          <span className="font-medium text-a7-text">New Edit</span>
        </div>

        <div className="flex items-center gap-3">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full transition-all"
                style={
                  step === s.id
                    ? { background: 'linear-gradient(135deg, #2DD4BF, #5BE8D5)', boxShadow: '0 0 8px rgba(45,212,191,0.5)' }
                    : i < stepIndex
                    ? { background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)' }
                    : { background: 'rgba(245,240,232,0.1)' }
                }
              />
              <span className={`text-xs ${step === s.id ? 'text-a7-text' : 'text-a7-text/20'}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <div className="text-sm text-a7-text/40 w-[140px] text-right">
          {editId ? `Edit ${editId.slice(0, 8)}` : ''}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8 relative z-10">
        {strategyBrief && <EditorStrategyBanner brief={strategyBrief} />}
        {step === 'reference' && (
          <div className="w-full max-w-xl">
            <h2 className="text-xl font-bold mb-2 text-center text-a7-text">Upload a Reference</h2>
            <p className="text-a7-text/40 text-sm mb-8 text-center">
              Drop a video that defines the editing style you want.
            </p>

            <DropZone
              accept="video/*"
              file={referenceFile}
              uploadState={referenceUploadState}
              onFile={uploadReference}
            />

            <div className="my-6 flex items-center gap-3">
              <span className="flex-1 h-px bg-a7-text/[0.06]" />
              <span className="text-xs text-a7-text/30">or paste a URL</span>
              <span className="flex-1 h-px bg-a7-text/[0.06]" />
            </div>

            <input
              type="url"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="https://www.instagram.com/reel/..."
              className="w-full px-4 py-3 rounded-md text-sm bg-a7-base border border-a7-text/[0.08] text-a7-text placeholder:text-a7-text/20 focus:outline-none focus:border-grad-teal"
            />

            {referenceError && (
              <p className="mt-3 text-sm" style={{ color: '#E8B06A' }}>{referenceError}</p>
            )}

            <NavButtons onNext={next} onBack={null} disabled={!canAdvance} nextLabel="Continue" />
          </div>
        )}

        {step === 'footage' && (
          <div className="w-full max-w-xl">
            <h2 className="text-xl font-bold mb-2 text-center text-a7-text">Upload Your Footage</h2>
            <p className="text-a7-text/40 text-sm mb-8 text-center">
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
            <h2 className="text-xl font-bold mb-2 text-center text-a7-text">
              {analyzeState === 'done' ? 'Style DNA Captured' : 'Analyzing Style DNA'}
            </h2>
            <p className="text-a7-text/40 text-sm mb-8 text-center">
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
                      width: analyzeState === 'analyzing' ? '70%' : analyzeState === 'error' ? '100%' : '0%',
                      background: analyzeState === 'error'
                        ? 'linear-gradient(135deg, #E8B06A, #B87333)'
                        : 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                      boxShadow: '0 0 15px rgba(45,212,191,0.4)',
                    }}
                  />
                </div>
                <p className="text-a7-text/40 text-xs text-center">
                  {analyzeState === 'error'
                    ? `Analysis failed: ${analyzeError ?? 'unknown error'}`
                    : analyzeStage || 'Working...'}
                </p>

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
            <h2 className="text-xl font-bold mb-2 text-center text-a7-text">Render Settings</h2>
            <p className="text-a7-text/40 text-sm mb-8 text-center">
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
      className="relative overflow-hidden block border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all hover:scale-[1.005]"
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
      <svg viewBox="0 0 32 32" width="48" height="48" className="mx-auto mb-4">
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
      className="inline-flex rounded-md p-1 gap-1"
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
            className={`px-4 py-2 rounded text-sm font-medium transition-all ${active ? 'text-a7-void' : 'text-a7-text/50 hover:text-a7-text'}`}
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
