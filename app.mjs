// DOM controller: owns the one authoritative state and the transient challenge.
// Saved progress changes only through game.mjs transitions; animations never touch it.
import {
  FOODS, COLORS, MAX_NAME, DEFAULT_NAME, IDLE_MS,
  createState, progress, startChallenge, answerQuestion, revealAnswer,
  feed, adopt, drawQuestion, shuffle, idleTick, catScale,
} from './game.mjs';
import { QUESTIONS, getQuestions } from './questions.mjs';
import { SAVE_KEY, loadSave, saveState, resetSave } from './storage.mjs';
import { renderCat, PALETTES } from './cat.mjs';
import { layoutScene, buildScene } from './scene.mjs';

const $ = (sel) => document.querySelector(sel);
const STAGE_LABEL = {
  newborn: 'newborn', kitten: 'tiny kitten', young: 'young kitten',
  adolescent: 'adolescent', youngAdult: 'young adult', adult: 'adult',
};
const COLOR_LABEL = { ginger: 'Ginger', cream: 'Cream', gray: 'Gray', black: 'Black', brown: 'Brown', white: 'White' };
const IDS = Object.fromEntries(Object.keys(FOODS).map((f) => [f, getQuestions(f).map((q) => q.id)]));
const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let storage = null;
try { storage = window.localStorage; } catch { /* blocked: play in memory */ }

let state = null;
let canWrite = true; // false when the existing save could not be read; never overwrite it blindly
let challenge = null;
let question = null;
let choiceOrder = [];
let busy = false; // eating animation in progress (visual only)
let visualTimers = [];
let artKey = '';
let lastAdult = null;

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
// The toast clears itself so it never sits over the HUD or cat for long.
let toastTimer = 0;
const announce = (text) => {
  $('#status').textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#status').textContent = ''; }, 4000);
};

function warnUnsaved() { $('#storage-warning').hidden = false; }

function persist() {
  if (!canWrite || !storage) return warnUnsaved();
  if (!saveState(storage, state).ok) warnUnsaved();
}

// ---------- Dialog helpers: return focus to the opener, or the main action ----------
const openers = new WeakMap();
function openDialog(dialog, opener = document.activeElement) {
  openers.set(dialog, opener);
  dialog.showModal();
}
function mainAction() {
  if (!state) return null;
  return progress(state.currentCat.totalXp).isAdult ? $('#adopt-button') : document.querySelector('[data-earn]');
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('close', () => {
    const opener = openers.get(dialog);
    const target = opener?.isConnected && opener.offsetParent !== null && !opener.disabled ? opener : mainAction();
    target?.focus();
  });
  for (const btn of dialog.querySelectorAll('[data-close]')) btn.addEventListener('click', () => dialog.close());
}
// Dialogs that must not be dismissed. Chromium honors cancel.preventDefault() only once per
// user activation, so also reopen on close while the dialog is still required.
let adoptRequired = false;
let recoveryRequired = false;
const keepOpen = (dialog, required) => {
  dialog.addEventListener('cancel', (e) => { if (required()) e.preventDefault(); });
  dialog.addEventListener('close', () => { if (required()) dialog.showModal(); });
};
keepOpen($('#adopt-dialog'), () => adoptRequired);
keepOpen($('#recovery-dialog'), () => recoveryRequired);

