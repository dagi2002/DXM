/**
 * The real session-replay player (rrweb Replayer). Loaded lazily by the replay page, so rrweb and
 * its stylesheet never ship in the main bundle. The recording plays inside rrweb's sandboxed
 * iframe: recorded scripts never run, and text and inputs arrive already masked by the SDK.
 */
import type { ReplayDetail } from '@pulse/contracts';
import { Replayer } from '@rrweb/replay';
import '@rrweb/replay/dist/style.css';
import { IconButton, cx } from '@pulse/ui';
import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtClock } from '../lib/replays';

type RrEvent = { type: number; timestamp: number };

/** Fetches every chunk (gzip'd JSON) and returns the events in time order. */
async function loadEvents(detail: ReplayDetail, signal: AbortSignal): Promise<RrEvent[]> {
  const parts = await Promise.all(
    detail.chunks.map(async (c) => {
      const res = await fetch(c.url, { credentials: 'include', signal });
      if (!res.ok || !res.body) throw new Error(`chunk ${c.seq}: ${res.status}`);
      const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
      return JSON.parse(text) as RrEvent[];
    }),
  );
  return parts.flat().sort((a, b) => a.timestamp - b.timestamp);
}

export interface ReplayPlayerProps {
  detail: ReplayDetail;
  /** Offset (ms) to jump to; change `seek.n` to jump again to the same place. */
  seek?: { at: number; n: number };
}

