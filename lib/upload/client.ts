// =============================================================================
// Arrowhead 7 — Client-side upload helpers
// =============================================================================
// Two big-win primitives for "supercharging" uploads from the browser:
//
//   1. uploadToR2() — picks single-PUT for small files, parallel multipart
//      for big ones. Multipart drives multiple TCP connections in parallel,
//      which is the actual bottleneck on mobile uploads (single-stream
//      throughput is capped well below the link speed by TCP CC + per-flow
//      mobile-carrier QoS).
//   2. maybeCompressImage() — for image references, downscale to a 2048px
//      bounding box and re-encode as a quality-0.85 JPEG/WebP via a canvas
//      before upload. A 6MB iPhone HEIC becomes a ~250KB JPEG. Skipped for
//      formats the browser can't decode (HEIC on non-Apple browsers, AVIF on
//      older browsers) — those go through as-is.
//
// All progress is reported via the optional onProgress callback (0–100).

/** Threshold above which we switch from single-PUT to multipart. R2's minimum
 *  part size is 5MB, so any multipart needs at least 2 parts ≈ 10MB. 25MB is
 *  the smallest threshold that gives us 5 parts (worthwhile parallelism). */
const MULTIPART_THRESHOLD_BYTES = 25 * 1024 * 1024;

/** Per-part sizes. Mobile networks see "Part N network error" much more often
 *  on large chunks because each chunk is a longer-lived TCP connection more
 *  vulnerable to a single packet loss → retransmit storm → carrier reset.
 *  Smaller chunks mean less wasted bandwidth when a part has to be retried. */
const DESKTOP_PART_SIZE_BYTES = 8 * 1024 * 1024;
const MOBILE_PART_SIZE_BYTES = 4 * 1024 * 1024;

/** Initial concurrent-part count. Reduced under failure pressure — see
 *  `concurrencyCap` in uploadMultipart. */
const DESKTOP_INITIAL_CONCURRENCY = 4;
const MOBILE_INITIAL_CONCURRENCY = 3;

/** A part is retried up to (PART_MAX_ATTEMPTS − 1) times before it's surfaced
 *  as a hard failure. Backoff between attempts: 1s, 2s, 4s. */
const PART_MAX_ATTEMPTS = 4;
const PART_BACKOFF_BASE_MS = 1000;

/** Stall window: if the upload makes no progress for this long, abort + retry.
 *  Catches the "TCP connection holds open with zero bytes flowing" case that
 *  cellular networks do all the time when handing off between towers. */
const STALL_TIMEOUT_MS = 15_000;

/** Detect whether we're on a mobile device. We default to safer settings
 *  (smaller chunks, lower concurrency) whenever the answer is yes. */
function isMobileEnvironment(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Mobi|iPhone|iPad|iPod|Android/i.test(ua)) return true;
  if (typeof window !== 'undefined' && window.innerWidth < 768) return true;
  return false;
}

/** Hard wall-clock cap on a single part PUT. 30s per 4MB, 60s per 8MB, scaled
 *  linearly with a 120s ceiling so giant final parts still get enough time.
 *  This is the backstop — the stall detector should always fire first. */
