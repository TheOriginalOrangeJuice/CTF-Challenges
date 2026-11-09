// node tests/test_vault.js — sha256 vectors + flag roundtrip against python generator
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { ZM: {}, TextEncoder, TextDecoder, performance, console };
vm.createContext(ctx);
for (const f of ['js/00_core.js', 'js/05_vault.js', 'flag_data.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const ZM = ctx.ZM;
let fails = 0;
function eq(a, b, msg) { if (a !== b) { fails++; console.log('FAIL', msg, '\n  got', a, '\n  exp', b); } else console.log('ok  ', msg); }
eq(ZM.sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'sha256 empty');
eq(ZM.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256 abc');
eq(ZM.sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1', 'sha256 448-bit');
eq(ZM.sha256('a'.repeat(1000)), '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3', 'sha256 1000 a');
const v = new ZM.Vault();
eq(v.open().ok, false, 'vault closed at round 1');
for (let r = 2; r <= 100; r++) v.advance(r);
eq(v.isUnlockRound(), true, 'unlock round');
const res = v.open();
eq(res.ok, true, 'vault opens at round 100');
eq(res.flag, 'flag{d3r_r13s3_r0und_100_m41nfr4m3_0v3rr1d3}', 'flag matches');
// forged: round set directly w/o walking the chain
const f = new ZM.Vault(); f.round = 100; eq(f.open().ok, false, 'forged round rejected');
const g = new ZM.Vault(); for (let r = 2; r <= 101; r++) g.advance(r); eq(g.open().ok, false, 'overshoot rejected');
console.log(fails ? `${fails} FAILURES` : 'ALL PASS'); process.exit(fails ? 1 : 0);
