// Ordinary plaintext-autokey arithmetic. This module contains no target answers.
export const mod = n => ((n % 26) + 26) % 26;
export const letters = text => [...text.toUpperCase()].filter(c => /[A-Z]/.test(c));
export const value = c => c.charCodeAt(0) - 65;
export const letter = n => String.fromCharCode(65 + mod(n));
export function solve(ciphertext, anchors = {}, starter = '', link = 'none', offset = 16) {
  if (!['none','text','code'].includes(link) || !Number.isInteger(offset) || offset<1 || offset>64) throw new RangeError('Invalid ribbon link');
  const cipher = letters(ciphertext).map(value);
  const plain = Array(cipher.length).fill(null), origin = Array(cipher.length).fill(null), conflicts = [], candidates = [];
  Object.entries(anchors).forEach(([i, c]) => {
    if (/^[A-Z]$/.test(c) && +i >= 0 && +i < cipher.length) candidates.push({index:+i, number:value(c), source:`message letter ${+i + 1}`});
  });
  [...starter.toUpperCase().slice(0,16)].forEach((c, i) => {
    if (/^[A-Z]$/.test(c)) candidates.push({index:i, number:mod(cipher[i] - value(c)), source:`starter letter ${i + 1}`});
  });
  if (link === 'code') for (let i=offset;i<cipher.length;i++) candidates.push({index:i,number:mod(cipher[i]-cipher[i-offset]),source:`encoded letter ${i-offset+1}`});
  for (const guess of candidates) {
    let i = guess.index, n = guess.number;
    if (link === 'text') while (i >= offset) { n = mod(cipher[i] - n); i -= offset; }
    while (i < cipher.length) {
      if (plain[i] !== null && plain[i] !== n) conflicts.push({index:i, old:origin[i], next:guess.source});
      else if (plain[i] === null) { plain[i] = n; origin[i] = guess.source; }
      if (link !== 'text') break;
      i += offset;
      if (i < cipher.length) n = mod(cipher[i] - n);
    }
  }
  const key = plain.map((n,i) => n === null ? null : mod(cipher[i] - n));
  let cursor=0;
  const text = [...ciphertext].map(c => /[A-Z]/.test(c) ? (plain[cursor++] === null ? '·' : letter(plain[cursor-1])) : c).join('');
  return {cipher, plain, key, text, origin, conflicts, known:plain.filter(n=>n!==null).length};
}
