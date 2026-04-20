declare module 'ros3d' {
  export interface ViewerOptions {
    divID: string;
    width: number;
    height: number;
    antialias?: boolean;
    background?: string;
    cameraPose?: any;
    alpha?: number;
    [key: string]: any;
  }

  export interface PointCloud2Options {
    ros: any;
    topic: string;
    tfClient?: any;
    rootObject?: any;
    material?: {
      size?: number;
      color?: number;
    };
    [key: string]: any;
  }

  export class Viewer {
    constructor(options: ViewerOptions);
    addObject(object: any): void;
    scene: any;
  }

  export class Grid {
    constructor(options?: any);
  }

  export class Axes {
    constructor(options?: any);
  }

  export class PointCloud2 {
    handleMessage: (message: any) => void;
    processMessage: (msg: any)  => void;
    points: any;
    points: any;
    max_pts: any;
    buffer: any;
    constructor(options: PointCloud2Options);
  }
}