function partHardTimeoutMs(sizeBytes: number): number {
  return Math.min(120_000, Math.max(30_000, Math.round((sizeBytes / DESKTOP_PART_SIZE_BYTES) * 60_000)));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

export interface UploadKind {
  kind?: 'reference-image' | 'source';
}

export interface UploadResult {
  key: string;
  editId: string;
}

/**
 * Progress callback payload. Richer than just a percentage so the UI can
 * surface bytes-transferred + multipart-aware status text (e.g. "Part 2/4").
 */
export interface UploadProgress {
  /** 0–100, rounded. Never reaches 100 until the final commit succeeds. */
  pct: number;
  /** Bytes uploaded so far (aggregate across parts for multipart). */
  loadedBytes: number;
  /** Total bytes to upload. */
  totalBytes: number;
  /** For multipart: number of parts fully PUT so far. Undefined for single-PUT. */
  partsCompleted?: number;
  /** For multipart: total parts the file was split into. Undefined for single-PUT. */
  totalParts?: number;
  /** 'single' for a one-shot PUT, 'multipart' for parallel-part uploads. */
  mode: 'single' | 'multipart';
  /** When > 1, indicates we're retrying one or more parts (e.g. attempt 2 of 4
   *  on Part 3). UI shows "Retrying part 3 (attempt 2)…". */
  retryingAttempt?: number;
  /** Current concurrency in flight. Surfaced so the UI can explain a slowdown
   *  ("Slow network — reducing to 1 part at a time"). */
  currentConcurrency?: number;
}

/**
 * Snapshot of an in-progress multipart upload. Captured after every successful
 * part so the UI can resume from a hard failure without re-uploading bytes
 * that already made it to R2. Pass via `opts.resumeFrom` to continue.
 */
export interface UploadResumeState {
  key: string;
  uploadId: string;
  totalParts: number;
  partSizeBytes: number;
  /** Etags for parts that completed successfully so far. */
  completedParts: Array<{ partNumber: number; etag: string }>;
  /** Original file size — used to validate the user re-selects the same file. */
  fileSize: number;
  fileName: string;
}

export interface UploadOptions extends UploadKind {
  onProgress?: (progress: UploadProgress) => void;
  /** Optional AbortSignal — cancels the upload and aborts the multipart on R2. */
  signal?: AbortSignal;
  /** Resume an in-progress multipart upload instead of starting fresh. The
   *  caller is responsible for passing the SAME File the original upload was
   *  using — uploadToR2 validates sizes match before resuming. */
  resumeFrom?: UploadResumeState;
  /** Called after every successful part finishes. Caller persists the state
   *  to React state / localStorage so a hard failure leaves a resume point. */
  onResumeStateChange?: (state: UploadResumeState) => void;
}

/**
 * Upload a file to R2. Automatically chooses single-PUT vs parallel multipart
 * based on file size.
 */
export async function uploadToR2(file: File, opts: UploadOptions = {}): Promise<UploadResult> {
  if (file.size > MULTIPART_THRESHOLD_BYTES) {
    return uploadMultipart(file, opts);
  }
  return uploadSingle(file, opts);
}

// ─── Single-PUT (small files) ────────────────────────────────────────────────

async function uploadSingle(file: File, opts: UploadOptions): Promise<UploadResult> {
  const presignRes = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      kind: opts.kind === 'reference-image' ? 'reference-image' : undefined,
    }),
    signal: opts.signal,
  });
  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to get presigned URL');
  }
  const { uploadUrl, key, editId } = await presignRes.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
        opts.onProgress({
          pct,
          loadedBytes: e.loaded,
          totalBytes: e.total,
          mode: 'single',
        });
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (opts.signal) {
      const onAbort = () => xhr.abort();
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    xhr.send(file);
  });

  if (opts.onProgress) {
    opts.onProgress({
      pct: 100,
      loadedBytes: file.size,
      totalBytes: file.size,
      mode: 'single',
    });
  }
  return { key, editId };
}

// ─── Multipart (large files) ─────────────────────────────────────────────────

