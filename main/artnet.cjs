// Art-Net 4 ArtDmx packet builder.
'use strict';

const HEADER = Buffer.from('Art-Net\0', 'ascii');

/** Build an ArtDmx packet for a 15-bit port-address `universe` with up to 512 channels. */
function artDmx(universe, data, sequence = 0) {
  const len = Math.min(512, Math.max(2, data.length + (data.length % 2)));
  const buf = Buffer.alloc(18 + len);
  HEADER.copy(buf, 0);
  buf.writeUInt16LE(0x5000, 8);   // OpDmx
  buf.writeUInt8(0, 10);          // ProtVerHi
  buf.writeUInt8(14, 11);         // ProtVerLo
  buf.writeUInt8(sequence & 0xff, 12);
  buf.writeUInt8(0, 13);          // Physical
  buf.writeUInt8(universe & 0xff, 14);        // SubUni
  buf.writeUInt8((universe >> 8) & 0x7f, 15); // Net
  buf.writeUInt16BE(len, 16);
  for (let i = 0; i < len; i++) buf[18 + i] = Math.max(0, Math.min(255, data[i] | 0));
  return buf;
}

module.exports = { artDmx, ARTNET_PORT: 6454 };
