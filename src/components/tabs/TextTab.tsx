import React from 'react';
import type { Device, PreviewConfig } from '../../types';

export type ToastType = 'success' | 'error' | 'info';

export interface TextTabProps {
  previewConfig: PreviewConfig;
  setPreviewConfig: (cfg: PreviewConfig) => void;
  isTextFormValid: boolean;
  getCurrentDevice: () => Device | undefined;
  showToast: (message: string, type?: ToastType) => void;
  clearToastsByKeyword: (kw: string) => void;
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

const TextTab: React.FC<TextTabProps> = ({
  previewConfig,
  setPreviewConfig,
  isTextFormValid,
  getCurrentDevice,
  showToast,
  clearToastsByKeyword,
  invoke,
}) => {
  return (
    <div className="text-page">
      <h2>通过文本API更新你的dot.</h2>
      {/* 预览框 */}
      <div className="preview-container">
        <div 
          className={`preview-box ${previewConfig.link ? 'preview-box-clickable' : ''}`}
          onClick={() => {
            if (previewConfig.link) {
              window.open(previewConfig.link, '_blank');
            }
          }}
          style={{ cursor: previewConfig.link ? 'pointer' : 'default' }}
        >
          <div className="preview-header">
            <div className="preview-title">{previewConfig.title}</div>
          </div>
          <div className="preview-content">
            <div className="preview-message">{previewConfig.message}</div>
          </div>
          <div className="preview-footer">
            <div className="preview-icon">
              {previewConfig.icon ? (
                <img 
                  src={previewConfig.icon.startsWith('data:') ? previewConfig.icon : `data:image/png;base64,${previewConfig.icon}`} 
                  alt="icon" 
                  className="icon-img" 
                />
              ) : (
                <div className="icon-placeholder">🏷️</div>
              )}
            </div>
            <div className="preview-signature">{previewConfig.signature}</div>
          </div>
          {previewConfig.link && (
            <div className="preview-link-indicator">
              <span className="link-icon">🔗</span>
            </div>
          )}
        </div>
      </div>

      {/* 配置区域 */}
      <div className="config-section">
        <h3>配置预览内容</h3>
        <div className="config-grid">
          <div className="config-item">
            <label>Title:</label>
            <input
              type="text"
              value={previewConfig.title}
              onChange={(e) => setPreviewConfig({ ...previewConfig, title: e.target.value })}
              placeholder="输入标题"
            />
          </div>
          <div className="config-item">
            <label>Message:</label>
            <input
              type="text"
              value={previewConfig.message}
              onChange={(e) => setPreviewConfig({ ...previewConfig, message: e.target.value })}
              placeholder="输入消息内容"
            />
          </div>
          <div className="config-item">
            <label>Signature:</label>
            <input
              type="text"
              value={previewConfig.signature}
              onChange={(e) => setPreviewConfig({ ...previewConfig, signature: e.target.value })}
              placeholder="输入签名"
            />
          </div>
          <div className="config-item">
            <label>Icon (Base64):</label>
            <input
              type="text"
              value={previewConfig.icon}
              onChange={(e) => setPreviewConfig({ ...previewConfig, icon: e.target.value })}
              placeholder="输入base64图片数据或留空使用默认图标"
            />
          </div>
          <div className="config-item">
            <label>Link:</label>
            <input
              type="url"
              value={previewConfig.link}
              onChange={(e) => setPreviewConfig({ ...previewConfig, link: e.target.value })}
              placeholder="输入跳转链接（可选）"
            />
          </div>
        </div>
      </div>

      {/* 发送按钮 */}
      <div className="action-buttons-container">
        <button 
          className="action-button send-button"
          disabled={!isTextFormValid}
          onClick={async () => {
            const currentDevice = getCurrentDevice();
            if (!currentDevice || !currentDevice.apiKey || !currentDevice.serialNumber) {
              showToast('请先配置API密钥和设备ID', 'error');
              return;
            }
            try {
              showToast('正在发送...', 'info');
              await invoke('send_text_to_api', {
                apiKey: currentDevice.apiKey,
                deviceId: currentDevice.serialNumber,
                title: previewConfig.title,
                message: previewConfig.message,
                signature: previewConfig.signature,
                icon: previewConfig.icon.trim() || null,
                link: previewConfig.link.trim() || null,
              });
              clearToastsByKeyword('正在发送');
              setTimeout(() => showToast('文本发送成功！', 'success'), 50);
            } catch (error) {
              clearToastsByKeyword('正在发送');
              setTimeout(() => showToast(`发送失败：${error}`, 'error'), 50);
            }
          }}
        >
          发送
        </button>
      </div>
    </div>
  );
};

export default TextTab;
