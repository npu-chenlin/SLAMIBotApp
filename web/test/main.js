// 全局 ROS 连接
let ros;
let connected = false;

let serviceClients = {};
let durationSubscriber;
let batterySubscriber;
let storageSubscriber;
let driverStatusSubscriber;
let keyframeSubscriber;
let cpuSubscriber;
let memorySubscriber;

// 初始化 ROS 连接
function initRosConnection() {
    ros = new ROSLIB.Ros({
        url: 'ws://' + window.location.hostname + ':9090'  // 自动使用当前主机名
    });

    ros.on('connection', function() {
        console.log('Connected to ROS Bridge server');
        document.getElementById('connectionStatus').textContent = '已连接';
        document.getElementById('connectionStatus').classList.add('connected');
        connected = true;
        
        // 初始化所有服务客户端
        initServiceClients();
        // 初始化订阅
        setupDurationSubscriber();
        setupBatterySubscriber();
        setupStorageSubscriber();
        setupDriverStatusSubscriber();
        setupKeyframeSubscriber();
        setupCpuSubscriber();
        setupMemorySubscriber();
        
        setupPoseSubscriber();
        
        // 自动加载项目列表
        setTimeout(() => {
            loadProjects();
        }, 1000); // 延迟1秒确保服务客户端已初始化
    });

    ros.on('error', function(error) {
        console.error('Error connecting to ROS bridge server:', error);
        document.getElementById('connectionStatus').textContent = '连接错误';
        document.getElementById('connectionStatus').classList.remove('connected');
        connected = false;
    });

    ros.on('close', function() {
        console.log('Connection to ROS bridge server closed');
        document.getElementById('connectionStatus').textContent = '未连接';
        document.getElementById('connectionStatus').classList.remove('connected');
        connected = false;
        
        if (durationSubscriber) {
            durationSubscriber.unsubscribe();
        }
        if (batterySubscriber) {
            batterySubscriber.unsubscribe();
        }
        if (storageSubscriber) {
            storageSubscriber.unsubscribe();
        }
        if (driverStatusSubscriber) {
            driverStatusSubscriber.unsubscribe();
        }
        if (keyframeSubscriber) {
            keyframeSubscriber.unsubscribe();
        }
        if (cpuSubscriber) {
            cpuSubscriber.unsubscribe();
        }
        if (memorySubscriber) {
            memorySubscriber.unsubscribe();
        }
        
        // Stop SLAM pose subscriber if available
        if (window.SlamPose && typeof window.SlamPose.stop === 'function') {
            window.SlamPose.stop();
        }
    });
}

// 初始化所有服务客户端
function initServiceClients() {
    serviceClients.versionClient = new ROSLIB.Service({
        ros: ros,
        name: '/get_version',
        serviceType: 'project_control/Base'
    });

    serviceClients.usbClient = new ROSLIB.Service({
        ros: ros,
        name: '/usb_operation',
        serviceType: 'project_control/Base'
    });

    serviceClients.projectListClient = new ROSLIB.Service({
        ros: ros,
        name: '/project_list',
        serviceType: 'project_control/Base'
    });

    serviceClients.projectDeleteClient = new ROSLIB.Service({
        ros: ros,
        name: '/project_delete',
        serviceType: 'project_control/Base'
    });

    serviceClients.imageClient = new ROSLIB.Service({
        ros: ros,
        name: '/project_image',
        serviceType: 'project_control/MultiBytes'
    });



    serviceClients.ipClient = new ROSLIB.Service({
        ros: ros,
        name: '/ip_config',
        serviceType: 'project_control/Base'
    });

    serviceClients.currentIpClient = new ROSLIB.Service({
        ros: ros,
        name: '/current_ip',
        serviceType: 'project_control/Base'
    });

    serviceClients.cameraExposureControlService = new ROSLIB.Service({
        ros: ros,
        name: '/set_camera_exposure',
        serviceType: 'project_control/Base'
    });

    serviceClients.cameraGainControlService = new ROSLIB.Service({
        ros: ros,
        name: '/set_camera_gain',
        serviceType: 'project_control/Base'
    });
    
    serviceClients.cameraWhiteBalanceControlService = new ROSLIB.Service({
        ros: ros,
        name: '/set_camera_white_balance',
        serviceType: 'project_control/Base'
    });

    serviceClients.cameraStatusService = new ROSLIB.Service({
        ros: ros,
        name: '/get_camera_status',
        serviceType: 'project_control/Base'
    });

    serviceClients.projectControlService = new ROSLIB.Service({
        ros: ros,
        name: '/project_control',
        serviceType: 'device_control/Base'
    });
}

