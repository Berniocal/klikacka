/* app.js – Šumy (PWA)
   - Syntetické šumy přes AudioWorklet (noise-worklet.js)
   - Real MP3 přes WebAudio buffer + seamless loop (loopStart/loopEnd)
   - Nezastavuje při zhasnutí/změně viditelnosti (běh na pozadí)
*/

const $ = (id) => document.getElementById(id);

const soundBtn   = $("soundBtn");
const toggleBtn  = $("toggleBtn");
const intensity  = $("intensity");
const volume     = $("volume");
const statusEl   = $("status");

// Timer
const timerDisplay = $("timerDisplay");
const timerToggle  = $("timerToggle");
const timerModal   = $("timerModal");
const timerCancel  = $("timerCancel");
const timerOk      = $("timerOk");
const timerTopH    = $("timerTopH");
const timerTopM    = $("timerTopM");
const timerTopS    = $("timerTopS");
const wheelH       = $("wheelH");
const wheelM       = $("wheelM");
const wheelS       = $("wheelS");

const soundModal = $("soundModal");
const soundClose = $("soundClose");

let timerEnabled = false;
let timerSeconds = 0;
let timerEndAt = 0;
let timerTickInterval = null;

// ====== Audio (WebAudio) ======
let ctx = null;
let masterGain = null;

let noiseNode = null;      // AudioWorkletNode
let fileSource = null;     // AudioBufferSourceNode (real MP3)

let isPlaying = false;

let currentSound = localStorage.getItem("sumySound") || "white";

// Buffery pro real nahrávky
let realWaterfallBuffer = null;
let realSeaBuffer = null;
let realWindBuffer = null;
let realRainBuffer = null;

let realWaterfallBufferPromise = null;
let realSeaBufferPromise = null;
let realWindBufferPromise = null;
let realRainBufferPromise = null;

function setStatus(t){
  if (statusEl) statusEl.textContent = t || "";
}

function clamp01(x){
  return Math.max(0, Math.min(1, x));
}

function volToGain(v){
  const x = Math.max(0, Math.min(1, v / 100));
  return Math.pow(x, 1.6);
}

function intensity01(){
  return Math.max(0, Math.min(1, Number(intensity.value) / 100));
}

// === Seamless loop pro "real" MP3 (odstraní ticho na konci a začne až po úvodním náběhu) ===
// Pozn.: WebAudio BufferSource umí loopStart/loopEnd. Trimujeme typicky posledních ~150 ms,
// kde u MP3 často zůstane ticho / enkódovací "tail". Startujeme o ~50 ms později.
function configureSeamlessRealLoop(source, buffer){
  const head = 0.05;   // přeskoč úplný začátek (klik/lead-in)
  const tail = 0.15;   // přeskoč ticho na konci (typicky 1–2 s u některých MP3)
  const minLoop = 0.40;

  const dur = Math.max(0, Number(buffer?.duration) || 0);
  let loopStart = Math.min(head, Math.max(0, dur - 0.20));
  let loopEnd   = Math.max(loopStart + minLoop, dur - tail);

  loopStart = Math.max(0, Math.min(loopStart, dur));
  loopEnd   = Math.max(0, Math.min(loopEnd, dur));

  if (dur < 0.5 || loopEnd <= loopStart + 0.05){
    loopStart = 0;
    loopEnd = dur;
  }

  source.loop = true;
  source.loopStart = loopStart;
  source.loopEnd = loopEnd;

  return loopStart;
}

function labelFor(id){
  switch(id){
    case "white": return "Bílý šum";
    case "pink": return "Růžový šum";
    case "brown": return "Hnědý šum";
    case "fan": return "Ventilátor";
    case "waterfall_real": return "Vodopád (real)";
    case "sea_real": return "Moře (real)";
    case "wind_real": return "Vítr (real)";
    case "rain_real": return "Déšť (real)";
    case "waterfall": return "Vodopád";
    case "rain": return "Déšť";
    case "wind": return "Vítr";
    case "vacuum": return "Vysavač";
    default: return "Šum";
  }
}

function updateSoundBtnLabel(){
  if (!soundBtn) return;
  // soundBtn má v HTML: text + <span class="chev">▾</span>
  const first = soundBtn.childNodes[0];
  if (first && first.nodeType === Node.TEXT_NODE){
    first.textContent = labelFor(currentSound) + " ";
  } else {
    soundBtn.textContent = labelFor(currentSound);
  }
}

function openSoundModal(){
  soundModal.hidden = false;
  soundModal.style.display = "flex";
  document.body.classList.add("modalOpen");
}

