import { Router, Request, Response } from 'express';

const router = Router();

/* ── Simple in-memory rate limiter: 5 requests per IP per minute ──────────── */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (bucket.count >= 5) {
    return false;
  }

  bucket.count += 1;
  return true;
};

// Periodically clean up stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (now > bucket.resetAt) {
      rateBuckets.delete(ip);
    }
  }
}, 5 * 60_000);

/* ── GET /audit?url=... ───────────────────────────────────────────────────── */
router.get('/', async (req: Request, res: Response) => {
  const clientIp = (req.ip || req.socket.remoteAddress || 'unknown') as string;

  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
  }

  let targetUrl = (req.query.url as string) || '';

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing required query parameter: url' });
  }

  // Add https:// if no protocol is provided
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  // Validate URL format
  try {
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    const startTime = Date.now();

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'DXMPulse-Audit/1.0',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      signal: AbortSignal.timeout(15_000),
    });

    const ttfbMs = Date.now() - startTime;

    const body = await response.text();

    // Check for mobile-ready viewport meta tag
    const mobileReady = /<meta[^>]*name=["']viewport["'][^>]*>/i.test(body);

    // Calculate page size
    const contentLength = response.headers.get('content-length');
    const pageSizeBytes = contentLength ? parseInt(contentLength, 10) : Buffer.byteLength(body, 'utf-8');
    const pageSizeKb = Math.round(pageSizeBytes / 1024);

    // Compute overall score
    let score: 'good' | 'needs-work' | 'poor';
    if (ttfbMs < 1000 && mobileReady) {
      score = 'good';
    } else if (ttfbMs < 3000) {
      score = 'needs-work';
    } else {
      score = 'poor';
    }

    return res.json({
      url: targetUrl,
      ttfbMs,
      mobileReady,
      pageSizeKb,
      score,
    });
  } catch (err) {
    return res.status(502).json({ error: 'Unable to reach the target URL' });
  }
});

export default router;
