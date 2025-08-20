import React from 'react';

interface TemplatesModalProps {
  generateTemplate: (w: number, h: number, color: 'black' | 'white') => string;
  exportTemplate: (w: number, h: number, color: 'black' | 'white') => Promise<void>;
  onClose: () => void;
}

const TemplatesModal: React.FC<TemplatesModalProps> = ({ generateTemplate, exportTemplate, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content templates-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>图片模版</h3>
        </div>
        <div className="modal-body">
          <div className="template-section">
            <h4>40×40 模版</h4>
            <div className="template-grid">
              <div className="template-item">
                <div className="template-preview template-40x40-black">
                  <img src={generateTemplate(40, 40, 'black')} alt="40x40 黑色模版" className="template-image" />
                </div>
                <div className="template-info">
                  <span className="template-label">40×40 黑色</span>
                  <button className="template-export-btn" onClick={() => exportTemplate(40, 40, 'black')}>导出</button>
                </div>
              </div>
              <div className="template-item">
                <div className="template-preview template-40x40-white">
                  <img src={generateTemplate(40, 40, 'white')} alt="40x40 白色模版" className="template-image" />
                </div>
                <div className="template-info">
                  <span className="template-label">40×40 白色</span>
                  <button className="template-export-btn" onClick={() => exportTemplate(40, 40, 'white')}>导出</button>
                </div>
              </div>
            </div>
          </div>
          <div className="template-section">
            <h4>296×152 模版</h4>
            <div className="template-grid">
              <div className="template-item">
                <div className="template-preview template-296x152-black">
                  <img src={generateTemplate(296, 152, 'black')} alt="296x152 黑色模版" className="template-image" />
                </div>
                <div className="template-info">
                  <span className="template-label">296×152 黑色</span>
                  <button className="template-export-btn" onClick={() => exportTemplate(296, 152, 'black')}>导出</button>
                </div>
              </div>
              <div className="template-item">
                <div className="template-preview template-296x152-white">
                  <img src={generateTemplate(296, 152, 'white')} alt="296x152 白色模版" className="template-image" />
                </div>
                <div className="template-info">
                  <span className="template-label">296×152 白色</span>
                  <button className="template-export-btn" onClick={() => exportTemplate(296, 152, 'white')}>导出</button>
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

export default TemplatesModal;
