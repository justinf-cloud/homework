'use strict';

// ---------- 저장소 ----------
const KEY = 'homework-app-v1';
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const PAST_DAYS = 6; // 오늘 포함 7일을 볼 수 있음
const KUMON_DAYS = [0, 1, 3, 4, 5, 6]; // 화요일 빼고 매일
const LATE_RATIO = 0.5; // 그날 못 하고 다음날 이후에 체크하면 절반
// 포인트를 그림으로: 1,000점 하트, 10,000점 별, 100,000점 왕관
const HEART = 1000, STAR = 10000, CROWN = 100000;

const uid = () => Math.random().toString(36).slice(2, 10);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function keyToDate(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

function defaultData() {
  const weekdays = [1, 2, 3, 4, 5];
  return {
    settings: { pin: '0000', childName: '', extraPoints: 10, halfRatio: 0.5, lockExtra: false, streak2: 5, streak3: 10 },
    startedAt: dateKey(new Date()), // 이 날 이전은 '안 한 날'로 표시하지 않음
    // weekly: 화~월 한 주 안에 언제든 체크, bonus: 안 해도 되는 보너스(연속 보너스 있음)
    fixed: [
      { id: uid(), emoji: '🔢', name: '수학 문제집', days: weekdays, points: 10 },
      { id: uid(), emoji: '🔤', name: '영어 단어 외우기', days: weekdays, points: 10 },
    ],
    rewards: [
      { id: uid(), emoji: '🍦', name: '아이스크림', cost: 100 },
      { id: uid(), emoji: '🎮', name: '게임 30분', cost: 200 },
      { id: uid(), emoji: '🎁', name: '갖고 싶은 선물', cost: 1000 },
    ],
    // days[날짜] = { fixed: { 숙제id: 기록 }, extras: [{ id, name, points, ...기록 }] }
    // 기록 = { s: 'done'|'half'|null, p: 받은 포인트, h: △를 찍은 적 있음, late: 다음날 이후 완성 }
    days: {},
    // 포인트 사용, 직접 준 포인트 등: { at, amount, memo }
    ledger: [],
  };
}

// 이미 쓰던 데이터에도 새 기본 숙제를 한 번만 넣어 줌
function migrate(d) {
  d.migrated = d.migrated || [];
  if (!d.migrated.includes('kumon')) {
    const kumon = d.fixed.filter((f) => f.name.includes('구몬'));
    if (kumon.length) kumon.forEach((f) => { f.weekly = true; });
    else d.fixed.unshift(
      { id: uid(), emoji: '📘', name: '구몬 수학', days: KUMON_DAYS, points: 10, weekly: true },
      { id: uid(), emoji: '📗', name: '구몬 국어', days: KUMON_DAYS, points: 10, weekly: true },
    );
    d.migrated.push('kumon');
  }
  if (!d.migrated.includes('bonusRead')) {
    d.fixed.push(
      { id: uid(), emoji: '📕', name: '영어책 읽기', days: EVERY_DAY, points: 10, bonus: true },
      { id: uid(), emoji: '📙', name: '한글책 읽기', days: EVERY_DAY, points: 10, bonus: true },
    );
    d.migrated.push('bonusRead');
  }
  return d;
}

function fromSaved(d) {
  const base = defaultData();
  return migrate({ ...base, ...d, settings: { ...base.settings, ...d.settings } });
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return fromSaved(JSON.parse(raw));
  } catch (e) { /* 저장소를 못 쓰면 기본값으로 */ }
  return migrate(defaultData());
}