function setupDurationSubscriber() {
    durationSubscriber = new ROSLIB.Topic({
        ros: ros,
        name: '/project_duration',
        messageType: 'std_msgs/Float64'
    });
    
    durationSubscriber.subscribe(function(message) {
        const durationElement = document.getElementById('projectDuration');
        durationElement.textContent = formatDuration(message.data);
    });
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return [hours, minutes, secs]
        .map(v => v < 10 ? "0" + v : v)
        .join(":");
}

function showResult(elementId, message, success = true) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    
    if (elementId === 'resultMessage') {
        const panel = document.getElementById('resultPanel');
        panel.style.display = 'block';
        panel.className = success ? 'result-panel success' : 'result-panel error';
        
        // 5秒后隐藏
        setTimeout(function() {
            panel.style.display = 'none';
        }, 5000);
    }
}


let selectedProject = '';
function getVersion() {
    if (!connected || !serviceClients.versionClient) return;
    
    const request = new ROSLIB.ServiceRequest({});
    serviceClients.versionClient.callService(request, result => {
        showResult('versionStatus', result.message);
    }, error => {
        showResult('versionStatus', '获取失败: ' + error, false);
    });
}

function cleanUSB() {
    if (!connected || !serviceClients.usbClient) return;
    
    const request = new ROSLIB.ServiceRequest({});
    serviceClients.usbClient.callService(request, result => {
        showResult('usbStatus', result.success ? '清理成功' : '清理失败: ' + result.message, result.success);
    }, error => {
        showResult('usbStatus', '服务调用失败: ' + error, false);
    });
}

function loadProjects() {
    if (!connected || !serviceClients.projectListClient) return;
    
    const request = new ROSLIB.ServiceRequest({});
    serviceClients.projectListClient.callService(request, result => {
        const select = document.getElementById('projectList');
        select.innerHTML = '<option value="">选择项目</option>';
        if (result.success) {
            result.message.split(',').forEach(project => {
                if (project.trim()) {
                    const option = document.createElement('option');
                    option.value = project;
                    option.textContent = project;
                    select.appendChild(option);
                }
            });
            showResult('resultMessage', '项目列表加载成功', true);
        } else {
            showResult('resultMessage', '项目列表加载失败: ' + result.message, false);
        }
    }, error => {
        showResult('resultMessage', '服务调用失败: ' + error, false);
    });
}

function deleteProject() {
    if (!connected || !serviceClients.projectDeleteClient) {
        alert('未连接到ROS服务器');
        return;
    }
    
    const select = document.getElementById('projectList');
    const selectedProject = select.value;
    
    if (!selectedProject) {
        alert('请先选择要删除的项目');
        return;
    }
    
    if (!confirm(`确定要删除项目"${selectedProject}"吗？`)) {
        return;
    }
    
    const request = new ROSLIB.ServiceRequest({
        params: selectedProject
    });
    
    serviceClients.projectDeleteClient.callService(request, result => {
        if (result.success) {
            alert('项目删除成功');
            // 刷新项目列表
            loadProjects();
            const previewImage = document.getElementById('previewImage');
            if (previewImage) {
                previewImage.src = '';
            }
        } else {
            alert('删除失败: ' + result.message);
        }
    }, error => {
        alert('服务调用失败: ' + error);
    });
}

function onProjectSelected() {
    const select = document.getElementById('projectList');
    selectedProject = select.value;
    loadPreviewImage();
}

function loadPreviewImage() {
    if (!connected || !serviceClients.imageClient || !selectedProject) return;

    const request = new ROSLIB.ServiceRequest({
        project_name: selectedProject
    });

    serviceClients.imageClient.callService(request, result => {
        if (result.success) {
            if (result.data && result.data.length > 0) {
                let binaryData;
                
                if (result.data instanceof Array || result.data instanceof Uint8Array) {
                    console.log("result data is uint8 array");
                    binaryData = new Uint8Array(result.data);
                } 
                else if (typeof result.data === 'string') {
                    console.log("result data is string");
                    const base64Data = result.data.split(',')[1] || result.data; // 去除 data:image/png;base64, 前缀
                    binaryData = new Uint8Array(atob(base64Data).split('').map(c => c.charCodeAt(0)));
                }
    
                const blob = new Blob([binaryData], { type: 'image/jpeg' });
                const img_ele = document.getElementById('previewImage');
                img_ele.src = URL.createObjectURL(blob);

                // 清理URL对象
                setTimeout(() => {
                    URL.revokeObjectURL(img_ele.src);
                }, 1000);
            } else {
                console.warn("Received empty image data");
                const img_ele = document.getElementById('previewImage');
                img_ele.src = ''; // 清空图片
            }
        } else {
            console.error("Service failed:", result.message);
        }
    });
}





