(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const screens = {
    players: $('#screen-players'),
    topic: $('#screen-topic'),
    scoring: $('#screen-scoring'),
    game: $('#screen-game'),
  };

  function showScreen(key){
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[key].classList.add('active');
  }

  // UI refs
  const btnStart = $('#btn-start');
  const countdownEl = $('#countdown');
  const targetShapeEl = $('#target-shape');
  const stageShapeEl = $('#stage-shape');
  const resultsEl = $('#results');
  const resultsList = $('#results-list');
  const btnNext = $('#btn-next');
  const btnAgain = $('#btn-again');
  const hintEl = $('#hint');
  const overlayBlock = $('#overlay-block');

  const roundNumEl = $('#round-num');
  const modeNameEl = $('#mode-name');

  const cornerBtns = [$('#p1'), $('#p2'), $('#p3'), $('#p4')];
  const scoreEls   = [$('#score1'), $('#score2'), $('#score3'), $('#score4')];

  const playerMeta = [
    { id: 1, name: 'Modrý',   color: '#60a5fa' },
    { id: 2, name: 'Zelený', color: '#22c55e' },
    { id: 3, name: 'Červený',color: '#f43f5e' },
    { id: 4, name: 'Žlutý',  color: '#f59e0b' },
  ];

  const state = {
    players: 4,
    scoring: 'classic',
    round: 1,
    scores: [0,0,0,0],

    // per-round
    targetShape: null,
    running: false,
    accepting: false,
    targetOn: false,
    targetStartTs: 0,
    tapped: [false,false,false,false],
    disq:   [false,false,false,false],
    rt:     [null,null,null,null],
    shapeTimer: null,
    stageTimer: null,
    lastStageShape: null,
  };

  const SHAPES = [
    { key: 'circle',   label: 'Kruh' },
    { key: 'square',   label: 'Čtverec' },
    { key: 'rect',     label: 'Obdélník' },
    { key: 'triangle', label: 'Trojúhelník' },
  ];

  function randInt(min, max){
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function pick(arr){
    return arr[randInt(0, arr.length-1)];
  }

  function setShape(el, shapeKey){
    el.classList.remove('hidden');
    el.innerHTML = '';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');

    const stroke = 'rgba(255,255,255,.92)';
    const fill   = 'rgba(255,255,255,.12)';
    const sw     = 8;

    const defs = document.createElementNS(svgNS, 'defs');
    const grad = document.createElementNS(svgNS, 'linearGradient');
    grad.setAttribute('id','grad');
    grad.setAttribute('x1','0'); grad.setAttribute('y1','0');
    grad.setAttribute('x2','1'); grad.setAttribute('y2','1');
    const s1 = document.createElementNS(svgNS, 'stop');
    s1.setAttribute('offset','0%'); s1.setAttribute('stop-color','rgba(255,255,255,.12)');
    const s2 = document.createElementNS(svgNS, 'stop');
    s2.setAttribute('offset','100%'); s2.setAttribute('stop-color','rgba(255,255,255,0)');
    grad.appendChild(s1); grad.appendChild(s2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    const add = (node) => svg.appendChild(node);

    if (shapeKey === 'circle'){
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx','60'); c.setAttribute('cy','60'); c.setAttribute('r','42');
      c.setAttribute('fill', fill);
      c.setAttribute('stroke', stroke);
      c.setAttribute('stroke-width', String(sw));
      add(c);
    } else if (shapeKey === 'square'){
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x','22'); r.setAttribute('y','22');
      r.setAttribute('width','76'); r.setAttribute('height','76');
      r.setAttribute('rx','10');
      r.setAttribute('fill', fill);
      r.setAttribute('stroke', stroke);
      r.setAttribute('stroke-width', String(sw));
      add(r);
    } else if (shapeKey === 'rect'){
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x','14'); r.setAttribute('y','34');
      r.setAttribute('width','92'); r.setAttribute('height','52');
      r.setAttribute('rx','10');
      r.setAttribute('fill', fill);
      r.setAttribute('stroke', stroke);
      r.setAttribute('stroke-width', String(sw));
      add(r);
    } else if (shapeKey === 'triangle'){
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d','M60 18 L104 96 L16 96 Z');
      p.setAttribute('fill', fill);
      p.setAttribute('stroke', stroke);
      p.setAttribute('stroke-width', String(sw));
      p.setAttribute('stroke-linejoin','round');
      add(p);
    }

    const overlay = document.createElementNS(svgNS, 'rect');
    overlay.setAttribute('x','0'); overlay.setAttribute('y','0');
    overlay.setAttribute('width','120'); overlay.setAttribute('height','120');
    overlay.setAttribute('fill','url(#grad)');
    add(overlay);

    el.appendChild(svg);
  }

  function clearShape(el){
    el.classList.add('hidden');
    el.innerHTML = '';
  }

  function setPlayers(n){
    state.players = n;
    cornerBtns.forEach((btn, idx) => {
      btn.classList.toggle('inactive', idx >= n);
    });
  }

  function setScoring(mode){
    state.scoring = mode;
    modeNameEl.textContent =
      mode === 'classic' ? 'Klasické' :
      mode === '3210' ? '3–2–1–0' : 'Podle času';
  }

  function updateScoresUI(){
    for (let i=0;i<4;i++) scoreEls[i].textContent = String(state.scores[i] ?? 0);
  }

  function lockGameplay(lock){
    overlayBlock.classList.toggle('hidden', !lock);
  }

  function cleanupRound(){
    state.running = false;
    state.accepting = false;
    state.targetOn = false;
    state.targetStartTs = 0;
    state.tapped = [false,false,false,false];
    state.disq   = [false,false,false,false];
    state.rt     = [null,null,null,null];

    if (state.shapeTimer) clearTimeout(state.shapeTimer);
    if (state.stageTimer) clearTimeout(state.stageTimer);
    state.shapeTimer = null;
    state.stageTimer = null;

    clearShape(targetShapeEl);
    clearShape(stageShapeEl);

    resultsEl.classList.add('hidden');
    btnStart.disabled = false;
    btnStart.classList.remove('hidden');
    countdownEl.classList.add('hidden');
    hintEl.classList.remove('hidden');
    lockGameplay(false);
  }

  function startRound(){
    if (state.running) return;
    cleanupRound();
    state.running = true;

    btnStart.disabled = true;
    hintEl.classList.add('hidden');

    state.targetShape = pick(SHAPES).key;

    countdownEl.textContent = '3';
    countdownEl.classList.remove('hidden');

    let c = 3;
    const tick = () => {
      if (!state.running) return;
      countdownEl.textContent = String(c);
      if (c === 0){
        countdownEl.classList.add('hidden');
        showTargetThenGo();
        return;
      }
      c--;
      setTimeout(tick, 1000);
    };

    setTimeout(() => { c = 2; tick(); }, 1000);
  }

  function showTargetThenGo(){
    setShape(targetShapeEl, state.targetShape);
    state.targetOn = true;

    state.shapeTimer = setTimeout(() => {
      clearShape(targetShapeEl);
      state.targetOn = false;
      runStageLoop();
    }, 2000);
  }

  function runStageLoop(){
    state.accepting = true;

    const loop = () => {
      if (!state.running) return;

      let shape = pick(SHAPES).key;
      if (shape === state.lastStageShape) shape = pick(SHAPES).key;
      state.lastStageShape = shape;

      setShape(stageShapeEl, shape);

      const dur = randInt(1000, 2000);

      if (shape === state.targetShape){
        state.targetOn = true;
        state.targetStartTs = performance.now();
        state.stageTimer = setTimeout(() => {
          state.targetOn = false;
          endRound();
        }, dur);
      } else {
        state.targetOn = false;
        state.stageTimer = setTimeout(loop, dur);
      }
    };

    loop();
  }

  function endRound(){
    state.accepting = false;
    state.running = false;

    if (state.stageTimer) clearTimeout(state.stageTimer);
    state.stageTimer = null;

    lockGameplay(true);
    setTimeout(showResultsAndScore, 250);
  }

  function recordTap(playerIdx){
    if (playerIdx >= state.players) return;
    if (!state.accepting) return;
    if (state.tapped[playerIdx]) return;

    state.tapped[playerIdx] = true;

    if (!state.targetOn || !state.targetStartTs){
      // špatný tvar
      state.disq[playerIdx] = true;
      state.rt[playerIdx] = null;
      return;
    }

    const rt = Math.max(0, performance.now() - state.targetStartTs);
    state.rt[playerIdx] = rt;

    // Pokud už všichni stihli (validně nebo falešně), můžeme skončit hned.
    let allDone = true;
    for (let i=0;i<state.players;i++){
      if (!state.tapped[i] && !state.disq[i]){ allDone = false; break; }
    }
    if (allDone) endRound();
  }

  function computeRanking(){
    const entries = [];
    for (let i=0;i<state.players;i++){
      const meta = playerMeta[i];
      const isDisq = !!state.disq[i];
      const hasRT = typeof state.rt[i] === 'number';
      const tapped = !!state.tapped[i];

      let status = '';
      if (isDisq) status = 'Falešný start (špatný tvar)';
      else if (!tapped) status = 'Bez reakce';
      else if (hasRT) status = `${state.rt[i].toFixed(0)} ms`;
      else status = '—';

      entries.push({
        idx: i,
        name: meta.name,
        color: meta.color,
        disq: isDisq,
        tapped,
        rt: hasRT ? state.rt[i] : null,
        status,
        points: 0,
      });
    }

    const valids = entries.filter(e => !e.disq && e.rt !== null).sort((a,b)=>a.rt-b.rt);
    const noResp = entries.filter(e => !e.disq && e.rt === null).sort((a,b)=>a.idx-b.idx);
    const disq   = entries.filter(e => e.disq).sort((a,b)=>a.idx-b.idx);

    return [...valids, ...noResp, ...disq];
  }

  function awardPoints(ranking){
    const valids = ranking.filter(e => !e.disq && e.rt !== null);

    if (state.scoring === 'classic'){
      if (valids.length > 0) valids[0].points = 1;
    } else if (state.scoring === '3210'){
      const pts = [3,2,1,0];
      for (let i=0;i<valids.length;i++) valids[i].points = pts[i] ?? 0;
    } else if (state.scoring === 'time'){
      if (valids.length > 0){
        const tFast = valids[0].rt;
        for (const e of valids){
          const raw = 10 * (tFast / e.rt);
          e.points = Math.max(0, Math.round(raw));
        }
      }
    }

    for (const e of ranking) state.scores[e.idx] += (e.points || 0);
  }

  function showResultsAndScore(){
    clearShape(stageShapeEl);

    const ranking = computeRanking();
    awardPoints(ranking);
    updateScoresUI();

    resultsList.innerHTML = '';
    ranking.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'result-row';

      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.style.background = e.color;
      badge.textContent = String(i+1);

      const mid = document.createElement('div');
      const title = document.createElement('div');
      title.style.fontWeight = '900';
      title.textContent = e.name;
      const sub = document.createElement('div');
      sub.className = 'small';
      sub.textContent = e.status;
      mid.appendChild(title);
      mid.appendChild(sub);

      const pts = document.createElement('div');
      pts.className = 'points';
      pts.textContent = `+${e.points || 0}`;

      row.appendChild(badge);
      row.appendChild(mid);
      row.appendChild(pts);

      resultsList.appendChild(row);
    });

    resultsEl.classList.remove('hidden');
    btnStart.classList.add('hidden');
  }

  function nextRound(){
    state.round += 1;
    roundNumEl.textContent = String(state.round);
    cleanupRound();
  }

  function againRound(){
    cleanupRound();
  }

  function resetAll(){
    state.round = 1;
    state.scores = [0,0,0,0];
    updateScoresUI();
    cleanupRound();
    showScreen('players');
  }

  // Navigation wiring
  $$('#screen-players button[data-players]').forEach(btn => {
    btn.addEventListener('click', () => {
      setPlayers(Number(btn.dataset.players));
      showScreen('topic');
    });
  });

  $('#back-to-players').addEventListener('click', () => showScreen('players'));
  $('#topic-shapes').addEventListener('click', () => showScreen('scoring'));
  $('#back-to-topic').addEventListener('click', () => showScreen('topic'));

  $('#go-to-game').addEventListener('click', () => {
    const checked = $('input[name="scoring"]:checked');
    setScoring(checked ? checked.value : 'classic');
    roundNumEl.textContent = String(state.round);
    updateScoresUI();
    showScreen('game');
  });

  $$('input[name="scoring"]').forEach(r => r.addEventListener('change', () => setScoring(r.value)));

  // Game controls
  btnStart.addEventListener('click', startRound);
  btnNext.addEventListener('click', nextRound);
  btnAgain.addEventListener('click', againRound);
  $('#btn-reset').addEventListener('click', resetAll);

  // Corner taps
  cornerBtns.forEach((btn, idx) => {
    const onTap = (ev) => {
      ev.preventDefault();
      recordTap(idx);
    };
    btn.addEventListener('pointerdown', onTap, { passive:false });
    btn.addEventListener('click', onTap, { passive:false });
  });

  // Prevent double-tap zoom (mobile)
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch <= 300) e.preventDefault();
    lastTouch = now;
  }, { passive:false });

  // Service worker
  if ('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(()=>{});
    });
  }

  // Init
  setPlayers(4);
  setScoring('classic');
  updateScoresUI();
  showScreen('players');
})();
