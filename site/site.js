// VOID WING landing page: clips that play while on screen, and the flight recorder.
(function () {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colour = { friend: 'var(--friend)', foe: 'var(--foe)', objective: 'var(--objective)', warn: 'var(--warn)', good: 'var(--good)' };
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  // ---------- hero ----------
  const hero = document.getElementById('hero-video');
  const toggle = document.getElementById('hero-toggle');
  function setHero(play) {
    if (play) hero.play().catch(() => setHero(false));
    else hero.pause();
    toggle.textContent = play ? 'Pause video' : 'Play video';
    toggle.setAttribute('aria-pressed', String(!play));
  }
  toggle.addEventListener('click', () => setHero(hero.paused));
  setHero(!reduced);

  // ---------- mission clips: play while at least a third is on screen ----------
  const clips = [...document.querySelectorAll('video[data-inview]')];
  if (reduced) {
    for (const v of clips) v.controls = true;
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target;
        if (e.isIntersecting) {
          if (v.preload === 'none') v.preload = 'auto';
          v.play().catch(() => { v.controls = true; });
        } else v.pause();
      }
    }, { threshold: 0.35 });
    for (const v of clips) io.observe(v);
  }

  // ---------- flight recorder ----------
  const run = document.getElementById('run');
  const marksEl = document.getElementById('track-marks');
  const fill = document.getElementById('track-fill');
  const now = document.getElementById('now');
  fetch('media/chapters.json').then((r) => r.json()).then((data) => {
    // Times on the mission timeline.
    for (const li of document.querySelectorAll('.stop[data-mark]')) {
      const m = data.marks[li.dataset.mark];
      if (m == null) continue;
      const time = li.querySelector('.stop-time');
      time.textContent = mmss(m);
      time.setAttribute('aria-label', `${mmss(m)} into the run`);
      li.querySelector('.who')?.setAttribute('data-time', mmss(m));
    }
    const dur = data.duration;
    const ticks = data.recorder.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tick';
      b.style.left = `${(c.t / dur) * 100}%`;
      // Labels near the ends open inward so they stay on screen.
      if (c.t / dur > 0.8) b.classList.add('edge-r');
      else if (c.t / dur < 0.2) b.classList.add('edge-l');
      b.style.setProperty('--c', colour[c.kind] || 'var(--ink)');
      b.style.color = colour[c.kind] || 'var(--ink)';
      b.innerHTML = `<span>${mmss(c.t)} ${c.label}</span>`;
      b.setAttribute('aria-label', `Jump to ${mmss(c.t)}: ${c.label}`);
      b.addEventListener('click', () => {
        if (run.preload === 'none') run.preload = 'auto';
        run.currentTime = Math.max(0, c.t - 1.5);
        run.play().catch(() => undefined);
      });
      marksEl.appendChild(b);
      return { c, b };
    });
    let last; // undefined, so the first update always writes the hint
    const update = () => {
      const t = run.currentTime || 0;
      fill.style.width = `${Math.min(100, (t / dur) * 100)}%`;
      let cur = null;
      for (const k of ticks) if (k.c.t <= t + 0.05) cur = k;
      if (cur !== last) {
        last?.b.classList.remove('is-now');
        cur?.b.classList.add('is-now');
        last = cur;
        if (cur) {
          now.style.setProperty('--c', colour[cur.c.kind] || 'var(--ink)');
          now.innerHTML = `<b>${cur.c.label}</b> at ${mmss(cur.c.t)}. ${cur.c.note || ''}`;
        } else now.textContent = 'Pick a marker on the flight recorder to jump to that moment.';
      }
    };
    run.addEventListener('timeupdate', update);
    run.addEventListener('seeked', update);
    update();
  }).catch(() => { /* The page still works without the chapter data: the video has its own controls. */ });
})();
