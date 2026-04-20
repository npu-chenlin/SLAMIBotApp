import ROSLIB from 'roslib';

// 定义ROS连接状态类型
export type ROSConnectionStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

// 定义ROS服务接口
export interface ROSServiceInterface {
  connect: (url: string) => void;
  disconnect: () => void;
  isConnected: () => boolean;
  getROSInstance: () => ROSLIB.Ros | null;
  subscribeTopic: <T>(topicName: string, messageType: string, callback: (message: T) => void) => ROSLIB.Topic;
  unsubscribeTopic: (topic: ROSLIB.Topic) => void;
  createTFClient: (options: Omit<ROSLIB.TFClientOptions, 'ros'>) => ROSLIB.TFClient;
  onConnectionChange: (callback: (status: ROSConnectionStatus) => void) => () => void;
  // 添加服务相关方法
  callService: <T, U>(serviceName: string, serviceType: string, request: T) => Promise<U>;
  createService: <T, U>(serviceName: string, serviceType: string) => ROSLIB.Service;
  // 添加发布话题方法
  publishTopic: <T>(topicName: string, messageType: string, message: T) => void;
  createPublisher: <T>(topicName: string, messageType: string) => ROSLIB.Topic;
  // 添加获取参数方法
  getParam: (name: string) => Promise<any>;
}

class ROSService implements ROSServiceInterface {
  private ros: ROSLIB.Ros | null = null;
  private connectionListeners: ((status: ROSConnectionStatus) => void)[] = [];
  private status: ROSConnectionStatus = 'disconnected';
  private activeTopics: ROSLIB.Topic[] = [];
  private activeServices: Map<string, ROSLIB.Service> = new Map();
  private activePublishers: Map<string, ROSLIB.Topic> = new Map();

  // 连接到ROS服务器
  connect(url: string): void {
    // 如果已经连接，先断开
    if (this.ros) {
      this.disconnect();
    }

    this.updateStatus('connecting');

    this.ros = new ROSLIB.Ros({
      url: url
    });

    this.ros.on('connection', () => {
      console.log('Connected to ROS websocket server.');
      this.updateStatus('connected');
    });

    this.ros.on('error', (error: Error) => {
      console.error('Error connecting to ROS websocket server:', error);
      this.updateStatus('error');
    });

    this.ros.on('close', () => {
      console.log('Connection to ROS websocket server closed.');
      this.updateStatus('disconnected');
    });
  }

  // 断开ROS连接
  disconnect(): void {
    if (this.ros) {
      // 取消所有活跃的话题订阅
      this.activeTopics.forEach(topic => {
        topic.unsubscribe();
      });
      this.activeTopics = [];

      // 清空活跃服务列表
      this.activeServices.clear();

      // 清空活跃发布者列表
      this.activePublishers.clear();

      this.ros.close();
      this.ros = null;
      this.updateStatus('disconnected');
    }
  }

  // 检查是否已连接
  isConnected(): boolean {
    return this.status === 'connected';
  }

  // 获取ROS实例
  getROSInstance(): ROSLIB.Ros | null {
    return this.ros;
  }

  // 订阅话题
  subscribeTopic<T>(topicName: string, messageType: string, callback: (message: T) => void): ROSLIB.Topic {
    if (!this.ros) {
      throw new Error('ROS not connected. Please connect first.');
    }

    const topic = new ROSLIB.Topic({
      ros: this.ros,
      name: topicName,
      messageType: messageType
    });

    topic.subscribe((message: T) => {
      callback(message);
    });

    this.activeTopics.push(topic);
    return topic;
  }

  // 取消订阅话题
  unsubscribeTopic(topic: ROSLIB.Topic): void {
    topic.unsubscribe();
    this.activeTopics = this.activeTopics.filter(t => t !== topic);
  }

  // 创建TF客户端
  // Create TF client
  createTFClient(options: Omit<ROSLIB.TFClientOptions, 'ros'>): ROSLIB.TFClient {
    if (!this.ros) {
      throw new Error('ROS not connected. Please connect first.');
    }

    // Add the ros instance to the options
    const tfOptions: ROSLIB.TFClientOptions = {
      ...options,
      ros: this.ros
    };

    return new ROSLIB.TFClient(tfOptions);
  }

  // 创建ROS服务
  createService<T, U>(serviceName: string, serviceType: string): ROSLIB.Service {
    if (!this.ros) {
      throw new Error('ROS not connected. Please connect first.');
    }

    // 检查是否已经创建了该服务
    const existingService = this.activeServices.get(serviceName);
    if (existingService) {
      return existingService;
    }

    // 创建新的服务
    const service = new ROSLIB.Service({
      ros: this.ros,
      name: serviceName,
      serviceType: serviceType
    });

    // 保存到活跃服务列表
    this.activeServices.set(serviceName, service);
    return service;
  }

  // 调用ROS服务
  callService<T, U>(serviceName: string, serviceType: string, request: T): Promise<U> {
    return new Promise((resolve, reject) => {
      try {
        const service = this.createService<T, U>(serviceName, serviceType);

        const serviceRequest = new ROSLIB.ServiceRequest(request);

        service.callService(serviceRequest, (response: U) => {
          resolve(response);
        }, (error: any) => {
          reject(new Error(`调用服务 ${serviceName} 失败: ${error}`));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 注册连接状态变化监听器
  onConnectionChange(callback: (status: ROSConnectionStatus) => void): () => void {
    this.connectionListeners.push(callback);
    // 立即通知当前状态
    callback(this.status);

    // 返回取消监听的函数
    return () => {
      this.connectionListeners = this.connectionListeners.filter(listener => listener !== callback);
    };
  }

  // 创建发布者
  createPublisher<T>(topicName: string, messageType: string): ROSLIB.Topic {
    if (!this.ros) {
      throw new Error('ROS not connected. Please connect first.');
    }

    // 检查是否已经创建了该发布者
    const existingPublisher = this.activePublishers.get(topicName);
    if (existingPublisher) {
      return existingPublisher;
    }

    // 创建新的发布者
    const publisher = new ROSLIB.Topic({
      ros: this.ros,
      name: topicName,
      messageType: messageType
    });

    // 保存到活跃发布者列表
    this.activePublishers.set(topicName, publisher);
    return publisher;
  }

  // 发布话题消息
  publishTopic<T>(topicName: string, messageType: string, message: T): void {
    try {
      const publisher = this.createPublisher<T>(topicName, messageType);
      publisher.publish(message);
      console.log(`Published message to ${topicName}:`, message);
    } catch (error) {
      console.error(`Failed to publish message to ${topicName}:`, error);
      throw error;
    }
  }

  // 获取ROS参数
  getParam(name: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ros) {
        reject(new Error('ROS not connected. Please connect first.'));
        return;
      }

      const param = new ROSLIB.Param({
        ros: this.ros,
        name: name
      });

      param.get((value: any) => {
        if (value !== undefined && value !== null) {
          resolve(value);
        } else {
          resolve(null);
        }
      });
    });
  }

  // 更新连接状态并通知所有监听器
  private updateStatus(status: ROSConnectionStatus): void {
    this.status = status;
    this.connectionListeners.forEach(listener => {
      listener(status);
    });
  }
}

// 创建单例实例
const rosService = new ROSService();

export default rosService;