// ---------- Rendering ----------
function render() {
  const cat = state.currentCat;
  const p = progress(cat.totalXp);
  $('#cat-name').textContent = cat.name;
  $('#cat-stage').textContent = `Level ${p.level}, ${STAGE_LABEL[p.stage]}`;
  const bar = $('#xp-bar');
  bar.value = p.intoLevel;
  bar.max = p.needed;
  const xpText = p.isAdult ? 'Adult' : `${p.intoLevel} / ${p.needed} XP to level ${p.level + 1}`;
  $('#xp-label').textContent = xpText;
  bar.setAttribute('aria-valuetext', xpText);
  $('#pet-button').setAttribute('aria-label', `Pet ${cat.name}`);
  walker.style.setProperty('--scale', catScale(p.level));

  const key = `${p.stage}:${cat.color}`;
  if (key !== artKey) {
    artKey = key;
    $('#cat-art').replaceChildren(renderCat({ stage: p.stage, color: cat.color }));
  }

  $('#foods').hidden = p.isAdult;
  $('#adult-panel').hidden = !p.isAdult;
  if (p.isAdult) $('#adult-text').textContent = `${cat.name} reached level 10. Adopt a new kitten whenever you like; this cat will stay in your collection.`;

  for (const card of document.querySelectorAll('.food')) {
    const food = card.dataset.food;
    const count = state.inventory[food];
    card.querySelector('[data-count]').textContent = count;
    card.querySelector('[data-unit]').textContent = count === 1 ? 'serving' : 'servings';
    const feedBtn = card.querySelector('[data-feed]');
    // aria-disabled keeps the focused button focusable while it is unavailable.
    feedBtn.setAttribute('aria-disabled', String(count === 0 || busy));
    feedBtn.setAttribute('aria-label', `Feed ${FOODS[food].label.toLowerCase()} to ${cat.name}, ${count} left`);
  }
  // The phone bottom bar changes height when the adult panel swaps in.
  if (p.isAdult !== lastAdult) { lastAdult = p.isAdult; rebuildScene(); }
}

// ---------- Wandering and visual effects ----------
const walker = $('#walker');
function later(fn, ms) { const t = setTimeout(fn, ms); visualTimers.push(t); return t; }

function cancelVisuals() {
  visualTimers.forEach(clearTimeout);
  visualTimers = [];
  walker.classList.remove('eating', 'walking', 'petted', 'pop');
  $('#hearts').replaceChildren();
  $('#float-xp').replaceChildren();
  busy = false;
}

// ---------- Scene and walking ----------
const phoneLayout = matchMedia('(max-width: 639px), (max-height: 520px)');
let walk = { from: 0, to: 0 };

function placeWalker(x) {
  const max = Math.max(walk.from, walk.to - walker.offsetWidth);
  walker.style.left = `${Math.min(max, Math.max(walk.from, x))}px`;
}

function rebuildScene() {
  const phone = phoneLayout.matches;
  const rail = $('.rail');
  const layout = layoutScene({
    width: innerWidth, height: innerHeight, block: phone ? 32 : 48,
    railWidth: phone ? 0 : rail.offsetWidth + 32,
    minGround: phone ? rail.offsetHeight + 24 : 0,
    seed: 7,
  });
  buildScene($('#scene'), layout);
  document.documentElement.style.setProperty('--ground-h', `${layout.height - layout.groundTop}px`);
  walk = layout.walk;
  placeWalker(walker.style.left ? walker.offsetLeft : (walk.from + walk.to - walker.offsetWidth) / 2);
}
let resizeTimer = 0;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(rebuildScene, 150); });

function wander() {
  setTimeout(wander, 3500 + Math.random() * 3500);
  if (reducedMotion.matches || busy || walker.classList.contains('petted')) return;
  const max = Math.max(walk.from, walk.to - walker.offsetWidth);
  const current = walker.offsetLeft;
  const next = walk.from + Math.random() * (max - walk.from);
  if (Math.abs(next - current) < 40) return;
  walker.classList.toggle('facing-left', next < current);
  walker.classList.add('walking');
  walker.style.left = `${Math.round(next)}px`;
}
for (const type of ['transitionend', 'transitioncancel']) {
  walker.addEventListener(type, (e) => { if (e.propertyName === 'left') walker.classList.remove('walking'); });
}

// Stop a walk mid-transition by pinning the cat where it is now.
function freezeWalk() {
  walker.style.left = `${walker.offsetLeft}px`;
  walker.classList.remove('walking');
}

function popup(container, className, text) {
  if (reducedMotion.matches) return;
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  container.append(el);
  later(() => el.remove(), 1300);
}

function animateEating(xp) {
  if (reducedMotion.matches) return Promise.resolve();
  return new Promise((resolve) => {
    freezeWalk();
    walker.classList.add('eating');
    popup($('#float-xp'), 'xp-pop', `+${xp} XP`);
    later(() => { walker.classList.remove('eating'); resolve(); }, 1200);
  });
}