function setIPConfig(event) {
    event.preventDefault();
    
    if (!connected || !serviceClients.ipClient) {
        showResult('ipStatus', '未连接到ROS服务器', false);
        return;
    }
    
    const params = [
        document.getElementById('ip').value,
        document.getElementById('mask').value,
        document.getElementById('gateway').value,
        document.getElementById('dns').value
    ].join('/');

    const request = new ROSLIB.ServiceRequest({
        params: params
    });

    serviceClients.ipClient.callService(request, result => {
        showResult('ipStatus', result.success ? '配置成功' : '配置失败: ' + result.message, result.success);
    }, error => {
        showResult('ipStatus', '服务调用失败: ' + error, false);
    });
}

function getCurrentIPConfig() {
    if (!connected || !serviceClients.currentIpClient) {
        showResult('ipStatus', '未连接到ROS服务器', false);
        return;
    }
    
    showResult('ipStatus', '正在获取当前网络配置...');
    
    const request = new ROSLIB.ServiceRequest({});
    
    serviceClients.currentIpClient.callService(request, result => {
        if (result.success) {
            const parts = result.message.split('/');
            if (parts.length >= 4) {
                document.getElementById('ip').value = parts[0];
                document.getElementById('mask').value = parts[1];
                document.getElementById('gateway').value = parts[2];
                document.getElementById('dns').value = parts[3];
                showResult('ipStatus', '已加载当前网络配置', true);
            } else {
                showResult('ipStatus', '配置数据格式错误', false);
            }
        } else {
            showResult('ipStatus', '获取配置失败: ' + result.message, false);
        }
    }, error => {
        showResult('ipStatus', '服务调用失败: ' + error, false);
    });
}



// 获取相机状态
function getCameraStatus() {
    if (!connected || !serviceClients.cameraStatusService) {
        showResult('cameraStatus', '未连接到ROS服务器', false);
        return;
    }
    
    const request = new ROSLIB.ServiceRequest({
        params: ""
    });
    
    serviceClients.cameraStatusService.callService(request, function(result) {
        showResult('cameraStatus', result.success ? result.message : '获取相机状态失败: ' + result.message, result.success);
    }, function(error) {
        showResult('cameraStatus', '服务调用错误: ' + error, false);
    });
}

// 应用曝光设置
function applyExposureSettings() {
    if (!connected || !serviceClients.cameraExposureControlService) {
        showResult('exposureStatus', '未连接到ROS服务器', false);
        return;
    }
    
    const exposureMode = document.getElementById('exposureMode').value;
    const exposureTime = document.getElementById('exposureTime').value;
    const aeTimeUpperLimit = document.getElementById('aeTimeUpperLimit').value;

    // 验证参数
    if (exposureMode < 0 || exposureMode > 2) {
        showResult('exposureStatus', '曝光模式参数无效', false);
        return;
    }
    
    if (exposureTime < 0) {
        showResult('exposureStatus', '曝光时间不能为负数', false);
        return;
    }
    
    if (aeTimeUpperLimit < 0) {
        showResult('exposureStatus', '自动曝光上限不能为负数', false);
        return;
    }

    // 格式: exposureMode/exposureTime/aeTimeUpperLimit
    const request = new ROSLIB.ServiceRequest({
        params: `${exposureMode}/${exposureTime}/${aeTimeUpperLimit}`
    });

    showResult('exposureStatus', '正在应用曝光设置...');
    
    serviceClients.cameraExposureControlService.callService(request, function(result) {
        showResult('exposureStatus', result.success ? '曝光设置成功: ' + result.message : '曝光设置失败: ' + result.message, result.success);
    }, function(error) {
        showResult('exposureStatus', '服务调用错误: ' + error, false);
    });
}

