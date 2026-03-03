/* Reakční doba – v3.3
   Změny:
   - Start po kliknutí zmizí (pro zbytek hry už není potřeba).
   - Režim "Podle času" = soutěž na nejnižší PRŮMĚRNÝ čas:
       * nepřidělují se žádné body (všichni 0)
       * celkové pořadí po 10 kolech se řadí podle průměru (nejnižší vyhrává)
   - Režim "Klasické" (1 bod jen nejrychlejší):
       * pozadí se zbarví do barvy vítěze okamžitě při jeho správném stisku (nečeká se na ostatní)
   - Tlačítko hráče při dotyku zesvětlá, ale čas se počítá od prvního dotyku.
*/
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const TOTAL_ROUNDS = 10;

  // Screens
  const screens = {
    players: $('#screen-players'),
    topic: $('#screen-topic'),
    scoring: $('#screen-scoring'),
    game: $('#screen-game'),
  };

  let currentScreen = 'players';

  function showScreen(key){
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[key].classList.add('active');
    currentScreen = key;
  }

  // --- History / Android back ---
  function pushNav(screen){
    history.pushState({ screen }, '', '#'+screen);
    showScreen(screen);
  }

  function goToPlayersRoot(){
    history.replaceState(null, '', location.pathname);
    showScreen('players');
  }

  function confirmExitGameIfNeeded(nextScreen){
    if (currentScreen !== 'game') return true;
    if (nextScreen === 'game') return true;

    const ok = confirm('Chcete hru skutečně ukončit?');
    if (!ok){
      history.pushState({ screen: 'game' }, '', '#game');
      showScreen('game');
      return false;
    }
    resetAll(false);
    return true;
  }

  window.addEventListener('popstate', (ev) => {
    const target = ev.state?.screen;
    if (!target){
      showScreen('players');
      return;
    }
    if (!confirmExitGameIfNeeded(target)) return;
    showScreen(target);
  });

  // Init root
  history.replaceState(null, '', location.pathname);

  // Fullscreen buttons (menus)
  function toggleFullscreen(){
    const el = document.documentElement;
    if (!document.fullscreenElement){
      (el.requestFullscreen?.() || el.webkitRequestFullscreen?.() || Promise.resolve()).catch?.(()=>{});
    } else {
      (document.exitFullscreen?.() || document.webkitExitFullscreen?.() || Promise.resolve()).catch?.(()=>{});
    }
  }
  ['#btn-fs','#btn-fs2','#btn-fs3'].forEach(id => {
    const b = $(id);
    if (b) b.addEventListener('click', toggleFullscreen);
  });

  // UI refs
  const btnStart = $('#btn-start');
  const countdownEl = $('#countdown');

  const frameEl = $('#frame');
  const frameShapeEl = $('#frame-shape');

  const resultsEl = $('#results');
  const resultsList = $('#results-list');
  const resultsTitle = $('#results-title');
  const resultsSub = $('#results-sub');
  const btnNext = $('#btn-next');
  const btnReset = $('#btn-reset');

  const gameRoot = $('#game-root');

  const cornerBtns = [$('#p1'), $('#p2'), $('#p3'), $('#p4')];
  const metricEls = [$('#metric1'), $('#metric2'), $('#metric3'), $('#metric4')];

  const playerMeta = [
    { id: 1, name: 'Modrý', color: '#60a5fa' },
    { id: 2, name: 'Zelený', color: '#22c55e' },
    { id: 3, name: 'Červený', color: '#f43f5e' },
    { id: 4, name: 'Žlutý', color: '#f59e0b' },
  ];

  // Shapes
  const SHAPES = [
    { key: 'circle', label: 'Kruh' },
    { key: 'square', label: 'Čtverec' },
    { key: 'rect', label: 'Obdélník' },
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
    const fill = 'rgba(255,255,255,.12)';
    const strokeWidth = 8;

    const add = (node) => svg.appendChild(node);

    if (shapeKey === 'circle'){
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', '60');
      c.setAttribute('cy', '60');
      c.setAttribute('r', '42');
      c.setAttribute('fill', fill);
      c.setAttribute('stroke', stroke);
      c.setAttribute('stroke-width', String(strokeWidth));
      add(c);
    } else if (shapeKey === 'square'){
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', '22');
      r.setAttribute('y', '22');
      r.setAttribute('width', '76');
      r.setAttribute('height', '76');
      r.setAttribute('rx', '10');
      r.setAttribute('fill', fill);
      r.setAttribute('stroke', stroke);
      r.setAttribute('stroke-width', String(strokeWidth));
      add(r);
    } else if (shapeKey === 'rect'){
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', '14');
      r.setAttribute('y', '34');
      r.setAttribute('width', '92');
      r.setAttribute('height', '52');
      r.setAttribute('rx', '10');
      r.setAttribute('fill', fill);
      r.setAttribute('stroke', stroke);
      r.setAttribute('stroke-width', String(strokeWidth));
      add(r);
    } else if (shapeKey === 'triangle'){
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', 'M60 18 L104 96 L16 96 Z');
      p.setAttribute('fill', fill);
      p.setAttribute('stroke', stroke);
      p.setAttribute('stroke-width', String(strokeWidth));
      p.setAttribute('stroke-linejoin', 'round');
      add(p);
    }

    // soft highlight
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
    svg.insertBefore(defs, svg.firstChild);

    const g = document.createElementNS(svgNS, 'rect');
    g.setAttribute('x','0'); g.setAttribute('y','0');
    g.setAttribute('width','120'); g.setAttribute('height','120');
    g.setAttribute('fill','url(#grad)');
    add(g);

    el.appendChild(svg);
  }

  function clearShape(el){
    el.classList.add('hidden');
    el.innerHTML = '';
  }

  function msText(ms){
    if (typeof ms !== 'number' || !isFinite(ms)) return '—';
    return `${Math.round(ms)} ms`;
  }

  function pointsText(p){
    return `${p} b`;
  }

  // Game state
  const state = {
    players: 4,
    scoring: 'classic',
    round: 1, // 1..10
    points: [0,0,0,0],

    // average tracking (valid only)
    rtSum: [0,0,0,0],
    rtCount: [0,0,0,0],

    // per-round
    targetShape: null,
    running: false,
    accepting: false,
    targetOn: false,
    targetStartTs: 0,
    tapped: [false,false,false,false],
    disq: [false,false,false,false],
    rt: [null,null,null,null],
    stageTimer: null,
    lastStageShape: null,

    // visual
    winnerTintSet: false,
  };

  function setPlayers(n){
    state.players = n;
    cornerBtns.forEach((btn, idx) => {
      btn.classList.toggle('hidden', idx >= n);
    });
  }

  function setScoring(mode){
    state.scoring = mode;
  }

  function scoringName(){
    return state.scoring === 'classic' ? 'Klasické'
         : state.scoring === '3210' ? '3–2–1–0'
         : 'Podle času (průměr)';
  }

  function metricMode(){
    // Only "time" shows average in corners
    return (state.scoring === 'time') ? 'avg' : 'points';
  }

  function updateCornerMetrics(){
    const mode = metricMode();
    for (let i=0;i<4;i++){
      if (i >= state.players) continue;
      if (mode === 'points'){
        metricEls[i].textContent = pointsText(state.points[i] || 0);
      } else {
        if (state.rtCount[i] <= 0){
          metricEls[i].textContent = '—';
        } else {
          metricEls[i].textContent = msText(state.rtSum[i] / state.rtCount[i]);
        }
      }
    }
  }

  function clearWinnerTint(){
    gameRoot?.classList.remove('winner-tint');
    if (gameRoot) gameRoot.style.setProperty('--winnerTint', 'rgba(0,0,0,0)');
  }

  function setWinnerTint(playerIdx){
    if (!gameRoot) return;
    const hex = playerMeta[playerIdx]?.color || '#000000';
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    gameRoot.classList.add('winner-tint');
    gameRoot.style.setProperty('--winnerTint', `rgba(${r},${g},${b},0.33)`);
  }

  function clearRoundState(){
    state.running = false;
    state.accepting = false;
    state.targetOn = false;
    state.targetStartTs = 0;
    state.tapped = [false,false,false,false];
    state.disq = [false,false,false,false];
    state.rt = [null,null,null,null];
    state.lastStageShape = null;
    state.winnerTintSet = false;

    if (state.stageTimer) clearTimeout(state.stageTimer);
    state.stageTimer = null;

    frameEl.classList.remove('target');
    clearShape(frameShapeEl);

    resultsEl.classList.add('hidden');
    btnStart.disabled = false;
    btnStart.classList.remove('hidden');
    countdownEl.classList.add('hidden');

    // re-enable corner taps
    cornerBtns.forEach((b, idx) => {
      if (idx < state.players) b.style.pointerEvents = 'auto';
      b.classList.remove('pressed');
    });

    clearWinnerTint();
    updateCornerMetrics();
  }

  function resetAll(navigate=true){
    state.round = 1;
    state.points = [0,0,0,0];
    state.rtSum = [0,0,0,0];
    state.rtCount = [0,0,0,0];
    clearRoundState();
    if (navigate) goToPlayersRoot();
  }

  function lockCorners(lock){
    cornerBtns.forEach((b, idx) => {
      if (idx >= state.players) return;
      b.style.pointerEvents = lock ? 'none' : 'auto';
      if (lock) b.classList.remove('pressed');
    });
  }

  // --- Round start logic ---
  function startRoundWithCountdown(){
    if (state.running) return;

    clearRoundState();
    state.running = true;

    // Start is needed only for the first round – hide immediately after press
    btnStart.disabled = true;
    btnStart.classList.add('hidden');

    // choose target
    state.targetShape = pick(SHAPES).key;

    // countdown 3..2..1
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

  function startRoundImmediate(){
    if (state.running) return;
    clearRoundState();

    // no Start button for following rounds
    btnStart.classList.add('hidden');
    btnStart.disabled = true;

    state.running = true;
    state.targetShape = pick(SHAPES).key;

    showTargetThenGo();
  }

  function showTargetThenGo(){
    frameEl.classList.add('target');
    setShape(frameShapeEl, state.targetShape);
    state.targetOn = true;

    // show target for 2 seconds
    state.stageTimer = setTimeout(() => {
      frameEl.classList.remove('target');
      clearShape(frameShapeEl);
      state.targetOn = false;

      // 1 second blank pause
      state.stageTimer = setTimeout(() => {
        runStageLoop();
      }, 1000);

    }, 2000);
  }

  function runStageLoop(){
    state.accepting = true;

    const loop = () => {
      if (!state.running) return;

      // pick a stage shape (avoid immediate repeat)
      let shape = pick(SHAPES).key;
      if (shape === state.lastStageShape) shape = pick(SHAPES).key;
      state.lastStageShape = shape;

      setShape(frameShapeEl, shape);

      const dur = randInt(1000, 2000);

      if (shape === state.targetShape){
        state.targetOn = true;
        state.targetStartTs = performance.now();

        // end round after window
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

    lockCorners(true);

    setTimeout(() => showResultsAndScore(false), 120);
  }

  function recordTap(playerIdx){
    if (playerIdx >= state.players) return;
    if (!state.accepting) return;
    if (state.tapped[playerIdx]) return;

    state.tapped[playerIdx] = true;

    if (!state.targetOn || !state.targetStartTs){
      // false start
      state.disq[playerIdx] = true;
      state.rt[playerIdx] = null;
      return;
    }

    const now = performance.now();
    const rt = Math.max(0, now - state.targetStartTs);
    state.rt[playerIdx] = rt;

    // Classic: tint immediately on FIRST correct valid tap
    if (state.scoring === 'classic' && !state.winnerTintSet){
      state.winnerTintSet = true;
      setWinnerTint(playerIdx);
    }
  }

  function computeRanking(){
    const entries = [];
    for (let i=0;i<state.players;i++){
      const meta = playerMeta[i];
      const isDisq = !!state.disq[i];
      const tapped = !!state.tapped[i];
      const hasRT = typeof state.rt[i] === 'number';

      let status = '';
      if (isDisq){
        status = 'Falešný start';
      } else if (!tapped){
        status = 'Bez reakce';
      } else if (hasRT){
        status = msText(state.rt[i]);
      } else {
        status = '—';
      }

      entries.push({
        idx: i,
        name: meta.name,
        color: meta.color,
        disq: isDisq,
        tapped,
        rt: hasRT ? state.rt[i] : null,
        status,
        pointsAdd: 0,
      });
    }

    const valids = entries.filter(e => !e.disq && e.rt !== null).sort((a,b)=>a.rt-b.rt);
    const noResp = entries.filter(e => !e.disq && e.rt === null).sort((a,b)=>a.idx-b.idx);
    const disq = entries.filter(e => e.disq).sort((a,b)=>a.idx-b.idx);
    return [...valids, ...noResp, ...disq];
  }

  function awardPoints(ranking){
    // TIME mode: no points at all
    if (state.scoring === 'time'){
      return;
    }

    const valids = ranking.filter(e => !e.disq && e.rt !== null);

    if (state.scoring === 'classic'){
      if (valids.length > 0) valids[0].pointsAdd = 1;
    } else if (state.scoring === '3210'){
      const pts = [3,2,1,0];
      for (let i=0;i<valids.length;i++){
        valids[i].pointsAdd = pts[i] ?? 0;
      }
    }

    for (const e of ranking){
      state.points[e.idx] += (e.pointsAdd || 0);
    }
  }

  function updateAveragesFromRound(){
    for (let i=0;i<state.players;i++){
      if (!state.disq[i] && typeof state.rt[i] === 'number'){
        state.rtSum[i] += state.rt[i];
        state.rtCount[i] += 1;
      }
    }
  }

  function showResultsAndScore(isFinal){
    const ranking = computeRanking();
    awardPoints(ranking);
    updateAveragesFromRound();
    updateCornerMetrics();

    resultsTitle.textContent = isFinal ? 'Konec hry – celkové pořadí' : 'Výsledky kola';
    resultsSub.textContent = isFinal
      ? `Režim: ${scoringName()}`
      : `Kolo ${state.round}/${TOTAL_ROUNDS} • Režim: ${scoringName()}`;

    resultsList.innerHTML = '';

    if (!isFinal){
      ranking.forEach((e, i) => {
        const row = document.createElement('div');
        row.className = 'result-row';

        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.style.background = e.color;
        badge.textContent = String(i+1);

        const mid = document.createElement('div');
        const title = document.createElement('div');
        title.style.fontWeight = '1000';
        title.textContent = e.name;

        const sub = document.createElement('div');
        sub.className = 'small';
        sub.textContent = e.status;

        mid.appendChild(title);
        mid.appendChild(sub);

        const pts = document.createElement('div');
        pts.className = 'points';
        pts.textContent = (state.scoring === 'time') ? '' : `+${e.pointsAdd || 0}`;

        row.appendChild(badge);
        row.appendChild(mid);
        row.appendChild(pts);

        resultsList.appendChild(row);
      });

      btnNext.textContent = (state.round >= TOTAL_ROUNDS) ? 'Zobrazit celkové pořadí →' : 'Next →';
    } else {
      // Final ordering:
      // - time: lowest average wins
      // - else: points desc, avg asc
      const finalEntries = [];
      for (let i=0;i<state.players;i++){
        const avg = state.rtCount[i] > 0 ? (state.rtSum[i]/state.rtCount[i]) : Infinity;
        finalEntries.push({
          idx: i,
          name: playerMeta[i].name,
          color: playerMeta[i].color,
          points: state.points[i],
          avg,
          avgText: state.rtCount[i] > 0 ? msText(avg) : '—',
        });
      }

      if (state.scoring === 'time'){
        finalEntries.sort((a,b) => (a.avg - b.avg) || (a.idx - b.idx));
      } else {
        finalEntries.sort((a,b) => (b.points - a.points) || (a.avg - b.avg) || (a.idx - b.idx));
      }

      finalEntries.forEach((e, i) => {
        const row = document.createElement('div');
        row.className = 'result-row';

        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.style.background = e.color;
        badge.textContent = String(i+1);

        const mid = document.createElement('div');
        const title = document.createElement('div');
        title.style.fontWeight = '1000';
        title.textContent = e.name;

        const sub = document.createElement('div');
        sub.className = 'small';
        sub.textContent = (state.scoring === 'time')
          ? `Průměr: ${e.avgText}`
          : `Body: ${e.points} • Průměr: ${e.avgText}`;

        mid.appendChild(title);
        mid.appendChild(sub);

        const pts = document.createElement('div');
        pts.className = 'points';
        pts.textContent = (state.scoring === 'time') ? '' : `${e.points} b`;

        row.appendChild(badge);
        row.appendChild(mid);
        row.appendChild(pts);

        resultsList.appendChild(row);
      });

      btnNext.textContent = 'Nová hra';
    }

    resultsEl.classList.remove('hidden');
    btnStart.classList.add('hidden');
    lockCorners(true);
  }

  function nextAction(){
    // New round should start with normal background tint
    clearWinnerTint();

    if (state.round >= TOTAL_ROUNDS){
      showResultsAndScore(true);
      return;
    }

    state.round += 1;
    resultsEl.classList.add('hidden');
    lockCorners(false);
    startRoundImmediate();
  }

  function nextFromFinal(){
    resetAll(true);
  }

  // --- Navigation wiring ---
  $$('#screen-players button[data-players]').forEach(btn => {
    btn.addEventListener('click', () => {
      setPlayers(Number(btn.dataset.players));
      pushNav('topic');
    });
  });

  $('#back-to-players').addEventListener('click', goToPlayersRoot);
  $('#topic-shapes').addEventListener('click', () => pushNav('scoring'));
  $('#back-to-topic').addEventListener('click', () => pushNav('topic'));

  $('#go-to-game').addEventListener('click', () => {
    const checked = $('input[name="scoring"]:checked');
    setScoring(checked ? checked.value : 'classic');

    // new session
    state.round = 1;
    state.points = [0,0,0,0];
    state.rtSum = [0,0,0,0];
    state.rtCount = [0,0,0,0];

    clearRoundState();
    updateCornerMetrics();

    pushNav('game'); // Start button visible for first round
  });

  $$('input[name="scoring"]').forEach(r => r.addEventListener('change', () => setScoring(r.value)));

  // Start only for first round
  btnStart.addEventListener('click', startRoundWithCountdown);

  btnNext.addEventListener('click', () => {
    if (resultsTitle.textContent.includes('Konec hry')) nextFromFinal();
    else nextAction();
  });

  btnReset.addEventListener('click', () => resetAll(true));

  // Corner taps + press feedback
  cornerBtns.forEach((btn, idx) => {
    const pressOn = (ev) => {
      if (idx >= state.players) return;
      btn.classList.add('pressed');
      // record tap immediately on first touch
      ev.preventDefault();
      recordTap(idx);
    };
    const pressOff = () => btn.classList.remove('pressed');

    btn.addEventListener('pointerdown', pressOn, { passive: false });
    btn.addEventListener('pointerup', pressOff, { passive: true });
    btn.addEventListener('pointercancel', pressOff, { passive: true });
    btn.addEventListener('pointerleave', pressOff, { passive: true });

    // fallback click (desktop)
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      recordTap(idx);
    }, { passive: false });
  });

  // Prevent double-tap zoom (mobile)
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch <= 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });

  // Register SW
  if ('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  // Initialize
  setPlayers(4);
  showScreen('players');
  updateCornerMetrics();
})();