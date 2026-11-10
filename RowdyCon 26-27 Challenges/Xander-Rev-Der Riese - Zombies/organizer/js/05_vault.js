// ---------------------------------------------------------------------------
// 05_vault.js — the "mainframe vault": a SHA-256 hash chain advanced once per
// legitimate round transition. At round 100 the chain state derives the key
// that decrypts the flag ciphertext in flag_data.js. The chain is NOT a
// function of the round number alone: it must be walked, step by step.
// ---------------------------------------------------------------------------
(function () {
  const SEED = 'DER_RIESE::MAINFRAME::115';
  const TARGET_ROUND = 100;

  class Vault {
    constructor() {
      this.reset();
    }
    reset() {
      this.round = 1;
      this.state = ZM.sha256(SEED);
      this.history = 0;
    }
    // Called by the game exactly once per round advance (r = new round).
    advance(r) {
      this.round = r;
      this.state = ZM.sha256(this.state + ':' + r);
      this.history++;
      return this.state;
    }
    isUnlockRound() { return this.round === TARGET_ROUND; }
    keyFromState(state) { return ZM.sha256(state + ':FLAG'); }
    // Attempt to decrypt the flag with the current chain state.
    // Returns { ok: true, flag } or { ok: false }.
    open(data) {
      data = data || ZM.FLAG;
      if (!data || !data.ct) return { ok: false, reason: 'no vault data' };
      const key = this.keyFromState(this.state);
      const ct = ZM.U.hexToBytes(data.ct);
      const pt = new Uint8Array(ct.length);
      for (let off = 0, i = 0; off < ct.length; off += 32, i++) {
        const ks = ZM.sha256Bytes(ZM.U.utf8(key + ':' + i));
        for (let j = 0; j < 32 && off + j < ct.length; j++) pt[off + j] = ct[off + j] ^ ks[j];
      }
      const tag = ZM.U.bytesToHex(ZM.sha256Bytes(pt));
      if (tag !== data.tag) return { ok: false, reason: 'integrity check failed' };
      const flag = ZM.U.fromUtf8(pt);
      if (flag === null) return { ok: false, reason: 'integrity check failed' };
      return { ok: true, flag };
    }
  }
  Vault.SEED = SEED;
  Vault.TARGET_ROUND = TARGET_ROUND;
  ZM.Vault = Vault;
})();
