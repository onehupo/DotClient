import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface MacrosHelpModalProps {
  onClose: () => void;
}

interface MacroVariable {
  name: string;
  description: string;
  example: string;
  category: string;
}

// Parse markdown content into structured macro variables
function parseMacrosFromMarkdown(md: string): MacroVariable[] {
  const macros: MacroVariable[] = [];
  const lines = md.split('\n');
  let currentCategory = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Parse category headers (## Title or ### Title)
    if (line.startsWith('### ')) {
      currentCategory = line.slice(4).trim();
      continue;
    }
    if (line.startsWith('## ') && !line.includes('宏替换说明')) {
      currentCategory = line.slice(3).trim();
      continue;
    }
    
    // Parse macro variables (format: - {MACRO_NAME} → description)
    if (line.startsWith('- {') && line.includes('} →')) {
      const match = line.match(/- \{([^}]+)\}(?: \/ \{([^}]+)\})? → (.+)/);
      if (match) {
        const [, name, altName, description] = match;
        
        // Extract example from description if it contains actual values
        let example = `{${name}}`;
        let cleanDescription = description;
        
        // If description contains specific values (like dates, numbers), use as example
        if (description.match(/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}|\d+/)) {
          example = description;
          // Create a more generic description
          if (name.includes('DATE')) {
            cleanDescription = '当前日期';
          } else if (name.includes('TIME')) {
            cleanDescription = '当前时间';
          } else if (name.includes('YEAR')) {
            cleanDescription = '当前年份';
          } else if (name.includes('MONTH')) {
            cleanDescription = '当前月份';
          } else if (name.includes('DAY')) {
            cleanDescription = '当前日期中的天';
          } else if (name.includes('HOUR')) {
            cleanDescription = '当前小时';
          } else if (name.includes('MINUTE')) {
            cleanDescription = '当前分钟';
          } else if (name.includes('SECOND')) {
            cleanDescription = '当前秒数';
          } else if (name.includes('TIMESTAMP')) {
            cleanDescription = '时间戳格式';
          } else if (name.includes('WEEKDAY')) {
            cleanDescription = '星期几';
          } else if (name.includes('USAGE')) {
            cleanDescription = '使用率百分比';
          } else if (name.includes('BYTES')) {
            cleanDescription = '网络流量字节数';
          } else if (name.includes('TEMPERATURE')) {
            cleanDescription = '系统温度';
          } else if (name.includes('HOSTNAME') || name.includes('COMPUTER_NAME')) {
            cleanDescription = '计算机主机名';
          } else if (name.includes('USERNAME')) {
            cleanDescription = '当前用户名';
          } else if (name.includes('OS_') || name.includes('KERNEL_') || name.includes('ARCH') || name.includes('PLATFORM')) {
            cleanDescription = '系统信息';
          } else if (name.includes('NETWORK_')) {
            cleanDescription = '网络接口信息';
          } else {
            cleanDescription = description;
          }
        }
        
        macros.push({
          name,
          description: cleanDescription,
          example,
          category: currentCategory
        });
        
        // If there's an alternative name, add it as a separate macro
        if (altName) {
          macros.push({
            name: altName,
            description: cleanDescription,
            example: example.replace(`{${name}}`, `{${altName}}`),
            category: currentCategory
          });
        }
      }
    }
  }
  
  return macros;
}

// Copy macro variable to clipboard
const copyMacroToClipboard = async (macroName: string) => {
  const macroText = `{${macroName}}`;
  try {
    // Try Tauri clipboard first
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(macroText);
    return true;
  } catch {
    // Fallback to browser clipboard
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(macroText);
        return true;
      }
    } catch {
      // Final fallback - show in console
      console.log('Macro variable:', macroText);
    }
  }
  return false;
}

const MacrosHelpModal: React.FC<MacrosHelpModalProps> = ({ onClose }) => {
  const [macros, setMacros] = useState<MacroVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedMacro, setCopiedMacro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const md = await invoke<string>('get_macros_help_markdown');
        console.log('Raw markdown content:', md); // Debug log
        const parsedMacros = parseMacrosFromMarkdown(md);
        console.log('Parsed macros:', parsedMacros); // Debug log
        setMacros(parsedMacros);
      } catch (e) {
        console.error('Failed to load macros:', e); // Debug log
        setMacros([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleCopyMacro = async (macroName: string) => {
    const success = await copyMacroToClipboard(macroName);
    if (success) {
      setCopiedMacro(macroName);
      setTimeout(() => setCopiedMacro(null), 2000);
    }
  };

  // Group macros by category
  const macrosByCategory = macros.reduce((acc, macro) => {
    if (!acc[macro.category]) {
      acc[macro.category] = [];
    }
    acc[macro.category].push(macro);
    return acc;
  }, {} as Record<string, MacroVariable[]>);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content macros-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>宏替换变量</h3>
          <p className="modal-description">点击宏变量卡片复制到剪贴板，然后在文本字段中使用</p>
        </div>
        <div className="modal-body">
          {isLoading ? (
            <div className="macros-loading">
              <div className="loading-spinner"></div>
              <p>正在加载宏变量...</p>
            </div>
          ) : macros.length > 0 ? (
            <div className="macros-categories">
              {Object.entries(macrosByCategory).map(([category, categoryMacros]) => (
                <div key={category} className="macro-category">
                  <h4 className="macro-category-title">{category}</h4>
                  <div className="macros-grid">
                    {categoryMacros.map((macro) => (
                      <div 
                        key={macro.name} 
                        className={`macro-item ${copiedMacro === macro.name ? 'copied' : ''}`}
                        onClick={() => handleCopyMacro(macro.name)}
                      >
                        <div className="macro-header">
                          <div className="macro-name">{`{${macro.name}}`}</div>
                          <div className="macro-copy-icon">
                            {copiedMacro === macro.name ? '✓' : '📋'}
                          </div>
                        </div>
                        <div className="macro-description">{macro.description}</div>
                        {macro.example !== `{${macro.name}}` && (
                          <div className="macro-example">示例: {macro.example}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="macros-error">
              <p>暂无可用的宏变量</p>
              <p>请确保后端服务正常运行</p>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-close" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default MacrosHelpModal;
