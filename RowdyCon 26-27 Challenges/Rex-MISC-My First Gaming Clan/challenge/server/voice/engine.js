'use strict';
// Pure dialogue step: (script, session, alternatives) -> result. No side effects, no timers.
// Resolution order per utterance: state answers -> state wrong -> global intents (with per-state overrides)
// -> state fallback. Alternatives (other STT hypotheses) are tried in order; the first non-fallback wins.

const { normalize, matchSpec } = require('./match');

function newSession() {
  return { state: null, flags: {}, dyn: {}, annoy: 0, wrong: 0, repeats: 0, lastText: '', lastAt: 0, blockedUntil: 0, variantIdx: {}, lastUtteranceAt: 0 };
}

function bestOf(list, tokens, script, getSpec, session) {
  let best = null, bestScore = 0;
  for (const item of list || []) {
    const s = matchSpec(getSpec(item), tokens, script, session);
    if (s > bestScore) { best = item; bestScore = s; }
  }
  return best ? { item: best, score: bestScore } : null;
}

function resolveOne(script, session, text) {
  const st = script.states[session.state];
  if (!st) return null;
  const tokens = normalize(text, script);
  if (!tokens.length) return null;

  const ans = bestOf(st.answers, tokens, script, a => a.match, session);
  if (ans) return { kind: 'answer', say: ans.item.say, goto: ans.item.goto, set: ans.item.set, action: ans.item.action, tokens };

  if (st.wrong && matchSpec(st.wrong.match, tokens, script, session)) return { kind: 'wrong', say: st.wrong.say, annoy: 1, tokens };

  const intent = bestOf(Object.entries(script.intents), tokens, script, ([, def]) => def.match, session);
  if (intent) {
    const [name, def] = intent.item;
    const over = (st.on && st.on[name]) || {};
    return { kind: 'intent', intent: name, say: 'say' in over ? over.say : (over.action ? undefined : def.say), goto: over.goto, set: over.set, action: over.action, annoy: def.annoy || 0, tokens };
  }
  return null;
}

// Rank: progress (answer with goto) > answer > intent > wrong. Alternatives are STT hypotheses, so the
// most useful reading wins; ties keep the order of the alternatives.
const RANK = r => (r.kind === 'answer' ? (r.goto ? 4 : 3) : r.kind === 'intent' ? 2 : 1);

function step(script, session, alternatives) {
  const alts = (Array.isArray(alternatives) ? alternatives : [alternatives]).filter(a => typeof a === 'string' && a.trim());
  let best = null;
  for (const text of alts) {
    const r = resolveOne(script, session, text);
    if (r && (!best || RANK(r) > RANK(best))) { r.text = text; best = r; }
  }
  if (best) return best;
  const st = script.states[session.state] || {};
  const fb = Array.isArray(st.fallback) ? st.fallback : st.fallback ? [st.fallback] : ['what'];
  return { kind: 'fallback', say: fb[session.fallbackIdx = ((session.fallbackIdx || 0) + 1) % fb.length], annoy: 1, text: alts[0] || '', tokens: normalize(alts[0] || '', script) };
}

// Pick a line variant index round-robin per session (cosmetic variety)
function pickVariant(script, session, lineId) {
  const variants = script.lines[lineId];
  if (!variants || !variants.length) return -1;
  const i = session.variantIdx[lineId] || 0;
  session.variantIdx[lineId] = (i + 1) % variants.length;
  return i;
}

module.exports = { step, newSession, pickVariant, resolveOne };