// Grow pop, sparkles and a level label. Visual only; progress is already saved.
function levelUpEffects(level, isAdult) {
  if (reducedMotion.matches) return;
  walker.classList.remove('pop');
  void walker.offsetWidth; // restart the animation
  walker.classList.add('pop');
  later(() => walker.classList.remove('pop'), 600);
  later(() => popup($('#float-xp'), 'xp-pop level', isAdult ? 'All grown up!' : `Level ${level}!`), 250);
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('span');
    s.className = 'sparkle';
    s.textContent = '✦';
    s.style.left = `${(i - 2) * 26}px`;
    s.style.bottom = `${(i % 2) * 18}px`;
    $('#hearts').append(s);
    later(() => s.remove(), 1100);
  }
}

$('#pet-button').addEventListener('click', () => {
  const name = state?.currentCat.name;
  if (!name) return;
  announce(`${name} purrs happily.`);
  walker.classList.add('petted');
  for (let i = 0; i < 3; i++) {
    later(() => {
      const heart = document.createElement('span');
      heart.className = 'heart';
      heart.textContent = '♥';
      heart.style.left = `${(i - 1) * 22}px`;
      if (!reducedMotion.matches) { $('#hearts').append(heart); later(() => heart.remove(), 1300); }
    }, i * 150);
  }
  later(() => walker.classList.remove('petted'), 1400);
});

// ---------- Feeding ----------
for (const card of document.querySelectorAll('.food')) {
  const food = card.dataset.food;
  card.querySelector('[data-earn]').addEventListener('click', (e) => earn(food, e.currentTarget));
  card.querySelector('[data-feed]').addEventListener('click', () => feedFood(food));
}

function feedFood(food) {
  if (busy) return;
  const name = state.currentCat.name;
  if (state.inventory[food] === 0) {
    announce(`No ${FOODS[food].label.toLowerCase()} yet. Choose “Earn” to solve a problem for a serving.`);
    return;
  }
  const beforeXp = state.currentCat.totalXp;
  const before = progress(beforeXp);
  const next = feed(state, food);
  if (next === state) return;
  state = next;
  persist(); // committed before any animation
  const after = progress(state.currentCat.totalXp);
  const gained = state.currentCat.totalXp - beforeXp;
  const levelUp = after.level > before.level;
  let msg = `${name} ate the ${FOODS[food].label.toLowerCase()}. +${gained} XP.`;
  if (after.isAdult) msg += ' Level 10: all grown up!';
  else if (levelUp) msg += ` Now level ${after.level}!`;
  announce(msg);
  busy = true;
  render();
  if (levelUp) levelUpEffects(after.level, after.isAdult);
  animateEating(gained).finally(() => {
    busy = false;
    render();
    if (after.isAdult) $('#adopt-button').focus();
  });
  if (after.isAdult && reducedMotion.matches) $('#adopt-button').focus();
}

// ---------- Idle growth: +1 XP per IDLE_MS while the tab is visible ----------
function idleStep() {
  if (!state || document.visibilityState !== 'visible') return;
  const before = progress(state.currentCat.totalXp);
  const next = idleTick(state);
  if (next === state) return; // adult
  const hadFoodFocus = $('#foods').contains(document.activeElement);
  state = next;
  persist();
  const after = progress(state.currentCat.totalXp);
  render();
  if (after.level > before.level) {
    const name = state.currentCat.name;
    announce(after.isAdult ? `${name} is all grown up!` : `${name} grew to level ${after.level}!`);
    levelUpEffects(after.level, after.isAdult);
    // An open question can no longer earn food; close it (focus falls back to Adopt).
    if (after.isAdult && dlg.open) dlg.close();
    else if (after.isAdult && hadFoodFocus) $('#adopt-button').focus();
  }
}
setInterval(idleStep, IDLE_MS);

// ---------- Challenges ----------
const dlg = $('#challenge-dialog');

function earn(food, opener) {
  const { id, cycle } = drawQuestion(state.cycles[food], IDS[food]);
  state = { ...state, cycles: { ...state.cycles, [food]: cycle } };
  persist();
  question = BY_ID.get(id);
  challenge = startChallenge(state.currentCat.id, question);
  choiceOrder = shuffle(question.choices);
  renderChallenge();
  if (!dlg.open) openDialog(dlg, opener);
  dlg.querySelector('.choice')?.focus();
}

