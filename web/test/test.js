function parsePointCloud(msg) {
  console.log(msg);
  var buffer = new Uint8Array(msg.data).buffer;
  var dataView = new DataView(buffer);

  var points = [];
  var colors = [];

  for (let i = 0; i < msg.width; i++) {
    var pointOffset = i * msg.point_step;

    msg.fields.forEach((field) => {
      var byteOffset = pointOffset + field.offset;
      var name = field.name;

      switch (field.datatype) {
        case 7:
          if (name === "x" || name === "y" || name === "z") {
            points.push(dataView.getFloat32(byteOffset, !msg.is_bigendian));
          } else if (name === "rgb") {
            var rgbInt = dataView.getUint32(byteOffset, !msg.is_bigendian);
            var rgb = {
              r: ((rgbInt >> 16) & 0xff) / 255,
              g: ((rgbInt >> 8) & 0xff) / 255,
              b: (rgbInt & 0xff) / 255,
            };
            colors.push(rgb.r, rgb.g, rgb.b);
          }
          break;
      }
    });
  }
  console.log("parse ok");
  return {
    points,
    colors,
  };
}

self.onmessage = (e) => {
  const result = parsePointCloud(e.data);
  self.postMessage(result);
};

self.postMessage({
  type: "READY",
});
