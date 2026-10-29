'use strict';

// ---------- 저장소 ----------
const KEY = 'homework-app-v1';
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const PAST_DAYS = 6; // 오늘 포함 7일을 볼 수 있음

const uid = () => Math.random().toString(36).slice(2, 10);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

function defaultData() {
  const weekdays = [1, 2, 3, 4, 5];
  return {
    settings: { pin: '0000', childName: '', extraPoints: 10, halfRatio: 0.5, lockExtra: false },
    startedAt: dateKey(new Date()), // 이 날 이전은 '안 한 날'로 표시하지 않음
    fixed: [
      { id: uid(), emoji: '🔢', name: '수학 문제집', days: weekdays, points: 10 },
      { id: uid(), emoji: '🔤', name: '영어 단어 외우기', days: weekdays, points: 10 },
      { id: uid(), emoji: '📚', name: '책 읽기 30분', days: [0, 1, 2, 3, 4, 5, 6], points: 10 },
    ],
    rewards: [
      { id: uid(), emoji: '🍦', name: '아이스크림', cost: 100 },
      { id: uid(), emoji: '🎮', name: '게임 30분', cost: 200 },
      { id: uid(), emoji: '🎁', name: '갖고 싶은 선물', cost: 1000 },
    ],
    // days[날짜] = { fixed: { 숙제id: { s: 'done'|'half', p: 받은 포인트 } }, extras: [{ id, name, points, s, p }] }
    days: {},
    // 보상 사용, 직접 준 포인트 등: { at, amount, memo }
    ledger: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const base = defaultData();
      return { ...base, ...d, settings: { ...base.settings, ...d.settings } };
    }
  } catch (e) { /* 저장소를 못 쓰면 기본값으로 */ }
  return defaultData();
}