export default function ReplayPlayer({ detail, seek }: ReplayPlayerProps) {
  const { t } = useTranslation();
  const stage = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const replayer = useRef<Replayer | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [total, setTotal] = useState(Math.max(0, detail.endTs - detail.startTs));
  const [speed, setSpeed] = useState(1);
  const [skipIdle, setSkipIdle] = useState(true);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [scale, setScale] = useState(1);

  // Load the chunks and build the replayer.
  useEffect(() => {
    const ctrl = new AbortController();
    let r: Replayer | null = null;
    setState('loading');
    loadEvents(detail, ctrl.signal)
      .then((events) => {
        if (ctrl.signal.aborted || !host.current) return;
        if (events.length < 2) throw new Error('empty');
        host.current.replaceChildren();
        r = new Replayer(events as never, {
          root: host.current,
          skipInactive: true,
          mouseTail: false,
          showWarning: false,
          triggerFocus: false,
          UNSAFE_replayCanvas: false,
        });
        r.on('resize', (d) => setViewport(d as { width: number; height: number }));
        r.on('finish', () => setPlaying(false));
        const meta = r.getMetaData();
        setTotal(meta.totalTime);
        replayer.current = r;
        r.pause(0);
        setState('ready');
      })
      .catch(() => !ctrl.signal.aborted && setState('error'));
    return () => {
      ctrl.abort();
      r?.pause();
      r?.destroy();
      replayer.current = null;
    };
  }, [detail]);

  // Fit the recorded viewport into the stage.
  useEffect(() => {
    const el = stage.current;
    if (!el || !viewport) return;
    const fit = () =>
      setScale(Math.min(1, (el.clientWidth - 32) / viewport.width, (el.clientHeight - 32) / viewport.height));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewport]);

  // Clock while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const r = replayer.current;
      if (r) setNow(Math.min(r.getCurrentTime(), total));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  const goTo = (at: number, play = playing) => {
    const r = replayer.current;
    if (!r) return;
    const clamped = Math.max(0, Math.min(at, total));
    setNow(clamped);
    if (play) r.play(clamped);
    else r.pause(clamped);
  };

  // External seeks ("Play from the moment", clicking a timeline row).
  useEffect(() => {
    if (seek && state === 'ready') {
      goTo(seek.at, true);
      setPlaying(true);
    }
  }, [seek?.n, state]);

  useEffect(() => replayer.current?.setConfig({ speed }), [speed]);
  useEffect(() => replayer.current?.setConfig({ skipInactive: skipIdle }), [skipIdle]);

  const toggle = () => {
    if (state !== 'ready') return;
    if (playing) {
      replayer.current?.pause();
      setPlaying(false);
    } else {
      goTo(now >= total ? 0 : now, true);
      setPlaying(true);
    }
  };

  const frac = (ms: number) => (total > 0 ? Math.min(1, Math.max(0, ms / total)) : 0);

  return (
    <section
      aria-label={t('replay.player')}
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface text-text"
    >
      {/* The recording keeps its own viewport size; it is positioned absolutely and scaled, so it
          never widens the page layout (a 1440px recording on a phone included). */}
      <div ref={stage} className="relative h-[32rem] overflow-hidden bg-surface-sunken">
        <div
          aria-hidden="true"
          style={
            viewport
              ? {
                  width: viewport.width,
                  height: viewport.height,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                }
              : undefined
          }
          className="absolute top-1/2 left-1/2 origin-center overflow-hidden rounded-md bg-surface shadow-sm"
        >
          <div ref={host} />
        </div>
        {state !== 'ready' ? (
          <p
            role="status"
            className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm text-text-muted"
          >
            {state === 'loading' ? t('replay.loading') : t('replay.loadFailed')}
          </p>
        ) : null}
        <span className="absolute top-4 right-4 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted">
          {t('replay.masked')}
        </span>
      </div>
      <div className="grid gap-3 px-4 pt-3.5 pb-4 sm:px-5">
        <div className="relative h-6">
          <div aria-hidden="true" className="absolute inset-x-0 top-2.5 h-1 rounded-full bg-border" />
          <div
            aria-hidden="true"
            className="absolute top-2.5 left-0 h-1 rounded-full bg-primary"
            style={{ width: `calc(${frac(now)} * 100%)` }}
          />
          {detail.marks
            .filter((m) => m.type === 'pv' && m.at > 0)
            .map((m, i) => (
              <div
                key={`p${i}`}
                aria-hidden="true"
                className="absolute top-3 h-2.5 w-0.5 bg-text-faint"
                style={{ left: `calc(${frac(m.at)} * 100%)` }}
              />
            ))}
          {detail.marks
            .filter((m) => m.friction)
            .map((m, i) => (
              <div
                key={`f${i}`}
                aria-hidden="true"
                className="absolute top-1.5 size-3 -translate-x-1/2 rounded-full border-2 border-surface bg-bad"
                style={{ left: `calc(${frac(m.at)} * 100%)` }}
              />
            ))}
          <input
            type="range"
            min={0}
            max={Math.max(1, total)}
            step={100}
            value={now}
            disabled={state !== 'ready'}
            onChange={(e) => goTo(Number(e.target.value))}
            aria-label={t('replay.seek')}
            aria-valuetext={t('replay.timeline', { at: fmtClock(now), total: fmtClock(total) })}
            className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-default"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <IconButton
            label={playing ? t('replay.pause') : t('replay.play')}
            onPress={toggle}
            isDisabled={state !== 'ready'}
            className="rounded-full bg-primary !text-on-primary data-[hovered]:bg-primary-hover"
          >
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          </IconButton>
          <span className="text-sm tabular-nums" data-testid="replay-clock">
            {fmtClock(now)} / {fmtClock(total)}
          </span>
          <button
            type="button"
            onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
            aria-label={t('replay.speed', { speed: `${speed}×` })}
            className="min-h-11 min-w-11 rounded-md border border-border-strong px-2.5 text-[0.8125rem] outline-none hover:bg-surface-sunken focus-visible:outline-3 focus-visible:outline-primary"
          >
            {speed}×
          </button>
          <label className="flex min-h-11 items-center gap-2 text-[0.8125rem]">
            <input
              type="checkbox"
              checked={skipIdle}
              onChange={(e) => setSkipIdle(e.target.checked)}
              className="size-4.5 accent-primary"
            />
            {t('replay.skipIdle')}
          </label>
          <span className={cx('ml-auto flex items-center gap-1.5 text-[0.8125rem] text-text-muted')}>
            <span aria-hidden="true" className="size-2.5 rounded-full bg-bad" />
            {t('replay.friction')}
          </span>
        </div>
      </div>
    </section>
  );
}
