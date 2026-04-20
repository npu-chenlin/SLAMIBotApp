/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */
declare const self: DedicatedWorkerGlobalScope;

const parsePointCloud = (msg: any) => {
  // console.time('parsePointCloud');
  const buffer = new Uint8Array(msg.data).buffer;
  const dataView = new DataView(buffer);

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