let data = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (e) { toast('저장하지 못했어요. 브라우저 저장공간을 확인해 주세요.'); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- 포인트 ----------
function earned(s, points) {
  if (s === 'done') return points;
  if (s === 'half') return Math.round(points * data.settings.halfRatio);
  return 0;
}
function dayPoints(rec) {
  let sum = 0;
  for (const v of Object.values(rec.fixed || {})) sum += v.p || 0;
  for (const e of rec.extras || []) sum += e.p || 0;
  return sum;
}
function balance() {
  let sum = 0;
  for (const rec of Object.values(data.days)) sum += dayPoints(rec);
  for (const l of data.ledger) sum += l.amount;
  return sum;
}

// ---------- 화면 상태 ----------
let viewDate = startOfToday();
let pastUnlocked = false;

function dayRec(key, create) {
  if (!data.days[key] && create) data.days[key] = { fixed: {}, extras: [] };
  return data.days[key] || { fixed: {}, extras: [] };
}
function itemsFor(date) {
  const key = dateKey(date);
  const rec = dayRec(key);
  const wd = date.getDay();
  const items = data.fixed
    .filter((f) => f.days.includes(wd) || rec.fixed[f.id])
    .map((f) => ({ kind: 'fixed', id: f.id, emoji: f.emoji, name: f.name, points: f.points, s: rec.fixed[f.id] ? rec.fixed[f.id].s : null }));
  for (const e of rec.extras) items.push({ kind: 'extra', id: e.id, emoji: '✏️', name: e.name, points: e.points, s: e.s });
  return items;
}
function isToday() { return dateKey(viewDate) === dateKey(startOfToday()); }
function canEdit() { return isToday() || pastUnlocked; }

// ---------- 그리기 ----------
function render() {
  const name = data.settings.childName.trim();
  $('appTitle').textContent = name ? `${name}의 숙제` : '오늘의 숙제';
  document.title = $('appTitle').textContent;

  const today = startOfToday();
  const label = `${viewDate.getMonth() + 1}월 ${viewDate.getDate()}일 (${DAY_NAMES[viewDate.getDay()]})`;
  $('dateLabel').textContent = isToday() ? `${label} · 오늘` : label;
  $('prevDay').disabled = viewDate <= addDays(today, -PAST_DAYS);
  $('nextDay').disabled = isToday();

  renderWeek(today);
  renderList();
  renderRewards();
  $('pointsValue').textContent = balance().toLocaleString();
}

function renderWeek(today) {
  const strip = $('weekStrip');
  strip.innerHTML = '';
  for (let i = PAST_DAYS; i >= 0; i--) {
    const d = addDays(today, -i);
    const items = itemsFor(d);
    const done = items.filter((x) => x.s === 'done').length;
    let mark = '·';
    if (items.length && done === items.length) mark = '⭐';
    else if (items.some((x) => x.s)) mark = '🟡';
    else if (i > 0 && items.length && dateKey(d) >= data.startedAt) mark = '⚪';
    const b = document.createElement('button');
    b.className = dateKey(d) === dateKey(viewDate) ? 'sel' : '';
    b.innerHTML = `<span>${DAY_NAMES[d.getDay()]}</span><span class="mark">${mark}</span><span>${d.getDate()}</span>`;
    b.onclick = () => { viewDate = d; pastUnlocked = false; render(); };
    strip.appendChild(b);
  }
}

function renderList() {
  const items = itemsFor(viewDate);
  const list = $('hwList');
  const editable = canEdit();
  $('pastNotice').hidden = isToday() || pastUnlocked;
  $('extraForm').hidden = !editable;

  if (!items.length) {
    list.innerHTML = '<li class="empty">이 날은 정해진 숙제가 없어요 😊</li>';
  } else {
    list.innerHTML = items.map((it) => {
      const half = earned('half', it.points);
      return `<li class="hw ${it.s || ''}" data-kind="${it.kind}" data-id="${it.id}">
        <span class="hw-emoji">${esc(it.emoji || '📝')}</span>
        <div class="hw-body">
          <div class="hw-name">${esc(it.name)}${it.kind === 'extra' ? '<span class="tag-extra">추가</span>' : ''}</div>
          <div class="hw-meta">✓ ${it.points}점 · △ ${half}점</div>
        </div>
        <div class="hw-btns">
          <button class="chk half ${it.s === 'half' ? 'on' : ''}" data-s="half" ${editable ? '' : 'disabled'} aria-label="하다 말았어요">△<small>조금</small></button>
          <button class="chk done ${it.s === 'done' ? 'on' : ''}" data-s="done" ${editable ? '' : 'disabled'} aria-label="다 했어요">✓<small>다 했어</small></button>
          ${it.kind === 'extra' && editable ? '<button class="del-extra" data-del="1" aria-label="추가 숙제 지우기">✕</button>' : ''}
        </div>
      </li>`;
    }).join('');
  }
  $('allDone').hidden = !(items.length && items.every((x) => x.s === 'done'));
}

function renderRewards() {
  const bal = balance();
  const sorted = [...data.rewards].sort((a, b) => a.cost - b.cost);
  const next = sorted.find((r) => r.cost > bal);
  const nr = $('nextReward');
  if (!sorted.length) nr.innerHTML = '<span class="hint">부모님 설정에서 보상을 추가해 주세요.</span>';
  else if (next) {
    const pct = Math.min(100, Math.round((bal / next.cost) * 100));
    nr.innerHTML = `${esc(next.emoji)} <b>${esc(next.name)}</b>까지 <b>${(next.cost - bal).toLocaleString()}점</b> 남았어요!
      <div class="bar"><i style="width:${Math.max(pct, 0)}%"></i></div>`;
  } else nr.innerHTML = '🥳 모든 보상을 받을 수 있어요!';

  $('rewardList').innerHTML = sorted.map((r) => `
    <li class="reward">
      <span class="r-emoji">${esc(r.emoji || '🎁')}</span>
      <div class="r-body"><div class="r-name">${esc(r.name)}</div><div class="r-cost">${r.cost.toLocaleString()}점</div></div>
      <button class="btn small ${bal >= r.cost ? 'primary' : ''}" data-reward="${r.id}" ${bal >= r.cost ? '' : 'disabled'}>받기</button>
    </li>`).join('');
}

// ---------- 숙제 체크 ----------
$('hwList').addEventListener('click', (ev) => {
  const li = ev.target.closest('.hw');
  if (!li || !canEdit()) return;
  const key = dateKey(viewDate);
  const rec = dayRec(key, true);
  const { kind, id } = li.dataset;

  if (ev.target.closest('[data-del]')) {
    rec.extras = rec.extras.filter((e) => e.id !== id);
    save(); render();
    return;
  }
  const btn = ev.target.closest('.chk');
  if (!btn) return;
  const want = btn.dataset.s;

  let before = 0, after = 0;
  if (kind === 'fixed') {
    const f = data.fixed.find((x) => x.id === id);
    const cur = rec.fixed[id];
    before = cur ? cur.p : 0;
    if (cur && cur.s === want) delete rec.fixed[id];
    else rec.fixed[id] = { s: want, p: earned(want, f ? f.points : 0) };
    after = rec.fixed[id] ? rec.fixed[id].p : 0;
  } else {
    const e = rec.extras.find((x) => x.id === id);
    before = e.p || 0;
    e.s = e.s === want ? null : want;
    e.p = earned(e.s, e.points);
    after = e.p;
  }
  save();
  const wasAllDone = !$('allDone').hidden;
  render();
  const delta = after - before;
  if (delta) floatPoints(btn, delta);
  if (!wasAllDone && !$('allDone').hidden) confetti();
});

$('extraForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const name = $('extraInput').value.trim();
  if (!name) return;
  if (data.settings.lockExtra && !(await askPin('추가 숙제 등록'))) return;
  dayRec(dateKey(viewDate), true).extras.push({ id: uid(), name, points: Number(data.settings.extraPoints) || 0, s: null, p: 0 });
  $('extraInput').value = '';
  save(); render();
});

