/**
 * Decodes the base64-encoded array 'inbytes' into the array 'outbytes'
 * until 'inbytes' is exhausted or 'outbytes' is filled.
 * if 'record_size' is specified, records of length 'record_size' bytes
 * are copied every other 'pointRatio' records.
 * returns the number of decoded records
 */
const decode64Lookup: Record<string, number> = {};
const decode64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
for (var i = 0; i < 64; i++) { decode64Lookup[decode64Chars.charAt(i)] = i; }

function decode64(inbytes: string, outbytes: Uint8Array, record_size: number, pointRatio: number): number {
  var x: number, b = 0, l = 0, j = 0, L = inbytes.length, A = outbytes.length;
  record_size = record_size || A; // default copies everything (no skipping)
  pointRatio = pointRatio || 1; // default copies everything (no subsampling)
  var bitskip = (pointRatio - 1) * record_size * 8;
  for (x = 0; x < L && j < A; x++) {
    b = (b << 6) + decode64Lookup[inbytes.charAt(x)];
    l += 6;
    if (l >= 8) {
      l -= 8;
      outbytes[j++] = (b >>> l) & 0xff;
      if ((j % record_size) === 0) { // skip records
        x += Math.ceil((bitskip - l) / 6);
        l = l % 8;
        if (l > 0) { b = decode64Lookup[inbytes.charAt(x)]; }
      }
    }
  }
  return Math.floor(j / record_size);
}

/**
 * Extract a Uint8Array from PointCloud2 msg.data which may be:
 * - Uint8Array / TypedArray (when using binary/CBOR transport)
 * - base64 string (when using JSON transport)
 * - ArrayBuffer
 * - plain number array
 */
function getPointCloudData(msgData: any): Uint8Array {
  if (msgData.buffer && msgData.buffer instanceof ArrayBuffer) {
    // TypedArray (Uint8Array, etc.)
    return new Uint8Array(msgData.buffer, msgData.byteOffset, msgData.byteLength);
  }
  if (msgData instanceof ArrayBuffer) {
    return new Uint8Array(msgData);
  }
  if (typeof msgData === 'string') {
    // base64 encoded string from JSON transport
    const decoded = new Uint8Array(msgData.length * 3 / 4 + 4);
    decode64(msgData, decoded, decoded.length, 1);
    return decoded;
  }
  if (Array.isArray(msgData)) {
    return new Uint8Array(msgData);
  }
  // fallback
  return new Uint8Array(msgData);
}

const isWorkerSupported = (): boolean => {
  return typeof window.Worker !== "undefined";
};

const getCurrentTimestamp = () => {
  const now = new Date();

  // 提取本地时间组件
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，补零到2位
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0'); // 补零到3位

  // 格式：YYYY-MM-DD HH:mm:ss.sss
  const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  console.log(`getCurrentTimestamp: ${timestamp}`);
  return timestamp;
}

export { decode64, getPointCloudData, isWorkerSupported, getCurrentTimestamp };