// 应用白平衡设置
function applyWhiteBalanceSettings() {
    if (!connected || !serviceClients.cameraWhiteBalanceControlService) {
        showResult('whiteBalanceStatus', '未连接到ROS服务器', false);
        return;
    }
    
    const whiteBalanceMode = document.getElementById('whiteBalanceMode').value;
    const redRatio = document.getElementById('redRatio').value;
    const greenRatio = document.getElementById('greenRatio').value;
    const blueRatio = document.getElementById('blueRatio').value;

    // 验证参数
    if (whiteBalanceMode < 0 || whiteBalanceMode > 2) {
        showResult('whiteBalanceStatus', '白平衡模式参数无效', false);
        return;
    }
    
    if (redRatio < 0 || greenRatio < 0 || blueRatio < 0) {
        showResult('whiteBalanceStatus', '白平衡通道值不能为负数', false);
        return;
    }

    // 格式: whiteBalanceMode/redRatio/greenRatio/blueRatio
    const request = new ROSLIB.ServiceRequest({
        params: `${whiteBalanceMode}/${redRatio}/${greenRatio}/${blueRatio}`
    });

    showResult('whiteBalanceStatus', '正在应用白平衡设置...');
    
    serviceClients.cameraWhiteBalanceControlService.callService(request, function(result) {
        showResult('whiteBalanceStatus', result.success ? '白平衡设置成功: ' + result.message : '白平衡设置失败: ' + result.message, result.success);
    }, function(error) {
        showResult('whiteBalanceStatus', '服务调用错误: ' + error, false);
    });
}

// 应用增益设置
function applyGainSettings() {
    if (!connected || !serviceClients.cameraGainControlService) {
        showResult('gainStatus', '未连接到ROS服务器', false);
        return;
    }
    
    const gainMode = document.getElementById('gainMode').value;
    const gainValue = document.getElementById('gainValue').value;

    // 验证参数
    if (gainMode < 0 || gainMode > 2) {
        showResult('gainStatus', '增益模式参数无效', false);
        return;
    }
    
    if (gainValue < 0) {
        showResult('gainStatus', '增益值不能为负数', false);
        return;
    }

    // 格式: gainMode/gainValue
    const request = new ROSLIB.ServiceRequest({
        params: `${gainMode}/${gainValue}`
    });

    showResult('gainStatus', '正在应用增益设置...');
    
    serviceClients.cameraGainControlService.callService(request, function(result) {
        showResult('gainStatus', result.success ? '增益设置成功: ' + result.message : '增益设置失败: ' + result.message, result.success);
    }, function(error) {
        showResult('gainStatus', '服务调用错误: ' + error, false);
    });
}

// 应用预设
function applyPreset() {
    const presetMode = document.getElementById('presetMode').value;
    if (!presetMode) {
        showResult('presetStatus', '请选择预设模式', false);
        return;
    }
    
    showResult('presetStatus', '正在应用预设...');
    
    // 根据预设模式设置参数
    switch (presetMode) {
        case 'auto':
            // 全自动模式：连续自动曝光 + 连续自动白平衡 + 连续自动增益
            setPresetValues(2, 30000, 50000, 2, 1000, 1000, 1000, 2, 5);
            break;
        case 'manual':
            // 手动模式：关闭自动曝光 + 关闭自动白平衡 + 关闭自动增益
            setPresetValues(0, 30000, 50000, 0, 1000, 1000, 1000, 0, 5);
            break;
        case 'low_light':
            // 低光环境：连续自动曝光 + 连续自动白平衡 + 高增益
            setPresetValues(2, 50000, 100000, 2, 1000, 1000, 1000, 0, 15);
            break;
        case 'bright_light':
            // 强光环境：连续自动曝光 + 连续自动白平衡 + 低增益
            setPresetValues(2, 10000, 30000, 2, 1000, 1000, 1000, 0, 2);
            break;
        default:
            showResult('presetStatus', '未知的预设模式', false);
            return;
    }
    
    showResult('presetStatus', '预设应用成功', true);
}

// 设置预设值
function setPresetValues(exposureMode, exposureTime, aeTimeUpperLimit, 
                        whiteBalanceMode, redRatio, greenRatio, blueRatio,
                        gainMode, gainValue) {
    // 设置曝光参数
    document.getElementById('exposureMode').value = exposureMode;
    document.getElementById('exposureTime').value = exposureTime;
    document.getElementById('aeTimeUpperLimit').value = aeTimeUpperLimit;
    
    // 设置白平衡参数
    document.getElementById('whiteBalanceMode').value = whiteBalanceMode;
    document.getElementById('redRatio').value = redRatio;
    document.getElementById('greenRatio').value = greenRatio;
    document.getElementById('blueRatio').value = blueRatio;
    
    // 设置增益参数
    document.getElementById('gainMode').value = gainMode;
    document.getElementById('gainValue').value = gainValue;
    
    // 自动应用所有设置
    applyExposureSettings();
    applyWhiteBalanceSettings();
    applyGainSettings();
}