async function uploadMultipart(file: File, opts: UploadOptions): Promise<UploadResult> {
  const mobile = isMobileEnvironment();

  // 0. Decide whether to start fresh or resume an existing upload. We never
  //    abort the multipart on a hard failure — the caller hangs on to the
  //    UploadResumeState and we pick up where we left off when the user retries.
  let key: string;
  let uploadId: string;
  let editId: string;
  let partSizeBytes: number;
  let totalParts: number;
  const completed: Array<{ partNumber: number; etag: string }> = [];

  if (opts.resumeFrom) {
    if (opts.resumeFrom.fileSize !== file.size) {
      throw new Error('Resume failed: selected file size doesn\'t match the original upload');
    }
    key = opts.resumeFrom.key;
    uploadId = opts.resumeFrom.uploadId;
    editId = opts.resumeFrom.key.split('/')[2] ?? '';
    partSizeBytes = opts.resumeFrom.partSizeBytes;
    totalParts = opts.resumeFrom.totalParts;
    completed.push(...opts.resumeFrom.completedParts);
  } else {
    const createRes = await fetch('/api/upload/multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        filename: file.name,
        contentType: file.type,
        kind: opts.kind === 'reference-image' ? 'reference-image' : undefined,
      }),
      signal: opts.signal,
    });
    if (!createRes.ok) {
      const body = await createRes.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to create multipart upload');
    }
    const created = await createRes.json();
    key = created.key;
    uploadId = created.uploadId;
    editId = created.editId;
    partSizeBytes = mobile ? MOBILE_PART_SIZE_BYTES : DESKTOP_PART_SIZE_BYTES;
    totalParts = Math.ceil(file.size / partSizeBytes);
  }

  // 1. Adaptive concurrency. Starts at the platform default, drops by 1 every
  //    time a part exhausts a retry attempt (down to 1). New parts respect the
  //    current cap; parts already in flight are not killed.
  let concurrencyCap = mobile ? MOBILE_INITIAL_CONCURRENCY : DESKTOP_INITIAL_CONCURRENCY;
  let activeWorkers = 0;
  let retryingAttempts = 0; // max retry attempt currently in flight across parts

  const downshiftConcurrency = () => {
    if (concurrencyCap > 1) {
      concurrencyCap = Math.max(1, concurrencyCap - 1);
    }
  };

  // 2. Progress aggregation across all parts (including resumed ones).
  const partProgress = new Array<number>(totalParts).fill(0);
  for (const c of completed) partProgress[c.partNumber - 1] = 100;

  const partSizeFor = (i: number): number =>
    i === totalParts - 1 ? file.size - i * partSizeBytes : partSizeBytes;

  const reportProgress = () => {
    if (!opts.onProgress) return;
    let loaded = 0;
    let partsCompleted = 0;
    for (let i = 0; i < totalParts; i++) {
      loaded += (partProgress[i] / 100) * partSizeFor(i);
      if (partProgress[i] >= 100) partsCompleted++;
    }
    opts.onProgress({
      pct: Math.min(99, Math.round((loaded / file.size) * 100)),
      loadedBytes: Math.min(file.size, Math.round(loaded)),
      totalBytes: file.size,
      partsCompleted,
      totalParts,
      mode: 'multipart',
      retryingAttempt: retryingAttempts > 0 ? retryingAttempts + 1 : undefined,
      currentConcurrency: concurrencyCap,
    });
  };

  // 3. Single-part PUT primitive: signs the URL, PUTs the bytes, watches for
  //    stalls + hard timeout, returns the ETag. Throws on any failure — the
  //    retry wrapper above decides whether to try again.
  const putOnePart = async (partNumber: number): Promise<string> => {
    const start = (partNumber - 1) * partSizeBytes;
    const end = Math.min(file.size, start + partSizeBytes);
    const blob = file.slice(start, end);

    const signRes = await fetch('/api/upload/multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sign', key, uploadId, partNumber }),
      signal: opts.signal,
    });
    if (!signRes.ok) {
      const body = await signRes.json().catch(() => ({}));
      throw new Error(body.error || `Failed to sign part ${partNumber}`);
    }
    const { url } = await signRes.json();

    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);

      // Stall detector: aborts the XHR if no progress for STALL_TIMEOUT_MS.
      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      const resetStall = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          // Mark this as a stall, not a generic abort, so the retry layer
          // doesn't treat it as a user-cancel.
          stalled = true;
          try { xhr.abort(); } catch { /* ignore */ }
        }, STALL_TIMEOUT_MS);
      };
      let stalled = false;
      resetStall();

      // Hard cap on the entire part — backstop in case the stall detector
      // misses something pathological.
      const hardTimer = setTimeout(() => {
        stalled = true;
        try { xhr.abort(); } catch { /* ignore */ }
      }, partHardTimeoutMs(blob.size));

      // Cancel from the outer AbortSignal cleanly forwards to xhr.abort.
      const outerSignal = opts.signal;
      const onOuterAbort = () => {
        try { xhr.abort(); } catch { /* ignore */ }
      };
      if (outerSignal) {
        if (outerSignal.aborted) onOuterAbort();
        else outerSignal.addEventListener('abort', onOuterAbort, { once: true });
      }

      const cleanup = () => {
        if (stallTimer) clearTimeout(stallTimer);
        clearTimeout(hardTimer);
        outerSignal?.removeEventListener('abort', onOuterAbort);
      };

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          resetStall();
          partProgress[partNumber - 1] = Math.round((e.loaded / e.total) * 100);
          reportProgress();
        }
      };
      xhr.onload = () => {
        cleanup();
        if (xhr.status >= 200 && xhr.status < 300) {
          const tag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag');
          if (!tag) {
            reject(new Error(`Part ${partNumber}: missing ETag header (check R2 CORS)`));
            return;
          }
          partProgress[partNumber - 1] = 100;
          reportProgress();
          resolve(tag.replace(/"/g, ''));
        } else {
          reject(new Error(`Part ${partNumber} HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => {
        cleanup();
        reject(new Error(`Part ${partNumber} network error`));
      };
      xhr.onabort = () => {
        cleanup();
        // Outer-signal cancel → bubble up as AbortError; stall → bubble up as
        // a retryable "stalled" error.
        if (outerSignal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
        } else if (stalled) {
          reject(new Error(`Part ${partNumber} stalled (no progress for ${STALL_TIMEOUT_MS / 1000}s)`));
        } else {
          reject(new DOMException('Aborted', 'AbortError'));
        }
      };
      xhr.send(blob);
    });
  };

  // 4. Retry wrapper: 1 initial attempt + up to 3 retries with exponential
  //    backoff. Each failed attempt also downshifts the concurrency cap so a
  //    flaky network ratchets us toward a serial-mode upload.
  const uploadPartWithRetry = async (partNumber: number): Promise<{ partNumber: number; etag: string }> => {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= PART_MAX_ATTEMPTS; attempt++) {
      if (opts.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (attempt > 1) {
        retryingAttempts = Math.max(retryingAttempts, attempt - 1);
        reportProgress();
        // 1s, 2s, 4s — capped at 8s for safety.
        const backoffMs = Math.min(8_000, PART_BACKOFF_BASE_MS * Math.pow(2, attempt - 2));
        await sleep(backoffMs, opts.signal);
        // Reset progress for this part so the UI doesn't show a stuck % while
        // we're re-uploading the same chunk.
        partProgress[partNumber - 1] = 0;
        reportProgress();
      }
      try {
        const etag = await putOnePart(partNumber);
        retryingAttempts = Math.max(0, retryingAttempts - 1);
        return { partNumber, etag };
      } catch (err) {
        // User-initiated abort is not retryable.
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        lastErr = err;
        // First failure on this part downshifts concurrency — by the time
        // we've burned 3 retries on a single part the cap is at the floor.
        downshiftConcurrency();
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`Part ${partNumber} failed after ${PART_MAX_ATTEMPTS} attempts`);
  };

  // 5. Build the queue of parts that still need uploading.
  const queue: number[] = [];
  for (let i = 1; i <= totalParts; i++) {
    if (!completed.some((c) => c.partNumber === i)) queue.push(i);
  }
  reportProgress(); // initial paint (might already show partial progress from resume)

  // 6. Worker pool. Honours the dynamic concurrency cap — workers that finish
  //    a part check the current cap and exit if they're now over the limit.
  let fatalError: unknown = null;

  const worker = async () => {
    try {
      while (queue.length > 0) {
        if (fatalError) return;
        if (opts.signal?.aborted) return;
        // If the cap dropped while we were uploading, retire this worker.
        if (activeWorkers > concurrencyCap) return;
        const partNumber = queue.shift();
        if (partNumber === undefined) return;
        try {
          const result = await uploadPartWithRetry(partNumber);
          completed.push(result);
          // Persist resume state after every successful part.
          opts.onResumeStateChange?.({
            key,
            uploadId,
            totalParts,
            partSizeBytes,
            completedParts: completed.slice(),
            fileSize: file.size,
            fileName: file.name,
          });
        } catch (err) {
          // Abort signals cascade out as-is. Hard failures (retries exhausted)
          // surface to the catch below — we DON'T abort the multipart, so the
          // user can retry from this resume state.
          if (err instanceof DOMException && err.name === 'AbortError') {
            fatalError = err;
          } else if (!fatalError) {
            fatalError = err;
          }
          return;
        }
      }
    } finally {
      activeWorkers--;
    }
  };

  // 7. Spin up the initial worker pool. We launch up to concurrencyCap workers
  //    even though the cap can shrink — workers exit themselves when they see
  //    activeWorkers > cap.
  const initialPoolSize = Math.min(concurrencyCap, queue.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < initialPoolSize; i++) {
    activeWorkers++;
    workers.push(worker());
  }
  await Promise.all(workers);

  if (fatalError) {
    // DO NOT abort the multipart upload on R2. Keep the parts that succeeded
    // alive so the user can retry from the resume state. R2's multipart
    // uploads expire after 24h by default — plenty of time for a retry.
    throw fatalError instanceof Error ? fatalError : new Error('Multipart upload failed');
  }

  // 8. Complete.
  const completeRes = await fetch('/api/upload/multipart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'complete', key, uploadId, parts: completed }),
    signal: opts.signal,
  });
  if (!completeRes.ok) {
    const body = await completeRes.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to complete multipart upload');
  }
  if (opts.onProgress) {
    opts.onProgress({
      pct: 100,
      loadedBytes: file.size,
      totalBytes: file.size,
      partsCompleted: totalParts,
      totalParts,
      mode: 'multipart',
      currentConcurrency: concurrencyCap,
    });
  }
  return { key, editId };
}

// ─── Image compression (mood-board references) ───────────────────────────────

/** Formats we know we can decode with HTMLImageElement on every browser. */
const BROWSER_DECODABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Bounding-box dimension. Style DNA only samples 64×64 frames so anything
 *  larger than ~2K is wasted bandwidth. */
const MAX_DIMENSION = 2048;

/** Re-encode at this quality. 0.85 is the conventional sweet spot for JPEG —
 *  visually lossless on photographic content, ~10× smaller than the source. */
const ENCODE_QUALITY = 0.85;

/**
 * Best-effort: shrink and re-encode an image to a JPEG/WebP if the original
 * is large and the browser can decode it. Returns the original file when
 * compression would be useless or unsafe (small file, undecodable format,
 * canvas tainted, etc.) — never throws.
 */
export async function maybeCompressImage(file: File): Promise<File> {
  if (!BROWSER_DECODABLE.has(file.type)) return file;
  // Don't bother for tiny files — the encode round-trip eats the savings.
  if (file.size < 400 * 1024) return file;

  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      // No resize needed and file is already moderately small — pass through.
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    // Prefer WebP (smaller, supported in every modern browser); fall back to JPEG.
    const tryWebP = file.type !== 'image/gif';
    const outType = tryWebP ? 'image/webp' : 'image/jpeg';
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), outType, ENCODE_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    const newName = renameForCompression(file.name, outType);
    return new File([blob], newName, { type: outType, lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap is dramatically faster than going via <img> when it's
  // available, and avoids the GC pressure of an HTMLImageElement.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renameForCompression(name: string, mime: string): string {
  const ext = mime === 'image/webp' ? 'webp' : 'jpg';
  const base = name.replace(/\.[^.]+$/, '');
  return `${base}.${ext}`;
}