$('prevDay').onclick = () => { viewDate = addDays(viewDate, -1); pastUnlocked = false; render(); };
$('nextDay').onclick = () => { viewDate = addDays(viewDate, 1); pastUnlocked = false; render(); };
$('unlockPast').onclick = async () => { if (await askPin('지난 날 고치기')) { pastUnlocked = true; render(); } };

// 날짜가 바뀌면 오늘로 돌아오기
let lastToday = dateKey(startOfToday());
function checkDayChange() {
  const now = dateKey(startOfToday());
  if (now !== lastToday) { lastToday = now; viewDate = startOfToday(); pastUnlocked = false; render(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });
setInterval(checkDayChange, 60 * 1000);

// ---------- 보상 ----------
$('rewardList').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-reward]');
  if (!b) return;
  const r = data.rewards.find((x) => x.id === b.dataset.reward);
  if (!r || balance() < r.cost) return;
  if (!(await askPin(`'${r.name}' 보상 주기`))) return;
  data.ledger.push({ at: Date.now(), amount: -r.cost, memo: `보상: ${r.name}` });
  save(); render();
  confetti();
  toast(`${r.emoji || '🎁'} ${r.name} 보상을 받았어요!`);
});

// ---------- 도구: 사전 ----------
const DICTS = {
  naver: (w) => `https://en.dict.naver.com/#/search?query=${encodeURIComponent(w)}`,
  daum: (w) => `https://dic.daum.net/search.do?q=${encodeURIComponent(w)}&dic=eng`,
  papago: (w) => `https://papago.naver.com/?sk=en&tk=ko&st=${encodeURIComponent(w)}`,
};
function openDict(which) {
  const w = $('dictInput').value.trim();
  if (!w) { $('dictInput').focus(); toast('찾을 단어를 먼저 적어요'); return; }
  window.open(DICTS[which](w), '_blank', 'noopener');
}
document.querySelectorAll('[data-dict]').forEach((b) => { b.onclick = () => openDict(b.dataset.dict); });
$('dictForm').addEventListener('submit', (ev) => { ev.preventDefault(); openDict('naver'); });