let data = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (e) { toast('저장하지 못했어요. 브라우저 저장공간을 확인해 주세요.'); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- 포인트 ----------
function earned(s, points, late) {
  let p = 0;
  if (s === 'done') p = points;
  if (s === 'half') p = points * data.settings.halfRatio;
  return Math.round(late ? p * LATE_RATIO : p);
}

// 체크 버튼을 눌렀을 때 기록 바꾸기.
// 그 날짜가 지난 뒤에 체크하면 늦은 체크(절반). 주간 숙제(구몬)는 이번 주 안이면 괜찮지만,
// △를 찍어 둔 것을 다음날 이후에 ✓하면 절반. 부모님이 비밀번호로 고칠 때는 그대로.
function isLateCheck(entry, weekly, key) {
  if (!entry.s || pastUnlocked || key >= dateKey(startOfToday())) return false;
  if (weekly && inThisWeek(keyToDate(key))) return entry.s === 'done' && !!entry.h;
  return true;
}
function applyCheck(entry, want, points, key, weekly) {
  entry.s = entry.s === want ? null : want;
  if (entry.s === 'half') entry.h = true;
  entry.late = isLateCheck(entry, weekly, key);
  entry.p = earned(entry.s, points, entry.late);
}

// 보너스 숙제 연속 기록 (늦은 완성은 연속으로 치지 않음)
function succeeded(key, id) {
  const r = data.days[key];
  const v = r && r.fixed[id];
  return !!(v && v.s === 'done' && !v.late);
}
function streakAt(id, date) {
  let n = 0;
  for (let d = new Date(date); n < 1000 && succeeded(dateKey(d), id); d = addDays(d, -1)) n++;
  return n;
}
function streakBonus(n) {
  if (n >= 3) return data.settings.streak3;
  if (n === 2) return data.settings.streak2;
  return 0;
}
function dayTotal(key, rec) {
  let sum = 0;
  for (const v of Object.values(rec.fixed || {})) sum += v.p || 0;
  for (const e of rec.extras || []) sum += e.p || 0;
  const date = keyToDate(key);
  for (const f of data.fixed) {
    if (f.bonus && succeeded(key, f.id)) sum += streakBonus(streakAt(f.id, date));
  }
  return sum;
}
function balance() {
  let sum = 0;
  for (const [key, rec] of Object.entries(data.days)) sum += dayTotal(key, rec);
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
    .map((f) => ({ kind: 'fixed', id: f.id, emoji: f.emoji, name: f.name, points: f.points, weekly: !!f.weekly, bonus: !!f.bonus, ...(rec.fixed[f.id] || {}) }));
  for (const e of rec.extras) items.push({ kind: 'extra', emoji: '✏️', ...e });
  return items;
}
const homeworkOf = (items) => items.filter((x) => !x.bonus);

function isToday() { return dateKey(viewDate) === dateKey(startOfToday()); }
function isYesterday() { return dateKey(viewDate) === dateKey(addDays(startOfToday(), -1)); }
// 어제 숙제까지는 아이가 직접 고칠 수 있고, 그 전은 부모님 비밀번호가 필요함
function canEdit() { return isToday() || isYesterday() || pastUnlocked; }
// 주간 숙제(구몬)는 화~월 한 주 안이면 언제든 체크할 수 있음
function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return addDays(x, -((x.getDay() + 5) % 7)); }
function inThisWeek(d) { return dateKey(weekStart(d)) === dateKey(weekStart(startOfToday())); }
function itemEditable(weekly) { return canEdit() || (weekly && inThisWeek(viewDate)); }

// ---------- 그리기 ----------
function render() {
  const name = data.settings.childName.trim();
  $('appTitle').textContent = name ? `${name}의 숙제` : '오늘의 숙제';
  document.title = $('appTitle').textContent;

  const today = startOfToday();
  const label = `${viewDate.getMonth() + 1}월 ${viewDate.getDate()}일 (${DAY_NAMES[viewDate.getDay()]})`;
  $('dateLabel').textContent = isToday() ? `${label} · 오늘` : isYesterday() ? `${label} · 어제` : label;
  $('prevDay').disabled = viewDate <= addDays(today, -PAST_DAYS);
  $('nextDay').disabled = isToday();

  renderWeek(today);
  renderWeeklySummary(today);
  renderList();
  renderRewards();
  renderPoints();
}

function renderPoints() {
  const bal = balance();
  const pos = Math.max(0, bal);
  const crowns = Math.floor(pos / CROWN);
  const stars = Math.floor((pos % CROWN) / STAR);
  const hearts = Math.floor((pos % STAR) / HEART);
  $('trophies').innerHTML =
    '<span class="crown">👑</span>'.repeat(crowns) +
    '<span class="star">⭐</span>'.repeat(stars) +
    '<span class="heart">❤️</span>'.repeat(hearts);
  $('trophies').hidden = !(crowns || stars || hearts);
  $('pointsValue').textContent = bal.toLocaleString();
  $('nextHeart').textContent = `다음 ❤️까지 ${(HEART - (pos % HEART)).toLocaleString()}점`;
}

