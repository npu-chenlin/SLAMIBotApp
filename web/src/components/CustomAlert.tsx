import React from 'react';
import './CustomAlert.css';

interface CustomAlertProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
  showOkButton?: boolean;
  okButtonText?: string;
}

const CustomAlert: React.FC<CustomAlertProps> = ({
  isOpen,
  title = '提示',
  message,
  onClose,
  showOkButton = true,
  okButtonText = '确定'
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div className="modal-backdrop" onClick={onClose}></div>
      
      {/* 弹窗内容 */}
      <div className="custom-alert">
        <h3>{title}</h3>
        <p dangerouslySetInnerHTML={{ __html: message }}></p>
        {showOkButton && (
          <button className="btn-ok" onClick={onClose}>
            {okButtonText}
          </button>
        )}
      </div>
    </>
  );
};

export default CustomAlert; 