function callProjectControl(action) {
    if (!connected || !serviceClients.projectControlService) {
        showResult('resultMessage', '未连接到ROS服务器', false);
        return;
    }
    
    const taskName = document.getElementById('taskName').value.trim();
    if (!taskName) {
        showResult('resultMessage', '请输入任务名称', false);
        return;
    }
    
    const request = new ROSLIB.ServiceRequest({
        params: `${taskName}/${action}`
    });
    
    serviceClients.projectControlService.callService(request, function(result) {
        showResult('resultMessage', result.message, result.success);
    }, function(error) {
        showResult('resultMessage', `服务调用失败: ${error}`, false);
    });
}


function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // 移除所有活动标签
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // 设置活动标签
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// 设置电池状态订阅
function setupBatterySubscriber() {
    batterySubscriber = new ROSLIB.Topic({
        ros: ros,
        name: '/battery',
        messageType: 'sensor_msgs/BatteryState'
    });
    
    batterySubscriber.subscribe(function(message) {
        const batteryElement = document.getElementById('batteryStatus');
        const batterySpan = batteryElement.querySelector('span');
        const batteryIcon = batteryElement.querySelector('i');
        
        // 更新电池百分比
        const percentage = Math.round(message.percentage * 100);
        batterySpan.textContent = `${percentage}%`;
        
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // 设置标签切换
    setupTabs();
    
    // 初始化ROS连接
    initRosConnection();
    
    // 设备控制事件监听
    document.getElementById('getVersionBtn').addEventListener('click', getVersion);
    document.getElementById('cleanUSBBtn').addEventListener('click', cleanUSB);
    document.getElementById('projectList').addEventListener('change', onProjectSelected);

    document.getElementById('deleteProjectBtn').addEventListener('click', deleteProject);
    document.getElementById('ipConfigForm').addEventListener('submit', setIPConfig);
    document.getElementById('getCurrentIPBtn').addEventListener('click', getCurrentIPConfig);
    
    // 相机控制事件监听
    document.getElementById('getCameraStatusBtn').addEventListener('click', getCameraStatus);
    document.getElementById('applyExposureSettings').addEventListener('click', applyExposureSettings);
    document.getElementById('applyWhiteBalanceSettings').addEventListener('click', applyWhiteBalanceSettings);
    document.getElementById('applyGainSettings').addEventListener('click', applyGainSettings);
    document.getElementById('applyPresetBtn').addEventListener('click', applyPreset);
    
    // 项目控制事件监听
    document.getElementById('startButton').addEventListener('click', () => callProjectControl('start_device'));
    document.getElementById('stopButton').addEventListener('click', () => callProjectControl('stop_device'));
    
    // 绑定标定文件相关事件
    document.getElementById('loadCalibBtn').addEventListener('click', loadCalibFile);
    document.getElementById('saveCalibBtn').addEventListener('click', saveCalibFile);
    document.getElementById('formatJsonBtn').addEventListener('click', formatJsonContent);
    
    // 文件上传相关事件绑定
    const uploadBtn = document.getElementById('uploadArchiveBtn');
    const fileInput = document.getElementById('archiveFile');
    const statusDiv = document.getElementById('uploadStatus');
    const progressBar = document.getElementById('uploadProgress');
    const progressFill = progressBar.querySelector('.progress-fill');
    
    uploadBtn.addEventListener('click', function() {
        const file = fileInput.files[0];
        if (!file) {
            statusDiv.textContent = '请先选择文件';
            statusDiv.style.color = 'var(--error-color)';
            return;
        }
        
        const formData = new FormData();
        formData.append('file', file);
        
        // 显示上传状态
        statusDiv.textContent = '正在上传文件...';
        statusDiv.style.color = 'var(--text-color)';
        progressBar.style.display = 'block';
        progressFill.style.width = '0%';
        
        const xhr = new XMLHttpRequest();
        
        // 进度处理
        xhr.upload.addEventListener('progress', function(e) {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                progressFill.style.width = percentComplete + '%';
            }
        });
        
        // 完成处理
        xhr.addEventListener('load', function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                statusDiv.textContent = '固件上传成功';
                statusDiv.style.color = 'var(--success-color)';
            } else {
                try {
                    const response = JSON.parse(xhr.responseText);
                    statusDiv.textContent = '错误: ' + response.message;
                } catch (e) {
                    statusDiv.textContent = '上传失败，状态码: ' + xhr.status;
                }
                statusDiv.style.color = 'var(--error-color)';
            }
            setTimeout(() => {
                progressBar.style.display = 'none';
            }, 2000);
        });
        
        // 错误处理
        xhr.addEventListener('error', function() {
            statusDiv.textContent = '网络错误，上传失败';
            statusDiv.style.color = 'var(--error-color)';
            progressBar.style.display = 'none';
        });
        
        // 发送请求
        xhr.open('POST', '/upload', true);
        xhr.send(formData);
    });
    
    // 文件选择变化时更新状态
    fileInput.addEventListener('change', function() {
        const file = fileInput.files[0];
        if (file) {
            statusDiv.textContent = `已选择: ${file.name} (${formatFileSize(file.size)})`;
            statusDiv.style.color = 'var(--text-color)';
        } else {
            statusDiv.textContent = '就绪';
            statusDiv.style.color = 'var(--text-color)';
        }
    });
    

    
    // 自动更新硬件固件（基于install.bash的upload函数逻辑）
    const autoUploadBtn = document.getElementById('autoUploadBtn');
    
    autoUploadBtn.addEventListener('click', function() {
        // 禁用按钮防止重复点击
        autoUploadBtn.disabled = true;
        autoUploadBtn.textContent = '正在更新...';
        
        // 显示更新状态
        statusDiv.textContent = '正在查询最新固件版本...';
        statusDiv.style.color = 'var(--text-color)';
        progressBar.style.display = 'block';
        progressFill.style.width = '0%';
        
        // 延迟一秒后开始查询，让用户看到状态
        setTimeout(() => {
            // 先查询最新版本信息
            fetch('http://101.42.4.41:5001/latest/hardware')
        .then(response => response.json())
        .then(versionData => {
            if (!versionData || !versionData.filename) {
                throw new Error('无法获取最新固件信息');
            }
            
            // 显示查询到的固件信息
            statusDiv.innerHTML = `
                <div><strong>✅ 最新固件版本:</strong> v${versionData.latest_version || 'unknown'}</div>
                <div><strong>📄 文件名:</strong> ${versionData.filename}</div>
                <div><strong>📝 描述:</strong> ${versionData.description || 'unknown'}</div>
                <div><strong>📅 发布日期:</strong> ${versionData.release_date || 'unknown'}</div>
            `;
            statusDiv.style.color = 'var(--success-color)';
            
            // 延迟2秒让用户查看固件信息，然后开始下载
            return new Promise((resolve) => {
                setTimeout(() => {
                    statusDiv.textContent = `正在下载固件: ${versionData.filename}...`;
                    progressFill.style.width = '25%';
                    
                    // 构建下载URL
                    const downloadUrl = `http://101.42.4.41:5001/download/hardware/${versionData.filename}`;
                    
                    // 下载最新固件
                    resolve(fetch(downloadUrl));
                }, 2000);
            });
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`下载失败: ${response.status}`);
            }
            
            statusDiv.textContent = '正在处理固件文件...';
            progressFill.style.width = '50%';
            
            return response.blob();
        })
        .then(blob => {
            statusDiv.textContent = '正在更新硬件固件...';
            progressFill.style.width = '75%';
            
            // 创建FormData准备更新硬件
            const formData = new FormData();
            formData.append('file', blob, 'latest_firmware.ibot');
            
            // 更新硬件固件（使用现有的/upload端点）
            return fetch('/upload', {
                method: 'POST',
                body: formData
            });
        })
        .then(response => {
            progressFill.style.width = '100%';
            
            if (response.ok) {
                statusDiv.textContent = '✅ 硬件固件更新成功！系统将在3秒后重启...';
                statusDiv.style.color = 'var(--success-color)';
            } else {
                return response.json().then(data => {
                    statusDiv.textContent = `❌ 硬件固件更新失败: ${data.message || '未知错误'}`;
                    statusDiv.style.color = 'var(--error-color)';
                });
            }
        })
        .catch(error => {
            progressFill.style.width = '100%';
            
            statusDiv.textContent = `❌ 硬件固件更新失败: ${error.message}`;
            statusDiv.style.color = 'var(--error-color)';
            console.error('硬件固件更新错误:', error);
        })
        .finally(() => {
            // 恢复按钮状态
            autoUploadBtn.disabled = false;
            autoUploadBtn.textContent = '自动更新硬件固件';
            
            setTimeout(() => {
                progressBar.style.display = 'none';
            }, 3000);
        });
        }, 1000); // 延迟1秒后开始查询
    });
});


