import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("text");
  const [darkMode, setDarkMode] = useState(false);
  const [previewConfig, setPreviewConfig] = useState({
    title: "您好",
    message: "欢迎使用 Quote/0",
    signature: "MindReset",
    icon: "",
    link: ""
  });
  const [imageConfig, setImageConfig] = useState({
    link: ""
  });
  const [imagePreview, setImagePreview] = useState("");
  const [processedImagePreview, setProcessedImagePreview] = useState("");
  const [base64Input, setBase64Input] = useState("");
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("original");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    apiKey: "",
    serialNumber: ""
  });
  const [showTools, setShowTools] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [showExampleIcons, setShowExampleIcons] = useState(false);
  const [toasts, setToasts] = useState<Array<{
    id: string;
    message: string;
    type: "success" | "error" | "info";
    timeoutId?: number;
  }>>([]);

  // 初始化时检查系统主题偏好和设置
  useEffect(() => {
    const savedTheme = localStorage.getItem('darkMode');
    if (savedTheme) {
      setDarkMode(JSON.parse(savedTheme));
    } else {
      // 检查系统主题偏好
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDarkMode(prefersDark);
    }

    // 加载保存的设置
    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  // 当深色模式状态改变时，更新HTML类名和本地存储
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // 当算法改变时，如果已有处理后的图片，自动重新处理（只在非用户主动切换时触发）
  useEffect(() => {
    // 这个useEffect现在主要用于其他场景的自动更新，算法按钮点击时会直接调用handleAlgorithmChange
  }, [selectedAlgorithm]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    // 使用更精确的ID生成，包含毫秒和随机数
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 清理超过5个的旧toast
    setToasts(prev => {
      if (prev.length >= 5) {
        const toastToRemove = prev[0];
        if (toastToRemove.timeoutId) {
          clearTimeout(toastToRemove.timeoutId);
        }
        return prev.slice(1);
      }
      return prev;
    });
    
    // 设置3秒后自动移除该toast（每个toast都有独立的完整3秒）
    const timeoutId = window.setTimeout(() => {
      removeToast(id);
    }, 3000);
    
    // 添加新的toast with timeoutId
    const newToast = { id, message, type, timeoutId };
    setToasts(prev => [...prev, newToast]);
  };

  // 手动移除指定的toast
  const removeToast = (id: string) => {
    // 先添加移除动画类
    const toastElement = document.querySelector(`[data-toast-id="${id}"]`);
    if (toastElement) {
      toastElement.classList.add('removing');
      
      // 等待动画完成后再从状态中移除
      setTimeout(() => {
        setToasts(prev => {
          const toastToRemove = prev.find(toast => toast.id === id);
          if (toastToRemove?.timeoutId) {
            clearTimeout(toastToRemove.timeoutId);
          }
          return prev.filter(toast => toast.id !== id);
        });
      }, 300); // 匹配CSS动画时间
    } else {
      // 如果找不到元素，直接移除
      setToasts(prev => {
        const toastToRemove = prev.find(toast => toast.id === id);
        if (toastToRemove?.timeoutId) {
          clearTimeout(toastToRemove.timeoutId);
        }
        return prev.filter(toast => toast.id !== id);
      });
    }
  };

  // 清除包含特定关键词的toast
  const clearToastsByKeyword = (keyword: string) => {
    setToasts(prev => {
      const toastsToRemove = prev.filter(toast => toast.message.includes(keyword));
      toastsToRemove.forEach(toast => {
        if (toast.timeoutId) {
          clearTimeout(toast.timeoutId);
        }
      });
      return prev.filter(toast => !toast.message.includes(keyword));
    });
  };

  const openSettings = () => {
    // 关闭其他弹窗
    setShowExamples(false);
    setShowTemplates(false);
    setShowTools(false);
    setShowSettings(true);
  };

  const closeSettings = () => {
    setShowSettings(false);
  };

  const openTools = () => {
    // 关闭其他弹窗
    setShowExamples(false);
    setShowTemplates(false);
    setShowSettings(false);
    setShowTools(true);
  };

  const closeTools = () => {
    setShowTools(false);
  };

  const openTemplates = () => {
    // 关闭其他弹窗
    setShowExamples(false);
    setShowTools(false);
    setShowSettings(false);
    setShowTemplates(true);
  };

  const closeTemplates = () => {
    setShowTemplates(false);
  };

  const openExamples = () => {
    // 关闭其他弹窗
    setShowTemplates(false);
    setShowTools(false);
    setShowSettings(false);
    setShowExampleIcons(false);
    setShowExamples(true);
  };

  const closeExamples = () => {
    setShowExamples(false);
  };

  const openExampleIcons = () => {
    // 关闭其他弹窗
    setShowTemplates(false);
    setShowTools(false);
    setShowSettings(false);
    setShowExamples(false);
    setShowExampleIcons(true);
  };

  const closeExampleIcons = () => {
    setShowExampleIcons(false);
  };

  // 生成模版图片
  const generateTemplate = (width: number, height: number, color: 'black' | 'white') => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    canvas.width = width;
    canvas.height = height;
    
    // 设置背景色
    ctx.fillStyle = color === 'black' ? '#000000' : '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    return canvas.toDataURL('image/png');
  };

  // 调整图片尺寸为296x152
  const resizeImageTo296x152 = (imageDataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建canvas上下文'));
          return;
        }

        // 设置目标尺寸
        canvas.width = 296;
        canvas.height = 152;
        
        // 绘制调整后的图片
        ctx.drawImage(img, 0, 0, 296, 152);
        
        // 返回调整后的图片数据
        resolve(canvas.toDataURL('image/png'));
      };
      
      img.onerror = () => {
        reject(new Error('图片加载失败'));
      };
      
      img.src = imageDataUrl;
    });
  };

  // 导出模版图片
  const exportTemplate = async (width: number, height: number, color: 'black' | 'white') => {
    try {
      const templateData = generateTemplate(width, height, color);
      
      // 生成文件名
      const now = new Date();
      const dateStr = now.getFullYear() + '-' + 
                     String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(now.getDate()).padStart(2, '0');
      const timeStr = String(now.getHours()).padStart(2, '0') + '-' + 
                     String(now.getMinutes()).padStart(2, '0') + '-' + 
                     String(now.getSeconds()).padStart(2, '0');
      const filename = `template-${width}x${height}-${color}-${dateStr}_${timeStr}.png`;
      
      // 调用Tauri命令保存模版图片到下载目录
      const savedPath = await invoke('save_image_to_downloads', {
        imageData: templateData,
        filename: filename
      });
      
      showToast(`模版导出成功！已保存为 ${filename}`, 'success');
      console.log('模版导出成功:', { filename, savedPath, width, height, color });
    } catch (error) {
      console.error('模版导出失败:', error);
      showToast(`模版导出失败：${error}`, 'error');
    }
  };

  const saveSettings = () => {
    localStorage.setItem('appSettings', JSON.stringify(settings));
    setShowSettings(false);
    showToast('设置已保存！', 'success');
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const processImageFile = (file: File) => {
    console.log('开始处理图片文件:', file.name, file.size, 'bytes'); // 调试日志
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      console.log('图片文件读取成功，数据长度:', result.length); // 调试日志
      
      try {
        // 导入时立即调整图片尺寸为296x152
        const resizedImage = await resizeImageTo296x152(result);
        setImagePreview(resizedImage);
        // 清空base64输入框，因为现在使用的是文件上传的图片
        setBase64Input("");
        // 清空之前的处理预览
        setProcessedImagePreview("");
      } catch (error) {
        console.error('图片尺寸调整失败:', error);
        showToast('图片处理失败，请重试', 'error');
      }
    };
    
    reader.onerror = (e) => {
      console.error('图片文件读取失败:', e);
      showToast('文件读取失败，请重试', 'error');
    };
    
    reader.readAsDataURL(file);
  };

  const handleBase64Input = async (value: string) => {
    setBase64Input(value);
    if (value.trim()) {
      // 如果输入的不是完整的data URL，则添加前缀
      const base64Url = value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
      
      try {
        // 导入时立即调整图片尺寸为296x152
        const resizedImage = await resizeImageTo296x152(base64Url);
        setImagePreview(resizedImage);
      } catch (error) {
        console.error('图片尺寸调整失败:', error);
        // 如果调整失败，使用原图
        setImagePreview(base64Url);
      }
    } else {
      setImagePreview("");
    }
    // 清空之前的处理预览
    setProcessedImagePreview("");
  };

  // 检查文本页面必填字段是否都已填写
  const isTextFormValid = previewConfig.title.trim() && 
                          previewConfig.message.trim() && 
                          previewConfig.signature.trim();

  // 示例图标数据 - 40×40图标
  const exampleIcons = [
    {
      id: 'icon1',
      name: '黑色方块',
      base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAKKADAAQAAAABAAAAKAAAAAB65masAAAAYElEQVRYCe3SsQ2AQAwEQfP99wwE38EmDgbpw5Ws4Z6Zef+39jtrL7uHObD+IYIEq0DtbZBgFai9DRKsArW3QYJVoPY2SLAK1N4GCVaB2tsgwSpQexskWAVqb4MEq0DtPxP3AU9rhblDAAAAAElFTkSuQmCC'
    },
    {
      id: 'icon2',
      name: '白色方块',
      base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAKKADAAQAAAABAAAAKAAAAAB65masAAAAXElEQVRYCe3SwQ0AEBQFQfTfM6KFuTis+yY/48193/j4rY9ve6d1oP5QggmqgPZtMEEV0L4NJqgC2rfBBFVA+zaYoApo3wYTVAHt22CCKqB9G0xQBbRvgwmqgPYHPuoETA4WTIoAAAAASUVORK5CYII='
    },
    {
      id: 'icon3', 
      name: '棋盘图案',
      base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAAAAACpleexAAAAOklEQVR4nO2RsQkAMAzD5P7/c/qBCbQhizVlCAgjAVAAstehyeKjGjs0ox4YA6TMuzplLCnzR50ylgvm2yBFvCCk5QAAAABJRU5ErkJggg=='
    },
    {
      id: 'icon4',
      name: '圆形图标',
      base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAAAAACpleexAAAA4UlEQVR4nMVUSxLFIAgLTu9/5byFUsFAu+o8Np3GED4iRpxmUAwYBVbaV0R7Jxonb+e/nJgY/rmZSTod2U3gojEIM0hsnCmDW56xGIDKm38O2U66upANjkfeTDIR+07aoVgKBnQ8BY7BryaW+OlQWMzsJIbIBpAMzBX7VFxdp2heEmNq88SLYtQMwOWz9GaqaOpKaDGrCpmkPbixP64Sj7ThzLw+x+bWhx92hXtSIyA1Lyu2UyaPq5E0eVzpaSbXrGgAZWIsTlFaKcWmkJWSMkhluIiUe16hB636Ur3JP+7wH9LnUEN7qhbeAAAAAElFTkSuQmCC'
    }
  ];

  // 示例图片数据 - 只展示296×152的图片
  const exampleImages = [
    {
      id: 'template1',
      name: '模板样式1',
      size: '296×152',
      preview: '/examples/template_1.png'
    },
    {
      id: 'template2',
      name: '模板样式2',
      size: '296×152',
      preview: '/examples/template_2.png'
    },
    {
      id: 'template3',
      name: '模板样式3',
      size: '296×152',
      preview: '/examples/template_3.png'
    },
    {
      id: 'template4',
      name: '模板样式4',
      size: '296×152',
      preview: '/examples/temolate_4.png'
    },
    {
      id: 'template5',
      name: '模板样式5',
      size: '296×152',
      preview: '/examples/template_5.jpg'
    },
    {
      id: 'template6',
      name: '模板样式6',
      size: '296×152',
      preview: '/examples/template_6.jpg'
    },
    {
      id: 'template7',
      name: '模板样式7',
      size: '296×152',
      preview: '/examples/template_7.jpg'
    },
    {
      id: 'sample1',
      name: '文字内容',
      size: '296×152',
      preview: '/examples/sample-296x152-text.png'
    },
    {
      id: 'sample2',
      name: '风景图片',
      size: '296×152',
      preview: '/examples/sample-296x152-landscape.png'
    },
    {
      id: 'sample3',
      name: '灰度测试',
      size: '296×152',
      preview: '/examples/gray_296x152.png'
    },
    {
      id: 'sample4',
      name: '误差扩散',
      size: '296×152',
      preview: '/examples/dithered_floyd_steinberg_296x152.png'
    },
    {
      id: 'sample5',
      name: '有序抖动',
      size: '296×152',
      preview: '/examples/dithered_ordered_296x152.png'
    },
    {
      id: 'sample6',
      name: '随机抖动',
      size: '296×152',
      preview: '/examples/dithered_random_296x152.png'
    }
  ];

  // 选择示例图片
  const selectExampleImage = async (imagePath: string) => {
    try {
      showToast('正在加载示例图片...', 'info');
      
      // 通过fetch获取图片并转换为base64
      const response = await fetch(imagePath);
      if (!response.ok) {
        throw new Error('Failed to load image');
      }
      
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        const result = e.target?.result as string;
        
        try {
          // 导入时立即调整图片尺寸为296x152
          const resizedImage = await resizeImageTo296x152(result);
          setImagePreview(resizedImage);
          setBase64Input(''); // 清空base64输入框
          setProcessedImagePreview(''); // 清空处理预览
          closeExamples();
          showToast('示例图片加载成功！', 'success');
        } catch (error) {
          console.error('图片尺寸调整失败:', error);
          // 如果调整失败，使用原图
          setImagePreview(result);
          setBase64Input(''); // 清空base64输入框
          setProcessedImagePreview(''); // 清空处理预览
          closeExamples();
          showToast('示例图片加载成功！', 'success');
        }
      };
      
      reader.onerror = () => {
        showToast('示例图片加载失败', 'error');
      };
      
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Load example image failed:', error);
      showToast('示例图片加载失败', 'error');
    }
  };

  // 复制图标base64
  const copyIconBase64 = async (iconBase64: string) => {
    try {
      // 去掉data:image前缀，只保留纯base64数据
      const base64Data = iconBase64.includes(',') ? iconBase64.split(',')[1] : iconBase64;
      await navigator.clipboard.writeText(base64Data);
      showToast('图标Base64已复制到剪贴板！', 'success');
      closeExampleIcons();
    } catch (error) {
      console.error('复制失败:', error);
      showToast('复制失败，请重试', 'error');
    }
  };

  // 处理算法切换和图片预览
  const handleAlgorithmChange = async (algorithm: string) => {
    setSelectedAlgorithm(algorithm);
    
    // 如果有图片，立即处理并预览
    if (imagePreview) {
      try {
        // 清除之前的处理相关toast，避免重复显示
        clearToastsByKeyword('正在处理');
        clearToastsByKeyword('图片预览已生成');
        
        if (algorithm === 'original') {
          // 如果选择原始图片，直接显示原始图片
          setProcessedImagePreview(imagePreview);
          
          // 稍微延迟显示toast，确保清除操作完成
          setTimeout(() => {
            showToast('切换到原始图片', 'success');
          }, 10);
        } else {
          // 稍微延迟显示toast，确保清除操作完成
          setTimeout(() => {
            showToast('正在处理图片...', 'info');
          }, 10);
          
          // 调用Rust函数处理图片
          const processedImageData = await invoke('process_image_with_algorithm', {
            imageData: imagePreview,
            algorithm: algorithm
          });
          
          // 在页面预览区域展示处理后的图片
          setProcessedImagePreview(processedImageData as string);
          
          // 先清除"正在处理"的toast，再显示成功toast
          clearToastsByKeyword('正在处理图片');
          setTimeout(() => {
            showToast('图片预览已生成', 'success');
          }, 50);
        }
      } catch (error) {
        console.error('图片处理失败:', error);
        showToast(`图片处理失败：${error}`, 'error');
      }
    }
  };

  return (
    <main className="container">
      {/* Toast通知容器 */}
      <div className="toasts-container">
        {toasts.map((toast, index) => (
          <div 
            key={toast.id}
            data-toast-id={toast.id}
            className={`toast toast-${toast.type}`}
            style={{ '--toast-index': index } as React.CSSProperties}
            onClick={() => removeToast(toast.id)}
          >
            <span className="toast-icon">
              {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span className="toast-message">{toast.message}</span>
            <span className="toast-close">×</span>
          </div>
        ))}
      </div>

      {/* 示例图标按钮 */}
      <button 
        className="example-icons-button"
        onClick={openExampleIcons}
        title="示例图标"
      >
        🏷️
      </button>

      {/* 示例按钮 */}
      <button 
        className="examples-button"
        onClick={openExamples}
        title="示例图片"
      >
        🖼️
      </button>

      {/* 模版按钮 */}
      <button 
        className="templates-button"
        onClick={openTemplates}
        title="模版"
      >
        📋
      </button>

      {/* 工具按钮 */}
      <button 
        className="tools-button"
        onClick={openTools}
        title="工具"
      >
        🛠️
      </button>

      {/* 设置按钮 */}
      <button 
        className="settings-button"
        onClick={openSettings}
        title="设置"
      >
        ⚙️
      </button>

      {/* 深色模式切换按钮 */}
      <button 
        className="theme-toggle-button"
        onClick={toggleDarkMode}
        title={darkMode ? "切换到浅色模式" : "切换到深色模式"}
      >
        {darkMode ? "☀️" : "✨"}
        {/* {darkMode ? "🌞☀️" : "🌙🌜"} */}
      </button>

      {/* 示例图标模态框 */}
      {showExampleIcons && (
        <div className="modal-overlay" onClick={closeExampleIcons}>
          <div className="modal-content example-icons-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>示例图标</h3>
              <p className="modal-description">点击图标复制其Base64数据，用于文本消息的图标字段</p>
            </div>
            <div className="modal-body">
              <div className="example-icons-grid">
                {exampleIcons.map((icon) => (
                  <div 
                    key={icon.id} 
                    className="example-icon-item"
                    onClick={() => copyIconBase64(icon.base64)}
                  >
                    <div className="example-icon-preview">
                      <img 
                        src={icon.base64} 
                        alt={icon.name}
                        className="example-icon-image"
                        onError={(e) => {
                          // 如果图片加载失败，显示占位符
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
              <button className="modal-close" onClick={closeExampleIcons}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 示例图片模态框 */}
      {showExamples && (
        <div className="modal-overlay" onClick={closeExamples}>
          <div className="modal-content examples-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>示例图片</h3>
              <p className="modal-description">选择一个示例图片来快速体验不同的图像效果</p>
            </div>
            <div className="modal-body">
              <div className="examples-grid">
                {exampleImages.map((example) => (
                  <div 
                    key={example.id} 
                    className="example-item"
                    onClick={() => selectExampleImage(example.preview)}
                  >
                    <div className="example-preview">
                      <img 
                        src={example.preview} 
                        alt={example.name}
                        className="example-image"
                        onError={(e) => {
                          // 如果图片加载失败，显示占位符
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
              <button className="modal-close" onClick={closeExamples}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 模版模态框 */}
      {showTemplates && (
        <div className="modal-overlay" onClick={closeTemplates}>
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
                      <img 
                        src={generateTemplate(40, 40, 'black')} 
                        alt="40x40 黑色模版" 
                        className="template-image"
                      />
                    </div>
                    <div className="template-info">
                      <span className="template-label">40×40 黑色</span>
                      <button 
                        className="template-export-btn"
                        onClick={() => exportTemplate(40, 40, 'black')}
                      >
                        导出
                      </button>
                    </div>
                  </div>
                  <div className="template-item">
                    <div className="template-preview template-40x40-white">
                      <img 
                        src={generateTemplate(40, 40, 'white')} 
                        alt="40x40 白色模版" 
                        className="template-image"
                      />
                    </div>
                    <div className="template-info">
                      <span className="template-label">40×40 白色</span>
                      <button 
                        className="template-export-btn"
                        onClick={() => exportTemplate(40, 40, 'white')}
                      >
                        导出
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="template-section">
                <h4>296×152 模版</h4>
                <div className="template-grid">
                  <div className="template-item">
                    <div className="template-preview template-296x152-black">
                      <img 
                        src={generateTemplate(296, 152, 'black')} 
                        alt="296x152 黑色模版" 
                        className="template-image"
                      />
                    </div>
                    <div className="template-info">
                      <span className="template-label">296×152 黑色</span>
                      <button 
                        className="template-export-btn"
                        onClick={() => exportTemplate(296, 152, 'black')}
                      >
                        导出
                      </button>
                    </div>
                  </div>
                  <div className="template-item">
                    <div className="template-preview template-296x152-white">
                      <img 
                        src={generateTemplate(296, 152, 'white')} 
                        alt="296x152 白色模版" 
                        className="template-image"
                      />
                    </div>
                    <div className="template-info">
                      <span className="template-label">296×152 白色</span>
                      <button 
                        className="template-export-btn"
                        onClick={() => exportTemplate(296, 152, 'white')}
                      >
                        导出
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-close" onClick={closeTemplates}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 工具模态框 */}
      {showTools && (
        <div className="modal-overlay" onClick={closeTools}>
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
                              // 去掉data:image前缀，只保留纯base64数据
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
              <button className="modal-close" onClick={closeTools}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 设置模态框 */}
      {showSettings && (
        <div className="modal-overlay" onClick={closeSettings}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>设置</h3>
            </div>
            <div className="modal-body">
              <div className="setting-item">
                <label>API密钥:</label>
                <input
                  type="text"
                  value={settings.apiKey}
                  onChange={(e) => setSettings({...settings, apiKey: e.target.value})}
                  placeholder="输入API密钥"
                />
              </div>
              <div className="setting-item">
                <label>设备ID (Device ID):</label>
                <input
                  type="text"
                  value={settings.serialNumber}
                  onChange={(e) => setSettings({...settings, serialNumber: e.target.value})}
                  placeholder="输入设备ID"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel" onClick={closeSettings}>取消</button>
              <button className="modal-save" onClick={saveSettings}>保存</button>
            </div>
          </div>
        </div>
      )}

      <div className="tab-container">
        <div className="tab-buttons">
          <button 
            className={`tab-button ${activeTab === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTab('text')}
          >
            文本
          </button>
          <button 
            className={`tab-button ${activeTab === 'image' ? 'active' : ''}`}
            onClick={() => setActiveTab('image')}
          >
            图片
          </button>
        </div>
        
        <div className="tab-content">
          {activeTab === 'text' ? (
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
                      onChange={(e) => setPreviewConfig({...previewConfig, title: e.target.value})}
                      placeholder="输入标题"
                    />
                  </div>
                  <div className="config-item">
                    <label>Message:</label>
                    <input
                      type="text"
                      value={previewConfig.message}
                      onChange={(e) => setPreviewConfig({...previewConfig, message: e.target.value})}
                      placeholder="输入消息内容"
                    />
                  </div>
                  <div className="config-item">
                    <label>Signature:</label>
                    <input
                      type="text"
                      value={previewConfig.signature}
                      onChange={(e) => setPreviewConfig({...previewConfig, signature: e.target.value})}
                      placeholder="输入签名"
                    />
                  </div>
                  <div className="config-item">
                    <label>Icon (Base64):</label>
                    <input
                      type="text"
                      value={previewConfig.icon}
                      onChange={(e) => setPreviewConfig({...previewConfig, icon: e.target.value})}
                      placeholder="输入base64图片数据或留空使用默认图标"
                    />
                  </div>
                  <div className="config-item">
                    <label>Link:</label>
                    <input
                      type="url"
                      value={previewConfig.link}
                      onChange={(e) => setPreviewConfig({...previewConfig, link: e.target.value})}
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
                    console.log('发送配置:', previewConfig);
                    console.log('使用设置:', settings);
                    
                    // 检查必要的设置
                    if (!settings.apiKey || !settings.serialNumber) {
                      showToast('请先配置API密钥和设备ID', 'error');
                      return;
                    }

                    try {
                      showToast('正在发送...', 'info');
                      
                      // 调用Rust函数发送到API
                      const result = await invoke('send_text_to_api', {
                        apiKey: settings.apiKey,
                        deviceId: settings.serialNumber,
                        title: previewConfig.title,
                        message: previewConfig.message,
                        signature: previewConfig.signature,
                        icon: previewConfig.icon.trim() || null,
                        link: previewConfig.link.trim() || null
                      });
                      
                      console.log('API响应:', result);
                      // 先清除"正在发送"的toast，再显示成功toast
                      clearToastsByKeyword('正在发送');
                      setTimeout(() => {
                        showToast('文本发送成功！', 'success');
                      }, 50);
                      
                    } catch (error) {
                      console.error('发送失败:', error);
                      // 先清除"正在发送"的toast，再显示错误toast
                      clearToastsByKeyword('正在发送');
                      setTimeout(() => {
                        showToast(`发送失败：${error}`, 'error');
                      }, 50);
                    }
                  }}
                >
                  发送
                </button>
              </div>
            </div>
          ) : (
            <div className="image-page">
              <h2>通过图片API更新你的dot.</h2>
              
              {/* 图片预览框 */}
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
                      alt={processedImagePreview ? "处理后图片" : "原始图片"} 
                      className="preview-image"
                      onError={() => {
                        console.error('图片加载失败');
                        setImagePreview("");
                        setProcessedImagePreview("");
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

              {/* 图片配置区域 */}
              <div className="config-section">
                <h3>配置预览内容</h3>
                <div className="image-config-layout">
                  {/* 左侧配置 */}
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
                          <span className="file-input-text">
                            点击选择图片文件
                          </span>
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
                        onChange={(e) => setImageConfig({...imageConfig, link: e.target.value})}
                        placeholder="输入跳转链接（可选）"
                      />
                    </div>
                  </div>
                  
                  {/* 右侧算法选择 */}
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

              {/* 操作按钮 */}
              <div className="action-buttons-container">
                <button 
                  className="action-button export-button"
                  onClick={async () => {
                    if (imagePreview) {
                      try {
                        // 显示导出中的提示
                        showToast('正在导出图片...', 'info');
                        
                        let exportImageData;
                        if (selectedAlgorithm === 'original') {
                          // 如果选择原始图片，先调整尺寸然后导出
                          exportImageData = await resizeImageTo296x152(imagePreview);
                        } else {
                          // 先处理图片
                          const processedData = await invoke('process_image_with_algorithm', {
                            imageData: imagePreview,
                            algorithm: selectedAlgorithm
                          }) as string;
                          // 然后调整尺寸
                          exportImageData = await resizeImageTo296x152(processedData);
                        }
                        
                        // 生成文件名
                        const now = new Date();
                        const dateStr = now.getFullYear() + '-' + 
                                       String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                                       String(now.getDate()).padStart(2, '0');
                        const timeStr = String(now.getHours()).padStart(2, '0') + '-' + 
                                       String(now.getMinutes()).padStart(2, '0') + '-' + 
                                       String(now.getSeconds()).padStart(2, '0');
                        const filename = `exported-image-${selectedAlgorithm}-296x152-${dateStr}_${timeStr}.png`;
                        
                        // 调用Tauri命令保存处理后的图片到下载目录
                        const savedPath = await invoke('save_image_to_downloads', {
                          imageData: exportImageData,
                          filename: filename
                        });
                        
                        // 先清除"正在导出"的toast，再显示成功toast
                        clearToastsByKeyword('正在导出图片');
                        setTimeout(() => {
                          showToast(`导出成功！已保存为 ${filename}`, 'success');
                        }, 50);
                        console.log('导出成功:', { filename, savedPath, algorithm: selectedAlgorithm, size: '296x152' });
                      } catch (error) {
                        console.error('导出失败:', error);
                        // 先清除"正在导出"的toast，再显示错误toast
                        clearToastsByKeyword('正在导出图片');
                        setTimeout(() => {
                          showToast(`导出失败：${error}`, 'error');
                        }, 50);
                      }
                    } else {
                      showToast('请先选择或输入图片', 'error');
                    }
                  }}
                  disabled={!imagePreview}
                >
                  导出
                </button>
                <button 
                  className="action-button send-button"
                  onClick={async () => {
                    if (imagePreview) {
                      console.log('发送图片:', { imagePreview, base64Input, selectedAlgorithm });
                      console.log('使用设置:', settings);
                      
                      // 检查必要的设置
                      if (!settings.apiKey || !settings.serialNumber) {
                        showToast('请先配置API密钥和设备ID', 'error');
                        return;
                      }

                      try {
                        if (selectedAlgorithm === 'original') {
                          showToast('正在发送原始图片...', 'info');
                          // 如果选择原始图片，先调整尺寸然后发送
                          const resizedImageData = await resizeImageTo296x152(imagePreview);
                          const result = await invoke('send_image_to_api', {
                            apiKey: settings.apiKey,
                            deviceId: settings.serialNumber,
                            imageData: resizedImageData,
                            link: imageConfig.link.trim() || null
                          });
                          console.log('API响应:', result);
                          // 先清除"正在发送"的toast，再显示成功toast
                          clearToastsByKeyword('正在发送');
                          setTimeout(() => {
                            showToast('原始图片发送成功！(296×152)', 'success');
                          }, 50);
                        } else {
                          showToast('正在处理并发送图片...', 'info');
                          
                          // 先处理图片
                          const processedImageData = await invoke('process_image_with_algorithm', {
                            imageData: imagePreview,
                            algorithm: selectedAlgorithm
                          }) as string;
                          
                          // 然后调整尺寸
                          const resizedImageData = await resizeImageTo296x152(processedImageData);
                          
                          // 调用Rust函数发送到API
                          const result = await invoke('send_image_to_api', {
                            apiKey: settings.apiKey,
                            deviceId: settings.serialNumber,
                            imageData: resizedImageData,
                            link: imageConfig.link.trim() || null
                          });
                          
                          console.log('API响应:', result);
                          // 先清除"正在处理并发送"的toast，再显示成功toast
                          clearToastsByKeyword('正在处理并发送');
                          setTimeout(() => {
                            showToast('图片发送成功！(296×152)', 'success');
                          }, 50);
                        }
                        
                      } catch (error) {
                        console.error('发送失败:', error);
                        // 先清除所有发送相关的toast，再显示错误toast
                        clearToastsByKeyword('正在发送');
                        clearToastsByKeyword('正在处理并发送');
                        setTimeout(() => {
                          showToast(`发送失败：${error}`, 'error');
                        }, 50);
                      }
                    } else {
                      showToast('请先选择或输入图片', 'error');
                    }
                  }}
                  disabled={!imagePreview}
                >
                  发送
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default App;
