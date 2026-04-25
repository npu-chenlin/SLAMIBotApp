/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */
declare const self: DedicatedWorkerGlobalScope;

function decode64(inbytes: string, outbytes: Uint8Array, record_size: number, pointRatio: number): number {
  var x: number, b = 0, l = 0, j = 0, L = inbytes.length, A = outbytes.length;
  record_size = record_size || A;
  pointRatio = pointRatio || 1;
  var bitskip = (pointRatio - 1) * record_size * 8;
  var S = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var e: Record<string, number> = {};
  for (var i = 0; i < 64; i++) { e[S.charAt(i)] = i; }
  for (x = 0; x < L && j < A; x++) {
    b = (b << 6) + e[inbytes.charAt(x)];
    l += 6;
    if (l >= 8) {
      l -= 8;
      outbytes[j++] = (b >>> l) & 0xff;
      if ((j % record_size) === 0) {
        x += Math.ceil((bitskip - l) / 6);
        l = l % 8;
        if (l > 0) { b = e[inbytes.charAt(x)]; }
      }
    }
  }
  return Math.floor(j / record_size);
}

function getPointCloudData(msgData: any): Uint8Array {
  if (msgData.buffer && msgData.buffer instanceof ArrayBuffer) {
    return new Uint8Array(msgData.buffer, msgData.byteOffset, msgData.byteLength);
  }
  if (msgData instanceof ArrayBuffer) {
    return new Uint8Array(msgData);
  }
  if (typeof msgData === 'string') {
    var decoded = new Uint8Array(msgData.length * 3 / 4 + 4);
    decode64(msgData, decoded, decoded.length, 1);
    return decoded;
  }
  if (Array.isArray(msgData)) {
    return new Uint8Array(msgData);
  }
  return new Uint8Array(msgData);
}

const parsePointCloud = (msg: any) => {
  const bytes = getPointCloudData(msg.data);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = !msg.is_bigendian;

  // Cache field offsets
  let xOffset = -1, yOffset = -1, zOffset = -1, rgbOffset = -1, intensityOffset = -1;
  for (let f = 0; f < msg.fields.length; f++) {
    const field = msg.fields[f];
    switch (field.name) {
      case 'x': xOffset = field.offset; break;
      case 'y': yOffset = field.offset; break;
      case 'z': zOffset = field.offset; break;
      case 'rgb': rgbOffset = field.offset; break;
      case 'intensity': intensityOffset = field.offset; break;
    }
  }

  const count = msg.width;
  const points = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let posIdx = 0;
  let colorIdx = 0;

  for (let i = 0; i < count; i++) {
    const base = i * msg.point_step;

    if (xOffset >= 0) points[posIdx++] = dv.getFloat32(base + xOffset, littleEndian);
    if (yOffset >= 0) points[posIdx++] = dv.getFloat32(base + yOffset, littleEndian);
    if (zOffset >= 0) points[posIdx++] = dv.getFloat32(base + zOffset, littleEndian);

    if (rgbOffset >= 0) {
      const rgbInt = dv.getUint32(base + rgbOffset, littleEndian);
      colors[colorIdx++] = ((rgbInt >> 16) & 0xff) / 255;
      colors[colorIdx++] = ((rgbInt >> 8) & 0xff) / 255;
      colors[colorIdx++] = (rgbInt & 0xff) / 255;
    } else if (intensityOffset >= 0) {
      const intensity = dv.getFloat32(base + intensityOffset, littleEndian) / 255;
      const normalized = Math.max(0, Math.min(1, intensity));
      const r = Math.min(4 * normalized - 1.5, -4 * normalized + 4.5);
      const g = Math.min(4 * normalized - 0.5, -4 * normalized + 3.5);
      const b = Math.min(4 * normalized + 0.5, -4 * normalized + 2.5);
      colors[colorIdx++] = Math.max(0, Math.min(1, r));
      colors[colorIdx++] = Math.max(0, Math.min(1, g));
      colors[colorIdx++] = Math.max(0, Math.min(1, b));
    } else {
      colors[colorIdx++] = 1.0;
      colors[colorIdx++] = 1.0;
      colors[colorIdx++] = 1.0;
    }
  }

  return { points, colors, count };
};

self.onmessage = (e: MessageEvent) => {
  const result = parsePointCloud(e.data);
  self.postMessage(result);
};

self.postMessage({
  type: 'READY',
});

export { }; 