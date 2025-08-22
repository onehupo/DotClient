import React from 'react';
import type { Device, TextToImageConfig, TextItemConfig } from '../../types';
export type ToastType = 'success' | 'error' | 'info';

export interface TextToImageTabProps {
  textToImageConfig: TextToImageConfig;
  setTextToImageConfig: (cfg: TextToImageConfig) => void;
  textToImagePreview: string;
  updateTextToImagePreview: () => void;
  addText: () => void;
  removeText: (id: string) => void;
  updateText: (id: string, updates: Partial<TextItemConfig>) => void;
  handleBackgroundImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearBackgroundImage: () => void;
  clearTextToImageConfig: () => void;
  exportTextToImageConfig: () => Promise<void>;
  importTextToImageConfig: () => void;
  availableFonts: string[];
  truncateFontName: (name: string, maxLength?: number) => string;
  getCurrentDevice: () => Device | undefined;
  showToast: (message: string, type?: ToastType) => void;
  clearToastsByKeyword: (kw: string) => void;
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

const TextToImageTab: React.FC<TextToImageTabProps> = ({
  textToImageConfig,
  setTextToImageConfig,
  textToImagePreview,
  addText,
  removeText,
  updateText,
  handleBackgroundImageUpload,
  clearBackgroundImage,
  clearTextToImageConfig,
  exportTextToImageConfig,
  importTextToImageConfig,
  availableFonts,
  truncateFontName,
  getCurrentDevice,
  showToast,
  clearToastsByKeyword,
  invoke,
}) => {
  return (
    <div className="text-to-image-page">
      <h2>通过图片API更新你的dot.</h2>
      <div className="image-preview-container">
        <div 
          className={`image-preview-box ${textToImageConfig.link ? 'preview-box-clickable' : ''}`}
          onClick={() => {
            if (textToImageConfig.link) {
              window.open(textToImageConfig.link, '_blank');
            }
          }}
          style={{ cursor: textToImageConfig.link ? 'pointer' : 'default' }}
        >
          {textToImagePreview ? (
            <img src={textToImagePreview} alt="制图预览" className="preview-image" />
          ) : (
            <div className="image-placeholder">
              <span className="placeholder-icon">📝</span>
              <p>制图预览</p>
            </div>
          )}
          {textToImageConfig.link && (
            <div className="preview-link-indicator">
              <span className="link-icon">🔗</span>
            </div>
          )}
        </div>
      </div>

      <div className="config-section">
        <h3>配置预览内容</h3>
        <div className="text-to-image-config-layout">
          <div className="config-basic">
            <div className="config-item">
              <label>背景颜色:</label>
              <div className="background-color-options">
                <button 
                  className={`color-button ${textToImageConfig.backgroundColor === 'white' ? 'selected' : ''}`}
                  onClick={() => setTextToImageConfig({ ...textToImageConfig, backgroundColor: 'white' })}
                  style={{ backgroundColor: 'white', color: 'black' }}
                >
                  白色
                </button>
                <button 
                  className={`color-button ${textToImageConfig.backgroundColor === 'black' ? 'selected' : ''}`}
                  onClick={() => setTextToImageConfig({ ...textToImageConfig, backgroundColor: 'black' })}
                  style={{ backgroundColor: 'black', color: 'white' }}
                >
                  黑色
                </button>
                <button 
                  className={`color-button ${textToImageConfig.backgroundColor === 'gray' ? 'selected' : ''}`}
                  onClick={() => setTextToImageConfig({ ...textToImageConfig, backgroundColor: 'gray' })}
                  style={{ backgroundColor: 'gray', color: 'white' }}
                >
                  灰色
                </button>
              </div>
            </div>

            <div className="config-item background-image-section">
              <label>背景图片:</label>
              <div className="background-image-upload">
                <div className="background-image-input">
                  <label className="background-file-input">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBackgroundImageUpload}
                      title="选择背景图片"
                    />
                    选择背景图片
                  </label>
                  {textToImageConfig.backgroundImage && (
                    <button 
                      className="clear-background-button"
                      onClick={clearBackgroundImage}
                      title="清除背景图片"
                    >
                      清除
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="config-item">
              <label>Link:</label>
              <input
                type="url"
                value={textToImageConfig.link}
                onChange={(e) => setTextToImageConfig({ ...textToImageConfig, link: e.target.value })}
                placeholder="输入跳转链接（可选）"
              />
            </div>
          </div>

          <div className="text-config-section">
            <div className="text-config-header">
              <div className="text-config-title">
                <h4>文本配置</h4>
                <div className="cache-indicator-dynamic">
                  <span className="cache-icon">💾</span>
                  <span className="cache-text">自动保存</span>
                </div>
              </div>
              <button className="add-text-button" onClick={addText}>+ 添加文本</button>
            </div>

            <div className={`text-items-container ${textToImageConfig.texts.length > 0 ? 'has-text-items' : ''}`}>
              {textToImageConfig.texts.length === 0 ? (
                <div className="no-text-placeholder"><p>暂无文本，点击"添加文本"开始创建</p></div>
              ) : (
                textToImageConfig.texts.map((text, index) => (
                  <div key={text.id} className="text-item">
                    <div className="text-item-header">
                      <span className="text-item-title">文本 {index + 1}</span>
                      <button className="remove-text-button" onClick={() => removeText(text.id)}>删除</button>
                    </div>
                    <div className="text-item-config">
                      <div className="config-row">
                        <div className="config-item text-input">
                          <label>内容:</label>
                          <input
                            type="text"
                            value={text.content}
                            onChange={(e) => updateText(text.id, { content: e.target.value })}
                            placeholder="输入文本内容"
                          />
                        </div>
                      </div>
                      <div className="config-row">
                        <div className="config-item number-input">
                          <label>X位置:</label>
                          <input
                            type="number"
                            value={text.x}
                            onChange={(e) => updateText(text.id, { x: parseInt(e.target.value) || 0 })}
                            min={0}
                            max={296}
                          />
                        </div>
                        <div className="config-item number-input">
                          <label>Y位置:</label>
                          <input
                            type="number"
                            value={text.y}
                            onChange={(e) => updateText(text.id, { y: parseInt(e.target.value) || 0 })}
                            min={0}
                            max={152}
                          />
                        </div>
                        <div className="config-item number-input">
                          <label>字体大小:</label>
                          <input
                            type="number"
                            value={text.fontSize}
                            onChange={(e) => updateText(text.id, { fontSize: parseInt(e.target.value) || 12 })}
                            min={8}
                            max={144}
                          />
                        </div>
                        <div className="config-item number-input">
                          <label>旋转角度:</label>
                          <input
                            type="number"
                            value={text.rotation}
                            onChange={(e) => updateText(text.id, { rotation: parseInt(e.target.value) || 0 })}
                            min={-360}
                            max={360}
                          />
                        </div>
                        <div className="config-item select-input">
                          <label>粗细:</label>
                          <select
                            value={text.fontWeight}
                            onChange={(e) => updateText(text.id, { fontWeight: e.target.value as 'normal' | 'bold' })}
                          >
                            <option value="normal">常规</option>
                            <option value="bold">粗体</option>
                          </select>
                        </div>
                        <div className="config-item select-input">
                          <label>对齐:</label>
                          <select
                            value={text.textAlign}
                            onChange={(e) => updateText(text.id, { textAlign: e.target.value as 'left' | 'center' | 'right' })}
                          >
                            <option value="left">左对齐</option>
                            <option value="center">居中</option>
                            <option value="right">右对齐</option>
                          </select>
                        </div>
                        <div className="config-item select-input">
                          <label>颜色:</label>
                          <select
                            value={text.color}
                            onChange={(e) => updateText(text.id, { color: e.target.value as 'white' | 'black' | 'gray' })}
                          >
                            <option value="black">黑色</option>
                            <option value="white">白色</option>
                            <option value="gray">灰色</option>
                          </select>
                        </div>
                        <div className="config-item select-input font-select">
                          <label>字体:</label>
                          <select
                            value={text.fontFamily}
                            onChange={(e) => updateText(text.id, { fontFamily: e.target.value })}
                            className="font-family-select"
                            title={text.fontFamily}
                            disabled={availableFonts.length === 0}
                          >
                            {availableFonts.length === 0 ? (
                              <option value="">加载字体中...</option>
                            ) : (
                              availableFonts.map((font) => (
                                <option key={font} value={font} style={{ fontFamily: font }} title={font}>
                                  {truncateFontName(font, 25)}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="action-buttons-container">
        <div className="action-buttons-row">
          <button className="action-button config-button" onClick={clearTextToImageConfig} title="清空所有配置">清空配置</button>
          <button className="action-button config-button" onClick={exportTextToImageConfig} title="导出当前配置到文件">导出配置</button>
          <button className="action-button config-button" onClick={importTextToImageConfig} title="从文件导入配置">导入配置</button>
          <button 
            className="action-button export-button"
            onClick={async () => {
              if (!textToImagePreview || textToImageConfig.texts.length === 0) {
                showToast('请先配置文本内容', 'error');
                return;
              }
              try {
                showToast('正在导出图片...', 'info');
                // 与发送逻辑保持一致：先让后端进行无头渲染（包含宏替换），再进行保存
                const dataUrl = await invoke<string>('render_t2i_via_headless_canvas_api', {
                  backgroundColor: textToImageConfig.backgroundColor,
                  backgroundImage: textToImageConfig.backgroundImage || null,
                  texts: textToImageConfig.texts.map(t => ({
                    id: t.id,
                    content: t.content,
                    x: t.x,
                    y: t.y,
                    font_size: t.fontSize,
                    rotation: t.rotation,
                    font_weight: t.fontWeight,
                    text_align: t.textAlign,
                    color: t.color,
                    font_family: t.fontFamily,
                  })),
                });
                const now = new Date();
                const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
                const filename = `text-to-image-296x152-${dateStr}_${timeStr}.png`;
                await invoke('save_image_to_downloads', { imageData: dataUrl, filename });
                clearToastsByKeyword('正在导出图片');
                setTimeout(() => showToast(`导出成功！已保存为 ${filename}`, 'success'), 50);
              } catch (error) {
                clearToastsByKeyword('正在导出图片');
                setTimeout(() => showToast(`导出失败：${error}`, 'error'), 50);
              }
            }}
            disabled={!textToImagePreview || textToImageConfig.texts.length === 0}
          >
            导出图片
          </button>
          <button 
            className="action-button send-button"
            onClick={async () => {
              if (!textToImagePreview || textToImageConfig.texts.length === 0) {
                showToast('请先配置文本内容', 'error');
                return;
              }
              const currentDevice = getCurrentDevice();
              if (!currentDevice || !currentDevice.apiKey || !currentDevice.serialNumber) {
                showToast('请先配置API密钥和设备ID', 'error');
                return;
              }
              try {
                showToast('正在发送制图...', 'info');
                // 先由后端进行无头渲染（包含文本宏替换），保证与自动化路径一致
                const dataUrl = await invoke<string>('render_t2i_via_headless_canvas_api', {
                  backgroundColor: textToImageConfig.backgroundColor,
                  backgroundImage: textToImageConfig.backgroundImage || null,
                  texts: textToImageConfig.texts.map(t => ({
                    id: t.id,
                    content: t.content,
                    x: t.x,
                    y: t.y,
                    font_size: t.fontSize,
                    rotation: t.rotation,
                    font_weight: t.fontWeight,
                    text_align: t.textAlign,
                    color: t.color,
                    font_family: t.fontFamily,
                  })),
                });
                // 然后发送图片（link 在后端会再做宏替换）
                await invoke('send_image_to_api', {
                  apiKey: currentDevice.apiKey,
                  deviceId: currentDevice.serialNumber,
                  imageData: dataUrl,
                  link: (textToImageConfig.link || '').trim() || null,
                });
                clearToastsByKeyword('正在发送制图');
                setTimeout(() => showToast('制图发送成功！(296×152)', 'success'), 50);
              } catch (error) {
                clearToastsByKeyword('正在发送制图');
                setTimeout(() => showToast(`发送失败：${error}`, 'error'), 50);
              }
            }}
            disabled={!textToImagePreview || textToImageConfig.texts.length === 0}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
};

export default TextToImageTab;