// 하트·별·왕관을 새로 모으면 축하
function celebrateLevel(before, after) {
  const levels = [[CROWN, '👑 대형 왕관'], [STAR, '⭐ 별'], [HEART, '❤️ 하트']];
  for (const [unit, name] of levels) {
    if (Math.floor(after / unit) > Math.floor(before / unit)) {
      confetti();
      toast(`${name}을(를) 모았어요! 대단해요!`);
      return;
    }
  }
}

function renderWeek(today) {
  const strip = $('weekStrip');
  strip.innerHTML = '';
  for (let i = PAST_DAYS; i >= 0; i--) {
    const d = addDays(today, -i);
    const items = homeworkOf(itemsFor(d));
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

// 이번 주(화~월) 주간 숙제를 몇 번 했는지
function renderWeeklySummary(today) {
  const weekly = data.fixed.filter((f) => f.weekly && !f.bonus);
  const box = $('weeklySummary');
  box.hidden = !weekly.length;
  if (!weekly.length) return;
  const start = weekStart(today);
  box.innerHTML = '<b>이번 주 (화~월)</b> ' + weekly.map((f) => {
    let total = 0, done = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (!f.days.includes(d.getDay())) continue;
      total++;
      const v = dayRec(dateKey(d)).fixed[f.id];
      if (v && v.s === 'done') done++;
    }
    return `<span class="ws-item">${esc(f.emoji)} ${esc(f.name)} <b>${done}/${total}</b></span>`;
  }).join('');
}

function itemHtml(it) {
  const ok = it.bonus ? canEdit() : itemEditable(it.weekly);
  const tag = it.kind === 'extra' ? '<span class="tag-extra">추가</span>' : it.weekly ? '<span class="tag-extra weekly">이번 주 안에</span>' : '';
  const pastDay = dateKey(viewDate) < dateKey(startOfToday());
  let meta;
  if (it.late) {
    meta = `늦게 체크해서 절반 · ${it.p}점`;
  } else if (pastDay && !it.s && !(it.weekly && inThisWeek(viewDate)) && !pastUnlocked) {
    meta = it.bonus
      ? `지금 하면 절반 · ✓ ${earned('done', it.points, true)}점 (연속 안 됨)`
      : `지금 하면 절반 · ✓ ${earned('done', it.points, true)}점 · △ ${earned('half', it.points, true)}점`;
  } else if (it.bonus) {
    meta = `✓ ${it.points}점`;
    if (it.s === 'done') {
      const n = streakAt(it.id, viewDate);
      if (n >= 2) meta += ` · 🔥 ${n}일 연속! +${streakBonus(n)}`;
    } else {
      const next = streakBonus(streakAt(it.id, addDays(viewDate, -1)) + 1);
      if (next) meta += ` · 🔥 하면 연속 보너스 +${next}`;
    }
  } else {
    meta = `✓ ${it.points}점 · △ ${earned('half', it.points)}점`;
  }
  const halfBtn = it.bonus ? '' :
    `<button class="chk half ${it.s === 'half' ? 'on' : ''}" data-s="half" ${ok ? '' : 'disabled'} aria-label="하다 말았어요">△<small>조금</small></button>`;
  return `<li class="hw ${it.s || ''} ${it.late ? 'late' : ''}" data-kind="${it.kind}" data-id="${it.id}" data-weekly="${it.weekly ? 1 : ''}" data-bonus="${it.bonus ? 1 : ''}">
    <span class="hw-emoji">${esc(it.emoji || '📝')}</span>
    <div class="hw-body">
      <div class="hw-name">${esc(it.name)}${tag}</div>
      <div class="hw-meta">${meta}</div>
    </div>
    <div class="hw-btns">
      ${halfBtn}
      <button class="chk done ${it.s === 'done' ? 'on' : ''}" data-s="done" ${ok ? '' : 'disabled'} aria-label="다 했어요">✓<small>다 했어</small></button>
      ${it.kind === 'extra' && canEdit() ? '<button class="del-extra" data-del="1" aria-label="추가 숙제 지우기">✕</button>' : ''}
    </div>
  </li>`;
}

function renderList() {
  const all = itemsFor(viewDate);
  const items = homeworkOf(all);
  const bonus = all.filter((x) => x.bonus);
  const editable = canEdit();
  $('pastNotice').hidden = all.length ? all.every((it) => (it.bonus ? editable : itemEditable(it.weekly))) : editable;
  $('extraForm').hidden = !editable;

  $('hwList').innerHTML = items.length ? items.map(itemHtml).join('') : '<li class="empty">이 날은 정해진 숙제가 없어요 😊</li>';
  $('allDone').hidden = !(items.length && items.every((x) => x.s === 'done'));
  $('bonusBox').hidden = !bonus.length;
  $('bonusList').innerHTML = bonus.map(itemHtml).join('');
}

function renderRewards() {
  const bal = balance();
  const sorted = [...data.rewards].sort((a, b) => a.cost - b.cost);
  const next = sorted.find((r) => r.cost > bal);
  const nr = $('nextReward');
  if (!sorted.length) nr.innerHTML = '<span class="hint">부모님 설정에서 보상을 추가해 주세요.</span>';
  else if (next) nr.innerHTML = `${esc(next.emoji)} <b>${esc(next.name)}</b>까지 <b>${(next.cost - bal).toLocaleString()}점</b> 남았어요!`;
  else nr.innerHTML = '🥳 모든 보상을 받을 수 있어요! 부모님께 말씀드려요.';

  $('rewardList').innerHTML = sorted.map((r) => {
    const pct = Math.max(0, Math.min(100, Math.round((bal / r.cost) * 100)));
    return `<li class="reward ${pct >= 100 ? 'ready' : ''}">
      <span class="r-emoji">${esc(r.emoji || '🎁')}</span>
      <div class="r-body">
        <div class="r-top"><span class="r-name">${esc(r.name)}</span><span class="r-cost">${pct >= 100 ? '받을 수 있어요!' : `${bal.toLocaleString()} / ${r.cost.toLocaleString()}점`}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>
    </li>`;
  }).join('');
}

// ---------- 숙제 체크 ----------
function onListClick(ev) {
  const li = ev.target.closest('.hw');
  if (!li) return;
  const isBonus = !!li.dataset.bonus;
  if (!(isBonus ? canEdit() : itemEditable(!!li.dataset.weekly))) return;
  const key = dateKey(viewDate);
  const rec = dayRec(key, true);
  const { kind, id } = li.dataset;

  if (ev.target.closest('[data-del]') && canEdit()) {
    rec.extras = rec.extras.filter((e) => e.id !== id);
    save(); render();
    return;
  }
  const btn = ev.target.closest('.chk');
  if (!btn) return;

  const before = balance();
  const wasAllDone = !$('allDone').hidden;
  if (kind === 'fixed') {
    const f = data.fixed.find((x) => x.id === id);
    const entry = rec.fixed[id] || { s: null, p: 0 };
    applyCheck(entry, btn.dataset.s, f ? f.points : 0, key, !!(f && f.weekly));
    if (entry.s || entry.h) rec.fixed[id] = entry; else delete rec.fixed[id];
  } else {
    const e = rec.extras.find((x) => x.id === id);
    applyCheck(e, btn.dataset.s, e.points, key, false);
  }
  save();
  render();
  const after = balance();
  if (after !== before) floatPoints(btn, after - before);
  if (!wasAllDone && !$('allDone').hidden) confetti();
  celebrateLevel(before, after);
}
$('hwList').addEventListener('click', onListClick);
$('bonusList').addEventListener('click', onListClick);

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

// ---------- 도구: 네이버 영어사전 ----------
$('dictForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const w = $('dictInput').value.trim();
  if (!w) { $('dictInput').focus(); toast('찾을 단어를 먼저 적어요'); return; }
  window.open(`https://en.dict.naver.com/#/search?query=${encodeURIComponent(w)}`, '_blank', 'noopener');
  $('dictInput').select();
});

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
  $('setStreak2').value = s.streak2;
  $('setStreak3').value = s.streak3;
  renderFixedEditor();
  renderRewardEditor();
  renderSpend();
  renderLedger();
}

