function decode64(
  data: any,
  buffer: any,
  point_step: any,
  pointRatio: any
): any {
  throw new Error("Function not implemented.");
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

export { decode64, isWorkerSupported, getCurrentTimestamp };