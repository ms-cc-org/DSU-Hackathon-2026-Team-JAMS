'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { CROP_NAME, CROP_TITLE } from '@/lib/constants';
import { FIRST_DAY, LAST_DAY, LAST_OBSERVED_DAY, clampDay, dateOf, dayOf, formatDay, isPredictedDay, isoDay, parseTypedDate, seasonProgress, seasonYearOf } from '@/lib/daily';
import { seasonDays } from '@/lib/storms';
import { useExplorer, useReducedMotion } from './explorer-context';
import { PauseIcon, PlayIcon } from './icons';

/** Pixels per day at the needle. */
const PX = 6;
const HEIGHT = 64;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK0 = dayOf(2000, 1, 4); // first Drought Monitor map

/**
 * The date dial: a wheel of days. Drag, swipe or scroll it and the map follows day by day; it coasts, then
 * settles on a whole day. Bars show the share of counties in severe drought each week; the green band is the
 * selected crop's growing season.
 */
export default function Timeline() {
  const { s, bundle, dispatch } = useExplorer();
  const reduced = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const pos = useRef(s.day); // the (fractional) day under the needle
  const sent = useRef(s.day); // the last day the app was told about
  const vel = useRef(0); // days per ms while coasting
  const target = useRef<number | null>(null); // where an outside change asks the dial to turn to
  const drag = useRef<{ x: number; time: number } | null>(null);
  const frame = useRef(0);
  const last = useRef(0);
  const look = useRef({ ink: '#14201A', muted: '#66716A', tick: '#C3CBC4', bar: '#EB6834', band: '#008300', pred: '#7B4FD1', font: 'system-ui' });
  const crop = useRef(s.crop);

  const share = useMemo(() => {
    const cs = bundle.counties.filter(c => c.wkc && s.states.includes(c.s));
    const out = new Float32Array(bundle.nWeeks);
    for (const c of cs) for (let w = 0; w < bundle.nWeeks; w++) if (Number(c.wkc![2 * w]) >= 3) out[w]++;
    return out.map(v => v / (cs.length || 1));
  }, [bundle, s.states]);
  const shareRef = useRef(share);

  const draw = () => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = HEIGHT;
    if (el.width !== Math.round(w * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const c = look.current, mid = w / 2, radius = w / 2 / 1.2, p = pos.current;
    const span = Math.ceil((radius * Math.PI) / 2 / PX), base = 30;
    let seasonCache = { year: -1, from: 0, to: -1 };
    for (let d = Math.floor(p - span); d <= Math.ceil(p + span); d++) {
      if (d < FIRST_DAY || d > LAST_DAY) continue;
      const arc = ((d - p) * PX) / radius;
      if (Math.abs(arc) >= Math.PI / 2) continue;
      // Days bunch up toward the edges, as on a wheel seen from the side.
      const x = mid + radius * Math.sin(arc), next = mid + radius * Math.sin(Math.min(Math.PI / 2, arc + PX / radius));
      const width = Math.max(0.6, next - x), fade = Math.cos(arc);
      ctx.globalAlpha = 0.2 + 0.8 * fade;
      // Predicted dates (after the records end) sit on a tinted band, with a marker where predictions begin
      if (d > LAST_OBSERVED_DAY) {
        ctx.fillStyle = c.pred;
        ctx.globalAlpha *= 0.12;
        ctx.fillRect(x, 0, width + 0.3, h);
        ctx.globalAlpha = 0.2 + 0.8 * fade;
        if (d === LAST_OBSERVED_DAY + 1) {
          ctx.fillStyle = c.pred;
          ctx.fillRect(x - 1, 0, 2, h);
          ctx.font = `800 10px ${c.font}`;
          ctx.fillText('PREDICTED →', x + 5, 10);
        }
      }
      const sy = seasonYearOf(d, crop.current);
      if (sy !== seasonCache.year) { const [from, to] = seasonDays(crop.current, sy); seasonCache = { year: sy, from, to }; }
      if (d >= seasonCache.from && d <= seasonCache.to) {
        ctx.fillStyle = c.band;
        ctx.globalAlpha *= 0.35;
        ctx.fillRect(x, base, width, 6);
        ctx.globalAlpha = 0.2 + 0.8 * fade;
      }
      const wk = Math.floor((d - WEEK0) / 7), sh = wk >= 0 ? shareRef.current[wk] ?? 0 : 0;
      if (sh > 0.01) { ctx.fillStyle = c.bar; ctx.fillRect(x, base - 2 - sh * 24, width + 0.3, sh * 24); }
      const date = dateOf(d), day = date.getUTCDate(), month = date.getUTCMonth();
      const isYear = month === 0 && day === 1;
      ctx.fillStyle = isYear ? c.ink : c.tick;
      ctx.fillRect(x - 0.5, base, 1, isYear ? 24 : day === 1 ? 15 : date.getUTCDay() === 1 ? 8 : 4);
      if (day === 1) {
        ctx.fillStyle = isYear ? c.ink : c.muted;
        ctx.font = `${isYear ? 800 : 600} ${isYear ? 14 : 11}px ${c.font}`;
        ctx.fillText(isYear ? String(date.getUTCFullYear()) : MONTHS[month], x + 4, base + 26);
      }
    }
    ctx.globalAlpha = 1;
  };

  const publish = () => {
    const d = clampDay(pos.current);
    if (target.current == null && d !== sent.current) {
      sent.current = d;
      dispatch({ type: 'day', day: d });
    }
  };

  const loop = (now: number) => {
    frame.current = 0;
    const dt = last.current ? Math.min(48, now - last.current) : 16;
    last.current = now;
    let again = !!drag.current;
    if (!drag.current) {
      if (Math.abs(vel.current) > 0.0005) {
        pos.current = Math.max(FIRST_DAY, Math.min(LAST_DAY, pos.current + vel.current * dt));
        vel.current *= Math.pow(0.92, dt / 16);
        again = true;
      } else if (target.current != null) {
        const diff = target.current - pos.current;
        if (Math.abs(diff) < 0.02) { pos.current = target.current; target.current = null; } else { pos.current += diff * Math.min(1, dt / 90); again = true; }
      } else {
        const diff = Math.round(pos.current) - pos.current;
        if (Math.abs(diff) > 0.01) { pos.current += diff * Math.min(1, dt / 70); again = true; } else pos.current = Math.round(pos.current);
      }
    }
    publish();
    draw();
    if (again) frame.current = requestAnimationFrame(loop);
    else last.current = 0;
  };
  const kick = () => { if (!frame.current) frame.current = requestAnimationFrame(loop); };

  // Colors and font follow the page theme.
  useEffect(() => {
    const read = () => {
      const css = getComputedStyle(document.documentElement);
      const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      look.current = { ink: v('--ink', '#14201A'), muted: v('--muted', '#66716A'), tick: v('--line-2', '#C3CBC4'), bar: v('--bar-drought', '#EB6834'), band: v('--cat-crops', '#008300'), pred: v('--cat-storms', '#7B4FD1'), font: getComputedStyle(document.body).fontFamily };
      draw();
    };
    read();
    const dark = matchMedia('(prefers-color-scheme: dark)');
    dark.addEventListener('change', read);
    const resize = new ResizeObserver(() => draw());
    if (canvas.current) resize.observe(canvas.current);
    // A wheel or two-finger swipe over the dial turns it instead of scrolling or navigating the page.
    const el = canvas.current;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      vel.current = 0;
      target.current = null;
      pos.current = Math.max(FIRST_DAY, Math.min(LAST_DAY, pos.current + (delta / PX) * 0.6));
      kick();
    };
    el?.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      dark.removeEventListener('change', read);
      resize.disconnect();
      el?.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    // draw and kick only touch refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw when the crop's season band or the drought bars change.
  useEffect(() => {
    crop.current = s.crop;
    shareRef.current = share;
    draw();
     
  }, [s.crop, share]);

  // Follow changes made elsewhere: Play, a chart click, a shared link.
  useEffect(() => {
    if (s.day === sent.current) return;
    sent.current = s.day;
    if (drag.current) return;
    vel.current = 0;
    if (reduced || s.playing || Math.abs(s.day - pos.current) > 120) { pos.current = s.day; target.current = null; draw(); }
    else { target.current = s.day; kick(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.day]);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, time: performance.now() };
    vel.current = 0;
    target.current = null;
    kick();
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const now = performance.now(), dx = e.clientX - drag.current.x, dt = Math.max(1, now - drag.current.time);
    pos.current = Math.max(FIRST_DAY, Math.min(LAST_DAY, pos.current - dx / PX));
    vel.current = 0.7 * vel.current + 0.3 * (-dx / PX / dt);
    drag.current = { x: e.clientX, time: now };
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    if (performance.now() - drag.current.time > 80) vel.current = 0; // released after pausing: no coasting
    drag.current = null;
    kick();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const by: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -30, PageDown: 30 };
    let day: number | null = null;
    if (by[e.key] != null) day = s.day + by[e.key] * (e.shiftKey && Math.abs(by[e.key]) === 1 ? 7 : 1);
    if (e.key === 'Home') day = FIRST_DAY;
    if (e.key === 'End') day = LAST_DAY;
    if (day == null) return;
    e.preventDefault();
    dispatch({ type: 'day', day: clampDay(day) });
  };

  // Typing a date: inside the records it moves the dial; after them it opens Predict, where forecasts will live.
  const router = useRouter();
  const [typing, setTyping] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const startTyping = () => { setTyping(formatDay(s.day)); setTypeError(null); };
  const stopTyping = () => { setTyping(null); setTypeError(null); };
  const goToTyped = (e: FormEvent) => {
    e.preventDefault();
    const day = parseTypedDate(typing ?? '', s.day);
    if (day == null) return setTypeError('Type a date like 7/15/2012 or July 15, 2012.');
    if (day < FIRST_DAY) return setTypeError(`The records start on ${formatDay(FIRST_DAY)}.`);
    if (day > LAST_DAY) return router.push(`/predict?date=${isoDay(day)}`);
    dispatch({ type: 'day', day });
    stopTyping();
  };

  const progress = seasonProgress(s.day, s.crop);
  return (
    <footer className="timeline">
      <div className="tl-in">
        <button className="play" onClick={() => dispatch({ type: 'play', on: !s.playing })} aria-label={s.playing ? 'Pause' : 'Play day by day'}>
          {s.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="tl-year">
          {typing == null ? (
            <button type="button" className="tl-date" onClick={startTyping} title="Type a date" aria-label={`Date: ${formatDay(s.day)}. Click to type a date.`}>
              {formatDay(s.day)}
            </button>
          ) : (
            <form className="tl-type" onSubmit={goToTyped}>
              <input
                className="tl-date-input" value={typing} autoFocus onFocus={e => e.target.select()}
                aria-label="Type a date, then press Enter" placeholder="7/15/2012" aria-invalid={!!typeError} aria-describedby={typeError ? 'tl-type-error' : undefined}
                onChange={e => { setTyping(e.target.value); setTypeError(null); }}
                onKeyDown={e => { if (e.key === 'Escape') stopTyping(); }}
                onBlur={() => { if (!typeError) stopTyping(); }}
              />
              {typeError && <p id="tl-type-error" className="tl-type-error" role="alert">{typeError}</p>}
            </form>
          )}
          {typing == null && isPredictedDay(s.day) && <span className="tl-pred">Predicted</span>}
          <span>{CROP_TITLE[s.crop]}: {progress.label.toLowerCase()}</span>
        </div>
        <div
          className="dial-wrap"
          role="slider"
          tabIndex={0}
          aria-label="Date"
          aria-valuemin={FIRST_DAY}
          aria-valuemax={LAST_DAY}
          aria-valuenow={s.day}
          aria-valuetext={formatDay(s.day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          onKeyDown={onKeyDown}
        >
          <canvas
            ref={canvas}
            className="dial-canvas"
            style={{ height: HEIGHT }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <span className="dial-needle" aria-hidden="true" />
        </div>
        <div className="tl-note">
          <span><i />Counties in severe drought that week</span>
          <span><i className="band" />{CROP_TITLE[s.crop]} growing season ({CROP_NAME[s.crop]})</span>
        </div>
      </div>
    </footer>
  );
}
