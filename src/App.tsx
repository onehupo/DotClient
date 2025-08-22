import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./styles/index.css";
import AutomationTab from "./components/tabs/AutomationTab";
// New split tab components
import TextTab from "./components/tabs/TextTab";
import ImageTab from "./components/tabs/ImageTab";
import TextToImageTab from "./components/tabs/TextToImageTab";
// New modal components
import ExampleIconsModal from "./components/modals/ExampleIconsModal";
import ExamplesModal from "./components/modals/ExamplesModal";
import TemplatesModal from "./components/modals/TemplatesModal";
import ToolsModal from "./components/modals/ToolsModal";
import DevicesModal from "./components/modals/DevicesModal";
import MacrosHelpModal from "./components/modals/MacrosHelpModal";
import { useToast } from "./components/common/ToastProvider";
import { resizeImageTo296x152, generateTemplate as generateTemplateImage } from './utils/image';
import { getSystemFonts, truncateFontName } from './utils/fonts';
import { generateExampleName, generateIconName } from './utils/names';
import type { Settings, TextToImageConfig } from './types';

function App() {
  const { showToast, clearToastsByKeyword } = useToast();
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
  const [textToImageConfig, setTextToImageConfig] = useState<TextToImageConfig>({
    backgroundColor: "white",
    backgroundImage: null,
    texts: [],
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
  const [settings, setSettings] = useState<Settings>({
    devices: [],
    selectedDeviceId: ""
  });
  const [showTools, setShowTools] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [showExampleIcons, setShowExampleIcons] = useState(false);
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [showMacrosHelp, setShowMacrosHelp] = useState(false);
  const hasShownRestoreToast = useRef(false); // 跟踪是否已显示过恢复提示
  const hasLoadedTextConfig = useRef(false); // 跟踪是否已加载过文本配置
  // Toasts moved to ToastProvider

  // font utilities moved to utils/fonts

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

    // 注释掉自动启动后台任务，改为在创建第一个任务时启动
    // const startAutomationBackgroundTasks = async () => {
    //   try {
    //     await invoke('automation_start_background_tasks');
    //     console.log('自动化后台任务已启动');
    //   } catch (error) {
    //     console.warn('启动自动化后台任务失败:', error);
    //   }
    // };
    // 
    // startAutomationBackgroundTasks();

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

  // 当制图配置改变时，自动更新预览和保存配置
  useEffect(() => {
    updateTextToImagePreview();
    
    // 使用防抖来减少频繁的localStorage写入
    const saveTimeout = setTimeout(() => {
      localStorage.setItem('textToImageConfig', JSON.stringify(textToImageConfig));
    }, 500); // 500ms防抖
    
    return () => clearTimeout(saveTimeout);
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

  // 当切换到text-to-image tab时，加载保存的配置
  useEffect(() => {
    console.log('Tab changed to:', activeTab, 'hasLoadedTextConfig:', hasLoadedTextConfig.current);
    
    if (activeTab === 'text-to-image' && !hasLoadedTextConfig.current) {
      hasLoadedTextConfig.current = true;
      
      console.log('开始加载制图配置...');
      const savedTextToImageConfig = localStorage.getItem('textToImageConfig');
      console.log('localStorage中的配置:', savedTextToImageConfig);
      
      if (savedTextToImageConfig) {
        try {
          const parsedConfig = JSON.parse(savedTextToImageConfig);
          console.log('解析后的配置:', parsedConfig);
          
          // 验证配置格式是否有效
          if (parsedConfig && typeof parsedConfig === 'object') {
            // 确保必要的字段存在
            const validatedConfig = {
              backgroundColor: parsedConfig.backgroundColor || "white",
              backgroundImage: parsedConfig.backgroundImage || null,
              texts: Array.isArray(parsedConfig.texts) ? parsedConfig.texts : [],
              link: parsedConfig.link || ""
            };
            
            setTextToImageConfig(validatedConfig);
            console.log('已加载保存的制图配置:', validatedConfig);
            
            // 如果有内容，显示提示（防止重复显示）
            if ((validatedConfig.texts.length > 0 || validatedConfig.backgroundImage || validatedConfig.link) && !hasShownRestoreToast.current) {
              hasShownRestoreToast.current = true;
              setTimeout(() => {
                showToast('已恢复上次的制图配置', 'info');
              }, 500); // 缩短延迟，因为用户主动切换到此tab
            }
          } else {
            throw new Error('配置格式无效');
          }
        } catch (error) {
          console.warn('加载制图配置失败，使用默认配置:', error);
          // 清除损坏的配置
          localStorage.removeItem('textToImageConfig');
        }
      } else {
        console.log('localStorage中没有保存的制图配置');
      }
    }
  }, [activeTab]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // showToast, clearToastsByKeyword come from provider

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

  const openMacrosHelp = () => {
    // 关闭其他弹窗
    setShowExamples(false);
    setShowTemplates(false);
    setShowSettings(false);
    setShowTools(false);
    setShowExampleIcons(false);
    setShowMacrosHelp(true);
  };

  const closeMacrosHelp = () => setShowMacrosHelp(false);

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

  // 清空制图配置
  const clearTextToImageConfig = () => {
    const defaultConfig = {
      backgroundColor: "white" as "white" | "black" | "gray",
      backgroundImage: null as string | null,
      texts: [],
      link: ""
    };
    setTextToImageConfig(defaultConfig);
    // 清除localStorage中的缓存
    localStorage.removeItem('textToImageConfig');
    showToast('已清空制图配置和缓存', 'success');
  };

  // 导出制图配置
  const exportTextToImageConfig = async () => {
    try {
      showToast('正在导出配置...', 'info');
      
      const configToExport = {
        ...textToImageConfig,
        exportTime: new Date().toISOString(),
        version: "1.0"
      };
      const dataStr = JSON.stringify(configToExport, null, 2);
      
      // 生成文件名
      const now = new Date();
      const dateStr = now.getFullYear() + '-' + 
                     String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(now.getDate()).padStart(2, '0');
      const timeStr = String(now.getHours()).padStart(2, '0') + '-' + 
                     String(now.getMinutes()).padStart(2, '0') + '-' + 
                     String(now.getSeconds()).padStart(2, '0');
      const filename = `text-to-image-config-${dateStr}_${timeStr}.json`;
      
      try {
        // 尝试使用Tauri的文件系统API保存到下载目录
        const savedPath = await invoke('save_text_to_downloads', {
          content: dataStr,
          filename: filename
        });
        
        clearToastsByKeyword('正在导出配置');
        showToast(`配置导出成功！已保存为 ${filename}`, 'success');
        console.log('配置导出成功:', { filename, savedPath });
      } catch (tauriError) {
        console.warn('Tauri保存失败，使用浏览器下载:', tauriError);
        
        // 回退到浏览器下载
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = filename;
        
        // 创建隐藏的链接并触发点击
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // 清理URL对象
        URL.revokeObjectURL(link.href);
        
        clearToastsByKeyword('正在导出配置');
        showToast('配置导出成功！', 'success');
      }
    } catch (error) {
      console.error('导出配置失败:', error);
      clearToastsByKeyword('正在导出配置');
      showToast(`导出配置失败：${error}`, 'error');
    }
  };

  // 导入制图配置
  const importTextToImageConfig = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const configText = event.target?.result as string;
            const importedConfig = JSON.parse(configText);
            
            // 验证配置格式
            if (importedConfig && typeof importedConfig === 'object') {
              // 提取有效的配置字段
              const validConfig = {
                backgroundColor: importedConfig.backgroundColor || "white",
                backgroundImage: importedConfig.backgroundImage || null,
                texts: Array.isArray(importedConfig.texts) ? importedConfig.texts : [],
                link: importedConfig.link || ""
              };
              
              setTextToImageConfig(validConfig);
              showToast('配置导入成功！', 'success');
            } else {
              throw new Error('配置格式无效');
            }
          } catch (error) {
            console.error('导入配置失败:', error);
            showToast('导入配置失败：文件格式无效', 'error');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // image utilities moved to utils/image

  // 导出模版图片
  const exportTemplate = async (width: number, height: number, color: 'black' | 'white') => {
    try {
      const templateData = generateTemplateImage(width, height, color);
      
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

  // 文本页面必填字段校验逻辑在使用处内联计算

  // 示例图标数据 - 40×40图标（从public/icons目录加载）
  const [exampleIcons, setExampleIcons] = useState<Array<{
    id: string;
    name: string;
    path: string;
  }>>([]);

  // 生成示例图片显示名称
  // 使用 utils/names.generateExampleName

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
  // 使用 utils/names.generateIconName

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
  {/* Toasts are rendered by ToastProvider */}

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

      {/* 宏替换说明按钮（在设置左侧） */}
      <button 
        className="macros-help-button"
        onClick={openMacrosHelp}
        title="宏替换说明"
      >
        🧩​
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
        <ExampleIconsModal icons={exampleIcons} onCopy={copyIconBase64} onClose={closeExampleIcons} />
      )}

      {/* 示例图片模态框 */}
      {showExamples && (
        <ExamplesModal examples={exampleImages} onSelect={selectExampleImage} onClose={closeExamples} />
      )}

      {/* 模版模态框 */}
      {showTemplates && (
        <TemplatesModal
          generateTemplate={generateTemplate}
          exportTemplate={exportTemplate}
          onClose={closeTemplates}
        />
      )}

      {/* 工具模态框 */}
      {showTools && (
        <ToolsModal showToast={showToast} onClose={closeTools} />
      )}

      {/* 设置模态框 */}
      {showSettings && (
        <DevicesModal
          settings={settings}
          setSettings={setSettings as any}
          onSave={saveSettings}
          onClose={closeSettings}
        />
      )}

      {/* 宏替换说明模态框 */}
      {showMacrosHelp && (
        <MacrosHelpModal onClose={closeMacrosHelp} />
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
          <button 
            className={`tab-button ${activeTab === 'automation' ? 'active' : ''}`}
            onClick={() => setActiveTab('automation')}
          >
            自动化
          </button>
        </div>
        
        <div className="tab-content">
          {activeTab === 'text' ? (
            <TextTab
              previewConfig={previewConfig}
              setPreviewConfig={(cfg) => setPreviewConfig(cfg)}
              isTextFormValid={!!(previewConfig.title.trim() && previewConfig.message.trim() && previewConfig.signature.trim())}
              getCurrentDevice={getCurrentDevice}
              showToast={showToast}
              clearToastsByKeyword={clearToastsByKeyword}
              invoke={invoke}
            />
          ) : activeTab === 'image' ? (
            <ImageTab
              imagePreview={imagePreview}
              processedImagePreview={processedImagePreview}
              setImagePreview={setImagePreview}
              setProcessedImagePreview={setProcessedImagePreview}
              imageConfig={imageConfig}
              setImageConfig={setImageConfig as any}
              base64Input={base64Input}
              handleFileSelect={handleFileSelect}
              handleBase64Input={handleBase64Input}
              selectedAlgorithm={selectedAlgorithm}
              handleAlgorithmChange={handleAlgorithmChange}
              resizeImageTo296x152={resizeImageTo296x152}
              getCurrentDevice={getCurrentDevice}
              showToast={showToast}
              clearToastsByKeyword={clearToastsByKeyword}
              invoke={invoke}
            />
          ) : activeTab === 'text-to-image' ? (
            <TextToImageTab
              textToImageConfig={textToImageConfig}
              setTextToImageConfig={(cfg) => setTextToImageConfig(cfg)}
              textToImagePreview={textToImagePreview}
              updateTextToImagePreview={updateTextToImagePreview}
              addText={addText}
              removeText={removeText}
              updateText={updateText}
              handleBackgroundImageUpload={handleBackgroundImageUpload}
              clearBackgroundImage={clearBackgroundImage}
              clearTextToImageConfig={clearTextToImageConfig}
              exportTextToImageConfig={exportTextToImageConfig}
              importTextToImageConfig={importTextToImageConfig}
              availableFonts={availableFonts}
              truncateFontName={truncateFontName}
              getCurrentDevice={getCurrentDevice}
              showToast={showToast}
              clearToastsByKeyword={clearToastsByKeyword}
              invoke={invoke}
            />
          ) : activeTab === 'automation' ? (
            <AutomationTab showToast={showToast} settings={settings} />
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default App;
