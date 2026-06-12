/**
 * POST /ask — Ask Pulse natural-language query endpoint.
 *
 * Thin wrapper around `askPulse()`. Auth required. No caching — answers are
 * question-specific and data changes minute-to-minute.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { askPulse, type AskPulseLang } from '../services/ai/askPulse.js';

const router = Router();
router.use(requireAuth);

const askSchema = z.object({
  question: z.string().trim().min(3).max(500),
  lang: z.enum(['en', 'am']).optional(),
});

router.post('/', validate(askSchema), async (req, res) => {
  const { question, lang } = req.body as { question: string; lang?: AskPulseLang };
  try {
    const result = await askPulse(req.user!.workspaceId, question, lang ?? 'en');
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: 'Ask Pulse failed unexpectedly',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