// 设置存储空间订阅
function setupStorageSubscriber() {
    storageSubscriber = new ROSLIB.Topic({
        ros: ros,
        name: '/storage',
        messageType: 'std_msgs/String'
    });
    
    storageSubscriber.subscribe(function(message) {
        const storageElement = document.getElementById('storageStatus');
        const storageSpan = storageElement.querySelector('span');
        
        // 更新存储空间信息
        storageSpan.textContent = message.data;
    });
}

// 设置驱动状态订阅
function setupDriverStatusSubscriber() {
    driverStatusSubscriber = new ROSLIB.Topic({
        ros: ros,
        name: '/driver_status',
        messageType: 'std_msgs/UInt8'
    });
    
    driverStatusSubscriber.subscribe(function(message) {
        // 8 bytes. 0,0,0,0,SD,SLAM,CAM,LiDAR
        const statusArray = [
            message.data & 0x01,          
            (message.data >> 1) & 0x01,               
            (message.data >> 2) & 0x01,   
            (message.data >> 3) & 0x01];
        
        // console.log("Driver status received:", message.data, "Parsed status:", statusArray);
        
        updateDeviceStatus('lidarStatus', statusArray[0]);
        updateDeviceStatus('camStatus', statusArray[1]);
        updateDeviceStatus('slamStatus', statusArray[2]);
        updateDeviceStatus('sdStatus', statusArray[3]);
    });
}

