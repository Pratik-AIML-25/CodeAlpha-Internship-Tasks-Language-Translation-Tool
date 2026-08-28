// ---------- Config ----------
const MAX_CHARS = 500;
const HISTORY_KEY = 'lingua_history';
const HISTORY_LIMIT = 8;

const LANGS = [
  ["en","English"],["es","Spanish"],["fr","French"],["de","German"],
  ["it","Italian"],["pt","Portuguese"],["ru","Russian"],["ja","Japanese"],
  ["ko","Korean"],["zh","Chinese (Simplified)"],["ar","Arabic"],["hi","Hindi"],
  ["bn","Bengali"],["nl","Dutch"],["tr","Turkish"],["pl","Polish"],
  ["vi","Vietnamese"],["th","Thai"],["sv","Swedish"],["el","Greek"],
  ["he","Hebrew"],["id","Indonesian"],["uk","Ukrainian"],["cs","Czech"]
];

// Strings MyMemory sometimes embeds inside translatedText, with an HTTP 200,
// to signal quota/rate-limit/validation problems instead of a real translation.
const ERROR_TEXT_PATTERNS = [
  /MYMEMORY WARNING/i,
  /QUERY LENGTH LIMIT EXCEEDED/i,
  /INVALID LANGUAGE PAIR/i,
  /AVAILABLE FREE TRANSLATIONS/i,
  /IS AN INVALID (SOURCE|TARGET) LANGUAGE/i,
  /AMOUNT OF WORDS.*LIMIT/i
];

// ---------- Elements ----------
const sourceSel = document.getElementById('sourceLang');
const targetSel = document.getElementById('targetLang');
const sourceText = document.getElementById('sourceText');
const outputText = document.getElementById('outputText');
const translateBtn = document.getElementById('translateBtn');
const swapBtn = document.getElementById('swapBtn');
const copyBtn = document.getElementById('copyBtn');
const listenSourceBtn = document.getElementById('listenSource');
const listenTargetBtn = document.getElementById('listenTarget');
const statusEl = document.getElementById('status');
const charCount = document.getElementById('charCount');
const charCountWrap = charCount.parentElement;
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// ---------- Setup ----------
LANGS.forEach(([code, name]) => {
  const o1 = document.createElement('option'); o1.value = code; o1.textContent = name;
  const o2 = document.createElement('option'); o2.value = code; o2.textContent = name;
  sourceSel.appendChild(o1);
  targetSel.appendChild(o2);
});
sourceSel.value = 'en';
targetSel.value = 'es';

renderHistory();

// Show "Cmd" instead of "Ctrl" on Mac so the shortcut hint matches the user's keyboard.
const kbdModKey = document.getElementById('kbdModKey');
if(kbdModKey && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)){
  kbdModKey.textContent = 'Cmd';
}

// ---------- Character counter ----------
sourceText.addEventListener('input', updateCharCount);

function updateCharCount(){
  const len = sourceText.value.length;
  charCount.textContent = len;
  charCountWrap.classList.remove('warn', 'danger');
  if(len >= MAX_CHARS - 10){
    charCountWrap.classList.add('danger');
  } else if(len >= MAX_CHARS - 60){
    charCountWrap.classList.add('warn');
  }
}

// ---------- Status / loading helpers ----------
function setLoading(isLoading){
  translateBtn.disabled = isLoading;
  translateBtn.classList.toggle('loading', isLoading);
  translateBtn.innerHTML = isLoading
    ? '<span class="dot"></span> Translating…'
    : '<span class="dot"></span> Translate';
}

function setStatus(msg, isError){
  statusEl.textContent = msg || '';
  statusEl.classList.toggle('is-error', Boolean(isError && msg));
  statusEl.style.color = isError ? '' : 'var(--clay)';
}