function renderChallenge() {
  const food = FOODS[challenge.tier];
  $('#challenge-title').textContent = `${food.label}: ${food.topic}`;
  $('#challenge-prompt').textContent = question.prompt;
  const solved = challenge.status === 'solved';
  const revealed = challenge.status === 'revealed';
  const buttons = choiceOrder.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    const wrong = challenge.attemptedIds.includes(c.id) && c.id !== question.correctChoiceId;
    const right = (solved || revealed) && c.id === question.correctChoiceId;
    b.textContent = c.text;
    if (wrong) { b.classList.add('wrong'); b.setAttribute('aria-label', `${c.text}, not correct`); }
    if (right) { b.classList.add('right'); b.setAttribute('aria-label', `${c.text}, correct answer`); }
    b.disabled = wrong || challenge.status !== 'open';
    b.addEventListener('click', () => choose(c.id));
    return b;
  });
  $('#choices').replaceChildren(...buttons);
  const hint = $('#challenge-hint');
  hint.hidden = !(challenge.status === 'open' && challenge.attemptedIds.length > 0);
  hint.textContent = `Hint: ${question.hint}`;
  $('#challenge-solution').hidden = challenge.status === 'open';
  $('#solution-text').textContent = question.solution;
  $('#reveal-button').hidden = challenge.status !== 'open';
  $('#new-question-button').hidden = !revealed;
  $('#back-button').hidden = !solved;
}

function choose(choiceId) {
  if (!challenge) return;
  const r = answerQuestion(state, challenge, question, choiceId);
  challenge = r.challenge;
  if (r.outcome === 'correct') {
    state = r.state;
    persist(); // saved before any celebration
    render();
    announce(`Correct! You earned 1 ${FOODS[challenge.tier].label.toLowerCase()} serving. Feed it to ${state.currentCat.name} from the food card.`);
    renderChallenge();
    $('#back-button').focus();
  } else if (r.outcome === 'incorrect') {
    announce(`Not quite. Hint: ${question.hint}`);
    renderChallenge();
    dlg.querySelector('.choice:not(:disabled)')?.focus();
  }
}

$('#reveal-button').addEventListener('click', () => {
  challenge = revealAnswer(challenge);
  renderChallenge();
  announce('Solution shown. This question won’t earn food, but a new one will.');
  $('#new-question-button').focus();
});
$('#new-question-button').addEventListener('click', () => earn(challenge.tier));
$('#back-button').addEventListener('click', () => dlg.close());
dlg.addEventListener('close', () => { challenge = null; question = null; });

// ---------- Adoption ----------
const adoptDlg = $('#adopt-dialog');
let adoptingFrom = null; // captured current cat id, null for the first cat
let selectedColor = 'ginger';

function updatePreview() {
  $('#adopt-preview').replaceChildren(renderCat({ stage: 'kitten', color: selectedColor }));
}

function openAdopt(first, opener) {
  adoptRequired = first;
  adoptingFrom = first ? null : state.currentCat.id;
  const prevColor = first ? null : state.currentCat.color;
  selectedColor = first ? 'ginger' : COLORS[(COLORS.indexOf(prevColor) + 1) % COLORS.length];
  $('#adopt-title').textContent = first ? 'Name your kitten' : 'Adopt a kitten';
  const note = $('#adopt-note');
  note.hidden = first;
  if (!first) {
    const inv = state.inventory;
    const left = Object.keys(FOODS).map((f) => `${inv[f]} ${FOODS[f].label.toLowerCase()}`).join(', ');
    note.textContent = `${state.currentCat.name} will move to your collection. Unused food (${left}) doesn’t carry over: the new kitten starts with an empty pantry.`;
  }
  $('#adopt-cancel').hidden = first;
  const input = $('#name-input');
  input.value = '';
  input.removeAttribute('aria-invalid');
  const help = $('#name-help');
  help.textContent = `Up to ${MAX_NAME} characters. Leave blank to use ${DEFAULT_NAME}.`;
  help.classList.remove('error');
  $('#color-options').replaceChildren(...COLORS.map((c) => {
    const label = document.createElement('label');
    label.className = 'color-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'color';
    radio.value = c;
    radio.checked = c === selectedColor;
    radio.addEventListener('change', () => { selectedColor = c; updatePreview(); });
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = PALETTES[c].b;
    label.append(radio, swatch, COLOR_LABEL[c]);
    return label;
  }));
  updatePreview();
  $('#adopt-confirm').disabled = false;
  openDialog(adoptDlg, opener);
  input.focus();
}