function renderFixedEditor() {
  $('fixedEditor').innerHTML = data.fixed.map((f) => `
    <li class="ed-row" data-id="${f.id}">
      <input class="e-emoji" data-f="emoji" value="${esc(f.emoji)}" maxlength="4" aria-label="그림">
      <input class="e-name" data-f="name" value="${esc(f.name)}" maxlength="30" placeholder="숙제 이름">
      <input class="e-num" data-f="points" type="number" min="0" value="${f.points}" aria-label="포인트"> 점
      <div class="days">${DAY_NAMES.map((n, i) => `<button type="button" data-day="${i}" class="${f.days.includes(i) ? 'on' : ''}">${n}</button>`).join('')}</div>
      <label class="wk"><input type="checkbox" data-f="weekly" ${f.weekly ? 'checked' : ''}> 이번 주(화~월) 안에 언제든 체크</label>
      <label class="wk"><input type="checkbox" data-f="bonus" ${f.bonus ? 'checked' : ''}> 보너스 (안 해도 괜찮음, 연속 보너스)</label>
      <button class="btn small ghost" data-remove="1">삭제</button>
    </li>`).join('');
}
$('fixedEditor').addEventListener('input', (ev) => {
  const li = ev.target.closest('.ed-row'); const f = data.fixed.find((x) => x.id === li.dataset.id);
  const k = ev.target.dataset.f;
  if (!f || !k) return;
  if (k === 'points') f[k] = Math.max(0, Number(ev.target.value) || 0);
  else if (ev.target.type === 'checkbox') f[k] = ev.target.checked;
  else f[k] = ev.target.value;
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
  save(); renderRewardEditor(); renderSpend();
});
$('addReward').onclick = () => {
  data.rewards.push({ id: uid(), emoji: '🎁', name: '', cost: 100 });
  save(); renderRewardEditor(); renderSpend();
  const inputs = $('rewardEditor').querySelectorAll('.e-name');
  inputs[inputs.length - 1].focus();
};

