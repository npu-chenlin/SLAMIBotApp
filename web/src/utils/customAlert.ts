// 自定义alert工具函数
let alertContainer: HTMLDivElement | null = null;
let currentAlert: HTMLDivElement | null = null;

// 创建alert容器
function createAlertContainer(): HTMLDivElement {
  if (!alertContainer) {
    alertContainer = document.createElement('div');
    alertContainer.id = 'custom-alert-container';
    alertContainer.style.position = 'fixed';
    alertContainer.style.top = '0';
    alertContainer.style.left = '0';
    alertContainer.style.width = '100%';
    alertContainer.style.height = '100%';
    alertContainer.style.zIndex = '9999';
    alertContainer.style.display = 'none';
    document.body.appendChild(alertContainer);
  }
  return alertContainer;
}

// 创建alert元素
function createAlertElement(message: string, title: string = '提示'): HTMLDivElement {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'custom-alert';
  alertDiv.style.position = 'fixed';
  alertDiv.style.top = '50%';
  alertDiv.style.left = '50%';
  alertDiv.style.transform = 'translate(-50%, -50%)';
  alertDiv.style.background = 'white';
  alertDiv.style.padding = '20px';
  alertDiv.style.border = '1px solid #ccc';
  alertDiv.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
  alertDiv.style.zIndex = '10000';
  alertDiv.style.borderRadius = '8px';
  alertDiv.style.textAlign = 'center';
  alertDiv.style.minWidth = '300px';
  alertDiv.style.maxWidth = '500px';

  const titleElement = document.createElement('h3');
  titleElement.textContent = title;
  titleElement.style.margin = '0 0 15px 0';
  titleElement.style.color = '#333';
  titleElement.style.fontSize = '18px';
  titleElement.style.fontWeight = '600';

  const messageElement = document.createElement('p');
  messageElement.innerHTML = message; // 支持HTML渲染
  messageElement.style.margin = '0 0 20px 0';
  messageElement.style.color = '#666';
  messageElement.style.fontSize = '14px';
  messageElement.style.lineHeight = '1.5';

  const okButton = document.createElement('button');
  okButton.textContent = '确定';
  okButton.className = 'btn-ok';
  okButton.style.background = '#007bff';
  okButton.style.color = 'white';
  okButton.style.border = 'none';
  okButton.style.padding = '8px 16px';
  okButton.style.marginTop = '15px';
  okButton.style.borderRadius = '4px';
  okButton.style.cursor = 'pointer';
  okButton.style.fontSize = '14px';

  okButton.addEventListener('click', () => {
    closeAlert();
  });

  alertDiv.appendChild(titleElement);
  alertDiv.appendChild(messageElement);
  alertDiv.appendChild(okButton);

  return alertDiv;
}

// 创建确认弹窗元素
function createConfirmAlertElement(
  message: string, 
  title: string = '确认'
): { alertDiv: HTMLDivElement; setResolve: (resolve: (confirmed: boolean) => void) => void } {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'custom-alert';
  alertDiv.style.position = 'fixed';
  alertDiv.style.top = '50%';
  alertDiv.style.left = '50%';
  alertDiv.style.transform = 'translate(-50%, -50%)';
  alertDiv.style.background = 'white';
  alertDiv.style.padding = '20px';
  alertDiv.style.border = '1px solid #ccc';
  alertDiv.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
  alertDiv.style.zIndex = '10000';
  alertDiv.style.borderRadius = '8px';
  alertDiv.style.textAlign = 'center';
  alertDiv.style.minWidth = '350px';
  alertDiv.style.maxWidth = '500px';

  const titleElement = document.createElement('h3');
  titleElement.textContent = title;
  titleElement.style.margin = '0 0 15px 0';
  titleElement.style.color = '#333';
  titleElement.style.fontSize = '18px';
  titleElement.style.fontWeight = '600';

  const messageElement = document.createElement('p');
  messageElement.innerHTML = message; // 支持HTML渲染
  messageElement.style.margin = '0 0 20px 0';
  messageElement.style.color = '#666';
  messageElement.style.fontSize = '14px';
  messageElement.style.lineHeight = '1.5';

  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.gap = '10px';
  buttonContainer.style.justifyContent = 'center';

  const cancelButton = document.createElement('button');
  cancelButton.textContent = '取消';
  cancelButton.style.background = '#6c757d';
  cancelButton.style.color = 'white';
  cancelButton.style.border = 'none';
  cancelButton.style.padding = '8px 16px';
  cancelButton.style.borderRadius = '4px';
  cancelButton.style.cursor = 'pointer';
  cancelButton.style.fontSize = '14px';
  cancelButton.style.flex = '1';
  cancelButton.style.maxWidth = '80px';

  const confirmButton = document.createElement('button');
  confirmButton.textContent = '确定';
  confirmButton.style.background = '#dc3545';
  confirmButton.style.color = 'white';
  confirmButton.style.border = 'none';
  confirmButton.style.padding = '8px 16px';
  confirmButton.style.borderRadius = '4px';
  confirmButton.style.cursor = 'pointer';
  confirmButton.style.fontSize = '14px';
  confirmButton.style.flex = '1';
  confirmButton.style.maxWidth = '80px';

  let resolveFunction: ((confirmed: boolean) => void) | null = null;

  const resolve = (confirmed: boolean) => {
    closeAlert();
    if (resolveFunction) {
      resolveFunction(confirmed);
    }
  };

  const setResolve = (resolve: (confirmed: boolean) => void) => {
    resolveFunction = resolve;
  };

  cancelButton.addEventListener('click', () => resolve(false));
  confirmButton.addEventListener('click', () => resolve(true));

  buttonContainer.appendChild(cancelButton);
  buttonContainer.appendChild(confirmButton);

  alertDiv.appendChild(titleElement);
  alertDiv.appendChild(messageElement);
  alertDiv.appendChild(buttonContainer);

  return { alertDiv, setResolve };
}

