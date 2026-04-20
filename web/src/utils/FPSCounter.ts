export default class FPSCounter {
    private samples: number[] = [];
    private lastSampleTime = performance.now();
  
    public update(): number {
      const now = performance.now();
      const delta = now - this.lastSampleTime;
      this.lastSampleTime = now;
      const fps = 1000 / delta;
      
      this.samples.push(fps);
      if (this.samples.length > 100) this.samples.shift();
      
      return this.getAverageFPS();
    }
  
    public getAverageFPS(): number {
      return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    }
  }
  