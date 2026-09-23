/**
 * Offline QR Code Matrix Generator (Version 2/3 Byte Mode, ECC Level L)
 * Pure TypeScript implementation with zero external dependencies.
 */

// RS Galois Field GF(256) arithmetic for QR Error Correction
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 285;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function polyMul(p1: number[], p2: number[]): number[] {
  const result = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return result;
}

function getGeneratorPoly(ecLength: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecLength; i++) {
    poly = polyMul(poly, [1, GF_EXP[i]]);
  }
  return poly;
}

function computeReedSolomon(data: number[], ecLength: number): number[] {
  const genPoly = getGeneratorPoly(ecLength);
  const msgPoly = [...data, ...new Array(ecLength).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msgPoly[i];
    if (coef !== 0) {
      for (let j = 0; j < genPoly.length; j++) {
        msgPoly[i + j] ^= gfMul(genPoly[j], coef);
      }
    }
  }
  return msgPoly.slice(data.length);
}

export function generateQRCodeMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const len = bytes.length;

  // Choose Version: v1 (up to 17 bytes), v2 (up to 32 bytes), v3 (up to 53 bytes), v4 (up to 78 bytes)
  let version = 1;
  let totalDataBytes = 19;
  let ecBytes = 7;
  let size = 21;

  if (len > 17 && len <= 32) {
    version = 2;
    totalDataBytes = 34;
    ecBytes = 10;
    size = 25;
  } else if (len > 32 && len <= 53) {
    version = 3;
    totalDataBytes = 55;
    ecBytes = 15;
    size = 29;
  } else if (len > 53) {
    version = 4;
    totalDataBytes = 80;
    ecBytes = 20;
    size = 33;
  }

  // Bit buffer creation
  const bitBuffer: number[] = [];
  const pushBits = (val: number, numBits: number) => {
    for (let i = numBits - 1; i >= 0; i--) {
      bitBuffer.push((val >> i) & 1);
    }
  };

  // Mode Indicator: Byte Mode (0100)
  pushBits(0b0100, 4);

  // Character Count Indicator (8 bits for v1..v9)
  pushBits(len, 8);

  // Data Bytes
  for (const b of bytes) {
    pushBits(b, 8);
  }

  // Terminator
  const totalDataBits = totalDataBytes * 8;
  const remainingBits = totalDataBits - bitBuffer.length;
  const termLen = Math.min(4, remainingBits);
  pushBits(0, termLen);

  // Pad to byte boundary
  while (bitBuffer.length % 8 !== 0) {
    bitBuffer.push(0);
  }

  // Pad bytes
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitBuffer.length < totalDataBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bit buffer to data codewords
  const dataCodewords: number[] = [];
  for (let i = 0; i < bitBuffer.length; i += 8) {
    let byteVal = 0;
    for (let j = 0; j < 8; j++) {
      byteVal = (byteVal << 1) | bitBuffer[i + j];
    }
    dataCodewords.push(byteVal);
  }

  // Calculate RS Error Correction
  const ecCodewords = computeReedSolomon(dataCodewords, ecBytes);
  const finalCodewords = [...dataCodewords, ...ecCodewords];

  // Grid initialization: null = unassigned
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));

  // Place Finder Pattern
  const placeFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
          if (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)) {
            grid[nr][nc] = true;
          } else {
            grid[nr][nc] = false;
          }
        } else {
          grid[nr][nc] = false; // Separator
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    if (grid[6][i] === null) grid[6][i] = i % 2 === 0;
    if (grid[i][6] === null) grid[i][6] = i % 2 === 0;
  }

  // Alignment Pattern for Version >= 2
  if (version >= 2) {
    const alignPos = version === 2 ? [18] : version === 3 ? [22] : [26];
    for (const r of alignPos) {
      for (const c of alignPos) {
        if (grid[r][c] !== null) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            if (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) {
              grid[r + dr][c + dc] = true;
            } else {
              grid[r + dr][c + dc] = false;
            }
          }
        }
      }
    }
  }

  // Reserve Format Info Area
  for (let i = 0; i < 9; i++) {
    if (grid[8][i] === null) grid[8][i] = false;
    if (grid[i][8] === null) grid[i][8] = false;
    if (grid[8][size - 1 - i] === null) grid[8][size - 1 - i] = false;
    if (grid[size - 1 - i][8] === null) grid[size - 1 - i][8] = false;
  }
  grid[size - 8][8] = true; // Dark module

  // Convert codewords to bit array for placement
  const allBits: number[] = [];
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      allBits.push((cw >> i) & 1);
    }
  }

  // Place Data Bits in zigzag
  let bitIdx = 0;
  let dir = -1; // -1 = up, 1 = down
  let col = size - 1;

  while (col > 0) {
    if (col === 6) col--; // Skip vertical timing column
    const rowStart = dir === -1 ? size - 1 : 0;
    const rowEnd = dir === -1 ? -1 : size;
    const rowStep = dir === -1 ? -1 : 1;

    for (let row = rowStart; row !== rowEnd; row += rowStep) {
      for (let cOffset = 0; cOffset < 2; cOffset++) {
        const c = col - cOffset;
        if (grid[row][c] === null) {
          let bit = false;
          if (bitIdx < allBits.length) {
            bit = allBits[bitIdx] === 1;
            bitIdx++;
          }
          // Mask 0: (row + col) % 2 === 0
          if ((row + c) % 2 === 0) {
            bit = !bit;
          }
          grid[row][c] = bit;
        }
      }
    }
    dir = -dir;
    col -= 2;
  }

  // Format info mask 0 ECC Level L (01 000 -> BCH 0x77c4)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  let fIdx = 0;
  for (let i = 0; i < 6; i++) grid[8][i] = formatBits[fIdx++] === 1;
  grid[8][7] = formatBits[fIdx++] === 1;
  grid[8][8] = formatBits[fIdx++] === 1;
  grid[7][8] = formatBits[fIdx++] === 1;
  for (let i = 5; i >= 0; i--) grid[i][8] = formatBits[fIdx++] === 1;

  fIdx = 0;
  for (let i = 0; i < 7; i++) grid[size - 1 - i][8] = formatBits[fIdx++] === 1;
  for (let i = 0; i < 8; i++) grid[8][size - 8 + i] = formatBits[fIdx++] === 1;

  return grid.map((row) => row.map((cell) => cell === true));
}
