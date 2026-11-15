/*
 * Tamamo proof-of-work worker.
 *
 * Finds a decimal nonce such that hex(sha256(random + nonce)) starts with
 * `difficulty` zero characters. Works as a Web Worker (postMessage protocol
 * below) and as a plain <script> (exposes self.TamamoPoW) so the page can fall
 * back to the main thread when Workers are blocked.
 *
 * Worker protocol
 *   in:  {random: string, difficulty: 1..8, start: int, step: int}
 *   out: {type: "progress", hashes: n}
 *        {type: "found", nonce: "123", hash: "000a...", hashes: n}
 *        {type: "error", message: "..."}
 */
(function (root) {
  'use strict';

  var K = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  var IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  // compress runs the SHA-256 compression over `blocks` 16-word blocks of
  // `words` (starting at word `off`), updating the 8-word state H in place.
  // W is a scratch Int32Array(64).
  function compress(H, words, off, blocks, W) {
    var h0 = H[0], h1 = H[1], h2 = H[2], h3 = H[3], h4 = H[4], h5 = H[5], h6 = H[6], h7 = H[7];
    var i, x, y, a, b, c, d, e, f, g, h, t1, t2;
    for (var blk = 0; blk < blocks; blk++) {
      var o = off + blk * 16;
      for (i = 0; i < 16; i++) W[i] = words[o + i];
      for (i = 16; i < 64; i++) {
        x = W[i - 15];
        y = W[i - 2];
        W[i] = (W[i - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) +
          W[i - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) | 0;
      }
      a = h0; b = h1; c = h2; d = h3; e = h4; f = h5; g = h6; h = h7;
      for (i = 0; i < 64; i++) {
        t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) +
          ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) +
          ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    H[0] = h0; H[1] = h1; H[2] = h2; H[3] = h3; H[4] = h4; H[5] = h5; H[6] = h6; H[7] = h7;
  }

  // pad builds the padded message words for bytes[from:] given the total
  // message length (bytes), returning {words, blocks}.
  function pad(bytes, from, total) {
    var tail = bytes.length - from;
    var blocks = (tail + 9 + 63) >> 6;
    var buf = new Uint8Array(blocks * 64);
    buf.set(bytes.subarray(from), 0);
    buf[tail] = 0x80;
    var bits = total * 8;
    var hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
    var n = buf.length;
    buf[n - 8] = hi >>> 24; buf[n - 7] = hi >>> 16; buf[n - 6] = hi >>> 8; buf[n - 5] = hi;
    buf[n - 4] = lo >>> 24; buf[n - 3] = lo >>> 16; buf[n - 2] = lo >>> 8; buf[n - 1] = lo;
    return { buf: buf, words: toWords(buf), blocks: blocks };
  }

  function toWords(buf) {
    var w = new Int32Array(buf.length >> 2);
    for (var i = 0; i < w.length; i++) {
      var j = i << 2;
      w[i] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3];
    }
    return w;
  }

  function hex(H) {
    var s = '';
    for (var i = 0; i < 8; i++) s += ('0000000' + (H[i] >>> 0).toString(16)).slice(-8);
    return s;
  }

  // sha256hex hashes a string (UTF-8) and returns lowercase hex.
  function sha256hex(str) {
    var bytes = utf8(str);
    var p = pad(bytes, 0, bytes.length);
    var H = new Int32Array(IV);
    compress(H, p.words, 0, p.blocks, new Int32Array(64));
    return hex(H);
  }

  // Search tries nonces start, start+step, start+2*step, ... against a fixed
  // prefix. Full prefix blocks are hashed once (midstate); per attempt only the
  // changed nonce digits are rewritten and the 1-2 tail blocks compressed.
  function Search(random, difficulty, start, step) {
    this.prefix = utf8(String(random));
    this.shift = 32 - 4 * Math.max(1, Math.min(8, difficulty | 0));
    this.step = Math.max(1, step | 0);
    this.count = 0;
    var full = this.prefix.length >> 6;
    this.mid = new Int32Array(IV);
    this.W = new Int32Array(64);
    this.H = new Int32Array(8);
    if (full > 0) {
      compress(this.mid, toWords(this.prefix.subarray(0, full * 64)), 0, full, this.W);
    }
    this.tailFrom = full * 64;
    var s = String(Math.max(0, Math.floor(start || 0)));
    this.digits = [];
    for (var i = 0; i < s.length; i++) this.digits.push(s.charCodeAt(i) - 48);
    this.layout();
  }

  Search.prototype.layout = function () {
    var plen = this.prefix.length, nd = this.digits.length;
    var msg = new Uint8Array(plen + nd);
    msg.set(this.prefix, 0);
    for (var i = 0; i < nd; i++) msg[plen + i] = 48 + this.digits[i];
    var p = pad(msg, this.tailFrom, msg.length);
    this.buf = p.buf;
    this.words = p.words;
    this.blocks = p.blocks;
    this.off = plen - this.tailFrom; // where the digits start in buf
  };

  Search.prototype.nonce = function () {
    return this.digits.join('');
  };

  // advance adds step to the decimal nonce in place and refreshes the
  // affected message words.
  Search.prototype.advance = function () {
    var d = this.digits, i = d.length - 1, carry = this.step;
    while (carry > 0 && i >= 0) {
      var v = d[i] + carry;
      d[i] = v % 10;
      carry = (v / 10) | 0;
      i--;
    }
    if (carry > 0) {
      while (carry > 0) { d.unshift(carry % 10); carry = (carry / 10) | 0; }
      this.layout();
      return;
    }
    var first = i + 1, buf = this.buf, off = this.off, words = this.words;
    for (var k = first; k < d.length; k++) buf[off + k] = 48 + d[k];
    var w0 = (off + first) >> 2, w1 = (off + d.length - 1) >> 2;
    for (var w = w0; w <= w1; w++) {
      var j = w << 2;
      words[w] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3];
    }
  };

  // run tries up to n nonces. Returns the winning nonce string or null.
  // this.last holds how many hashes this call computed.
  Search.prototype.run = function (n) {
    var H = this.H, mid = this.mid, shift = this.shift;
    for (var i = 0; i < n; i++) {
      H[0] = mid[0]; H[1] = mid[1]; H[2] = mid[2]; H[3] = mid[3];
      H[4] = mid[4]; H[5] = mid[5]; H[6] = mid[6]; H[7] = mid[7];
      compress(H, this.words, 0, this.blocks, this.W);
      if ((H[0] >>> shift) === 0) {
        this.last = i + 1;
        this.count += i + 1;
        return this.nonce();
      }
      this.advance();
    }
    this.last = n;
    this.count += n;
    return null;
  };

  var api = { Search: Search, sha256hex: sha256hex };

  var isWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' &&
    self instanceof WorkerGlobalScope;

  if (isWorker) {
    self.onmessage = function (ev) {
      var m = ev.data || {};
      try {
        var s = new Search(m.random, m.difficulty, m.start, m.step);
        var pending = 0, last = Date.now();
        for (;;) {
          var r = s.run(20000);
          pending += s.last;
          if (r !== null) {
            self.postMessage({ type: 'found', nonce: r, hash: sha256hex(String(m.random) + r), hashes: pending });
            return;
          }
          var now = Date.now();
          if (now - last >= 120) {
            self.postMessage({ type: 'progress', hashes: pending });
            pending = 0;
            last = now;
          }
        }
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err && err.message || err) });
      }
    };
  } else if (root) {
    root.TamamoPoW = api;
  }
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : null));
