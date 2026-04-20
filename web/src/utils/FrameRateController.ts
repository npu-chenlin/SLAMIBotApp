type AnimationCallback = (deltaTime: number, frameCount: number) => void;

export default class FrameRateController {
  private targetFPS: number = 25;
  private interval: number;
  private lastFrameTime: number = 0;
  private animationHandle: number = 0;
  private frameCount: number = 0;
  private isRunning: boolean = false;

  constructor(targetFPS: number) {
    this.targetFPS = targetFPS;
    this.interval = 1000 / targetFPS;
  }

  public start(callback: AnimationCallback) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    
    const animate = (currentTime: number) => {
      if (!this.isRunning) return;

      // 计算时间差（考虑暂停/恢复的情况）
      const deltaTime = currentTime - this.lastFrameTime;
      
      // 达到目标帧间隔时执行回调
      if (deltaTime >= this.interval) {
        callback(deltaTime, ++this.frameCount);
        this.lastFrameTime = currentTime - (deltaTime % this.interval); // 补偿误差
      }

      this.animationHandle = requestAnimationFrame(animate);
    };

    this.animationHandle = requestAnimationFrame(animate);
  }

  public stop() {
    this.isRunning = false;
    cancelAnimationFrame(this.animationHandle);
    this.frameCount = 0;
  }

  public setFPS(newFPS: number) {
    this.targetFPS = newFPS;
    this.interval = 1000 / newFPS;
  }
}

