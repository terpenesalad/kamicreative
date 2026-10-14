// Open Sound Control 1.0 codec (messages + bundles). No dependencies.
'use strict';

function pad4(n) { return (4 - (n % 4)) % 4; }

function encString(s) {
  const b = Buffer.from(String(s), 'utf8');
  return Buffer.concat([b, Buffer.alloc(1 + pad4(b.length + 1))]);
}

function encodeMessage(address, args = []) {
  let tags = ',';
  const parts = [];
  for (const a of args) {
    if (typeof a === 'boolean') { tags += a ? 'T' : 'F'; continue; }
    if (a === null || a === undefined) { tags += 'N'; continue; }
    if (typeof a === 'number') {
      if (Number.isInteger(a) && a >= -2147483648 && a <= 2147483647) {
        tags += 'i';
        const b = Buffer.alloc(4); b.writeInt32BE(a); parts.push(b);
      } else {
        tags += 'f';
        const b = Buffer.alloc(4); b.writeFloatBE(a); parts.push(b);
      }
      continue;
    }
    tags += 's';
    parts.push(encString(a));
  }
  return Buffer.concat([encString(address), encString(tags), ...parts]);
}

function readString(buf, off) {
  let end = off;
  while (end < buf.length && buf[end] !== 0) end++;
  const s = buf.toString('utf8', off, end);
  return [s, end + 1 + pad4(end + 1 - off)];
}

/** Decode a packet into a flat list of { address, args }. Throws on malformed input. */
function decode(buf, out = []) {
  if (buf.length >= 8 && buf.toString('ascii', 0, 7) === '#bundle') {
    let off = 16; // '#bundle\0' + 8-byte timetag
    while (off + 4 <= buf.length) {
      const size = buf.readInt32BE(off);
      off += 4;
      if (size <= 0 || off + size > buf.length) throw new Error('Bad OSC bundle element size');
      decode(buf.subarray(off, off + size), out);
      off += size;
    }
    return out;
  }
  let [address, off] = readString(buf, 0);
  if (!address.startsWith('/')) throw new Error('OSC address must start with /');
  let tags = ',';
  if (off < buf.length) [tags, off] = readString(buf, off);
  const args = [];
  for (const t of tags.slice(1)) {
    switch (t) {
      case 'i': args.push(buf.readInt32BE(off)); off += 4; break;
      case 'f': args.push(buf.readFloatBE(off)); off += 4; break;
      case 'd': args.push(buf.readDoubleBE(off)); off += 8; break;
      case 'h': args.push(Number(buf.readBigInt64BE(off))); off += 8; break;
      case 's': case 'S': { let s; [s, off] = readString(buf, off); args.push(s); break; }
      case 'b': { const n = buf.readInt32BE(off); off += 4 + n + pad4(n); args.push(n); break; }
      case 'T': args.push(1); break;
      case 'F': args.push(0); break;
      case 'N': case 'I': args.push(0); break;
      case 'c': args.push(String.fromCharCode(buf.readInt32BE(off))); off += 4; break;
      case 'r': case 'm': args.push(buf.readUInt32BE(off)); off += 4; break;
      default: throw new Error(`Unsupported OSC type tag "${t}"`);
    }
  }
  // Round floats to 6 significant digits so 0.5 arrives as 0.5, not 0.5000000001.
  out.push({ address, args: args.map((a) => (typeof a === 'number' && !Number.isInteger(a) ? +a.toPrecision(6) : a)) });
  return out;
}

module.exports = { encodeMessage, decode };
