// Versioned localStorage save. Load never writes; failures never throw.
import { COLORS, FOODS, MAX_XP, MAX_NAME } from './game.mjs';

export const SAVE_KEY = 'meadow-cats:v1';

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v) => Number.isSafeInteger(v) && v >= 0;

function isCat(c) {
  return isObj(c)
    && typeof c.id === 'string' && c.id.length > 0
    && typeof c.name === 'string' && c.name.trim() === c.name && c.name.length > 0
    && [...c.name].length <= MAX_NAME
    && COLORS.includes(c.color)
    && Number.isInteger(c.totalXp) && c.totalXp >= 0 && c.totalXp <= MAX_XP;
}

function isCycle(cycle, ids) {
  return isObj(cycle)
    && Array.isArray(cycle.remaining)
    && cycle.remaining.every((id) => ids.includes(id))
    && new Set(cycle.remaining).size === cycle.remaining.length
    && (cycle.lastId === null || ids.includes(cycle.lastId));
}

export function validateState(s, questionIdsByTier) {
  if (!isObj(s) || s.version !== 1) return false;
  if (!isCat(s.currentCat)) return false;
  if (!isObj(s.inventory) || !Object.keys(FOODS).every((f) => isCount(s.inventory[f]))) return false;
  if (!Array.isArray(s.collection) || !s.collection.every((c) => isCat(c) && c.totalXp === MAX_XP)) return false;
  const catIds = [s.currentCat.id, ...s.collection.map((c) => c.id)];
  if (new Set(catIds).size !== catIds.length) return false;
  if (!isObj(s.cycles)) return false;
  return Object.keys(FOODS).every((f) => isCycle(s.cycles[f], questionIdsByTier[f] ?? []));
}

export function loadSave(storage, questionIdsByTier) {
  let raw;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'empty' };
  try {
    const state = JSON.parse(raw);
    if (validateState(state, questionIdsByTier)) return { status: 'ok', state };
  } catch { /* fall through: malformed JSON */ }
  return { status: 'invalid', raw };
}

export function saveState(storage, state) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

export function resetSave(storage) {
  try {
    storage.removeItem(SAVE_KEY);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
