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

/** ~8MB per part — large enough that the TCP window opens fully, small enough
 *  that a flaky-network retry is cheap. R2's max part count is 10000 so this
 *  comfortably covers files up to ~80GB. */
const MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;

/** How many parts to PUT concurrently. 4 is the sweet spot on most mobile
 *  carriers — beyond that the per-flow gains diminish and HoL on shared
 *  cellular links can actually slow individual chunks. */
const MULTIPART_CONCURRENCY = 4;

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
}

export interface UploadOptions extends UploadKind {
  onProgress?: (progress: UploadProgress) => void;
  /** Optional AbortSignal — cancels the upload and aborts the multipart on R2. */
  signal?: AbortSignal;
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
  // 1. Create the upload on R2 via our backend.
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
  const { uploadId, key, editId } = await createRes.json();

  // 2. Slice the file into parts and PUT them concurrently.
  const totalParts = Math.ceil(file.size / MULTIPART_PART_SIZE_BYTES);
  const partProgress = new Array<number>(totalParts).fill(0);
  const reportProgress = () => {
    if (!opts.onProgress) return;
    let loaded = 0;
    let partsCompleted = 0;
    for (let i = 0; i < totalParts; i++) {
      const partSize = i === totalParts - 1
        ? file.size - i * MULTIPART_PART_SIZE_BYTES
        : MULTIPART_PART_SIZE_BYTES;
      loaded += (partProgress[i] / 100) * partSize;
      if (partProgress[i] >= 100) partsCompleted++;
    }
    opts.onProgress({
      pct: Math.min(99, Math.round((loaded / file.size) * 100)),
      loadedBytes: Math.min(file.size, Math.round(loaded)),
      totalBytes: file.size,
      partsCompleted,
      totalParts,
      mode: 'multipart',
    });
  };

  const completed: Array<{ partNumber: number; etag: string }> = [];
  const queue = Array.from({ length: totalParts }, (_, i) => i + 1);

  const uploadPart = async (partNumber: number): Promise<void> => {
    const start = (partNumber - 1) * MULTIPART_PART_SIZE_BYTES;
    const end = Math.min(file.size, start + MULTIPART_PART_SIZE_BYTES);
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

    const etag = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      // S3 servers return the ETag in a header — must expose via CORS.
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          partProgress[partNumber - 1] = Math.round((e.loaded / e.total) * 100);
          reportProgress();
        }
      };
      xhr.onload = () => {
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
          reject(new Error(`Part ${partNumber} failed: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error(`Part ${partNumber} network error`));
      xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (opts.signal) {
        const onAbort = () => xhr.abort();
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener('abort', onAbort, { once: true });
      }
      xhr.send(blob);
    });
    completed.push({ partNumber, etag });
  };

  try {
    // Run a small worker pool over the queue. Order doesn't matter — parts are
    // identified by number on the server side.
    const worker = async () => {
      while (queue.length > 0) {
        const partNumber = queue.shift();
        if (partNumber === undefined) return;
        await uploadPart(partNumber);
      }
    };
    const workers = Array.from(
      { length: Math.min(MULTIPART_CONCURRENCY, totalParts) },
      () => worker()
    );
    await Promise.all(workers);

    // 3. Complete.
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
      });
    }
    return { key, editId };
  } catch (err) {
    // Best-effort abort so R2 doesn't keep the partial parts around.
    fetch('/api/upload/multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'abort', key, uploadId }),
    }).catch(() => undefined);
    throw err;
  }
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