// 更新设备状态指示灯
function updateDeviceStatus(elementId, statusCode) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const indicator = element.querySelector('.status-indicator');
    if (!indicator) return;
    
    // 清除旧的状态类
    indicator.classList.remove('active', 'error', 'warning');
    
    // 根据状态码设置指示灯
    switch (statusCode) {
        case 0: 
            break;
        case 1: 
            indicator.classList.add('active');
            break;
        case 2: 
            indicator.classList.add('warning');
            break;
        default:
            break;
    }
}

// 设置关键帧图像订阅
function setupKeyframeSubscriber() {
    let isSubscribed = true;
    const keyframeImage = document.getElementById('keyframeImage');
    
    if (!keyframeImage) {
        console.error("Keyframe HTML elements not found");
        return;
    }
    
    keyframeSubscriber = new ROSLIB.Topic({
        ros: ros,
        name: '/keyframe',
        messageType: 'sensor_msgs/CompressedImage'
    });
    
    keyframeSubscriber.subscribe(function(message) {
        if (!isSubscribed) return;
        
        try {
            const canvas = document.getElementById('keyframeImage');
            if(message.format.includes("jpeg") || message.format == "png"){
                const image = new Image();
                image.src = "data:image/"+message.format+";base64," + message.data;
                image.onload = function() {
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(image, 0, 0, image.width, image.height);
                }
            }
        } catch (error) {
            console.error('Error processing keyframe image:', error);
        }
    });
    
   
}

// 设置CPU使用率订阅
function setupCpuSubscriber() {
    cpuSubscriber = new ROSLIB.Topic({
        ros: ros,
        name: '/cpu',
        messageType: 'std_msgs/Float64'
    });
    
    cpuSubscriber.subscribe(function(message) {
        const cpuElement = document.getElementById('cpuStatus');
        if (!cpuElement) return;
        
        const cpuSpan = cpuElement.querySelector('span');
        if (!cpuSpan) return;
        
        // 更新CPU使用率
        const percentage = Math.round(message.data);
        cpuSpan.textContent = `CPU: ${percentage}%`;
        
        // 更新样式
        cpuElement.classList.remove('low', 'medium', 'high');
        if (percentage < 50) {
            cpuElement.classList.add('low');
        } else if (percentage < 80) {
            cpuElement.classList.add('medium');
        } else {
            cpuElement.classList.add('high');
        }
    });
}

// 设置内存使用率订阅
function setupMemorySubscriber() {
    memorySubscriber = new ROSLIB.Topic({
        ros: ros,
        name: '/memory',
        messageType: 'std_msgs/Float64'
    });
    
    memorySubscriber.subscribe(function(message) {
        const memoryElement = document.getElementById('memoryStatus');
        if (!memoryElement) return;
        
        const memorySpan = memoryElement.querySelector('span');
        if (!memorySpan) return;
        
        // 更新内存使用率
        const percentage = Math.round(message.data);
        memorySpan.textContent = `MEM: ${percentage}%`;
        
        // 更新样式
        memoryElement.classList.remove('low', 'medium', 'high');
        if (percentage < 60) {
            memoryElement.classList.add('low');
        } else if (percentage < 85) {
            memoryElement.classList.add('medium');
        } else {
            memoryElement.classList.add('high');
        }
    });
}