// 创建输入弹窗元素
function createInputAlertElement(
  message: string, 
  title: string = '输入', 
  defaultValue: string = '',
  placeholder: string = ''
): { alertDiv: HTMLDivElement; inputElement: HTMLInputElement; setResolve: (resolve: (value: string | null) => void) => void } {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'custom-alert';
  alertDiv.style.position = 'fixed';
  alertDiv.style.top = '50%';
  alertDiv.style.left = '50%';
  alertDiv.style.transform = 'translate(-50%, -50%)';
  alertDiv.style.background = 'white';
  alertDiv.style.padding = '20px';
  alertDiv.style.border = '1px solid #ccc';
  alertDiv.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
  alertDiv.style.zIndex = '10000';
  alertDiv.style.borderRadius = '8px';
  alertDiv.style.textAlign = 'center';
  alertDiv.style.minWidth = '350px';
  alertDiv.style.maxWidth = '500px';

  const titleElement = document.createElement('h3');
  titleElement.textContent = title;
  titleElement.style.margin = '0 0 15px 0';
  titleElement.style.color = '#333';
  titleElement.style.fontSize = '18px';
  titleElement.style.fontWeight = '600';

  const messageElement = document.createElement('p');
  messageElement.textContent = message;
  messageElement.style.margin = '0 0 15px 0';
  messageElement.style.color = '#666';
  messageElement.style.fontSize = '14px';
  messageElement.style.lineHeight = '1.5';

  const inputElement = document.createElement('input');
  inputElement.type = 'text';
  inputElement.value = defaultValue;
  inputElement.placeholder = placeholder;
  inputElement.style.width = '100%';
  inputElement.style.padding = '8px 12px';
  inputElement.style.border = '1px solid #ddd';
  inputElement.style.borderRadius = '4px';
  inputElement.style.fontSize = '14px';
  inputElement.style.marginBottom = '15px';
  inputElement.style.boxSizing = 'border-box';

  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.gap = '10px';
  buttonContainer.style.justifyContent = 'center';

  const cancelButton = document.createElement('button');
  cancelButton.textContent = '取消';
  cancelButton.style.background = '#6c757d';
  cancelButton.style.color = 'white';
  cancelButton.style.border = 'none';
  cancelButton.style.padding = '8px 16px';
  cancelButton.style.borderRadius = '4px';
  cancelButton.style.cursor = 'pointer';
  cancelButton.style.fontSize = '14px';
  cancelButton.style.flex = '1';
  cancelButton.style.maxWidth = '80px';

  const confirmButton = document.createElement('button');
  confirmButton.textContent = '确定';
  confirmButton.style.background = '#007bff';
  confirmButton.style.color = 'white';
  confirmButton.style.border = 'none';
  confirmButton.style.padding = '8px 16px';
  confirmButton.style.borderRadius = '4px';
  confirmButton.style.cursor = 'pointer';
  confirmButton.style.fontSize = '14px';
  confirmButton.style.flex = '1';
  confirmButton.style.maxWidth = '80px';

  let resolveFunction: ((value: string | null) => void) | null = null;

  const resolve = (value: string | null) => {
    closeAlert();
    if (resolveFunction) {
      resolveFunction(value);
    }
  };

  const setResolve = (resolve: (value: string | null) => void) => {
    resolveFunction = resolve;
  };

  cancelButton.addEventListener('click', () => resolve(null));
  confirmButton.addEventListener('click', () => resolve(inputElement.value));
  
  // 支持回车确认
  inputElement.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      resolve(inputElement.value);
    }
  });

  // 支持ESC取消
  inputElement.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      resolve(null);
    }
  });

  buttonContainer.appendChild(cancelButton);
  buttonContainer.appendChild(confirmButton);

  alertDiv.appendChild(titleElement);
  alertDiv.appendChild(messageElement);
  alertDiv.appendChild(inputElement);
  alertDiv.appendChild(buttonContainer);

  return { alertDiv, inputElement, setResolve };
}

