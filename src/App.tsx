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
  const [textToImageConfig, setTextToImageConfig] = useState({
    backgroundColor: "white" as "white" | "black" | "gray",
    backgroundImage: null as string | null,
    texts: [] as Array<{
      id: string;
      content: string;
      x: number;
      y: number;
      fontSize: number;
      rotation: number;
      fontWeight: "normal" | "bold";
      textAlign: "left" | "center" | "right";
      color: "white" | "black" | "gray";
      fontFamily: string;
    }>,
    link: ""
  });
  const [textToImagePreview, setTextToImagePreview] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [processedImagePreview, setProcessedImagePreview] = useState("");
  const [base64Input, setBase64Input] = useState("");
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("original");
  const [showSettings, setShowSettings] = useState(false);
  const [availableFonts, setAvailableFonts] = useState<string[]>([
    "Arial", "Georgia", "Times New Roman", "Courier New", "Helvetica", "Verdana"
  ]); // 默认字体列表
  const [settings, setSettings] = useState({
    devices: [] as Array<{
      id: string;
      apiKey: string;
      serialNumber: string;
      nickname: string;
    }>,
    selectedDeviceId: ""
  });
  const [showTools, setShowTools] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [showExampleIcons, setShowExampleIcons] = useState(false);
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [toasts, setToasts] = useState<Array<{
    id: string;
    message: string;
    type: "success" | "error" | "info";
    timeoutId?: number;
  }>>([]);

  // 获取系统支持的字体列表
  const getSystemFonts = async (): Promise<string[]> => {
    try {
      // 检查浏览器是否支持字体查询API
      if ('queryLocalFonts' in window) {
        const fonts = await (window as any).queryLocalFonts();
        const fontFamilies = [...new Set(fonts.map((font: any) => font.family))]
          .filter((family): family is string => typeof family === 'string')
          .sort();
        return fontFamilies;
      }
    } catch (error) {
      console.warn('无法获取系统字体列表:', error);
    }

    // 如果无法获取系统字体，使用常见字体检测
    const testFonts = [
      // 系统默认字体 
      'Arial', 'Helvetica', 'Times New Roman', 'Times', 'Courier New', 'Courier',
      'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
      'Trebuchet MS', 'Arial Black', 'Impact',
      // 中文字体
      'Microsoft YaHei', '微软雅黑', 'SimSun', '宋体', 'SimHei', '黑体', 
      'KaiTi', '楷体', 'FangSong', '仿宋', 'PingFang SC', 'Hiragino Sans GB',
      'STHeiti', 'STKaiti', 'STSong', 'STFangsong',
      // macOS 字体
      'San Francisco', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Avenir', 
      'Menlo', 'Monaco', 'Lucida Grande', 'Apple Color Emoji',
      // Windows 字体
      'Segoe UI', 'Tahoma', 'Calibri', 'Consolas', 'Cambria', 'Arial Unicode MS',
      // 网络字体常见选择
      'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro', 'Noto Sans'
    ];

    console.log('开始检测可用字体...');
    const availableFonts = testFonts.filter(font => {
      const isAvailable = isFontAvailable(font);
      if (isAvailable) {
        console.log('✓ 字体可用:', font);
      }
      return isAvailable;
    });
    
    console.log('检测完成，可用字体数量:', availableFonts.length);
    return availableFonts;
  };

  // 检测字体是否可用
  const isFontAvailable = (fontName: string): boolean => {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return false;

      // 使用更具区分性的测试字符串
      const testString = 'abcdefghijklmnopqrstuvwxyz0123456789';
      const testSize = '12px';
      const fallbackFonts = ['serif', 'sans-serif', 'monospace'];

      // 测试每个fallback字体
      const measurements = fallbackFonts.map(fallback => {
        context.font = `${testSize} ${fallback}`;
        return context.measureText(testString).width;
      });

      // 测试目标字体 + fallback
      const targetMeasurements = fallbackFonts.map(fallback => {
        context.font = `${testSize} "${fontName}", ${fallback}`;
        return context.measureText(testString).width;
      });

      // 如果任何一个测量值不同，说明字体存在
      return measurements.some((width, index) => 
        Math.abs(width - targetMeasurements[index]) > 0.1
      );
    } catch (error) {
      console.warn(`字体检测失败 ${fontName}:`, error);
      return false;
    }
  };

  // 截断长字体名称用于显示
  const truncateFontName = (fontName: string, maxLength: number = 20): string => {
    if (fontName.length <= maxLength) {
      return fontName;
    }
    return fontName.substring(0, maxLength - 3) + '...';
  };

  // 初始化时检查系统主题偏好和设置
  useEffect(() => {
    // 获取系统字体
    const loadSystemFonts = async () => {
      try {
        console.log('开始获取系统字体...');
        const systemFonts = await getSystemFonts();
        console.log('获取到的字体列表:', systemFonts);
        if (systemFonts.length > 0) {
          setAvailableFonts(systemFonts);
          console.log('字体列表已更新，共', systemFonts.length, '个字体');
        }
      } catch (error) {
        console.warn('加载系统字体失败，使用默认字体列表:', error);
      }
    };
    
    loadSystemFonts();
    loadIconsFromPublic(); // 加载图标列表
    loadExamplesFromPublic(); // 加载示例图片列表

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
      const parsedSettings = JSON.parse(savedSettings);
      // 兼容旧版本设置
      if (parsedSettings.apiKey && parsedSettings.serialNumber) {
        // 迁移旧设置到新格式
        const migratedSettings = {
          devices: [{
            id: '1',
            apiKey: parsedSettings.apiKey,
            serialNumber: parsedSettings.serialNumber,
            nickname: ''
          }],
          selectedDeviceId: '1'
        };
        setSettings(migratedSettings);
        localStorage.setItem('appSettings', JSON.stringify(migratedSettings));
      } else if (parsedSettings.devices && parsedSettings.devices.length > 0) {
        // 使用新格式设置
        setSettings(parsedSettings);
      } else {
        // 创建默认设备
        const defaultSettings = {
          devices: [{
            id: '1',
            apiKey: '',
            serialNumber: '',
            nickname: ''
          }],
          selectedDeviceId: '1'
        };
        setSettings(defaultSettings);
      }
    } else {
      // 创建默认设备
      const defaultSettings = {
        devices: [{
          id: '1',
          apiKey: '',
          serialNumber: '',
          nickname: ''
        }],
        selectedDeviceId: '1'
      };
      setSettings(defaultSettings);
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

  // 当制图配置改变时，自动更新预览
  useEffect(() => {
    updateTextToImagePreview();
  }, [textToImageConfig]);

  // 当算法改变时，如果已有处理后的图片，自动重新处理（只在非用户主动切换时触发）
  useEffect(() => {
    // 这个useEffect现在主要用于其他场景的自动更新，算法按钮点击时会直接调用handleAlgorithmChange
  }, [selectedAlgorithm]);

  // 处理点击外部区域关闭设备选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.device-selector-container')) {
        setShowDeviceSelector(false);
      }
    };

    if (showDeviceSelector) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDeviceSelector]);

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

  // 生成制图
  const generateTextToImage = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    canvas.width = 296;
    canvas.height = 152;
    
    // 设置背景
    if (textToImageConfig.backgroundImage) {
      // 如果有背景图片，绘制背景图片
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 296, 152);
        drawTexts(ctx);
        const newPreview = canvas.toDataURL('image/png');
        setTextToImagePreview(newPreview);
      };
      img.src = textToImageConfig.backgroundImage;
      return textToImagePreview; // 返回当前预览，等待图片加载完成后更新
    } else {
      // 使用纯色背景
      ctx.fillStyle = textToImageConfig.backgroundColor === 'black' ? '#000000' : 
                     textToImageConfig.backgroundColor === 'white' ? '#ffffff' : '#808080';
      ctx.fillRect(0, 0, 296, 152);
    }
    
    drawTexts(ctx);
    return canvas.toDataURL('image/png');
  };

  // 绘制文本的辅助函数
  const drawTexts = (ctx: CanvasRenderingContext2D) => {
    textToImageConfig.texts.forEach(text => {
      ctx.save();
      
      // 设置字体
      ctx.font = `${text.fontWeight} ${text.fontSize}px ${text.fontFamily}`;
      ctx.fillStyle = text.color === 'black' ? '#000000' : text.color === 'white' ? '#ffffff' : '#808080';
      ctx.textAlign = text.textAlign;
      
      // 移动到指定位置并旋转
      ctx.translate(text.x, text.y);
      ctx.rotate((text.rotation * Math.PI) / 180);
      
      // 绘制文本
      ctx.fillText(text.content, 0, 0);
      
      ctx.restore();
    });
  };

  // 更新制图预览
  const updateTextToImagePreview = () => {
    const preview = generateTextToImage();
    setTextToImagePreview(preview);
  };

  // 添加文本
  const addText = () => {
    const newText = {
      id: Date.now().toString(),
      content: "新文本",
      x: 148, // 中心位置
      y: 76,  // 中心位置
      fontSize: 16,
      rotation: 0,
      fontWeight: "normal" as "normal" | "bold",
      textAlign: "center" as "left" | "center" | "right",
      color: (textToImageConfig.backgroundColor === "white" ? "black" : "white") as "white" | "black" | "gray",
      fontFamily: availableFonts[0] || "Arial"
    };
    setTextToImageConfig({
      ...textToImageConfig,
      texts: [...textToImageConfig.texts, newText]
    });
  };

  // 删除文本
  const removeText = (id: string) => {
    setTextToImageConfig({
      ...textToImageConfig,
      texts: textToImageConfig.texts.filter(text => text.id !== id)
    });
  };

  // 更新文本
  const updateText = (id: string, updates: Partial<typeof textToImageConfig.texts[0]>) => {
    setTextToImageConfig({
      ...textToImageConfig,
      texts: textToImageConfig.texts.map(text =>
        text.id === id ? { ...text, ...updates } : text
      )
    });
  };

  // 处理背景图片上传
  const handleBackgroundImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result as string;
        try {
          // 调整背景图片尺寸为296x152
          const resizedImage = await resizeImageTo296x152(result);
          setTextToImageConfig({
            ...textToImageConfig,
            backgroundImage: resizedImage
          });
        } catch (error) {
          console.error('背景图片处理失败:', error);
          // 如果调整失败，使用原图
          setTextToImageConfig({
            ...textToImageConfig,
            backgroundImage: result
          });
        }
      };
      reader.onerror = () => {
        console.error('背景图片读取失败');
      };
      reader.readAsDataURL(file);
    }
  };

  // 清除背景图片
  const clearBackgroundImage = () => {
    setTextToImageConfig({
      ...textToImageConfig,
      backgroundImage: null
    });
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

  // 获取当前选择的设备
  const getCurrentDevice = () => {
    return settings.devices.find(device => device.id === settings.selectedDeviceId) || settings.devices[0];
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

  // 示例图标数据 - 40×40图标（从public/icons目录加载）
  const [exampleIcons, setExampleIcons] = useState<Array<{
    id: string;
    name: string;
    path: string;
  }>>([]);

  // 生成示例图片显示名称
  const generateExampleName = (filename: string): string => {
    // 移除文件扩展名和尺寸后缀
    const nameWithoutExt = filename.replace(/\.(png|jpg|jpeg|gif|svg)$/i, '');
    const nameWithoutSize = nameWithoutExt.replace(/_\d+x\d+$/, '');
    
    // 示例图片名称映射
    const exampleNameMap: { [key: string]: string } = {
      'template_1': '模板样式1',
      'template_2': '模板样式2',
      'template_3': '模板样式3',
      'temolate_4': '模板样式4', // 保持原有的拼写错误以匹配文件名
      'template_5': '模板样式5',
      'template_6': '模板样式6',
      'template_7': '模板样式7',
      'sample-296x152-text': '文字内容',
      'sample-296x152-landscape': '风景图片',
      'gray_296x152': '灰度测试',
      'dithered_floyd_steinberg_296x152': '误差扩散',
      'dithered_ordered_296x152': '有序抖动',
      'dithered_random_296x152': '随机抖动'
    };
    
    // 处理emoji文件名
    if (nameWithoutSize.startsWith('emoji_')) {
      const emojiNumber = nameWithoutSize.replace('emoji_', '');
      return `表情符号 ${emojiNumber}`;
    }
    
    return exampleNameMap[nameWithoutSize] || nameWithoutSize;
  };

  // 加载public/examples目录下的示例图片
  const loadExamplesFromPublic = async () => {
    try {
      // 获取public/examples目录下的所有图片文件
      const exampleFilenames = [
        // 模板文件
        'template_1.png', 'template_2.png', 'template_3.png', 'temolate_4.png',
        'template_5.jpg', 'template_6.jpg', 'template_7.jpg',
        // 示例图片
        'sample-296x152-text.png', 'sample-296x152-landscape.png', 'gray_296x152.png',
        // 抖动处理示例
        'dithered_floyd_steinberg_296x152.png', 'dithered_ordered_296x152.png', 'dithered_random_296x152.png',
        // Emoji 表情符号 (1-62)
        'emoji_1.png', 'emoji_2.png', 'emoji_3.png', 'emoji_4.png', 'emoji_5.png',
        'emoji_6.png', 'emoji_7.png', 'emoji_8.png', 'emoji_9.png', 'emoji_10.png',
        'emoji_11.png', 'emoji_12.png', 'emoji_13.png', 'emoji_14.png', 'emoji_15.png',
        'emoji_16.png', 'emoji_17.png', 'emoji_18.png', 'emoji_19.png', 'emoji_20.png',
        'emoji_21.png', 'emoji_22.png', 'emoji_23.png', 'emoji_24.png', 'emoji_25.png',
        'emoji_26.png', 'emoji_27.png', 'emoji_28.png', 'emoji_29.png', 'emoji_30.png',
        'emoji_31.png', 'emoji_32.png', 'emoji_33.png', 'emoji_34.png', 'emoji_35.png',
        'emoji_36.png', 'emoji_37.png', 'emoji_38.png', 'emoji_39.png', 'emoji_40.png',
        'emoji_41.png', 'emoji_42.png', 'emoji_43.png', 'emoji_44.png', 'emoji_45.png',
        'emoji_46.png', 'emoji_47.png', 'emoji_48.png', 'emoji_49.png', 'emoji_50.png',
        'emoji_51.png', 'emoji_52.png', 'emoji_53.png', 'emoji_54.png', 'emoji_55.png',
        'emoji_56.png', 'emoji_57.png', 'emoji_58.png', 'emoji_59.png', 'emoji_60.png',
        'emoji_61.png', 'emoji_62.png'
      ];

      const examples = exampleFilenames.map((filename, index) => {
        if (filename.startsWith('emoji_')) {
          // 对于emoji文件名，直接使用数字作为名称
          return {
            id: `emoji_${index + 1}`,
            name: `表情符号 ${filename.replace('emoji_', '')}`,
            size: '296×152',
            preview: `/examples/${filename}`
          };
        }
        // 对于其他文件名，使用生成的名称
        return {
          id: `example_${index + 1}`,
          name: generateExampleName(filename),
          size: '296×152',
          preview: `/examples/${filename}`
        };
      });

      setExampleImages(examples);
    } catch (error) {
      console.error('加载示例图片列表失败:', error);
    }
  };
  const generateIconName = (filename: string): string => {
    // 移除文件扩展名和尺寸后缀
    const nameWithoutExt = filename.replace(/\.(png|jpg|jpeg|gif|svg)$/i, '');
    const nameWithoutSize = nameWithoutExt.replace(/_\d+x\d+$/, '');
    
    // 图标名称映射
    const iconNameMap: { [key: string]: string } = {
      'add': '添加',
      'alarm': '闹钟',
      'bookmark': '书签',
      'business': '商务',
      'camera': '相机',
      'cancel': '取消',
      'chat': '聊天',
      'check': '确认',
      'cloud': '云端',
      'dashboard': '仪表板',
      'delete': '删除',
      'download': '下载',
      'edit': '编辑',
      'email': '邮件',
      'error': '错误',
      'help': '帮助',
      'home': '主页',
      'info': '信息',
      'link': '链接',
      'lock': '锁定',
      'map': '地图',
      'menu': '菜单',
      'pause': '暂停',
      'phone': '电话',
      'print': '打印',
      'refresh': '刷新',
      'restaurant': '餐厅',
      'save': '保存',
      'school': '学校',
      'search': '搜索',
      'settings': '设置',
      'share': '分享',
      'star': '星标',
      'stop': '停止',
      'today': '今天',
      'upload': '上传',
      'work': '工作',
      'sample-icon': '示例图标',
      'sample-pattern': '示例图案'
    };
    
    return iconNameMap[nameWithoutSize] || nameWithoutSize;
  };

  // 加载public/icons目录下的图标
  const loadIconsFromPublic = async () => {
    try {
      // 获取public/icons目录下的所有PNG文件
      const iconFilenames = [
        'add_40x40.png', 'alarm_40x40.png', 'bookmark_40x40.png', 'business_40x40.png',
        'camera_40x40.png', 'cancel_40x40.png', 'chat_40x40.png', 'check_40x40.png',
        'cloud_40x40.png', 'dashboard_40x40.png', 'delete_40x40.png', 'download_40x40.png',
        'edit_40x40.png', 'email_40x40.png', 'error_40x40.png', 'help_40x40.png',
        'home_40x40.png', 'info_40x40.png', 'link_40x40.png', 'lock_40x40.png',
        'map_40x40.png', 'menu_40x40.png', 'pause_40x40.png', 'phone_40x40.png',
        'print_40x40.png', 'refresh_40x40.png', 'restaurant_40x40.png', 'save_40x40.png',
        'school_40x40.png', 'search_40x40.png', 'settings_40x40.png', 'share_40x40.png',
        'star_40x40.png', 'stop_40x40.png', 'today_40x40.png', 'upload_40x40.png',
        'work_40x40.png', 'sample-40x40-icon.png'
      ];

      const icons = iconFilenames.map((filename, index) => ({
        id: `icon_${index + 1}`,
        name: generateIconName(filename),
        path: `/icons/${filename}`
      }));

      setExampleIcons(icons);
    } catch (error) {
      console.error('加载图标列表失败:', error);
    }
  };

  // 示例图片数据 - 从public/examples目录动态加载
  const [exampleImages, setExampleImages] = useState<Array<{
    id: string;
    name: string;
    size: string;
    preview: string;
  }>>([]);

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
  const copyIconBase64 = async (icon: { id: string; name: string; path: string }) => {
    try {
      showToast('正在转换图标...', 'info');
      
      // 通过fetch获取文件
      const response = await fetch(icon.path);
      if (!response.ok) {
        throw new Error('无法加载图标文件');
      }
      
      const blob = await response.blob();
      const file = new File([blob], `${icon.name}.png`, { type: blob.type });
      
      // 使用FileReader转换为base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = event.target?.result as string;
        // 去掉data:image前缀，只保留纯base64数据
        const base64Data = result.includes(',') ? result.split(',')[1] : result;
        
        console.log('转换完成，base64数据长度:', base64Data.length);
        
        // 清除"正在转换"的 toast
        clearToastsByKeyword('正在转换图标');
        
        // 尝试使用 Tauri 剪贴板管理器复制
        try {
          // 导入 Tauri 剪贴板管理器
          const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
          await writeText(base64Data);
          console.log('使用 Tauri clipboard-manager 复制成功');
          showToast(`已复制 ${icon.name} 的Base64数据！`, 'success');
        } catch (tauriError) {
          console.error('Tauri clipboard-manager 失败:', tauriError);
          
          // 回退到浏览器剪贴板API
          try {
            if (navigator.clipboard && window.isSecureContext) {
              await navigator.clipboard.writeText(base64Data);
              console.log('使用 navigator.clipboard 复制成功');
              showToast(`已复制 ${icon.name} 的Base64数据！`, 'success');
            } else {
              // 最终回退：输出到控制台
              console.log('Base64数据:', base64Data);
              showToast('Tauri剪贴板功能不可用，Base64数据已输出到控制台，请打开开发者工具查看', 'info');
            }
          } catch (fallbackError) {
            console.error('所有剪贴板方法都失败:', fallbackError);
            console.log('Base64数据:', base64Data);
            showToast('复制失败，Base64数据已输出到控制台，请打开开发者工具查看', 'info');
          }
        }
      };
      
      reader.onerror = () => {
        clearToastsByKeyword('正在转换图标');
        showToast('文件读取失败', 'error');
      };
      
      reader.readAsDataURL(file);
      
    } catch (error) {
      console.error('图标转换失败:', error);
      clearToastsByKeyword('正在转换图标');
      showToast(`转换失败：${error}`, 'error');
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

      {/* 设备选择按钮 - 左侧悬浮 */}
      {settings.devices.length > 0 && (
        <div className={`device-selector-container ${showDeviceSelector ? 'open' : ''}`}>
          <button 
            className="device-selector-button"
            onClick={() => setShowDeviceSelector(!showDeviceSelector)}
            title="选择设备"
          >
            {(() => {
              const currentDevice = getCurrentDevice();
              return currentDevice ? 
                (currentDevice.nickname || currentDevice.serialNumber || `设备 ${currentDevice.id.slice(-4)}`) :
                '选择设备';
            })()}
          </button>
          
          {showDeviceSelector && (
            <div className="device-dropdown-menu">
              {settings.devices.map((device) => (
                <div 
                  key={device.id} 
                  className={`device-dropdown-item ${device.id === settings.selectedDeviceId ? 'selected' : ''}`}
                  onClick={() => {
                    setSettings({...settings, selectedDeviceId: device.id});
                    setShowDeviceSelector(false);
                  }}
                >
                  {device.nickname || device.serialNumber || `设备 ${device.id.slice(-4)}`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                    onClick={() => copyIconBase64(icon)}
                  >
                    <div className="example-icon-preview">
                      <img 
                        src={icon.path} 
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
          <div className="modal-content devices-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>设备管理</h3>
            </div>
            <div className="modal-body">
              <div className="devices-list">
                {settings.devices.map((device, index) => (
                  <div key={device.id} className="device-item">
                    <div className="device-header">
                      <h4>设备 {index + 1}</h4>
                      <button 
                        className="delete-device-btn"
                        onClick={() => {
                          const newDevices = settings.devices.filter(d => d.id !== device.id);
                          const newSettings = {
                            ...settings,
                            devices: newDevices,
                            selectedDeviceId: settings.selectedDeviceId === device.id 
                              ? (newDevices.length > 0 ? newDevices[0].id : "")
                              : settings.selectedDeviceId
                          };
                          setSettings(newSettings);
                        }}
                        disabled={settings.devices.length <= 1}
                      >
                        删除
                      </button>
                    </div>
                    <div className="setting-item device-name-id-row">
                      <div className="setting-input-group">
                        <label>设备备注:</label>
                        <input
                          type="text"
                          value={device.nickname}
                          onChange={(e) => {
                            const newDevices = settings.devices.map(d => 
                              d.id === device.id ? {...d, nickname: e.target.value} : d
                            );
                            setSettings({...settings, devices: newDevices});
                          }}
                          placeholder="设备备注（可选）"
                        />
                      </div>
                      <div className="setting-input-group">
                        <label>设备ID:</label>
                        <input
                          type="text"
                          value={device.serialNumber}
                          onChange={(e) => {
                            const newDevices = settings.devices.map(d => 
                              d.id === device.id ? {...d, serialNumber: e.target.value} : d
                            );
                            setSettings({...settings, devices: newDevices});
                          }}
                          placeholder="输入设备ID"
                        />
                      </div>
                    </div>
                    <div className="setting-item">
                      <label>API密钥:</label>
                      <input
                        type="password"
                        value={device.apiKey}
                        onChange={(e) => {
                          const newDevices = settings.devices.map(d => 
                            d.id === device.id ? {...d, apiKey: e.target.value} : d
                          );
                          setSettings({...settings, devices: newDevices});
                        }}
                        placeholder="输入API密钥"
                        title={device.apiKey || "输入API密钥"}
                      />
                    </div>
                  </div>
                ))}
                
                <button 
                  className="add-device-btn"
                  onClick={() => {
                    const newDevice = {
                      id: Date.now().toString(),
                      apiKey: "",
                      serialNumber: "",
                      nickname: ""
                    };
                    setSettings({
                      ...settings,
                      devices: [...settings.devices, newDevice],
                      selectedDeviceId: settings.selectedDeviceId || newDevice.id
                    });
                  }}
                >
                  + 添加设备
                </button>
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
          <button 
            className={`tab-button ${activeTab === 'text-to-image' ? 'active' : ''}`}
            onClick={() => setActiveTab('text-to-image')}
          >
            制图
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
                    
                    // 获取当前选择的设备
                    const currentDevice = getCurrentDevice();
                    if (!currentDevice || !currentDevice.apiKey || !currentDevice.serialNumber) {
                      showToast('请先配置API密钥和设备ID', 'error');
                      return;
                    }

                    try {
                      showToast('正在发送...', 'info');
                      
                      // 调用Rust函数发送到API
                      const result = await invoke('send_text_to_api', {
                        apiKey: currentDevice.apiKey,
                        deviceId: currentDevice.serialNumber,
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
          ) : activeTab === 'image' ? (
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
                      
                      // 获取当前选择的设备
                      const currentDevice = getCurrentDevice();
                      if (!currentDevice || !currentDevice.apiKey || !currentDevice.serialNumber) {
                        showToast('请先配置API密钥和设备ID', 'error');
                        return;
                      }

                      try {
                        if (selectedAlgorithm === 'original') {
                          showToast('正在发送原始图片...', 'info');
                          // 如果选择原始图片，先调整尺寸然后发送
                          const resizedImageData = await resizeImageTo296x152(imagePreview);
                          const result = await invoke('send_image_to_api', {
                            apiKey: currentDevice.apiKey,
                            deviceId: currentDevice.serialNumber,
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
                            apiKey: currentDevice.apiKey,
                            deviceId: currentDevice.serialNumber,
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
          ) : (
            <div className="text-to-image-page">
              <h2>通过图片API更新你的dot.</h2>
              
              {/* 图片预览框 */}
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
                    <img 
                      src={textToImagePreview} 
                      alt="制图预览" 
                      className="preview-image"
                    />
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

              {/* 配置区域 */}
              <div className="config-section">
                <h3>配置预览内容</h3>
                <div className="text-to-image-config-layout">
                  {/* 基础配置 */}
                  <div className="config-basic">
                    <div className="config-item">
                      <label>背景颜色:</label>
                      <div className="background-color-options">
                        <button 
                          className={`color-button ${textToImageConfig.backgroundColor === 'white' ? 'selected' : ''}`}
                          onClick={() => {
                            setTextToImageConfig({...textToImageConfig, backgroundColor: 'white'});
                          }}
                          style={{ backgroundColor: 'white', color: 'black' }}
                        >
                          白色
                        </button>
                        <button 
                          className={`color-button ${textToImageConfig.backgroundColor === 'black' ? 'selected' : ''}`}
                          onClick={() => {
                            setTextToImageConfig({...textToImageConfig, backgroundColor: 'black'});
                          }}
                          style={{ backgroundColor: 'black', color: 'white' }}
                        >
                          黑色
                        </button>
                        <button 
                          className={`color-button ${textToImageConfig.backgroundColor === 'gray' ? 'selected' : ''}`}
                          onClick={() => {
                            setTextToImageConfig({...textToImageConfig, backgroundColor: 'gray'});
                          }}
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
                        onChange={(e) => setTextToImageConfig({...textToImageConfig, link: e.target.value})}
                        placeholder="输入跳转链接（可选）"
                      />
                    </div>
                  </div>
                  
                  {/* 文本配置 */}
                  <div className="text-config-section">
                    <div className="text-config-header">
                      <h4>文本配置</h4>
                      <button className="add-text-button" onClick={addText}>
                        + 添加文本
                      </button>
                    </div>
                    
                    <div className={`text-items-container ${textToImageConfig.texts.length > 0 ? 'has-text-items' : ''}`}>
                      {textToImageConfig.texts.length === 0 ? (
                        <div className="no-text-placeholder">
                          <p>暂无文本，点击"添加文本"开始创建</p>
                        </div>
                      ) : (
                        textToImageConfig.texts.map((text, index) => (
                          <div key={text.id} className="text-item">
                            <div className="text-item-header">
                              <span className="text-item-title">文本 {index + 1}</span>
                              <button 
                                className="remove-text-button"
                                onClick={() => removeText(text.id)}
                              >
                                删除
                              </button>
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
                                    min="0"
                                    max="296"
                                  />
                                </div>
                                <div className="config-item number-input">
                                  <label>Y位置:</label>
                                  <input
                                    type="number"
                                    value={text.y}
                                    onChange={(e) => updateText(text.id, { y: parseInt(e.target.value) || 0 })}
                                    min="0"
                                    max="152"
                                  />
                                </div>
                                <div className="config-item number-input">
                                  <label>字体大小:</label>
                                  <input
                                    type="number"
                                    value={text.fontSize}
                                    onChange={(e) => updateText(text.id, { fontSize: parseInt(e.target.value) || 12 })}
                                    min="8"
                                    max="144"
                                  />
                                </div>
                                <div className="config-item number-input">
                                  <label>旋转角度:</label>
                                  <input
                                    type="number"
                                    value={text.rotation}
                                    onChange={(e) => updateText(text.id, { rotation: parseInt(e.target.value) || 0 })}
                                    min="-360"
                                    max="360"
                                  />
                                </div>
                                <div className="config-item select-input">
                                  <label>粗细:</label>
                                  <select
                                    value={text.fontWeight}
                                    onChange={(e) => updateText(text.id, { fontWeight: e.target.value as "normal" | "bold" })}
                                  >
                                    <option value="normal">常规</option>
                                    <option value="bold">粗体</option>
                                  </select>
                                </div>
                                <div className="config-item select-input">
                                  <label>对齐:</label>
                                  <select
                                    value={text.textAlign}
                                    onChange={(e) => updateText(text.id, { textAlign: e.target.value as "left" | "center" | "right" })}
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
                                    onChange={(e) => updateText(text.id, { color: e.target.value as "white" | "black" | "gray" })}
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
                                    title={text.fontFamily} // 添加tooltip显示完整字体名称
                                    disabled={availableFonts.length === 0}
                                  >
                                    {availableFonts.length === 0 ? (
                                      <option value="">加载字体中...</option>
                                    ) : (
                                      availableFonts.map(font => (
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

              {/* 操作按钮 */}
              <div className="action-buttons-container">
                <button 
                  className="action-button export-button"
                  onClick={async () => {
                    if (textToImagePreview) {
                      try {
                        showToast('正在导出图片...', 'info');
                        
                        // 生成文件名
                        const now = new Date();
                        const dateStr = now.getFullYear() + '-' + 
                                       String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                                       String(now.getDate()).padStart(2, '0');
                        const timeStr = String(now.getHours()).padStart(2, '0') + '-' + 
                                       String(now.getMinutes()).padStart(2, '0') + '-' + 
                                       String(now.getSeconds()).padStart(2, '0');
                        const filename = `text-to-image-296x152-${dateStr}_${timeStr}.png`;
                        
                        // 调用Tauri命令保存图片到下载目录
                        const savedPath = await invoke('save_image_to_downloads', {
                          imageData: textToImagePreview,
                          filename: filename
                        });
                        
                        clearToastsByKeyword('正在导出图片');
                        setTimeout(() => {
                          showToast(`导出成功！已保存为 ${filename}`, 'success');
                        }, 50);
                        console.log('导出成功:', { filename, savedPath, type: 'text-to-image', size: '296x152' });
                      } catch (error) {
                        console.error('导出失败:', error);
                        clearToastsByKeyword('正在导出图片');
                        setTimeout(() => {
                          showToast(`导出失败：${error}`, 'error');
                        }, 50);
                      }
                    } else {
                      showToast('请先配置文本内容', 'error');
                    }
                  }}
                  disabled={!textToImagePreview || textToImageConfig.texts.length === 0}
                >
                  导出
                </button>
                <button 
                  className="action-button send-button"
                  onClick={async () => {
                    if (textToImagePreview && textToImageConfig.texts.length > 0) {
                      console.log('发送制图:', { textToImageConfig, textToImagePreview });
                      
                      // 获取当前选择的设备
                      const currentDevice = getCurrentDevice();
                      if (!currentDevice || !currentDevice.apiKey || !currentDevice.serialNumber) {
                        showToast('请先配置API密钥和设备ID', 'error');
                        return;
                      }

                      try {
                        showToast('正在发送制图...', 'info');
                        
                        // 调用Rust函数发送到API
                        const result = await invoke('send_image_to_api', {
                          apiKey: currentDevice.apiKey,
                          deviceId: currentDevice.serialNumber,
                          imageData: textToImagePreview,
                          link: textToImageConfig.link.trim() || null
                        });
                        
                        console.log('API响应:', result);
                        clearToastsByKeyword('正在发送制图');
                        setTimeout(() => {
                          showToast('制图发送成功！(296×152)', 'success');
                        }, 50);
                        
                      } catch (error) {
                        console.error('发送失败:', error);
                        clearToastsByKeyword('正在发送制图');
                        setTimeout(() => {
                          showToast(`发送失败：${error}`, 'error');
                        }, 50);
                      }
                    } else {
                      showToast('请先配置文本内容', 'error');
                    }
                  }}
                  disabled={!textToImagePreview || textToImageConfig.texts.length === 0}
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