// ---------- 도구: QR ----------
let qrStream = null, qrTimer = null, qrFound = '';
const detector = ('BarcodeDetector' in window) ? new BarcodeDetector({ formats: ['qr_code'] }) : null;

async function decodeFrom(source, w, h) {
  if (detector) {
    try { const r = await detector.detect(source); if (r.length) return r[0].rawValue; } catch (e) { /* jsQR로 시도 */ }
  }
  if (!window.jsQR) return '';
  const c = $('qrCanvas');
  const scale = Math.min(1, 800 / Math.max(w, h));
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const code = jsQR(img.data, img.width, img.height);
  return code ? code.data : '';
}

async function startQr() {
  $('qrModal').hidden = false;
  $('qrResult').hidden = true;
  $('qrStatus').textContent = '카메라를 켜는 중…';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $('qrStatus').textContent = '이 화면에서는 카메라를 바로 켤 수 없어요. "사진 찍어서 읽기"를 눌러 주세요.';
    return;
  }
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const v = $('qrVideo');
    v.srcObject = qrStream;
    await v.play();
    $('qrStatus').textContent = 'QR 코드를 비춰 주세요';
    qrTimer = setInterval(async () => {
      if (!v.videoWidth || qrFound) return;
      const text = await decodeFrom(v, v.videoWidth, v.videoHeight);
      if (text) showQr(text);
    }, 250);
  } catch (e) {
    $('qrStatus').textContent = '카메라를 켤 수 없어요. 카메라 권한을 허용하거나 "사진 찍어서 읽기"를 눌러 주세요.';
  }
}
function stopCamera() {
  clearInterval(qrTimer); qrTimer = null;
  if (qrStream) { qrStream.getTracks().forEach((t) => t.stop()); qrStream = null; }
}
function showQr(text) {
  qrFound = text;
  stopCamera();
  if (navigator.vibrate) navigator.vibrate(80);
  $('qrStatus').textContent = '찾았어요!';
  $('qrText').textContent = text;
  const isUrl = /^https?:\/\//i.test(text);
  $('qrOpen').hidden = !isUrl;
  $('qrResult').hidden = false;
}
function closeQr() { stopCamera(); qrFound = ''; $('qrModal').hidden = true; }

$('openQr').onclick = startQr;
$('qrClose').onclick = closeQr;
$('qrAgain').onclick = () => { qrFound = ''; startQr(); };
$('qrOpen').onclick = () => { if (qrFound) window.open(qrFound, '_blank', 'noopener'); };
$('qrPhoto').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  stopCamera();
  $('qrStatus').textContent = '사진에서 찾는 중…';
  try {
    const bmp = await createImageBitmap(file);
    const text = await decodeFrom(bmp, bmp.width, bmp.height);
    if (text) showQr(text);
    else $('qrStatus').textContent = 'QR 코드를 못 찾았어요. 조금 더 가까이 찍어 볼까요?';
  } catch (e) {
    $('qrStatus').textContent = '사진을 읽지 못했어요.';
  }
});

// ---------- 비밀번호 ----------
let pinResolve = null, pinBuf = '';
function askPin(title) {
  return new Promise((resolve) => {
    pinResolve = resolve; pinBuf = '';
    $('pinTitle').textContent = `🔒 ${title} - 부모님 비밀번호`;
    drawPin();
    $('pinModal').hidden = false;
  });
}
function drawPin() {
  [...$('pinDots').children].forEach((d, i) => d.classList.toggle('on', i < pinBuf.length));
}
function endPin(ok) { $('pinModal').hidden = true; if (pinResolve) pinResolve(ok); pinResolve = null; }
(function buildKeypad() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  $('keypad').innerHTML = keys.map((k) => k ? `<button data-k="${k}">${k}</button>` : '<span></span>').join('');
  $('keypad').addEventListener('click', (ev) => {
    const k = ev.target.dataset && ev.target.dataset.k;
    if (!k) return;
    if (k === '⌫') pinBuf = pinBuf.slice(0, -1);
    else if (pinBuf.length < 4) pinBuf += k;
    drawPin();
    if (pinBuf.length === 4) {
      if (pinBuf === data.settings.pin) setTimeout(() => endPin(true), 120);
      else {
        const dots = $('pinDots');
        dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
        setTimeout(() => { pinBuf = ''; drawPin(); }, 400);
      }
    }
  });
})();
$('pinCancel').onclick = () => endPin(false);