function closeSoundModal(){
  soundModal.hidden = true;
  soundModal.style.display = "none";
  document.body.classList.remove("modalOpen");
}

function updateToggleUI(){
  if (!toggleBtn) return;
  toggleBtn.textContent = isPlaying ? "Stop" : "▶ Play";
  toggleBtn.setAttribute("aria-pressed", isPlaying ? "true" : "false");
}

function pad2(n){ return String(n).padStart(2,"0"); }

function formatTimer(sec){
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = sec%60;
  if (h>0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}

function updateTimerDisplay(){
  if (!timerDisplay) return;
  if (!timerEnabled || timerSeconds<=0){
    timerDisplay.textContent = "—";
    return;
  }
  const now = Date.now();
  const left = Math.max(0, Math.ceil((timerEndAt - now)/1000));
  timerDisplay.textContent = formatTimer(left);
}

function stopTimerTick(){
  if (timerTickInterval){
    clearInterval(timerTickInterval);
    timerTickInterval = null;
  }
}

function startTimerTick(){
  stopTimerTick();
  timerTickInterval = setInterval(() => {
    if (!timerEnabled) return;
    const now = Date.now();
    const left = Math.max(0, Math.ceil((timerEndAt - now)/1000));
    if (left<=0){
      timerEnabled = false;
      timerSeconds = 0;
      timerEndAt = 0;
      stopTimerTick();
      updateTimerDisplay();
      if (isPlaying) stopHard();
      return;
    }
    updateTimerDisplay();
  }, 250);
}

function openTimerModal(){
  if (!timerModal) return;
  timerModal.hidden = false;
  timerModal.style.display = "flex";
  document.body.classList.add("modalOpen");
}

function closeTimerModal(){
  if (!timerModal) return;
  timerModal.hidden = true;
  timerModal.style.display = "none";
  document.body.classList.remove("modalOpen");
}

function buildWheel(listEl, max){
  if (!listEl) return;
  listEl.innerHTML = "";
  for (let i = 0; i <= max; i++){
    const div = document.createElement("div");
    div.className = "wheelItem";
    div.textContent = pad2(i);
    div.dataset.value = String(i);
    listEl.appendChild(div);
  }
}

function getItemHeight(listEl){
  const item = listEl?.querySelector(".wheelItem");
  if (!item) return 56;
  const r = item.getBoundingClientRect();
  return Math.max(40, Math.round(r.height || 56));
}

function scrollToValue(listEl, value, behavior="auto"){
  if (!listEl) return;
  const itemH = getItemHeight(listEl);
  listEl.scrollTo({ top: value*itemH, behavior });
}

function getNearestValue(listEl, max){
  if (!listEl) return 0;
  const itemH = getItemHeight(listEl);
  const v = Math.round(listEl.scrollTop / itemH);
  return Math.max(0, Math.min(max, v));
}

function snapWheel(listEl, max){
  if (!listEl) return;
  const v = getNearestValue(listEl, max);
  scrollToValue(listEl, v, "smooth");
}

function readTimerFromWheels(){
  const h = getNearestValue(wheelH, 23);
  const m = getNearestValue(wheelM, 59);
  const s = getNearestValue(wheelS, 59);
  return h*3600 + m*60 + s;
}

function disconnectChain(){
  try{ fileSource?.stop(); }catch{}
  try{ fileSource?.disconnect(); }catch{}
  fileSource = null;

  try{ noiseNode?.disconnect(); }catch{}
}

async function ensureAudio(){
  if (ctx && masterGain && noiseNode) return;

  ctx = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = ctx.createGain();
  masterGain.gain.value = 0.0;
  masterGain.connect(ctx.destination);

  await ctx.audioWorklet.addModule("noise-worklet.js");
  noiseNode = new AudioWorkletNode(ctx, "noise-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
}

function applyVolume(){
  if (!masterGain || !ctx) return;
  const v = volToGain(Number(volume.value));
  const t = ctx.currentTime;
  try{
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setTargetAtTime(v, t, 0.03);
  }catch{}
}

function fadeIn(){
  if (!masterGain || !ctx) return;
  const v = volToGain(Number(volume.value));
  const t = ctx.currentTime;
  try{
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(0.0, t);
    masterGain.gain.linearRampToValueAtTime(v, t + 0.08);
  }catch{}
}

function fadeOut(){
  if (!masterGain || !ctx) return;
  const t = ctx.currentTime;
  try{
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(0.0, t + 0.08);
  }catch{}
}

function mapModeToNoiseType(mode){
  switch(mode){
    case "white": return 0;
    case "pink": return 1;
    case "brown": return 2;
    case "fan": return 3;
    case "waterfall": return 4;
    case "rain": return 5;
    case "wind": return 6;
    case "vacuum": return 7;
    default: return 0;
  }
}

async function ensureRealWaterfallBuffer(){
  if (realWaterfallBuffer) return realWaterfallBuffer;
  if (!ctx) await ensureAudio();

  if (!realWaterfallBufferPromise){
    realWaterfallBufferPromise = fetch("waterfall-real.mp3")
      .then((r) => {
        if (!r.ok) throw new Error("Nelze načíst waterfall-real.mp3");
        return r.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => (realWaterfallBuffer = buf))
      .catch((err) => {
        console.error(err);
        realWaterfallBufferPromise = null;
        return null;
      });
  }
  return realWaterfallBufferPromise;
}

async function ensureRealSeaBuffer(){
  if (realSeaBuffer) return realSeaBuffer;
  if (!ctx) await ensureAudio();

  if (!realSeaBufferPromise){
    realSeaBufferPromise = fetch("sea-real.mp3")
      .then((r) => {
        if (!r.ok) throw new Error("Nelze načíst sea-real.mp3");
        return r.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => (realSeaBuffer = buf))
      .catch((err) => {
        console.error(err);
        realSeaBufferPromise = null;
        return null;
      });
  }
  return realSeaBufferPromise;
}

async function ensureRealWindBuffer(){
  if (realWindBuffer) return realWindBuffer;
  if (!ctx) await ensureAudio();

  if (!realWindBufferPromise){
    realWindBufferPromise = fetch("wind-real.mp3")
      .then((r) => {
        if (!r.ok) throw new Error("Nelze načíst wind-real.mp3");
        return r.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => (realWindBuffer = buf))
      .catch((err) => {
        console.error(err);
        realWindBufferPromise = null;
        return null;
      });
  }
  return realWindBufferPromise;
}

async function ensureRealRainBuffer(){
  if (realRainBuffer) return realRainBuffer;
  if (!ctx) await ensureAudio();

  if (!realRainBufferPromise){
    realRainBufferPromise = fetch("rain-real.mp3")
      .then((r) => {
        if (!r.ok) throw new Error("Nelze načíst rain-real.mp3");
        return r.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => (realRainBuffer = buf))
      .catch((err) => {
        console.error(err);
        realRainBufferPromise = null;
        return null;
      });
  }
  return realRainBufferPromise;
}

function buildChainFor(mode){
  if (!ctx || !noiseNode || !masterGain) return;

  disconnectChain();

  // === REAL MP3 (seamless loop) ===
  if (mode === "waterfall_real"){
    if (!realWaterfallBuffer){
      setStatus("Nacitam vodopady...");
      return;
    }
    fileSource = ctx.createBufferSource();
    fileSource.buffer = realWaterfallBuffer;

    const _offset = configureSeamlessRealLoop(fileSource, fileSource.buffer);
    fileSource.connect(masterGain);

    try{ fileSource.start(0, _offset); }catch{}
    return;
  }

  if (mode === "sea_real"){
    if (!realSeaBuffer){
      setStatus("Nacitam more...");
      return;
    }
    fileSource = ctx.createBufferSource();
    fileSource.buffer = realSeaBuffer;

    const _offset = configureSeamlessRealLoop(fileSource, fileSource.buffer);
    fileSource.connect(masterGain);

    try{ fileSource.start(0, _offset); }catch{}
    return;
  }

  if (mode === "wind_real"){
    if (!realWindBuffer){
      setStatus("Nacitam vitr...");
      return;
    }
    fileSource = ctx.createBufferSource();
    fileSource.buffer = realWindBuffer;

    const _offset = configureSeamlessRealLoop(fileSource, fileSource.buffer);
    fileSource.connect(masterGain);

    try{ fileSource.start(0, _offset); }catch{}
    return;
  }

  if (mode === "rain_real"){
    if (!realRainBuffer){
      setStatus("Nacitam dest...");
      return;
    }
    fileSource = ctx.createBufferSource();
    fileSource.buffer = realRainBuffer;

    const _offset = configureSeamlessRealLoop(fileSource, fileSource.buffer);
    fileSource.connect(masterGain);

    try{ fileSource.start(0, _offset); }catch{}
    return;
  }

  // === Syntetické šumy (AudioWorklet) ===
  const shape = intensity01();
  const baseLevel = 0.18 + 0.35 * shape;

  noiseNode.parameters.get("type").setValueAtTime(mapModeToNoiseType(mode), ctx.currentTime);
  noiseNode.parameters.get("level").setValueAtTime(baseLevel, ctx.currentTime);

  noiseNode.connect(masterGain);
}

async function rebuildIfPlaying(){
  if (!isPlaying) return;

  if (currentSound === "waterfall_real" && !realWaterfallBuffer) await ensureRealWaterfallBuffer();
  if (currentSound === "sea_real" && !realSeaBuffer) await ensureRealSeaBuffer();
  if (currentSound === "wind_real" && !realWindBuffer) await ensureRealWindBuffer();
  if (currentSound === "rain_real" && !realRainBuffer) await ensureRealRainBuffer();

  buildChainFor(currentSound);
  applyVolume();
}

async function start(){
  await ensureAudio();

  if (currentSound === "waterfall_real") await ensureRealWaterfallBuffer();
  if (currentSound === "sea_real") await ensureRealSeaBuffer();
  if (currentSound === "wind_real") await ensureRealWindBuffer();
  if (currentSound === "rain_real") await ensureRealRainBuffer();

  buildChainFor(currentSound);

  if (ctx.state === "suspended"){
    await ctx.resume();
  }

  fadeIn();
  isPlaying = true;
  updateToggleUI();

  if (timerEnabled && timerSeconds>0){
    timerEndAt = Date.now() + timerSeconds*1000;
    startTimerTick();
    updateTimerDisplay();
  }

  setStatus(labelFor(currentSound));
}

async function stopHard(){
  fadeOut();
  setTimeout(() => {
    disconnectChain();
  }, 120);

  isPlaying = false;
  updateToggleUI();
}

function wireUI(){
  updateSoundBtnLabel();
  updateToggleUI();
  applyVolume();
  setStatus("Připraveno.");

  volume?.addEventListener("input", () => applyVolume());
  intensity?.addEventListener("input", () => rebuildIfPlaying());

  soundBtn?.addEventListener("click", () => openSoundModal());
  soundClose?.addEventListener("click", () => closeSoundModal());
  soundModal?.addEventListener("click", (e) => {
    if (e.target === soundModal) closeSoundModal();

    const b = e.target.closest("[data-sound]");
    if (!b) return;

    currentSound = b.dataset.sound;
    localStorage.setItem("sumySound", currentSound);

    updateSoundBtnLabel();
    setStatus(labelFor(currentSound));
    closeSoundModal();
    rebuildIfPlaying();
  });

  toggleBtn?.addEventListener("click", async () => {
    try{
      if (!isPlaying) await start();
      else await stopHard();
    }catch(err){
      console.error(err);
      setStatus("Nepodařilo se spustit audio (zkus kliknout znovu).");
    }
  });

  // Timer UI
  buildWheel(wheelH, 23);
  buildWheel(wheelM, 59);
  buildWheel(wheelS, 59);

  scrollToValue(wheelH, 1);
  scrollToValue(wheelM, 30);
  scrollToValue(wheelS, 0);

  const snapLater = (listEl, max) => {
    let t = null;
    listEl.addEventListener("scroll", () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => snapWheel(listEl, max), 80);
    }, { passive:true });
  };
  snapLater(wheelH, 23);
  snapLater(wheelM, 59);
  snapLater(wheelS, 59);

  timerDisplay?.addEventListener("click", () => openTimerModal());
  timerCancel?.addEventListener("click", () => closeTimerModal());
  timerOk?.addEventListener("click", () => {
    const sec = readTimerFromWheels();
    timerSeconds = sec;
    timerEnabled = sec>0;
    if (timerEnabled){
      timerEndAt = Date.now() + timerSeconds*1000;
      startTimerTick();
    } else {
      stopTimerTick();
      timerEndAt = 0;
    }
    updateTimerDisplay();
    closeTimerModal();
  });

  timerToggle?.addEventListener("click", () => {
    timerEnabled = !timerEnabled;
    timerToggle.setAttribute("aria-pressed", timerEnabled ? "true" : "false");
    timerToggle.textContent = timerEnabled ? "Zapnuto" : "Zapnout";

    if (timerEnabled){
      timerSeconds = readTimerFromWheels();
      if (timerSeconds > 0){
        timerEndAt = Date.now() + timerSeconds*1000;
        startTimerTick();
      }
    } else {
      stopTimerTick();
      timerEndAt = 0;
    }
    updateTimerDisplay();
  });

  updateTimerDisplay();

  // NEZASTAVOVAT na visibilitychange (kvůli přehrávání na pozadí)
  document.addEventListener("visibilitychange", () => {
    // nic
  });
}

wireUI();