// 显示自定义alert
export function customAlert(message: string, title: string = '提示'): Promise<void> {
  return new Promise((resolve) => {
    const container = createAlertContainer();
    
    // 如果已有alert，先关闭
    if (currentAlert) {
      closeAlert();
    }

    const alertElement = createAlertElement(message, title);
    
    // 创建背景遮罩
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.width = '100%';
    backdrop.style.height = '100%';
    backdrop.style.background = 'rgba(0,0,0,0.5)';
    backdrop.style.zIndex = '9999';

    // 点击背景遮罩关闭弹窗
    backdrop.addEventListener('click', () => {
      closeAlert();
    });

    // 先添加背景遮罩，再添加弹窗内容
    container.appendChild(backdrop);
    container.appendChild(alertElement);
    container.style.display = 'block';

    currentAlert = alertElement;

    // 存储resolve函数，以便在关闭时调用
    (alertElement as any).resolve = resolve;
  });
}

// 显示自定义输入弹窗
export function customPrompt(
  message: string, 
  title: string = '输入', 
  defaultValue: string = '', 
  placeholder: string = ''
): Promise<string | null> {
  return new Promise((resolve) => {
    const container = createAlertContainer();
    
    // 如果已有alert，先关闭
    if (currentAlert) {
      closeAlert();
    }

    const { alertDiv, inputElement, setResolve } = createInputAlertElement(message, title, defaultValue, placeholder);
    
    // 创建背景遮罩
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.width = '100%';
    backdrop.style.height = '100%';
    backdrop.style.background = 'rgba(0,0,0,0.5)';
    backdrop.style.zIndex = '9999';

    // 点击背景遮罩关闭弹窗
    backdrop.addEventListener('click', () => {
      closeAlert();
      resolve(null);
    });

    // 先添加背景遮罩，再添加弹窗内容
    container.appendChild(backdrop);
    container.appendChild(alertDiv);
    container.style.display = 'block';

    currentAlert = alertDiv;

    // 设置resolve函数
    setResolve(resolve);

    // 自动聚焦到输入框
    setTimeout(() => {
      inputElement.focus();
      inputElement.select();
    }, 100);
  });
}

// 显示自定义确认弹窗
export function customConfirm(message: string, title: string = '确认'): Promise<boolean> {
  return new Promise((resolve) => {
    const container = createAlertContainer();
    
    // 如果已有alert，先关闭
    if (currentAlert) {
      closeAlert();
    }

    const { alertDiv, setResolve } = createConfirmAlertElement(message, title);
    
    // 创建背景遮罩
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.width = '100%';
    backdrop.style.height = '100%';
    backdrop.style.background = 'rgba(0,0,0,0.5)';
    backdrop.style.zIndex = '9999';

    // 点击背景遮罩关闭弹窗
    backdrop.addEventListener('click', () => {
      closeAlert();
      resolve(false);
    });

    // 先添加背景遮罩，再添加弹窗内容
    container.appendChild(backdrop);
    container.appendChild(alertDiv);
    container.style.display = 'block';

    currentAlert = alertDiv;

    // 设置resolve函数
    setResolve(resolve);
  });
}

// 关闭alert
function closeAlert(): void {
  if (alertContainer && currentAlert) {
    const resolve = (currentAlert as any).resolve;
    alertContainer.innerHTML = '';
    alertContainer.style.display = 'none';
    currentAlert = null;
    if (resolve) {
      resolve();
    }
  }
}

// 重写全局alert函数（可选）
// export function overrideGlobalAlert(): void {
//   if (typeof window !== 'undefined') {
//     const originalAlert = window.alert;
//     window.alert = function(message: string) {
//       return customAlert(message);
//     };
//   }
// } 