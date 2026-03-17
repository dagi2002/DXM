import { z } from 'zod';

const sdkEventSchema = z.object({
  type: z.string(),
  ts: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  depth: z.number().optional(),
  pct: z.number().optional(),
  url: z.string().optional(),
  target: z.string().max(120).optional(),
  name: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  event: z.string().optional(),
  userId: z.string().max(64).optional(),
  data: z.any().optional(),
}).passthrough();

export const collectSchema = z.object({
  sessionId: z.string().min(1).max(64),
  siteId: z.string().min(1).max(64),
  events: z.array(sdkEventSchema).max(500),
  metadata: z.object({
    url: z.string().optional(),
    userAgent: z.string().optional(),
    language: z.string().optional(),
    screen: z.object({ width: z.number(), height: z.number() }).optional(),
    viewport: z.object({ width: z.number(), height: z.number() }).optional(),
  }).optional(),
});

export const collectReplaySchema = z.object({
  sessionId: z.string().min(1).max(64),
  siteId: z.string().min(1).max(64),
  replayEvents: z.array(z.any()).max(100),
  chunkIndex: z.number().int().min(0),
});

export type CollectInput = z.infer<typeof collectSchema>;
