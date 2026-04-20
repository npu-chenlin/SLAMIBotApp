import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './UserGuide.css';

const UserGuide: React.FC = () => {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);

  // 添加meta标签以优化移动设备显示
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
    
    // 确保html和body元素有正确的高度
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    
    // 处理Android WebView中的高度问题
    const setHeight = () => {
      const windowHeight = window.innerHeight;
      if (pageRef.current) {
        pageRef.current.style.height = `${windowHeight}px`;
      }
    };

    console.log(window.innerHeight);
    
    // 初始设置和监听调整大小事件
    setHeight();
    window.addEventListener('resize', setHeight);
    
    // 在某些Android设备上，需要延迟设置高度
    setTimeout(setHeight, 300);
    
    return () => {
      window.removeEventListener('resize', setHeight);
    };
  }, []);

  const goBack = () => {
    navigate('/');
  };

  return (
    <div className="user-guide-page" ref={pageRef}>
      <div className="guide-container">
        <div className="header">
          <button className="back-button" onClick={goBack}>
            ← 返回主应用
          </button>
          <h1>🤖 SLAMIBOT 使用说明</h1>
          <p>快速上手指南 - 让您轻松掌握设备操作</p>
        </div>
        
        <div className="section">
          <h2>📋 设备连接</h2>
          <div className="step">
            <span className="step-number">1</span>
            确保设备电源已开启，指示灯正常
          </div>
          <div className="step">
            <span className="step-number">2</span>
            检查网络连接，确保设备与电脑在同一网络
          </div>
          <div className="step">
            <span className="step-number">3</span>
            点击右上角"🔌"按钮，输入设备IP地址
          </div>
          <div className="tip">
            默认IP地址为192.168.117.6，如无法连接请检查网络设置
          </div>
        </div>
        
        <div className="section">
          <h2>🎯 开始作业</h2>
          <div className="step">
            <span className="step-number">1</span>
            连接成功后，点击"开始作业"按钮
          </div>
          <div className="step">
            <span className="step-number">2</span>
            系统将自动开始数据采集和SLAM建图
          </div>
          <div className="step">
            <span className="step-number">3</span>
            实时查看点云数据和设备状态
          </div>
          <div className="user-guide-warning">
            作业过程中请勿移动或关闭设备，以免影响数据质量
          </div>
        </div>
        
        <div className="section">
          <h2>⚙️ 主要功能</h2>
          <div className="feature-grid">
            <div className="feature-item">
              <div className="feature-icon">📊</div>
              <div className="feature-title">项目管理</div>
              <div className="feature-desc">查看和管理历史项目</div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">⬇️</div>
              <div className="feature-title">下载中心</div>
              <div className="feature-desc">软件和固件更新</div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">📚</div>
              <div className="feature-title">使用教程</div>
              <div className="feature-desc">详细操作指南</div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">�</div>
              <div className="feature-title">设备配置</div>
              <div className="feature-desc">相机和系统设置</div>
            </div>
          </div>
        </div>
        
        <div className="section">
          <h2>📱 操作技巧</h2>
          <div className="tip">
            <strong>视角切换：</strong>点击相机图标可在第一人称和第三人称视角间切换
          </div>
          <div className="tip">
            <strong>点云查看：</strong>使用鼠标拖拽旋转视角，滚轮缩放
          </div>
          <div className="tip">
            <strong>状态监控：</strong>实时查看电池电量、存储空间和设备状态
          </div>
        </div>
        
        <div className="section">
          <h2>🔧 故障排除</h2>
          <div className="step">
            <span className="step-number">1</span>
            如设备未连接，检查IP地址和网络设置
          </div>
          <div className="step">
            <span className="step-number">2</span>
            如数据采集异常，重启设备并重新连接
          </div>
          <div className="step">
            <span className="step-number">3</span>
            如仍有问题，请联系技术支持
          </div>
        </div>
        
        <div className="footer">
          <p>© 2025 SLAMIBOT 技术支持团队</p>
          <p>如有疑问，请点击右上角"✉️"按钮联系我们</p>
        </div>
      </div>
    </div>
  );
};

export default UserGuide; 