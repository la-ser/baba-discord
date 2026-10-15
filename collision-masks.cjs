const fs = require("fs");
const zlib = require("zlib");

function paeth(a, b, c) {
  const prediction = a + b - c;
  const distanceA = Math.abs(prediction - a);
  const distanceB = Math.abs(prediction - b);
  const distanceC = Math.abs(prediction - c);
  if (distanceA <= distanceB && distanceA <= distanceC) return a;
  return distanceB <= distanceC ? b : c;
}

function decodeRgbaPng(filePath) {
  const file = fs.readFileSync(filePath);
  if (file.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new Error(`${filePath} is not a PNG file`);
  const width = file.readUInt32BE(16);
  const height = file.readUInt32BE(20);
  const bitDepth = file[24];
  const colorType = file[25];
  const interlace = file[28];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0)
    throw new Error(`${filePath} must be a non-interlaced 8-bit RGBA PNG`);
  const idat = [];
  let offset = 8;
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") idat.push(file.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === "IEND") break;
  }
  const packed = zlib.inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[sourceOffset++];
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[sourceOffset++];
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[rowOffset + x - stride] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[rowOffset + x - stride - bytesPerPixel]
        : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + above;
      else if (filter === 3) value = raw + Math.floor((left + above) / 2);
      else if (filter === 4) value = raw + paeth(left, above, upperLeft);
      else throw new Error(`${filePath} uses unsupported PNG filter ${filter}`);
      pixels[rowOffset + x] = value & 255;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index += 1)
    alpha[index] = pixels[index * 4 + 3];
  return { width, height, alpha };
}

function createScaledMask(filePath, width, height, alphaThreshold = 32) {
  let source;
  try {
    source = decodeRgbaPng(filePath);
  } catch (err) {
    console.warn(`[CollisionMask] Could not decode ${filePath} (${err.message}). Using solid bounding box mask fallback.`);
    const solid = new Uint8Array(width * height);
    solid.fill(1);
    return { width, height, solid, minX: 0, maxX: width - 1, minY: 0, maxY: height - 1 };
  }
  const solid = new Uint8Array(width * height);
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    const sourceTop = Math.floor((y * source.height) / height);
    const sourceBottom = Math.max(sourceTop + 1, Math.ceil(((y + 1) * source.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceLeft = Math.floor((x * source.width) / width);
      const sourceRight = Math.max(sourceLeft + 1, Math.ceil(((x + 1) * source.width) / width));
      let maximumAlpha = 0;
      for (let sy = sourceTop; sy < sourceBottom && maximumAlpha < alphaThreshold; sy += 1) {
        const row = sy * source.width;
        for (let sx = sourceLeft; sx < sourceRight; sx += 1)
          maximumAlpha = Math.max(maximumAlpha, source.alpha[row + sx]);
      }
      if (maximumAlpha >= alphaThreshold) {
        solid[y * width + x] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        solid[y * width + x] = 0;
      }
    }
  }
  return { width, height, solid, minX, maxX, minY, maxY };
}

module.exports = { createScaledMask };