// ---------- Translation ----------
async function translate(){
  const text = sourceText.value.trim();
  if(!text){
    setStatus('Type something to translate first.', true);
    return;
  }
  const src = sourceSel.value;
  const tgt = targetSel.value;

  if(src === tgt){
    showResult(text);
    setStatus('');
    saveHistoryEntry(src, tgt, text, text);
    return;
  }

  setLoading(true);
  setStatus('');

  try{
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}`;
    const res = await fetch(url);

    if(!res.ok){
      throw new Error(`The API returned an HTTP error (status ${res.status}). Please try again.`);
    }

    let data;
    try{
      data = await res.json();
    } catch(parseErr){
      throw new Error('Received an unreadable response from the API.');
    }

    const translated = data && data.responseData && data.responseData.translatedText;
    const responseStatus = data && data.responseStatus;

    if(!translated){
      throw new Error('The API did not return a translation. Please try again.');
    }

    // MyMemory frequently returns HTTP 200 even when it is actually reporting
    // a quota, rate-limit, or validation error inside the translated text itself.
    const looksLikeApiError = ERROR_TEXT_PATTERNS.some(pattern => pattern.test(translated));
    const statusIsError = responseStatus !== undefined && Number(responseStatus) !== 200;

    if(looksLikeApiError || statusIsError){
      throw new Error(
        looksLikeApiError
          ? 'Daily translation limit reached or invalid language pair. Try again later, or with a shorter request.'
          : `The API reported an error (status ${responseStatus}). Please try again shortly.`
      );
    }

    showResult(translated);
    saveHistoryEntry(src, tgt, text, translated);

  } catch(err){
    // The browser's own fetch() throws a generic, technical message (e.g.
    // "Failed to fetch" in Chrome, "NetworkError when attempting to fetch
    // resource" in Firefox) when there's no network connection or the
    // request is blocked. Replace that with a plain-language message instead
    // of showing raw browser/JS error text to the user.
    const rawMessage = err && err.message ? err.message : '';
    const isNetworkFailure = err instanceof TypeError ||
      /failed to fetch|networkerror|load failed/i.test(rawMessage);

    const message = isNetworkFailure
      ? 'Unable to connect to the translation service. Please check your internet connection and try again.'
      : (rawMessage || 'Translation failed — check your connection and try again.');

    setStatus(message, true);
  } finally {
    setLoading(false);
  }
}

function showResult(text){
  outputText.textContent = text;
  outputText.classList.remove('placeholder');
  copyBtn.disabled = false;
  listenTargetBtn.disabled = false;
}

translateBtn.addEventListener('click', translate);

sourceText.addEventListener('keydown', (e) => {
  if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
    translate();
  }
});

// ---------- Swap ----------
swapBtn.addEventListener('click', () => {
  swapBtn.classList.add('spin');
  setTimeout(() => swapBtn.classList.remove('spin'), 250);

  const srcVal = sourceSel.value;
  sourceSel.value = targetSel.value;
  targetSel.value = srcVal;

  const outHasResult = !outputText.classList.contains('placeholder');
  if(outHasResult){
    const newSource = outputText.textContent;
    sourceText.value = newSource;
    updateCharCount();
    outputText.textContent = 'Your translation will appear here.';
    outputText.classList.add('placeholder');
    copyBtn.disabled = true;
    listenTargetBtn.disabled = true;
  }
});

// ---------- Copy ----------
copyBtn.addEventListener('click', async () => {
  try{
    await navigator.clipboard.writeText(outputText.textContent);
    copyBtn.classList.add('copied');
    copyBtn.textContent = '✓ Copied';
    setTimeout(() => {
      copyBtn.classList.remove('copied');
      copyBtn.textContent = '⧉ Copy';
    }, 1500);
  } catch(err){
    setStatus('Could not copy — select the text manually.', true);
  }
});

// ---------- Text-to-speech ----------
function speak(text, langCode){
  if(!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = langCode;
  window.speechSynthesis.speak(utter);
}

listenSourceBtn.addEventListener('click', () => {
  speak(sourceText.value.trim(), sourceSel.value);
});
listenTargetBtn.addEventListener('click', () => {
  speak(outputText.textContent.trim(), targetSel.value);
});

// ---------- Translation history (localStorage) ----------
function loadHistory(){
  try{
    const raw = localStorage.getItem(HISTORY_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed)) return [];
    // Entries saved before the pin feature existed won't have an id — backfill
    // one so togglePin() can target them individually.
    return parsed.map(entry => ({
      id: entry.id || `${entry.ts || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pinned: Boolean(entry.pinned),
      ...entry
    }));
  } catch(err){
    // Corrupted or inaccessible storage — fail quietly and start fresh.
    return [];
  }
}

function saveHistoryEntry(src, tgt, sourceStr, translatedStr){
  let history;
  try{
    history = loadHistory();
    history.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      src,
      tgt,
      sourceText: sourceStr,
      translatedText: translatedStr,
      ts: Date.now(),
      pinned: false
    });
    // Pinned entries don't count against the recent-history cap — only trim
    // the unpinned ones down to HISTORY_LIMIT, so a pin can't be silently
    // evicted just because more translations happened afterward.
    const pinned = history.filter(e => e.pinned);
    const unpinned = history.filter(e => !e.pinned).slice(0, HISTORY_LIMIT);
    history = [...pinned, ...unpinned].sort((a, b) => b.ts - a.ts);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  } catch(err){
    // localStorage may be unavailable (private browsing, storage full, etc.).
    // The translation itself still succeeded, so we simply skip saving history.
    console.warn('Could not save translation history:', err);
  }
}

