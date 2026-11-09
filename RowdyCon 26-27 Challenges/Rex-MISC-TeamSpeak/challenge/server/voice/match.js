'use strict';
// Pure text matching helpers for the scripted voice bot. Tolerant to speech-to-text noise:
// normalisation, synonym rewriting, number words -> digits, token Levenshtein, phrase windows.

const FILLERS = new Set(['uh', 'um', 'uhm', 'er', 'erm', 'hmm', 'hm', 'like', 'well', 'so', 'okay', 'ok', 'please', 'pls', 'just', 'actually', 'basically']);
const CONTRACTIONS = [[/\bi'm\b/g, 'i am'], [/\bit's\b/g, 'it is'], [/\bwhat's\b/g, 'what is'], [/\bwho's\b/g, 'who is'], [/\bhe's\b/g, 'he is'], [/\bshe's\b/g, 'she is'], [/\bthat's\b/g, 'that is'], [/\bdon't\b/g, 'do not'], [/\bdidn't\b/g, 'did not'], [/\bcan't\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/\bisn't\b/g, 'is not'], [/\bi've\b/g, 'i have'], [/\byou're\b/g, 'you are'], [/\bthey're\b/g, 'they are'], [/\blet's\b/g, 'let us'], [/\bwasn't\b/g, 'was not'], [/\bn't\b/g, ' not']];
const ONES = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const HOMOPHONES = { for: 4, fore: 4, to: 2, too: 2, won: 1, ate: 8, tree: 3, free: 3, sex: 6, sicks: 6, nein: 9, nighn: 9 };

function basic(text) {
  let s = String(text || '').toLowerCase().replace(/[’`´]/g, "'");
  for (const [re, rep] of CONTRACTIONS) s = s.replace(re, rep);
  s = s.replace(/[^a-z0-9äöüß'\s]/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim();
  return s;
}

// Apply phrase rewrites (longest first, whole words), e.g. "dust two" -> "dust2"
function rewrite(s, table) {
  if (!table) return s;
  const entries = Object.entries(table).flatMap(([canon, list]) => list.map(p => [basic(p), canon])).sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, canon] of entries) {
    if (!phrase) continue;
    const re = new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'g');
    s = s.replace(re, `$1${canon}`);
  }
  return s;
}

// Number words -> digits. A run of numeric tokens becomes one token: spelled digits concatenate
// ("four four seven one" -> 4471), small compound numbers concatenate year-style ("twenty ten" -> 2010,
// "forty four seventy one" -> 4471, "nineteen ninety nine" -> 1999), "two thousand ten" -> 2010.
// Multi-digit raw numbers ("24 7") stay separate tokens.
function numberize(tokens) {
  const strict = t => /^\d+$/.test(t) || t in ONES || t in TENS || t === 'hundred' || t === 'thousand';
  const isNum = (t, i) => strict(t) || ((t in HOMOPHONES || t === 'and') && i > 0 && i < tokens.length - 1 && strict(tokens[i - 1]) && strict(tokens[i + 1])) || (t in HOMOPHONES && ((i > 0 && strict(tokens[i - 1])) || (i < tokens.length - 1 && strict(tokens[i + 1]))));
  const out = [];
  for (let i = 0; i < tokens.length;) {
    if (!isNum(tokens[i], i)) { out.push(tokens[i]); i++; continue; }
    const run = [];
    while (i < tokens.length && isNum(tokens[i], i)) run.push(tokens[i++]);
    const groups = []; let cur = null, seq = null, raw = false;
    const flush = () => { if (cur !== null) { groups.push(String(cur)); cur = null; } if (seq !== null) { groups.push(seq); seq = null; } };
    for (const t of run) {
      if (t === 'and') continue;
      if (/^\d{2,}$/.test(t)) { flush(); groups.push(t); raw = true; continue; }
      if (t === 'hundred' || t === 'thousand') {
        const mul = t === 'hundred' ? 100 : 1000;
        if (seq !== null) { cur = Number(seq) * mul; seq = null; } else if (cur !== null) cur *= mul; else cur = mul;
        continue;
      }
      const v = /^\d$/.test(t) ? Number(t) : t in ONES ? ONES[t] : t in TENS ? TENS[t] : HOMOPHONES[t];
      if (v < 10) {
        const zero = t === 'oh' || t === 'zero';
        if (!zero && cur !== null && v > 0 && ((cur >= 20 && cur < 100 && cur % 10 === 0) || (cur >= 100 && cur % 100 === 0) || (cur >= 100 && cur % 10 === 0 && cur % 100 >= 20))) { cur += v; continue; }
        if (cur !== null) flush();
        seq = (seq || '') + String(v);
      } else if (v < 20) {           // teens
        if (cur !== null && cur >= 100 && cur % 100 === 0) { cur += v; continue; }
        flush(); cur = v;
      } else {                        // tens
        if (cur !== null && cur >= 100 && cur % 100 === 0) { cur += v; continue; }
        flush(); cur = v;
      }
    }
    flush();
    if (groups.length === 1) out.push(groups[0]);
    else if (raw) out.push(...groups);
    else out.push(groups.join(''));
  }
  return out;
}

function normalize(text, script) {
  let s = basic(text);
  s = rewrite(s, script && script.confusions);
  s = rewrite(s, script && script.synonyms);
  let tokens = s.split(' ').filter(t => t && !FILLERS.has(t));
  tokens = numberize(tokens);
  return tokens;
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function tokSim(a, b) {
  if (a === b) return 1;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return 0; // numbers must be exact
  const L = Math.max(a.length, b.length);
  const tol = L >= 7 ? 2 : L >= 4 ? 1 : 0;
  const d = lev(a, b);
  return d <= tol ? 1 - d / (L * 2) : 0;
}

// Best score of a phrase (array of tokens) over all windows of the utterance tokens.
function phraseScore(phrase, tokens) {
  const p = phrase.length;
  if (!p || tokens.length < p) return 0;
  let best = 0;
  for (let i = 0; i + p <= tokens.length; i++) {
    let s = 0;
    for (let k = 0; k < p; k++) { const v = tokSim(phrase[k], tokens[i + k]); if (!v) { s = 0; break; } s += v; }
    if (s) best = Math.max(best, s / p);
  }
  return best;
}

const THRESHOLD = 0.8;
const toPhrase = (s, script) => normalize(s, script);

// match spec: { any:[phrases], all:[phrases], number:"4471" | true (any number), regex:"..." }
// returns score (0 = no match)
function matchSpec(spec, tokens, script, session) {
  if (!spec) return 0;
  let score = 0;
  if (spec.session) {                       // dynamic answer stored on the session (e.g. the spelled word)
    const val = session && session.dyn && session.dyn[spec.session];
    if (!val) return 0;
    const want = normalize(String(val), script);
    let tk = tokens;
    const letters = tokens.filter(t => t.length === 1 && /[a-z]/.test(t));
    if (letters.length >= 2) tk = tokens.concat([letters.join('')]);  // "s o d a" spelled out
    const v = phraseScore(want, tk);
    if (v < THRESHOLD) return 0;
    score = Math.max(score, v + 0.2);
  }
  if (spec.regex) { if (!new RegExp(spec.regex, 'i').test(tokens.join(' '))) return 0; score = Math.max(score, 1); }
  if (spec.number !== undefined) {
    const nums = tokens.filter(t => /^\d+$/.test(t));
    if (spec.number === true) { if (!nums.length) return 0; score = Math.max(score, 0.9); }
    else { if (!nums.includes(String(spec.number))) return 0; score = Math.max(score, 1.2); }
  }
  if (spec.all) {
    let min = 1;
    for (const ph of spec.all) { const v = phraseScore(toPhrase(ph, script), tokens); if (v < THRESHOLD) return 0; min = Math.min(min, v); }
    score = Math.max(score, min + 0.1 * spec.all.length);
  }
  if (spec.any) {
    let best = 0;
    for (const ph of spec.any) { const p = toPhrase(ph, script); const v = phraseScore(p, tokens); if (v >= THRESHOLD) best = Math.max(best, v + 0.05 * (p.length - 1)); }
    if (!best) return 0;
    score = Math.max(score, best);
  }
  return score;
}

module.exports = { normalize, basic, lev, tokSim, phraseScore, matchSpec, numberize, THRESHOLD };
