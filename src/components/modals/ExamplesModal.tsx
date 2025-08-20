import React from 'react';
import type { ExampleImageItem } from '../../types';

interface ExamplesModalProps {
  examples: ExampleImageItem[];
  onSelect: (previewPath: string) => void;
  onClose: () => void;
}

const ExamplesModal: React.FC<ExamplesModalProps> = ({ examples, onSelect, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content examples-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>示例图片</h3>
          <p className="modal-description">选择一个示例图片来快速体验不同的图像效果</p>
        </div>
        <div className="modal-body">
          <div className="examples-grid">
            {examples.map((example) => (
              <div 
                key={example.id} 
                className="example-item"
                onClick={() => onSelect(example.preview)}
              >
                <div className="example-preview">
                  <img 
                    src={example.preview} 
                    alt={example.name}
                    className="example-image"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjYyIiB2aWV3Qm94PSIwIDAgMTIwIDYyIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjYyIiBmaWxsPSIjRjNGNEY2Ci8+CjxwYXRoIGQ9Ik00MCAyNkw2MCAzNkw4MCAyNiIgc3Ryb2tlPSIjOUI5QjlCIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4K';
                    }}
                  />
                </div>
                <div className="example-info">
                  <div className="example-name">{example.name}</div>
                  <div className="example-size">{example.size}</div>
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

export default ExamplesModal;
