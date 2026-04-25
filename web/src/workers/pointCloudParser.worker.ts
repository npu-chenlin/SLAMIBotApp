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
  // console.time('parsePointCloud');
  const bytes = getPointCloudData(msg.data);
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const points: number[] = [];
  const colors: number[] = [];
  const intensities: number[] = [];

  for (let i = 0; i < msg.width; i++) {
    const pointOffset = i * msg.point_step;

    msg.fields.forEach((field: any) => {
      const byteOffset = pointOffset + field.offset;
      const name = field.name;

      switch (field.datatype) {
        case 7:  // FLOAT32 (x/y/z) // UINT32 (rgb)
          if (name === 'x' || name === 'y' || name === 'z') {
            points.push(dataView.getFloat32(byteOffset, !msg.is_bigendian));
          } else if (name === 'rgb') {
            const rgbInt = dataView.getUint32(byteOffset, !msg.is_bigendian);
            const rgb = {
              r: ((rgbInt >> 16) & 0xff) / 255,
              g: ((rgbInt >> 8) & 0xff) / 255,
              b: (rgbInt & 0xff) / 255
            };
            colors.push(rgb.r, rgb.g, rgb.b);
          } else if (name === 'intensity' && colors.length === 0) {
            // intensity to color using jet colormap
            const intensity = dataView.getFloat32(byteOffset, !msg.is_bigendian) / 255;
            const normalized = Math.max(0, Math.min(1, intensity));
            
            const r = Math.min(4 * normalized - 1.5, -4 * normalized + 4.5);
            const g = Math.min(4 * normalized - 0.5, -4 * normalized + 3.5);
            const b = Math.min(4 * normalized + 0.5, -4 * normalized + 2.5);
            
            intensities.push(
              Math.max(0, Math.min(1, r)),
              Math.max(0, Math.min(1, g)), 
              Math.max(0, Math.min(1, b))
            );
          }
          break;
        case 6:
          break;
      }
    });
  }
  // console.timeEnd('parsePointCloud');

  return {
    points,
    colors: colors.length > 0 ? colors : intensities,
  };
};

self.onmessage = (e: MessageEvent) => {
  const result = parsePointCloud(e.data);
  self.postMessage(result);
};

self.postMessage({
  type: 'READY',
});

export { }; 