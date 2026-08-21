import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Camera } from "lucide-react";
import {
  SLIDES, SLIDE_MS, nextSlide, prevSlide, reachedAfter, isMounted, slideLabel, slideAlt,
} from "./lib/slides.js";

/* ---------------------------------------------------------
   THE SLIDE SHOW OF PARTS — used twice.

   Behind the staff login board before anybody signs in, and full size on the way
   in afterwards. The pictures and the turning rules live in src/lib/slides.js;
   this file is only how they are drawn.

   IT COSTS ONE PICTURE AT A TIME. Every slide is stacked in the same box and
   faded between, but a slide is only put in the page once the show reaches it —
   an <img> in the page is downloaded even at zero opacity, so mounting all
   eleven at once would spend a megabyte of somebody's bundle on the login
   screen. Slides already reached stay in the page, so the second lap is free.
--------------------------------------------------------- */

/* The turning. Returned rather than built into a screen so the login board can
   run the same show behind its own wording. */
export function useSlideshow(count, { ms = SLIDE_MS, paused = false } = {}) {
  const [at, setAt] = useState(0);
  const [reached, setReached] = useState(0);

  /* Deliberately keyed on `at`: every move — the clock's or a thumb's — starts
     the wait again, so tapping forward does not leave a half-second slide
     behind it. */
  useEffect(() => {
    if (paused || count < 2 || ms <= 0) return;
    const t = setTimeout(() => setAt((i) => nextSlide(i, count)), ms);
    return () => clearTimeout(t);
  }, [at, count, ms, paused]);

  useEffect(() => { setReached((r) => reachedAfter(r, at)); }, [at]);

  const go = useCallback((i) => setAt(() => (i >= 0 && i < count ? i : 0)), [count]);
  const next = useCallback(() => setAt((i) => nextSlide(i, count)), [count]);
  const back = useCallback(() => setAt((i) => prevSlide(i, count)), [count]);

  return { at, reached, go, next, back };
}

/* The stack of photographs, and nothing else — no wording, no buttons. The two
   screens put their own furniture on top. */
export function SlidePictures({ slides, at, reached, decorative = false, className = "" }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {slides.map((s, i) =>
        isMounted(i, reached) ? (
          <img
            key={s.image}
            src={s.image}
            alt={decorative ? "" : slideAlt(s)}
            aria-hidden={decorative ? "true" : undefined}
            className="bp-slide absolute inset-0 w-full h-full object-cover"
            style={{ opacity: i === at ? 1 : 0 }}
          />
        ) : null
      )}
    </div>
  );
}

/* The full show, for the way in after a login: one big photograph, what it is,
   arrows for a thumb that will not wait, and a dot per slide. */
export default function SlideShow({ slides = SLIDES, ms = SLIDE_MS }) {
  const { at, reached, go, next, back } = useSlideshow(slides.length, { ms });
  const slide = slides[at] || slides[0];

  return (
    <div>
      {/* 5:3, the shape every picture in public/ads is cut to, so none of them
          is ever cropped a second time by the box it lands in. */}
      <div className="relative w-full rounded-2xl overflow-hidden ring-1 ring-white/15 shadow-2xl bg-[#0B1220]"
           style={{ aspectRatio: "5 / 3" }}>
        <SlidePictures slides={slides} at={at} reached={reached} />

        {/* Enough shade at the foot to read white words over a white bumper. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(7,11,18,0.94) 0%, rgba(7,11,18,0.35) 42%, rgba(7,11,18,0) 72%)" }}
        />

        <button
          type="button"
          onClick={back}
          aria-label="Previous picture"
          className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur ring-1 ring-white/20 active:scale-95 transition"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Next picture"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur ring-1 ring-white/20 active:scale-95 transition"
        >
          <ChevronRight size={20} />
        </button>

        {/* The caption is keyed on the slide so it re-enters with each picture
            rather than the words changing under a still photograph. */}
        <div key={slide?.image} className="bp-fade-up absolute inset-x-0 bottom-0 p-4 sm:p-5">
          {slide?.car ? (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#06B6D4]/25 ring-1 ring-[#67E8F9]/50 px-2.5 py-1 mb-2">
              <span className="text-[#A5F3FC] text-[10px] font-bold uppercase tracking-[0.18em]">
                {slide.car}
              </span>
            </div>
          ) : null}
          <div className="text-white font-extrabold text-lg sm:text-xl leading-tight drop-shadow">
            {slide?.part}
          </div>
          <div className="text-[#BFDBFE] text-xs sm:text-[13px] mt-1 leading-snug">{slide?.sub}</div>
        </div>
      </div>

      {/* A dot per slide, tappable, and the count in words for anybody who cannot
          see which dot is lit. */}
      <div className="flex items-center justify-center gap-1.5 mt-3.5" aria-label="Pictures of parts">
        {slides.map((s, i) => (
          <button
            key={s.image}
            type="button"
            aria-current={i === at ? "true" : undefined}
            aria-label={slideLabel(s)}
            onClick={() => go(i)}
            className={`rounded-full transition-all ${
              i === at ? "w-6 h-1.5 bg-[#67E8F9]" : "w-1.5 h-1.5 bg-white/30 hover:bg-white/60"
            }`}
          />
        ))}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[#6F8299] text-[11px] text-center mt-3 leading-relaxed px-4">
        <Camera size={12} className="shrink-0" />
        <span>
          Pictures of the kinds of parts we deal in — {slides.length} of them. A part's
          own photograph is the one added under Edit Parts.
        </span>
      </p>
    </div>
  );
}
