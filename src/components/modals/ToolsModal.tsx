import React from 'react';

interface ToolsModalProps {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onClose: () => void;
}

const ToolsModal: React.FC<ToolsModalProps> = ({ showToast, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content tools-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>工具箱</h3>
        </div>
        <div className="modal-body">
          <div className="tool-section">
            <h4>文件转Base64</h4>
            <div className="base64-converter">
              <div className="converter-input">
                <input
                  type="file"
                  id="base64-file-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const result = event.target?.result as string;
                        const textarea = document.getElementById('base64-output') as HTMLTextAreaElement;
                        if (textarea) {
                          const base64Data = result.includes(',') ? result.split(',')[1] : result;
                          textarea.value = base64Data;
                        }
                        showToast('文件转换完成！', 'success');
                      };
                      reader.onerror = () => {
                        showToast('文件读取失败', 'error');
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  accept="*/*"
                  style={{ display: 'none' }}
                />
                <button 
                  className="select-file-button"
                  onClick={() => {
                    const input = document.getElementById('base64-file-input') as HTMLInputElement;
                    input?.click();
                  }}
                >
                  选择文件
                </button>
              </div>
              <div className="converter-output">
                <label>Base64输出:</label>
                <textarea
                  id="base64-output"
                  className="base64-output-textarea"
                  rows={6}
                  placeholder="转换后的Base64数据将显示在这里..."
                  readOnly
                />
                <div className="output-actions">
                  <button 
                    className="copy-button"
                    onClick={() => {
                      const textarea = document.getElementById('base64-output') as HTMLTextAreaElement;
                      if (textarea && textarea.value) {
                        navigator.clipboard.writeText(textarea.value).then(() => {
                          showToast('已复制到剪贴板！', 'success');
                        }).catch(() => {
                          showToast('复制失败', 'error');
                        });
                      } else {
                        showToast('没有内容可复制', 'error');
                      }
                    }}
                  >
                    复制
                  </button>
                  <button 
                    className="clear-button"
                    onClick={() => {
                      const textarea = document.getElementById('base64-output') as HTMLTextAreaElement;
                      if (textarea) {
                        textarea.value = '';
                      }
                    }}
                  >
                    清空
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-close" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default ToolsModal;