// ---------- 부모님 설정 ----------
$('openSettings').onclick = async () => {
  if (!(await askPin('설정 열기'))) return;
  renderSettings();
  $('settings').hidden = false;
  $('settings').scrollTop = 0;
};
$('closeSettings').onclick = () => { $('settings').hidden = true; save(); render(); };

function renderSettings() {
  const s = data.settings;
  $('setName').value = s.childName;
  $('setExtraPoints').value = s.extraPoints;
  $('setHalfRatio').value = String(s.halfRatio);
  $('setLockExtra').checked = s.lockExtra;
  renderFixedEditor();
  renderRewardEditor();
  renderLedger();
}

function renderFixedEditor() {
  $('fixedEditor').innerHTML = data.fixed.map((f) => `
    <li class="ed-row" data-id="${f.id}">
      <input class="e-emoji" data-f="emoji" value="${esc(f.emoji)}" maxlength="4" aria-label="그림">
      <input class="e-name" data-f="name" value="${esc(f.name)}" maxlength="30" placeholder="숙제 이름">
      <input class="e-num" data-f="points" type="number" min="0" value="${f.points}" aria-label="포인트"> 점
      <div class="days">${DAY_NAMES.map((n, i) => `<button type="button" data-day="${i}" class="${f.days.includes(i) ? 'on' : ''}">${n}</button>`).join('')}</div>
      <button class="btn small ghost" data-remove="1">삭제</button>
    </li>`).join('');
}
$('fixedEditor').addEventListener('input', (ev) => {
  const li = ev.target.closest('.ed-row'); const f = data.fixed.find((x) => x.id === li.dataset.id);
  const k = ev.target.dataset.f;
  if (!f || !k) return;
  f[k] = k === 'points' ? Math.max(0, Number(ev.target.value) || 0) : ev.target.value;
  save();
});
$('fixedEditor').addEventListener('click', (ev) => {
  const li = ev.target.closest('.ed-row'); if (!li) return;
  const f = data.fixed.find((x) => x.id === li.dataset.id);
  if (ev.target.dataset.day !== undefined) {
    const d = Number(ev.target.dataset.day);
    f.days = f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort();
    ev.target.classList.toggle('on');
    save();
  } else if (ev.target.dataset.remove) {
    data.fixed = data.fixed.filter((x) => x.id !== f.id);
    save(); renderFixedEditor();
  }
});
$('addFixed').onclick = () => {
  data.fixed.push({ id: uid(), emoji: '📝', name: '', days: [1, 2, 3, 4, 5], points: 10 });
  save(); renderFixedEditor();
  const inputs = $('fixedEditor').querySelectorAll('.e-name');
  inputs[inputs.length - 1].focus();
};

function renderRewardEditor() {
  $('rewardEditor').innerHTML = data.rewards.map((r) => `
    <li class="ed-row" data-id="${r.id}">
      <input class="e-emoji" data-f="emoji" value="${esc(r.emoji)}" maxlength="4" aria-label="그림">
      <input class="e-name" data-f="name" value="${esc(r.name)}" maxlength="30" placeholder="보상 이름">
      <input class="e-num" data-f="cost" type="number" min="1" value="${r.cost}" aria-label="필요 포인트"> 점
      <button class="btn small ghost" data-remove="1">삭제</button>
    </li>`).join('');
}
$('rewardEditor').addEventListener('input', (ev) => {
  const li = ev.target.closest('.ed-row'); const r = data.rewards.find((x) => x.id === li.dataset.id);
  const k = ev.target.dataset.f;
  if (!r || !k) return;
  r[k] = k === 'cost' ? Math.max(1, Number(ev.target.value) || 1) : ev.target.value;
  save();
});
$('rewardEditor').addEventListener('click', (ev) => {
  if (!ev.target.dataset.remove) return;
  const id = ev.target.closest('.ed-row').dataset.id;
  data.rewards = data.rewards.filter((x) => x.id !== id);
  save(); renderRewardEditor();
});
$('addReward').onclick = () => {
  data.rewards.push({ id: uid(), emoji: '🎁', name: '', cost: 100 });
  save(); renderRewardEditor();
  const inputs = $('rewardEditor').querySelectorAll('.e-name');
  inputs[inputs.length - 1].focus();
};

