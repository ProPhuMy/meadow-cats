// Pure game logic. No DOM, no storage, no randomness except injected rng.

/** @typedef {'kibble'|'fish'|'deluxe'} FoodId */
/** @typedef {'ginger'|'cream'|'gray'|'black'|'brown'|'white'} ColorId */
/** @typedef {{ id: string, name: string, color: ColorId, totalXp: number }} Cat */
/** @typedef {{ remaining: string[], lastId: string|null }} Cycle */

export const FOODS = {
  kibble: { label: 'Kibble', topic: 'Algebra', xp: 10 },
  fish: { label: 'Fish', topic: 'Basic calculus', xp: 25 },
  deluxe: { label: 'Deluxe meal', topic: 'Advanced calculus', xp: 50 },
};
export const COLORS = ['ginger', 'cream', 'gray', 'black', 'brown', 'white'];
export const XP_PER_LEVEL = 100;
export const MAX_LEVEL = 10;
export const MAX_XP = XP_PER_LEVEL * MAX_LEVEL;
export const MAX_NAME = 24;
export const DEFAULT_NAME = 'Mochi';
export const IDLE_MS = 3600; // +1 XP per tick: 1000 XP ≈ 1 hour of visible play
const STAGE_BY_LEVEL = ['newborn', 'newborn', 'kitten', 'kitten', 'young', 'young',
  'adolescent', 'adolescent', 'youngAdult', 'youngAdult', 'adult'];

const emptyInventory = () => ({ kibble: 0, fish: 0, deluxe: 0 });
const emptyCycle = () => ({ remaining: [], lastId: null });

function assertFood(foodId) {
  if (!Object.hasOwn(FOODS, foodId)) throw new Error(`Unknown food: ${foodId}`);
}

/** Validates and normalizes a new cat. Throws on invalid input. */
function newCat({ id, name, color }) {
  if (typeof id !== 'string' || !id) throw new Error('Cat id required');
  if (!COLORS.includes(color)) throw new Error(`Unknown color: ${color}`);
  const trimmed = String(name ?? '').trim() || DEFAULT_NAME;
  if ([...trimmed].length > MAX_NAME) throw new Error('Name too long');
  return { id, name: trimmed, color, totalXp: 0 };
}

export function createState(cat) {
  return {
    version: 1,
    currentCat: newCat(cat),
    inventory: emptyInventory(),
    collection: [],
    cycles: { kibble: emptyCycle(), fish: emptyCycle(), deluxe: emptyCycle() },
  };
}

export function progress(totalXp) {
  if (!Number.isFinite(totalXp) || totalXp < 0 || totalXp > MAX_XP) {
    throw new Error(`Invalid XP: ${totalXp}`);
  }
  const level = Math.min(MAX_LEVEL, Math.floor(totalXp / XP_PER_LEVEL));
  const isAdult = level === MAX_LEVEL;
  const stage = STAGE_BY_LEVEL[level];
  const intoLevel = isAdult ? XP_PER_LEVEL : totalXp - level * XP_PER_LEVEL;
  return { level, stage, intoLevel, needed: XP_PER_LEVEL, isAdult };
}

/** On-screen size multiplier: 0.45 at level 0 up to exactly 1 at level 10. */
export const catScale = (level) => (45 + 5.5 * level) / 100;

/** One idle tick: +1 XP, capped. Adults are returned unchanged. */
export function idleTick(state) {
  const { currentCat } = state;
  if (progress(currentCat.totalXp).isAdult) return state;
  return { ...state, currentCat: { ...currentCat, totalXp: Math.min(MAX_XP, currentCat.totalXp + 1) } };
}

export function startChallenge(catId, question) {
  return { catId, questionId: question.id, tier: question.tier, status: 'open', attemptedIds: [] };
}

export function answerQuestion(state, challenge, question, choiceId) {
  if (!question.choices.some((c) => c.id === choiceId)) throw new Error(`Unknown choice: ${choiceId}`);
  const ignored = { state, challenge, outcome: 'ignored' };
  if (challenge.status !== 'open'
    || challenge.catId !== state.currentCat.id
    || challenge.questionId !== question.id
    || challenge.attemptedIds.includes(choiceId)
    || progress(state.currentCat.totalXp).isAdult) return ignored;

  if (choiceId !== question.correctChoiceId) {
    return {
      state,
      challenge: { ...challenge, attemptedIds: [...challenge.attemptedIds, choiceId] },
      outcome: 'incorrect',
    };
  }
  const tier = challenge.tier;
  return {
    state: { ...state, inventory: { ...state.inventory, [tier]: state.inventory[tier] + 1 } },
    challenge: { ...challenge, status: 'solved', attemptedIds: [...challenge.attemptedIds, choiceId] },
    outcome: 'correct',
  };
}

export function revealAnswer(challenge) {
  return challenge.status === 'open' ? { ...challenge, status: 'revealed' } : challenge;
}

export function feed(state, foodId) {
  assertFood(foodId);
  const { currentCat, inventory } = state;
  if (inventory[foodId] < 1 || progress(currentCat.totalXp).isAdult) return state;
  return {
    ...state,
    currentCat: { ...currentCat, totalXp: Math.min(MAX_XP, currentCat.totalXp + FOODS[foodId].xp) },
    inventory: { ...inventory, [foodId]: inventory[foodId] - 1 },
  };
}

export function adopt(state, expectedCatId, cat) {
  const { currentCat, collection } = state;
  if (currentCat.id !== expectedCatId || !progress(currentCat.totalXp).isAdult) return state;
  const next = newCat(cat);
  if (next.id === currentCat.id || collection.some((c) => c.id === next.id)) {
    throw new Error('Duplicate cat id');
  }
  return {
    ...state,
    currentCat: next,
    inventory: emptyInventory(),
    collection: [...collection, currentCat],
  };
}

export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function drawQuestion(cycle, ids, rng = Math.random) {
  let remaining = cycle.remaining;
  if (remaining.length === 0) {
    remaining = shuffle(ids, rng);
    if (remaining.length > 1 && remaining[0] === cycle.lastId) {
      [remaining[0], remaining[remaining.length - 1]] = [remaining[remaining.length - 1], remaining[0]];
    }
  }
  const [id, ...rest] = remaining;
  return { id, cycle: { remaining: rest, lastId: id } };
}