$('#adopt-button').addEventListener('click', (e) => openAdopt(false, e.currentTarget));
$('#adopt-cancel').addEventListener('click', () => adoptDlg.close());

$('#adopt-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#name-input');
  const name = input.value.trim();
  if ([...name].length > MAX_NAME) {
    input.setAttribute('aria-invalid', 'true');
    const help = $('#name-help');
    help.textContent = `That name is ${[...name].length} characters. Use ${MAX_NAME} or fewer.`;
    help.classList.add('error');
    input.focus();
    return;
  }
  $('#adopt-confirm').disabled = true; // guards double submit; adopt() also no-ops on a stale id
  const cat = { id: newId(), name, color: selectedColor };
  if (adoptingFrom === null) {
    if (state) return adoptDlg.close(); // already created
    state = createState(cat);
    persist();
    announce(`Meet ${state.currentCat.name}! Choose a food and solve a problem to earn a serving.`);
  } else {
    const oldName = state.currentCat.name;
    const next = adopt(state, adoptingFrom, cat);
    if (next !== state) {
      cancelVisuals();
      state = next;
      persist();
      announce(`${oldName} joined your collection. Say hello to ${state.currentCat.name}!`);
    }
  }
  adoptRequired = false;
  render();
  adoptDlg.close();
});

// ---------- Other tabs ----------
// Idle ticks write every few seconds, so a stale tab would overwrite progress made
// elsewhere. Adopt the other tab's save instead; stop writing if it became unreadable.
addEventListener('storage', (e) => {
  if (e.storageArea !== storage || (e.key !== SAVE_KEY && e.key !== null)) return;
  const loaded = loadSave(storage, IDS);
  if (loaded.status !== 'ok') { canWrite = false; warnUnsaved(); return; }
  const catChanged = state?.currentCat.id !== loaded.state.currentCat.id;
  state = loaded.state;
  canWrite = true;
  if (catChanged) {
    adoptRequired = false;
    recoveryRequired = false;
    for (const d of [dlg, adoptDlg, $('#recovery-dialog')]) if (d.open) d.close();
    cancelVisuals();
  }
  render();
});

// ---------- Collection ----------
$('#open-collection').addEventListener('click', (e) => {
  const cats = state?.collection ?? [];
  $('#collection-empty').hidden = cats.length > 0;
  $('#collection-list').replaceChildren(...cats.map((cat, i) => {
    const li = document.createElement('li');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = cat.name;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${COLOR_LABEL[cat.color]}, cat #${i + 1}`;
    li.append(renderCat({ stage: 'adult', color: cat.color }), name, meta);
    return li;
  }));
  openDialog($('#collection-dialog'), e.currentTarget);
});

// ---------- Recovery ----------
function openRecovery(raw) {
  const link = $('#download-save');
  link.href = URL.createObjectURL(new Blob([raw], { type: 'text/plain' }));
  const confirm = $('#reset-confirm');
  confirm.checked = false;
  confirm.addEventListener('change', () => { $('#reset-save').disabled = !confirm.checked; });
  $('#reset-save').addEventListener('click', () => {
    const r = resetSave(storage);
    if (!r.ok) {
      const err = $('#recovery-error');
      err.hidden = false;
      err.textContent = `The save couldn’t be deleted (${r.error}). You can still play without saving.`;
      return;
    }
    recoveryRequired = false;
    $('#recovery-dialog').close();
    openAdopt(true, null);
  });
  $('#play-unsaved').addEventListener('click', () => {
    canWrite = false; // keep the unreadable save untouched
    warnUnsaved();
    recoveryRequired = false;
    $('#recovery-dialog').close();
    openAdopt(true, null);
  });
  recoveryRequired = true;
  openDialog($('#recovery-dialog'), null);
}

// ---------- Startup ----------
const loaded = loadSave(storage, IDS);
if (loaded.status === 'ok') {
  state = loaded.state;
  render();
} else if (loaded.status === 'invalid') {
  openRecovery(loaded.raw);
} else {
  if (loaded.status === 'unavailable') { canWrite = false; warnUnsaved(); }
  openAdopt(true, null);
}
rebuildScene();
wander();