$('setName').oninput = (ev) => { data.settings.childName = ev.target.value; save(); };
$('setExtraPoints').oninput = (ev) => { data.settings.extraPoints = Math.max(0, Number(ev.target.value) || 0); save(); };
$('setHalfRatio').onchange = (ev) => { data.settings.halfRatio = Number(ev.target.value); save(); };
$('setLockExtra').onchange = (ev) => { data.settings.lockExtra = ev.target.checked; save(); };

function renderLedger() {
  const rows = [];
  for (const [key, rec] of Object.entries(data.days)) {
    const p = dayPoints(rec);
    if (p) rows.push({ at: new Date(key + 'T23:59:00').getTime(), amount: p, memo: `${key.slice(5).replace('-', '/')} 숙제` });
  }
  for (const l of data.ledger) rows.push(l);
  rows.sort((a, b) => b.at - a.at);
  $('ledgerList').innerHTML = rows.slice(0, 60).map((r) => {
    const d = new Date(r.at);
    return `<li><span>${d.getMonth() + 1}/${d.getDate()} ${esc(r.memo)}</span><b class="${r.amount >= 0 ? 'plus' : 'minus'}">${r.amount >= 0 ? '+' : ''}${r.amount}</b></li>`;
  }).join('') || '<li class="hint">아직 기록이 없어요</li>';
}
$('adjustForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const amount = Math.trunc(Number($('adjustAmount').value));
  if (!amount) { toast('포인트를 숫자로 적어 주세요 (예: 20, -10)'); return; }
  const memo = $('adjustMemo').value.trim() || (amount > 0 ? '부모님 보너스' : '포인트 차감');
  data.ledger.push({ at: Date.now(), amount, memo });
  $('adjustAmount').value = ''; $('adjustMemo').value = '';
  save(); renderLedger();
  toast(`${amount > 0 ? '+' : ''}${amount}점 적용했어요`);
});
$('pinForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const p = $('newPin').value;
  if (!/^\d{4}$/.test(p)) { toast('숫자 4자리로 적어 주세요'); return; }
  data.settings.pin = p; $('newPin').value = '';
  save(); toast('비밀번호를 바꿨어요');
});

$('exportData').onclick = () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `숙제백업-${dateKey(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('importData').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!d || !Array.isArray(d.fixed) || !d.days) throw new Error('형식 오류');
    const base = defaultData();
    data = { ...base, ...d, settings: { ...base.settings, ...d.settings } };
    save(); renderSettings(); render();
    toast('백업을 불러왔어요');
  } catch (e) {
    toast('백업 파일을 읽지 못했어요');
  }
});

// ---------- 효과 ----------
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}
function floatPoints(anchor, delta) {
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'float-pts' + (delta < 0 ? ' minus' : '');
  el.textContent = (delta > 0 ? '+' : '') + delta;
  el.style.left = `${r.left + r.width / 2 - 20}px`;
  el.style.top = `${r.top - 10}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
  const badge = $('pointsBadge');
  badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
}
function confetti() {
  const bits = ['🎉', '⭐', '🌟', '🎊', '💖', '✨'];
  for (let i = 0; i < 28; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.textContent = bits[i % bits.length];
    el.style.left = `${Math.random() * 100}vw`;
    el.style.animationDelay = `${Math.random() * 0.6}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
}

// ---------- 시작 ----------
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
