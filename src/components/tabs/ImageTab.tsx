import React from 'react';
import type { Device, ImageConfig } from '../../types';

export type ToastType = 'success' | 'error' | 'info';

export interface ImageTabProps {
  imagePreview: string;
  processedImagePreview: string;
  setImagePreview: (v: string) => void;
  setProcessedImagePreview: (v: string) => void;
  imageConfig: ImageConfig;
  setImageConfig: (cfg: ImageConfig) => void;
  base64Input: string;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleBase64Input: (value: string) => void;
  selectedAlgorithm: string;
  handleAlgorithmChange: (algorithm: string) => void;
  resizeImageTo296x152: (imageDataUrl: string) => Promise<string>;
  getCurrentDevice: () => Device | undefined;
  showToast: (message: string, type?: ToastType) => void;
  clearToastsByKeyword: (kw: string) => void;
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

const ImageTab: React.FC<ImageTabProps> = ({
  imagePreview,
  processedImagePreview,
  setImagePreview,
  setProcessedImagePreview,
  imageConfig,
  setImageConfig,
  base64Input,
  handleFileSelect,
  handleBase64Input,
  selectedAlgorithm,
  handleAlgorithmChange,
  resizeImageTo296x152,
  getCurrentDevice,
  showToast,
  clearToastsByKeyword,
  invoke,
}) => {
  return (
    <div className="image-page">
      <h2>通过图片API更新你的dot.</h2>
      <div className="image-preview-container">
        <div 
          className={`image-preview-box ${imageConfig.link ? 'preview-box-clickable' : ''}`}
          onClick={() => {
            if (imageConfig.link) {
              window.open(imageConfig.link, '_blank');
            }
          }}
          style={{ cursor: imageConfig.link ? 'pointer' : 'default' }}
        >
          {imagePreview ? (
            <img 
              src={processedImagePreview || imagePreview} 
              alt={processedImagePreview ? '处理后图片' : '原始图片'} 
              className="preview-image"
              onError={() => {
                setImagePreview('');
                setProcessedImagePreview('');
              }}
            />
          ) : (
            <div className="image-placeholder">
              <span className="placeholder-icon">🌄</span>
              <p>暂无图片</p>
            </div>
          )}
          {imageConfig.link && (
            <div className="preview-link-indicator">
              <span className="link-icon">🔗</span>
            </div>
          )}
        </div>
      </div>

      <div className="config-section">
        <h3>配置预览内容</h3>
        <div className="image-config-layout">
          <div className="config-left">
            <div className="config-item">
              <label>选择文件:</label>
              <div className="file-input">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  title="点击选择文件"
                />
                <div className="file-input-content">
                  <span className="file-input-icon">📁</span>
                  <span className="file-input-text">点击选择图片文件</span>
                  <span className="file-input-hint">支持 JPG、PNG 等格式</span>
                </div>
              </div>
            </div>
            <div className="config-item">
              <label>或输入Base64:</label>
              <textarea
                value={base64Input}
                onChange={(e) => handleBase64Input(e.target.value)}
                placeholder="输入base64图片数据（可包含或不包含data:image前缀）"
                className="base64-input"
                rows={2}
              />
            </div>
            <div className="config-item">
              <label>Link:</label>
              <input
                type="url"
                value={imageConfig.link}
                onChange={(e) => setImageConfig({ ...imageConfig, link: e.target.value })}
                placeholder="输入跳转链接（可选）"
              />
            </div>
          </div>

          <div className="config-right">
            <div className="config-item">
              <label>处理算法:</label>
              <div className="algorithm-options-vertical">
                <button 
                  className={`algorithm-button-vertical ${selectedAlgorithm === 'original' ? 'selected' : ''}`}
                  onClick={() => handleAlgorithmChange('original')}
                >
                  <span className="algorithm-icon">🖼️</span>
                  <span className="algorithm-text">原始图片</span>
                </button>
                <button 
                  className={`algorithm-button-vertical ${selectedAlgorithm === 'ordered' ? 'selected' : ''}`}
                  onClick={() => handleAlgorithmChange('ordered')}
                >
                  <span className="algorithm-icon">🔢</span>
                  <span className="algorithm-text">有序算法</span>
                </button>
                <button 
                  className={`algorithm-button-vertical ${selectedAlgorithm === 'floyd_steinberg' ? 'selected' : ''}`}
                  onClick={() => handleAlgorithmChange('floyd_steinberg')}
                >
                  <span className="algorithm-icon">🌊</span>
                  <span className="algorithm-text">误差扩散</span>
                </button>
                <button 
                  className={`algorithm-button-vertical ${selectedAlgorithm === 'random' ? 'selected' : ''}`}
                  onClick={() => handleAlgorithmChange('random')}
                >
                  <span className="algorithm-icon">🎲</span>
                  <span className="algorithm-text">随机算法</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="action-buttons-container">
        <button 
          className="action-button export-button"
          onClick={async () => {
            if (!imagePreview) {
              showToast('请先选择或输入图片', 'error');
              return;
            }
            try {
              showToast('正在导出图片...', 'info');
              let exportImageData: string;
              if (selectedAlgorithm === 'original') {
                exportImageData = await resizeImageTo296x152(imagePreview);
              } else {
                const processedData = await invoke<string>('process_image_with_algorithm', {
                  imageData: imagePreview,
                  algorithm: selectedAlgorithm,
                });
                exportImageData = await resizeImageTo296x152(processedData);
              }
              const now = new Date();
              const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
              const filename = `exported-image-${selectedAlgorithm}-296x152-${dateStr}_${timeStr}.png`;
              await invoke('save_image_to_downloads', { imageData: exportImageData, filename });
              clearToastsByKeyword('正在导出图片');
              setTimeout(() => showToast(`导出成功！已保存为 ${filename}`, 'success'), 50);
            } catch (error) {
              clearToastsByKeyword('正在导出图片');
              setTimeout(() => showToast(`导出失败：${error}`, 'error'), 50);
            }
          }}
          disabled={!imagePreview}
        >
          导出
        </button>
        <button 
          className="action-button send-button"
          onClick={async () => {
            if (!imagePreview) {
              showToast('请先选择或输入图片', 'error');
              return;
            }
            const currentDevice = getCurrentDevice();
            if (!currentDevice || !currentDevice.apiKey || !currentDevice.serialNumber) {
              showToast('请先配置API密钥和设备ID', 'error');
              return;
            }
            try {
              if (selectedAlgorithm === 'original') {
                showToast('正在发送原始图片...', 'info');
                const resizedImageData = await resizeImageTo296x152(imagePreview);
                await invoke('send_image_to_api', {
                  apiKey: currentDevice.apiKey,
                  deviceId: currentDevice.serialNumber,
                  imageData: resizedImageData,
                  link: imageConfig.link.trim() || null,
                });
                clearToastsByKeyword('正在发送');
                setTimeout(() => showToast('原始图片发送成功！(296×152)', 'success'), 50);
              } else {
                showToast('正在处理并发送图片...', 'info');
                const processedImageData = await invoke<string>('process_image_with_algorithm', {
                  imageData: imagePreview,
                  algorithm: selectedAlgorithm,
                });
                const resizedImageData = await resizeImageTo296x152(processedImageData);
                await invoke('send_image_to_api', {
                  apiKey: currentDevice.apiKey,
                  deviceId: currentDevice.serialNumber,
                  imageData: resizedImageData,
                  link: imageConfig.link.trim() || null,
                });
                clearToastsByKeyword('正在处理并发送');
                setTimeout(() => showToast('图片发送成功！(296×152)', 'success'), 50);
              }
            } catch (error) {
              clearToastsByKeyword('正在发送');
              clearToastsByKeyword('正在处理并发送');
              setTimeout(() => showToast(`发送失败：${error}`, 'error'), 50);
            }
          }}
          disabled={!imagePreview}
        >
          发送
        </button>
      </div>
    </div>
  );
};

export default ImageTab;
