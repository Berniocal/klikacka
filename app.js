/* Reakční doba – v3.1 (oprava historie)
   - Android back:
       Game -> confirm -> Rules -> Topic -> Players -> (exit app)
   - Na obrazovce Players už není další history stav
*/
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const TOTAL_ROUNDS = 10;

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

  // --- HISTORY LOGIC ---

  function pushNav(screen){
    history.pushState({ screen }, '', '#'+screen);
    showScreen(screen);
  }

  function goToPlayersRoot(){
    // replace current state so that back from Players exits app
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
      // no state -> exit point (Players)
      showScreen('players');
      return;
    }

    if (!confirmExitGameIfNeeded(target)) return;
    showScreen(target);
  });

  // Init history root
  history.replaceState(null, '', location.pathname);

  // --- zbytek logiky beze změny ---

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

  const SHAPES = [
    { key: 'circle' },
    { key: 'square' },
    { key: 'rect' },
    { key: 'triangle' },
  ];

  function randInt(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(arr){ return arr[randInt(0, arr.length-1)]; }

  function setShape(el, shapeKey){
    el.classList.remove('hidden');
    el.innerHTML = shapeKey;
  }
  function clearShape(el){ el.classList.add('hidden'); el.innerHTML = ''; }

  function msText(ms){ return (typeof ms === 'number') ? `${Math.round(ms)} ms` : '—'; }
  function pointsText(p){ return `${p} b`; }

  const state = {
    players: 4,
    scoring: 'classic',
    round: 1,
    points: [0,0,0,0],
    rtSum: [0,0,0,0],
    rtCount: [0,0,0,0],
    running:false,
    accepting:false,
    targetShape:null,
    targetOn:false,
    targetStartTs:0,
    tapped:[false,false,false,false],
    disq:[false,false,false,false],
    rt:[null,null,null,null],
    stageTimer:null
  };

  function metricMode(){ return (state.scoring === 'time') ? 'avg' : 'points'; }

  function updateCornerMetrics(){
    const mode = metricMode();
    for (let i=0;i<4;i++){
      if (i >= state.players) continue;
      metricEls[i].textContent =
        mode === 'points'
          ? pointsText(state.points[i])
          : (state.rtCount[i]>0 ? msText(state.rtSum[i]/state.rtCount[i]) : '—');
    }
  }

  function setPlayers(n){
    state.players = n;
    cornerBtns.forEach((btn, idx) => btn.classList.toggle('hidden', idx >= n));
  }

  function setScoring(mode){ state.scoring = mode; }

  function clearRoundState(){
    state.running=false;
    state.accepting=false;
    state.targetOn=false;
    clearShape(frameShapeEl);
    resultsEl.classList.add('hidden');
    btnStart.classList.remove('hidden');
    updateCornerMetrics();
  }

  function resetAll(navigate=true){
    state.round=1;
    state.points=[0,0,0,0];
    state.rtSum=[0,0,0,0];
    state.rtCount=[0,0,0,0];
    clearRoundState();
    if(navigate) goToPlayersRoot();
  }

  // --- menu wiring ---

  $$('#screen-players button[data-players]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      setPlayers(Number(btn.dataset.players));
      pushNav('topic');
    });
  });

  $('#back-to-players').addEventListener('click', goToPlayersRoot);
  $('#topic-shapes').addEventListener('click',()=>pushNav('scoring'));
  $('#back-to-topic').addEventListener('click',()=>pushNav('topic'));

  $('#go-to-game').addEventListener('click',()=>{
    const checked = $('input[name="scoring"]:checked');
    setScoring(checked ? checked.value : 'classic');
    clearRoundState();
    pushNav('game');
  });

  btnReset.addEventListener('click',()=>resetAll(true));

  // init
  setPlayers(4);
  showScreen('players');
  updateCornerMetrics();

})();