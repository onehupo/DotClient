import React from 'react';
import type { ExampleIcon } from '../../types';

interface ExampleIconsModalProps {
  icons: ExampleIcon[];
  onCopy: (icon: ExampleIcon) => void;
  onClose: () => void;
}

const ExampleIconsModal: React.FC<ExampleIconsModalProps> = ({ icons, onCopy, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content example-icons-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>示例图标</h3>
          <p className="modal-description">点击图标复制其Base64数据，用于文本消息的图标字段</p>
        </div>
        <div className="modal-body">
          <div className="example-icons-grid">
            {icons.map((icon) => (
              <div 
                key={icon.id} 
                className="example-icon-item"
                onClick={() => onCopy(icon)}
              >
                <div className="example-icon-preview">
                  <img 
                    src={icon.path} 
                    alt={icon.name}
                    className="example-icon-image"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNiAxNkwyNCAyNEwzMiAxNiIgc3Ryb2tlPSIjOUI5QjlCIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4K';
                    }}
                  />
                </div>
                <div className="example-icon-info">
                  <div className="example-icon-name">{icon.name}</div>
                  <div className="example-icon-size">40×40</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-close" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default ExampleIconsModal;