$('setName').oninput = (ev) => { data.settings.childName = ev.target.value; save(); };
$('setExtraPoints').oninput = (ev) => { data.settings.extraPoints = Math.max(0, Number(ev.target.value) || 0); save(); };
$('setHalfRatio').onchange = (ev) => { data.settings.halfRatio = Number(ev.target.value); save(); };
$('setLockExtra').onchange = (ev) => { data.settings.lockExtra = ev.target.checked; save(); };
$('setStreak2').oninput = (ev) => { data.settings.streak2 = Math.max(0, Number(ev.target.value) || 0); save(); };
$('setStreak3').oninput = (ev) => { data.settings.streak3 = Math.max(0, Number(ev.target.value) || 0); save(); };

// 포인트 쓰기: 보상 버튼을 한 번 누르면 확인, 한 번 더 누르면 차감
function addLedger(amount, memo) {
  data.ledger.push({ at: Date.now(), amount, memo });
  save(); renderSpend(); renderLedger();
  toast(`${amount > 0 ? '+' : ''}${amount}점 ${amount > 0 ? '줬어요' : '썼어요'} (남은 포인트 ${balance().toLocaleString()}점)`);
}
function renderSpend() {
  $('spendBalance').textContent = balance().toLocaleString();
  $('spendList').innerHTML = [...data.rewards].sort((a, b) => a.cost - b.cost).map((r) =>
    `<button class="btn" data-spend="${r.id}">${esc(r.emoji)} ${esc(r.name)} <b>-${r.cost.toLocaleString()}</b></button>`).join('');
}
$('spendList').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-spend]');
  if (!b) return;
  const r = data.rewards.find((x) => x.id === b.dataset.spend);
  if (!r) return;
  if (balance() < r.cost) { toast(`포인트가 모자라요 (지금 ${balance().toLocaleString()}점)`); return; }
  if (!b.classList.contains('confirm')) {
    $('spendList').querySelectorAll('.confirm').forEach((x) => { x.classList.remove('confirm'); });
    renderSpend();
    const nb = $('spendList').querySelector(`[data-spend="${r.id}"]`);
    nb.classList.add('confirm');
    nb.innerHTML = `${r.cost.toLocaleString()}점 뺄까요? 한 번 더 누르세요`;
    return;
  }
  addLedger(-r.cost, `사용: ${r.name}`);
});

function renderLedger() {
  const rows = [];
  for (const [key, rec] of Object.entries(data.days)) {
    const p = dayTotal(key, rec);
    if (p) rows.push({ at: keyToDate(key).getTime() + 86399000, amount: p, memo: '숙제' });
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
  const memo = $('adjustMemo').value.trim() || (amount > 0 ? '부모님 보너스' : '포인트 사용');
  $('adjustAmount').value = ''; $('adjustMemo').value = '';
  addLedger(amount, memo);
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
    data = fromSaved(d);
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
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
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