function togglePin(id){
  try{
    const history = loadHistory();
    const entry = history.find(e => e.id === id);
    if(!entry) return;
    entry.pinned = !entry.pinned;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  } catch(err){
    console.warn('Could not update pinned state:', err);
  }
}

function renderHistory(){
  const history = loadHistory();
  historyList.querySelectorAll('.history-item, .history-section-label').forEach(el => el.remove());

  if(history.length === 0){
    historyEmpty.style.display = 'block';
    clearHistoryBtn.textContent = '✕ Clear history';
    clearHistoryBtn.disabled = true;
    return;
  }
  historyEmpty.style.display = 'none';

  const pinned = history.filter(e => e.pinned);
  const unpinned = history.filter(e => !e.pinned);

  // Only label the sections when there's a mix — a single flat list reads
  // fine on its own and doesn't need a "Recent" header above it.
  if(pinned.length){
    if(unpinned.length){
      historyList.appendChild(makeSectionLabel('📌 Pinned'));
    }
    pinned.forEach(entry => historyList.appendChild(makeHistoryItem(entry)));
    if(unpinned.length){
      historyList.appendChild(makeSectionLabel('Recent'));
    }
  }
  unpinned.forEach(entry => historyList.appendChild(makeHistoryItem(entry)));

  // "Clear history" only ever removes unpinned entries, so update its label
  // to reflect that once something is pinned.
  clearHistoryBtn.textContent = pinned.length ? '✕ Clear recent' : '✕ Clear history';
  clearHistoryBtn.disabled = unpinned.length === 0;
}

function makeSectionLabel(text){
  const li = document.createElement('li');
  li.className = 'history-section-label';
  li.setAttribute('role', 'presentation');
  li.textContent = text;
  return li;
}

function makeHistoryItem(entry){
  const li = document.createElement('li');
  li.className = 'history-item' + (entry.pinned ? ' pinned' : '');

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = 'pin-btn' + (entry.pinned ? ' active' : '');
  pinBtn.textContent = entry.pinned ? '★' : '☆';
  pinBtn.title = entry.pinned ? 'Unpin' : 'Pin this translation';
  pinBtn.setAttribute('aria-pressed', String(Boolean(entry.pinned)));
  pinBtn.setAttribute('aria-label', entry.pinned ? 'Unpin this translation' : 'Pin this translation so it stays in history');
  pinBtn.addEventListener('click', () => togglePin(entry.id));

  // A real <button> instead of a clickable <li> so this entry is keyboard-
  // reachable via Tab and activatable via Enter/Space, and announced
  // correctly by screen readers (native button semantics, no extra ARIA
  // wiring needed).
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'history-item-btn';
  btn.setAttribute(
    'aria-label',
    `Reload translation from ${entry.src.toUpperCase()} to ${entry.tgt.toUpperCase()}: ${truncate(entry.sourceText, 40)}`
  );

  const meta = document.createElement('div');
  meta.className = 'history-meta';
  meta.textContent = `${entry.src.toUpperCase()} → ${entry.tgt.toUpperCase()} · ${formatTime(entry.ts)}`;

  const textRow = document.createElement('div');
  textRow.className = 'history-text';
  textRow.innerHTML = `${escapeHtml(truncate(entry.sourceText, 40))}<span class="arrow">→</span>${escapeHtml(truncate(entry.translatedText, 40))}`;

  btn.appendChild(meta);
  btn.appendChild(textRow);

  btn.addEventListener('click', () => {
    sourceSel.value = entry.src;
    targetSel.value = entry.tgt;
    sourceText.value = entry.sourceText;
    updateCharCount();
    showResult(entry.translatedText);
    setStatus('');
  });

  li.appendChild(pinBtn);
  li.appendChild(btn);
  return li;
}

clearHistoryBtn.addEventListener('click', () => {
  try{
    const history = loadHistory();
    const pinned = history.filter(e => e.pinned);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(pinned));
  } catch(err){
    console.warn('Could not clear translation history:', err);
  }
  renderHistory();
});

function truncate(str, len){
  if(!str) return '';
  return str.length > len ? str.slice(0, len).trim() + '…' : str;
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(ts){
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