// 四元数转欧拉角（单位：度）
function quaternionToEuler(q) {
    // 提取四元数的x, y, z, w
    const x = q.x;
    const y = q.y;
    const z = q.z;
    const w = q.w;
    
    // 计算欧拉角
    // 参考: https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles
    
    // roll (x-axis rotation)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp) * (180 / Math.PI);
    
    // pitch (y-axis rotation)
    const sinp = 2 * (w * y - z * x);
    let pitch;
    if (Math.abs(sinp) >= 1) {
        pitch = Math.sign(sinp) * 90; // use 90 degrees if out of range
    } else {
        pitch = Math.asin(sinp) * (180 / Math.PI);
    }
    
    // yaw (z-axis rotation)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp) * (180 / Math.PI);
    
    return { roll, pitch, yaw };
}

function setupPoseSubscriber() {

    // 创建订阅
    slamPoseSubscriber = new ROSLIB.Topic({
        ros: ros,
        name: '/slam_pose',
        messageType: 'nav_msgs/Odometry'
    });
   // 订阅SLAM位姿话题
    slamPoseSubscriber.subscribe(function(message) {
        // 获取位置数据
        const position = message.pose.pose.position;
        const orientation = message.pose.pose.orientation;
        
        // 更新位置显示
        const positionElement = document.getElementById('slamPosition');
        if (positionElement) {
            positionElement.textContent = `${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`;
        }
        
        // 更新四元数显示
        const orientationElement = document.getElementById('slamOrientation');
        if (orientationElement) {
            orientationElement.textContent = `x: ${orientation.x.toFixed(2)}, y: ${orientation.y.toFixed(2)}, z: ${orientation.z.toFixed(2)}, w: ${orientation.w.toFixed(2)}`;
        }
        
        // 计算并更新欧拉角
        const eulerElement = document.getElementById('slamEuler');
        if (eulerElement) {
            const euler = quaternionToEuler(orientation);
            eulerElement.textContent = `${euler.roll.toFixed(2)}°, ${euler.pitch.toFixed(2)}°, ${euler.yaw.toFixed(2)}°`;
        }
    });
    
    console.log('SLAM pose subscriber initialized');
}

// 标定文件相关函数
function loadCalibFile() {
    const statusElement = document.getElementById('calibStatus');
    statusElement.textContent = '正在读取文件...';
    
    fetch('/api/calib/read')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('calibContent').value = data.data.content;
                statusElement.textContent = '文件读取成功';
                statusElement.style.color = '#4CAF50';
            } else {
                statusElement.textContent = `读取失败: ${data.message}`;
                statusElement.style.color = '#F44336';
            }
        })
        .catch(error => {
            console.error('Error loading calib file:', error);
            statusElement.textContent = '读取失败: 网络错误';
            statusElement.style.color = '#F44336';
        });
}

function saveCalibFile() {
    const content = document.getElementById('calibContent').value.trim();
    const statusElement = document.getElementById('calibStatus');
    
    if (!content) {
        statusElement.textContent = '错误: 文件内容不能为空';
        statusElement.style.color = '#F44336';
        return;
    }
    
    statusElement.textContent = '正在保存文件...';
    
    fetch('/api/calib/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: content })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            statusElement.textContent = data.message;
            statusElement.style.color = '#4CAF50';
            
            // 显示重启提示
            if (confirm('标定文件保存成功！建议重启设备以应用更改。是否现在重启设备？')) {
                // 这里可以添加重启设备的逻辑
                alert('请手动重启设备以应用标定文件更改。');
            }
        } else {
            statusElement.textContent = `保存失败: ${data.message}`;
            statusElement.style.color = '#F44336';
        }
    })
    .catch(error => {
        console.error('Error saving calib file:', error);
        statusElement.textContent = '保存失败: 网络错误';
        statusElement.style.color = '#F44336';
    });
}

function formatJsonContent() {
    const textarea = document.getElementById('calibContent');
    const content = textarea.value.trim();
    
    if (!content) {
        document.getElementById('calibStatus').textContent = '错误: 没有内容可格式化';
        document.getElementById('calibStatus').style.color = '#F44336';
        return;
    }
    
    try {
        const parsed = JSON.parse(content);
        const formatted = JSON.stringify(parsed, null, 2);
        textarea.value = formatted;
        document.getElementById('calibStatus').textContent = 'JSON格式化成功';
        document.getElementById('calibStatus').style.color = '#4CAF50';
    } catch (error) {
        document.getElementById('calibStatus').textContent = `JSON格式化失败: ${error.message}`;
        document.getElementById('calibStatus').style.color = '#F44336';
    }
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
    else return (bytes / 1073741824).toFixed(2) + ' GB';
}

