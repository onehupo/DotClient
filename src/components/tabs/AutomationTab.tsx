import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Settings } from '../../types';
import { resizeImageTo296x152 } from '../../utils/image';
import {
  loadLocalTasks,
  saveLocalTasks,
  loadAutomationEnabled as loadEnabledFromLocal,
  saveAutomationEnabled as saveEnabledToLocal,
} from '../../utils/automationStorage';

interface AutomationTask {
  id: string;
  name: string;
  task_type: 'text' | 'image' | 'text-to-image';
  enabled: boolean;
  schedule: string;
  device_ids: string[];
  config: any;
  last_run?: string;
  next_run?: string;
  run_count: number;
  error_count: number;
  created_at: string;
  updated_at: string;
  fixed_at?: string; // ISO
  interval_sec?: number; // 单一时间间隔（秒）
  // 前端可选持有：与后端同步的优先级与持续时间
  priority?: number;
  duration_sec?: number; // 持续时间（秒），默认 300
}

interface TaskExecutionLog {
  id: string;
  task_id: string;
  executed_at: string;
  success: boolean;
  error_message?: string;
  duration_ms: number;
}

interface AutomationTabProps {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  settings: Settings;
}

type ScheduleMode = 'cron' | 'fixed' | 'interval';

const genId = () =>
  (typeof crypto !== 'undefined' && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);

const getIconSrc = (icon?: string | null) => {
  if (!icon) return '';
  return icon.startsWith('data:') ? icon : `data:image/png;base64,${icon}`;
};

const resolveColor = (c?: string) => {
  if (!c) return '#ffffff';
  const v = c.toLowerCase();
  if (v === 'white' || v === '#fff' || v === '#ffffff') return '#ffffff';
  if (v === 'black' || v === '#000' || v === '#000000') return '#000000';
  if (v === 'gray' || v === 'grey' || v === '#808080') return '#808080';
  return c;
};

const normalizeTexts = (texts: any[]): Array<{
  content: string;
  x: number; y: number;
  fontSize: number;
  rotation: number;
  fontWeight: string;
  textAlign: CanvasTextAlign;
  color: string;
  fontFamily: string;
}> => {
  if (!Array.isArray(texts)) return [];
  return texts.map((t) => ({
    content: t.content ?? '',
    x: Number(t.x ?? t?.x) || 0,
    y: Number(t.y ?? t?.y) || 0,
    fontSize: Number(t.font_size ?? t.fontSize ?? 16),
    rotation: Number(t.rotation ?? 0),
    fontWeight: String(t.font_weight ?? t.fontWeight ?? 'normal'),
    textAlign: (t.text_align ?? t.textAlign ?? 'left') as CanvasTextAlign,
    color: String(t.color ?? 'black'),
    fontFamily: String(t.font_family ?? t.fontFamily ?? 'Arial'),
  }));
};

const normalizeTextElementForBackend = (t: any) => ({
  id: String(t?.id ?? genId()),
  content: String(t?.content ?? ''),
  x: Number(t?.x ?? 0),
  y: Number(t?.y ?? 0),
  font_size: Number(t?.font_size ?? t?.fontSize ?? 16),
  rotation: Number(t?.rotation ?? 0),
  font_weight: String(t?.font_weight ?? t?.fontWeight ?? 'normal'),
  text_align: String(t?.text_align ?? t?.textAlign ?? 'left'),
  color: String(t?.color ?? 'black'),
  font_family: String(t?.font_family ?? t?.fontFamily ?? 'Arial'),
});

const cronPresets = [
  { label: '每分钟', value: '* * * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每天 9:00', value: '0 9 * * *' },
  { label: '每天 18:00', value: '0 18 * * *' },
  { label: '工作日 9:00', value: '0 9 * * 1-5' },
  { label: '周末 10:00', value: '0 10 * * 0,6' },
  { label: '每周一 9:00', value: '0 9 * * 1' },
  { label: '每月1号 9:00', value: '0 9 1 * *' },
];

const getDefaultConfigFor = (type: 'text' | 'image' | 'text-to-image') => {
  switch (type) {
    case 'text':
      return { title: '', message: '', signature: '', icon: null, link: null };
    case 'image':
      return { image_data: '', algorithm: 'floyd_steinberg', link: null };
    case 'text-to-image':
      return { background_color: '#ffffff', background_image: null, texts: [], link: null };
    default:
      return {};
  }
};

const normalizeImportedConfig = (
  type: 'text' | 'image' | 'text-to-image',
  incoming: any
) => {
  if (!incoming || typeof incoming !== 'object') return getDefaultConfigFor(type);
  if (type === 'text') {
    return {
      title: incoming.title ?? '',
      message: incoming.message ?? '',
      signature: incoming.signature ?? '',
      icon: incoming.icon ?? null,
      link: incoming.link ?? null,
    };
  }
  if (type === 'image') {
    const img = incoming.image_data ?? incoming.image ?? '';
    return { image_data: img ?? '', algorithm: incoming.algorithm ?? 'floyd_steinberg', link: incoming.link ?? null };
  }
  if (type === 'text-to-image') {
    const textsRaw = Array.isArray(incoming.texts) ? incoming.texts : [];
    return {
      background_color: incoming.background_color ?? incoming.backgroundColor ?? '#ffffff',
      background_image: incoming.background_image ?? incoming.backgroundImage ?? null,
      texts: textsRaw.map(normalizeTextElementForBackend),
      link: incoming.link ?? null,
    };
  }
  return getDefaultConfigFor(type);
};

const AutomationTab: React.FC<AutomationTabProps> = ({ showToast, settings }) => {
  const [tasks, setTasks] = useState<AutomationTask[]>(loadLocalTasks<AutomationTask[]>());
  const [logs, setLogs] = useState<TaskExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [editingTask, setEditingTask] = useState<AutomationTask | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [automationEnabled, setAutomationEnabled] = useState(loadEnabledFromLocal(true));
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('cron');
  const [t2iPreview, setT2iPreview] = useState<string>('');
  const [t2iListPreviews, setT2iListPreviews] = useState<Record<string, string>>({});
  // 队列视图模式：表格 or 日程
  const [queueView, setQueueView] = useState<'table' | 'agenda'>('table');
  // 日程密度：影响每小时高度
  // 每小时高度（像素），用于控制日程视图刻度密度
  const [hourHeightPx, setHourHeightPx] = useState<number>(6400);
  // 日程视图滚动容器与居中控制
  const agendaScrollRef = useRef<HTMLDivElement | null>(null);
  const hasUserScrolledRef = useRef(false);
  const hasCenteredRef = useRef(false);
  // 表格视图滚动容器与居中控制
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableHasUserScrolledRef = useRef(false);
  const tableHasCenteredRef = useRef(false);
  // 自动居中开关
  const [autoCenterNow, setAutoCenterNow] = useState<boolean>(true);

  // 使“当前时间线”居中；当 force=false 时，仅在超出可视范围才居中
  const centerNow = (force = false) => {
    const el = agendaScrollRef.current;
    if (!el) return;
    const now = new Date();
    const nowMinLocal = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const minuteHeightLocal = Math.max(64, Math.min(12800, hourHeightPx)) / 60;
    const y = nowMinLocal * minuteHeightLocal;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    const margin = 24; // 超出此边距视为“离屏”
    const inView = y >= top + margin && y <= bottom - margin;
    if (force || !inView) {
      const target = Math.max(0, Math.min(y - el.clientHeight / 2, el.scrollHeight - el.clientHeight));
      try {
        el.scrollTo({ top: target, behavior: 'smooth' });
      } catch {
        el.scrollTop = target;
      }
    }
  };

  // 使“表格视图的当前时间分隔行”居中（使用相对滚动容器的几何计算，避免 sticky 或表格布局导致的 offsetTop 失真）
  const centerNowInTable = (force = false) => {
    const el = tableScrollRef.current;
    if (!el) return;
    const marker = el.querySelector('.now-separator') as HTMLElement | null;
    if (!marker) return;
    const markerRect = marker.getBoundingClientRect();
    const containerRect = el.getBoundingClientRect();
    // y 为 marker 中心点相对于容器滚动内容的绝对位置（加上当前 scrollTop 即可）
    const y = (markerRect.top - containerRect.top) + el.scrollTop + markerRect.height / 2;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    const margin = 24;
    const inView = y >= top + margin && y <= bottom - margin;
    if (force || !inView) {
      const target = Math.max(0, Math.min(y - el.clientHeight / 2, el.scrollHeight - el.clientHeight));
      try {
        el.scrollTo({ top: target, behavior: 'smooth' });
      } catch {
        el.scrollTop = target;
      }
    }
  };
  const [newTask, setNewTask] = useState<Partial<AutomationTask>>({
    name: '',
    task_type: 'text',
    enabled: true,
    schedule: '0 9 * * *',
    duration_sec: 300,
    device_ids: settings.selectedDeviceId ? (() => {
      const selectedDevice = settings.devices.find(d => d.id === settings.selectedDeviceId);
      return selectedDevice?.serialNumber ? [selectedDevice.serialNumber] : [];
    })() : [],
    config: getDefaultConfigFor('text'),
  });
  const [planned, setPlanned] = useState<Array<{ id: string; task_id: string; date: string; position: number; status: string; created_at: string; executed_at?: string; scheduled_at?: string; scheduled_end_at?: string }>>([]);

  const todayStr = () => {
    const d = new Date();
    const yyyy = d.getFullYear(); // 使用本地时间而不是UTC
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const tomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear(); // 使用本地时间而不是UTC
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // 检查当前时间之后是否还有任务，如果没有则考虑生成明天的队列
  const checkAndGenerateTomorrowQueue = async (todayQueue: any[], validTasks: string[]) => {
    try {
      const now = new Date();
      
      // 检查今日队列中是否还有未来的任务
      const futureTasks = todayQueue.filter(item => {
        if (!item.scheduled_at) return false;
        const scheduledTime = new Date(item.scheduled_at);
        return scheduledTime > now;
      });
      
      // 如果今日没有未来任务了，检查明天是否有任务
      if (futureTasks.length === 0) {
        const tomorrowDate = tomorrowStr();
        const tomorrowItems = await invoke<typeof planned>('automation_get_planned_for_date', { date: tomorrowDate });
        
        // 如果明天没有队列，生成明天的队列
        if (!tomorrowItems || tomorrowItems.length === 0) {
          await invoke('automation_generate_planned_for_date', { date: tomorrowDate, order: validTasks });
          showToast('已自动生成明日执行队列', 'info');
        }
      }
    } catch (e) {
      console.warn('检查明日队列失败:', e);
    }
  };

  const fetchPlanned = async () => {
    try {
      const today = todayStr();
      console.log('fetchPlanned - 当前日期:', today); // 调试信息
      
      const items = await invoke<typeof planned>('automation_get_planned_for_date', { date: today });
      console.log('fetchPlanned - 获取到的队列项:', items?.length || 0); // 调试信息
      
      // 如果没有队列且有有效任务，自动生成今日队列
      const validTasks = ordering.filter(id => tasks.find(t => t.id === id && t.enabled));
      
    if ((!items || items.length === 0) && validTasks.length > 0) {
  console.log('fetchPlanned - 自动生成今日队列(异步)...'); // 调试信息
  await invoke('automation_generate_planned_for_date', { date: today, order: validTasks });
  showToast('正在生成今日执行队列…', 'info');
  // 等待后端事件推动刷新；兜底1.5秒后拉取一次
  setTimeout(() => { fetchPlanned(); }, 1500);
      } else {
        const sorted = [...(items || [])].sort((a, b) => a.position - b.position);
        setPlanned(sorted as any);
        
        // 检查是否需要生成明天的队列
        if (validTasks.length > 0) {
          await checkAndGenerateTomorrowQueue(sorted, validTasks);
        }
      }
    } catch (e) {
      console.warn('获取计划队列失败:', e);
    }
  };

  const [ordering, setOrdering] = useState<string[]>([]);

  useEffect(() => {
    // 以“启用任务在前，禁用任务在后”的全量顺序填充，并按已有 priority 再按名称稳定排序
    const enabled = tasks.filter(t => t.enabled);
    const disabled = tasks.filter(t => !t.enabled);
    const sortByPriorityThenName = (a: any, b: any) => {
      const pa = typeof a.priority === 'number' ? a.priority : Number.POSITIVE_INFINITY;
      const pb = typeof b.priority === 'number' ? b.priority : Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      return (a.name || '').localeCompare(b.name || '');
    };
    const initial = [...enabled.sort(sortByPriorityThenName), ...disabled.sort(sortByPriorityThenName)].map(t => t.id);
    setOrdering(initial);
  }, [tasks]);

  useEffect(() => { 
    // 当tasks或ordering变化时重新获取队列
    if (tasks.length > 0 && ordering.length > 0) {
      fetchPlanned(); 
    }
  }, [tasks, ordering]);

  // 进入“日程”视图时，将“当前时间线”滚动到容器中间，仅自动一次；用户滚动后不再自动居中
  useEffect(() => {
    if (queueView !== 'agenda') {
      // 切换离开后重置标记，以便下次进入再自动一次
      hasUserScrolledRef.current = false;
      hasCenteredRef.current = false;
      return;
    }
    const el = agendaScrollRef.current;
    if (!el) return;
    if (hasUserScrolledRef.current || hasCenteredRef.current) return;
    // 使用 rAF 确保 DOM 尺寸准备就绪
    requestAnimationFrame(() => {
      centerNow(true);
      hasCenteredRef.current = true;
    });
  }, [queueView]);

  // 若开启“自动居中”，当当前时间线离开可视区域时自动居中；随 currentTime/zoom 变化检查
  useEffect(() => {
    if (queueView !== 'agenda') return;
    if (!autoCenterNow) return;
    centerNow(false);
  }, [currentTime, hourHeightPx, autoCenterNow, queueView]);

  // 表格视图：进入时默认将“当前时间分隔行”居中，仅自动一次
  useEffect(() => {
    if (queueView !== 'table') {
      tableHasUserScrolledRef.current = false;
      tableHasCenteredRef.current = false;
      return;
    }
    const el = tableScrollRef.current;
    if (!el) return;
    if (tableHasUserScrolledRef.current || tableHasCenteredRef.current) return;
    requestAnimationFrame(() => {
      centerNowInTable(true);
      tableHasCenteredRef.current = true;
    });
  }, [queueView]);

  // 若开启“自动居中”，当“当前时间分隔行”离开可视区域时自动居中（表格视图）
  useEffect(() => {
    if (queueView !== 'table') return;
    if (!autoCenterNow) return;
    centerNowInTable(false);
  }, [currentTime, autoCenterNow, queueView]);

  const getOrderIndex = (id: string) => ordering.indexOf(id);

  const moveOrder = async (id: string, dir: -1 | 1) => {
    // 先基于当前状态计算新的顺序
    const idx = ordering.indexOf(id);
    if (idx === -1) return;
    const ni = idx + dir;
    if (ni < 0 || ni >= ordering.length) return;
    const copy = ordering.slice();
    const [x] = copy.splice(idx, 1);
    copy.splice(ni, 0, x);

    // 更新本地顺序
    setOrdering(copy);

    // 同步到后端，更新优先级（index 越小优先级越高）
    try {
  // 将全量顺序传给后端，避免未包含的任务保留旧 priority 导致重复
  await invoke('automation_update_priorities', { args: { ordered_ids: copy } });
    } catch (e) {
      console.error('更新优先级失败:', e);
      showToast('更新优先级失败', 'error');
    }
  };

  // 合并生成和刷新功能的统一队列管理函数
  const refreshOrGenerateQueue = async () => {
    try {
      const today = todayStr();
      console.log('当前日期:', today); // 调试信息
      
      // 先尝试获取现有队列
      const items = await invoke<typeof planned>('automation_get_planned_for_date', { date: today });
      console.log('获取到的队列项:', items?.length || 0); // 调试信息
      
      // 检查当前是否有可用的任务
      const validTasks = ordering.filter(id => tasks.find(t => t.id === id && t.enabled));
      console.log('有效任务数:', validTasks.length); // 调试信息
      
      // 如果没有可用任务，清空队列
      if (validTasks.length === 0) {
        setPlanned([]);
        showToast('队列已清空（无可用任务）', 'info');
        return;
      }
      
      // 如果队列为空，则自动生成
      if (!items || items.length === 0) {
        console.log('队列为空，生成新队列(异步)...'); // 调试信息
        await invoke('automation_generate_planned_for_date', { date: today, order: validTasks });
        showToast('正在生成今日执行队列…', 'info');
        // 等待后端事件推动刷新；兜底1.5秒后拉取一次
        setTimeout(() => { fetchPlanned(); }, 1500);
      } else {
        console.log('队列存在，检查有效性...'); // 调试信息
        // 队列存在，检查队列中的任务是否仍然有效
        const validQueueItems = items.filter(item => 
          tasks.find(t => t.id === item.task_id && t.enabled)
        );
        
        // 如果队列中没有有效任务，重新生成
        if (validQueueItems.length === 0) {
          console.log('队列中无有效任务，重新生成(异步)...'); // 调试信息
          await invoke('automation_generate_planned_for_date', { date: today, order: validTasks });
          showToast('正在重新生成执行队列…', 'info');
          // 等待后端事件推动刷新；兜底1.5秒后拉取一次
          setTimeout(() => { fetchPlanned(); }, 1500);
        } else {
          console.log('使用现有有效队列...'); // 调试信息
          // 只显示有效的队列项
          const sorted = [...validQueueItems].sort((a, b) => a.position - b.position);
          setPlanned(sorted as any);
          showToast('队列已刷新', 'success');
          
          // 检查是否需要生成明天的队列
          await checkAndGenerateTomorrowQueue(sorted, validTasks);
        }
      }
    } catch (e) {
      console.error('队列操作失败:', e);
      showToast('队列操作失败', 'error');
    }
  };

  // 清空队列配置
  const clearQueue = async () => {
    try {
      // 调用后端API清空今日队列
      await invoke('automation_clear_planned_for_date', { date: todayStr() });
      // 更新前端状态
      setPlanned([]);
      showToast('队列已清空', 'success');
    } catch (e) {
      console.error('清空队列失败:', e);
      showToast('清空队列失败', 'error');
    }
  };

  const loadTasks = async () => {
    try {
      const tasksData = await invoke<AutomationTask[]>('automation_get_tasks');
      setTasks(tasksData);
      saveLocalTasks(tasksData);
    } catch (error) {
      console.error('加载任务失败:', error);
      showToast('加载任务失败', 'error');
    }
  };

  const loadLogs = async () => {
    try {
      const logsData = await invoke<TaskExecutionLog[]>('automation_get_logs', { limit: 100 });
      setLogs(logsData);
    } catch (error) {
      console.error('加载日志失败:', error);
      showToast('加载日志失败', 'error');
    }
  };

  const loadAutomationEnabled = async () => {
    try {
      const enabled = await invoke<boolean>('automation_get_enabled');
      setAutomationEnabled(enabled);
      saveEnabledToLocal(enabled);
    } catch (error) {
      console.error('加载自动化开关状态失败:', error);
      showToast('加载自动化开关状态失败', 'error');
    }
  };

  const toggleAutomationEnabled = async () => {
    try {
      const newState = !automationEnabled;
      await invoke('automation_set_enabled', { enabled: newState });
      setAutomationEnabled(newState);
      saveEnabledToLocal(newState);
      showToast(newState ? '自动化已启用' : '自动化已禁用', newState ? 'success' : 'info');
    } catch (error) {
      console.error('切换自动化开关失败:', error);
      showToast('切换自动化开关失败', 'error');
    }
  };

  const syncApiKeys = async () => {
    try {
      const deviceConfigs = settings.devices.map(device => [
        device.serialNumber,
        device.apiKey
      ]);
      await invoke('automation_sync_api_keys', { deviceConfigs: deviceConfigs });
    } catch (error) {
      console.error('同步API密钥失败:', error);
    }
  };

  useEffect(() => {
    const initLoad = async () => {
      setLoading(true);
      setTasks(loadLocalTasks<AutomationTask[]>());
      setAutomationEnabled(loadEnabledFromLocal(true));
      await Promise.all([
        loadTasks(),
        loadLogs(),
        loadAutomationEnabled(),
        syncApiKeys(),
      ]);
      setLoading(false);
    };
    initLoad();
  }, [settings]);

  // 监听后端“计划生成完成”事件，自动刷新
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen('automation:planned:generated', (evt) => {
          const payload = evt?.payload as any;
          const d = payload?.date as string | undefined;
          const count = payload?.count as number | undefined;
          const today = todayStr();
          if (!d || d !== today) return;
          fetchPlanned();
          if (typeof count === 'number') {
            showToast(`队列已更新（${count} 项）`, 'success');
          }
        });
      } catch (e) {
        console.warn('事件监听失败', e);
      }
    })();
    return () => { try { unlisten && unlisten(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
  // Countdown tick: update every second so relative times and next execution stay fresh
  const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const generateT2iPreview = async (cfg: any): Promise<string> => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      canvas.width = 296;
      canvas.height = 152;

      const bgColor = resolveColor(cfg?.background_color ?? cfg?.backgroundColor ?? 'white');
      const bgImage = cfg?.background_image ?? cfg?.backgroundImage ?? null;
      const texts = normalizeTexts(cfg?.texts ?? []);

      // 调试信息
      console.log('generateT2iPreview - bgImage:', bgImage ? `${bgImage.substring(0, 50)}...` : 'null');
      console.log('generateT2iPreview - bgColor:', bgColor);
      console.log('generateT2iPreview - texts count:', texts.length);

      const drawTexts = () => {
        texts.forEach((t) => {
          ctx.save();
          ctx.font = `${t.fontWeight} ${t.fontSize}px ${t.fontFamily}`;
          ctx.fillStyle = t.color === 'black' ? '#000000' : t.color === 'white' ? '#ffffff' : t.color;
          ctx.textAlign = t.textAlign;
          ctx.translate(t.x, t.y);
          ctx.rotate((t.rotation * Math.PI) / 180);
          ctx.fillText(t.content, 0, 0);
          ctx.restore();
        });
      };

      const drawBaseAndTexts = () => {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawTexts();
        return canvas.toDataURL('image/png');
      };

      if (bgImage) {
        const img = new Image();
        return await new Promise((resolve) => {
          img.onload = () => {
            // 先绘制背景图片
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            // 然后只绘制文本，不要覆盖背景
            drawTexts();
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = () => resolve(drawBaseAndTexts());
          img.src = bgImage;
        });
      } else {
        return drawBaseAndTexts();
      }
    } catch (e) {
      console.warn('生成text-to-image预览失败:', e);
      return '';
    }
  };

  useEffect(() => {
    if (newTask.task_type === 'text-to-image') {
      (async () => {
        const url = await generateT2iPreview(newTask.config || {});
        setT2iPreview(url);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTask.task_type, JSON.stringify(newTask.config)]);

  useEffect(() => {
    const gen = async () => {
      const entries = await Promise.all(
        tasks
          .filter((t) => t.task_type === 'text-to-image')
          .map(async (t) => {
            const url = await generateT2iPreview((t as any).config || {});
            return [t.id, url] as const;
          })
      );
      const map: Record<string, string> = {};
      for (const [id, url] of entries) map[id] = url;
      setT2iListPreviews(map);
    };
    if (tasks.length) gen();
  }, [tasks]);

  const openTaskModal = (task?: AutomationTask) => {
    if (task) {
      setEditingTask(task);
      const inferredMode: ScheduleMode = task.fixed_at
        ? 'fixed'
        : (typeof task.interval_sec === 'number')
        ? 'interval'
        : 'cron';
      setScheduleMode(inferredMode);
      setNewTask({
        name: task.name,
        task_type: task.task_type,
        enabled: task.enabled,
        schedule: task.schedule,
        fixed_at: task.fixed_at,
        interval_sec: task.interval_sec,
  duration_sec: typeof task.duration_sec === 'number' ? task.duration_sec : 300,
        device_ids: task.device_ids,
        config: task.config,
      });
    } else {
      setEditingTask(null);
      setScheduleMode('cron');
      setNewTask({
        name: '',
        task_type: 'text',
        enabled: true,
        schedule: '0 9 * * *',
        fixed_at: undefined,
        interval_sec: undefined,
  duration_sec: 300,
        device_ids: settings.selectedDeviceId ? (() => {
          const selectedDevice = settings.devices.find(d => d.id === settings.selectedDeviceId);
          return selectedDevice?.serialNumber ? [selectedDevice.serialNumber] : [];
        })() : [],
        config: getDefaultConfigFor('text'),
      });
    }
    setShowTaskModal(true);
  };

  const closeTaskModal = () => {
    setShowTaskModal(false);
    setEditingTask(null);
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const parseCronExpression = (cron: string) => {
    const preset = cronPresets.find(p => p.value === cron);
    return preset ? preset.label : cron;
  };

  // 计划表改为只显示开始时间与持续时长

  // 根据任务字段判断调度模式
  const getTaskMode = (t: AutomationTask): ScheduleMode => {
    if (t.fixed_at) return 'fixed';
    if (typeof t.interval_sec === 'number') return 'interval';
    return 'cron';
  };

  // 展示友好的调度摘要
  const getScheduleLabel = (t: AutomationTask): string => {
    const mode = getTaskMode(t);
    if (mode === 'fixed') {
      // 仅显示本地时间
      return formatTime(t.fixed_at);
    }
    if (mode === 'interval') {
      const interval = t.interval_sec ?? 0;
      // 显示单一间隔
      return `${interval} 秒`;
    }
    // cron：显示预设名称或原表达式
    return parseCronExpression(t.schedule);
  };

  // 下次可执行相对描述已从界面移除

  // 计算一个 Date 用于“全局下次执行”统计（尽量估算）
  const saveTask = async () => {
    try {
      if (!newTask.name?.trim()) {
        showToast('请输入任务名称', 'error');
        return;
      }

      if (scheduleMode === 'cron') {
        if (!newTask.schedule?.trim()) {
          showToast('请设置 Cron 表达式', 'error');
          return;
        }
      } else if (scheduleMode === 'fixed') {
        if (!newTask.fixed_at?.trim()) {
          showToast('请选择固定时间', 'error');
          return;
        }
      } else if (scheduleMode === 'interval') {
        if (!(typeof newTask.interval_sec === 'number' && newTask.interval_sec > 0)) {
          showToast('请填写时间间隔（秒）', 'error');
          return;
        }
        if (newTask.interval_sec > 86400) { // 24小时限制
          showToast('时间间隔不能超过24小时（86400秒）', 'error');
          return;
        }
      }

      if (!newTask.device_ids?.length) {
        showToast('请选择至少一个设备', 'error');
        return;
      }

      if (newTask.task_type === 'image') {
        const img = newTask.config?.image_data;
        if (!img || !String(img).trim()) {
          showToast('请为图片任务选择或粘贴图片', 'error');
          return;
        }
      }

      let config;
      switch (newTask.task_type) {
        case 'text':
          config = {
            type: 'text',
            title: newTask.config?.title || '',
            message: newTask.config?.message || '',
            signature: newTask.config?.signature || '',
            icon: newTask.config?.icon || null,
            link: newTask.config?.link || null,
          };
          break;
        case 'image':
          config = {
            type: 'image',
            image_data: newTask.config?.image_data || '',
            algorithm: newTask.config?.algorithm || 'floyd_steinberg',
            link: newTask.config?.link || null,
          };
          break;
        case 'text-to-image':
          config = {
            type: 'text-to-image',
            background_color: newTask.config?.background_color || '#ffffff',
            background_image: newTask.config?.background_image || null,
            texts: Array.isArray(newTask.config?.texts)
              ? (newTask.config.texts as any[]).map(normalizeTextElementForBackend)
              : [],
            link: newTask.config?.link || null,
          };
          break;
        default:
          throw new Error('未知的任务类型');
      }

      // 保证三选一：根据模式清洗字段
      const sanitizedFixedAt = scheduleMode === 'fixed' ? (newTask.fixed_at || undefined) : undefined;
      const sanitizedInterval = scheduleMode === 'interval' ? (typeof newTask.interval_sec === 'number' ? newTask.interval_sec : undefined) : undefined;
      const sanitizedSchedule = scheduleMode === 'cron' ? (newTask.schedule || '0 9 * * *') : '';

      const taskToSave: AutomationTask = {
        id: editingTask?.id || '',
        name: newTask.name!,
        task_type: newTask.task_type!,
        enabled: newTask.enabled!,
        schedule: sanitizedSchedule,
        device_ids: newTask.device_ids!,
        config: config,
        run_count: editingTask?.run_count || 0,
        error_count: editingTask?.error_count || 0,
        created_at: editingTask?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        fixed_at: sanitizedFixedAt,
        interval_sec: sanitizedInterval,
        duration_sec: typeof newTask.duration_sec === 'number' ? newTask.duration_sec : 300,
      };

      if (editingTask) {
        await invoke('automation_update_task', { task: taskToSave });
        showToast('任务更新成功', 'success');
      } else {
        await invoke('automation_add_task', { task: taskToSave });
        showToast('任务创建成功', 'success');
      }

      for (const deviceId of taskToSave.device_ids) {
        const device = settings.devices.find(d => d.serialNumber === deviceId);
        if (device && device.apiKey) {
          try {
            await invoke('automation_set_api_key', {
              deviceId: deviceId,
              apiKey: device.apiKey
            });
          } catch (error) {
            console.warn(`设置设备 ${deviceId} 的API密钥失败:`, error);
          }
        }
      }

      await loadTasks();
      closeTaskModal();
    } catch (error) {
      console.error('保存任务失败:', error);
      showToast(`保存任务失败: ${error}`, 'error');
    }
  };

  const deleteTask = async (taskId: string) => {
    // 使用更明确的确认对话框
    const taskToDelete = tasks.find(task => task.id === taskId);
    const taskName = taskToDelete?.name || '未知任务';
    
    if (!window.confirm(`确定要删除任务 "${taskName}" 吗？\n\n此操作不可撤销。`)) {
      return;
    }
    
    try {
      // 1. 调用后端删除任务
      await invoke('automation_delete_task', { taskId: taskId });
      
      // 2. 从本地状态中立即移除任务（优化用户体验）
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
      
      // 3. 从ordering中移除删除的任务
      setOrdering(prev => prev.filter(id => id !== taskId));
      
      // 4. 重新从服务器加载任务数据以确保同步
      await loadTasks();
      
      // 5. 刷新队列以移除已删除任务的相关计划
      await fetchPlanned();
      
      showToast(`任务 "${taskName}" 删除成功`, 'success');
      
    } catch (error) {
      console.error('删除任务失败:', error);
      showToast(`删除任务失败: ${error}`, 'error');
      
      // 如果删除失败，重新加载任务以恢复正确状态
      await loadTasks();
    }
  };

  const toggleTaskEnabled = async (task: AutomationTask) => {
    try {
      const updatedTask = { ...task, enabled: !task.enabled };
      await invoke('automation_update_task', { task: updatedTask });
      showToast(`任务已${updatedTask.enabled ? '启用' : '禁用'}`, 'success');
      await loadTasks();
    } catch (error) {
      console.error('切换任务状态失败:', error);
      showToast(`切换任务状态失败: ${error}`, 'error');
    }
  };

  const executeTask = async (task: AutomationTask) => {
    if (!task.enabled) {
      showToast('任务已禁用，无法执行', 'error');
      return;
    }
    const device = settings.devices.find(d => task.device_ids.includes(d.serialNumber));
    if (!device || !device.apiKey) {
      showToast('找不到设备或API密钥', 'error');
      return;
    }
    
    try {
      showToast(`正在执行任务: ${task.name}...`, 'info');
      
      // 如果是 TextToImage 任务，使用前端渲染
      if (task.task_type === 'text-to-image') {
        // 先获取处理宏替换后的任务配置
        const processedConfig = await invoke('automation_get_t2i_task_with_macros', { 
          taskId: task.id 
        }) as any;
        
        // 使用前端渲染生成图片
        const renderedImageData = await generateT2iPreview(processedConfig);
        
        if (!renderedImageData) {
          throw new Error('前端渲染失败');
        }
        
        // 使用前端渲染的图片执行任务
        await invoke('automation_execute_t2i_with_frontend_render', { 
          taskId: task.id, 
          renderedImageData,
          apiKey: device.apiKey 
        });
      } else {
        // 其他类型任务使用原来的方式
        await invoke('automation_execute_task', { taskId: task.id, apiKey: device.apiKey });
      }
      
      showToast(`任务执行成功: ${task.name}`, 'success');
      await Promise.all([loadTasks(), loadLogs()]);
      // 执行后刷新队列一次
      await fetchPlanned();
    } catch (error) {
      console.error('任务执行失败:', error);
      showToast(`任务执行失败: ${error}`, 'error');
      // 失败也可能标记为 skipped，刷新一次
      await fetchPlanned();
    }
  };

  if (loading) {
    return (
      <div className="automation-page">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="automation-page" style={{ 
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      <div className="automation-header" style={{
        flexShrink: 0,
        marginBottom: 12, // 减小从16到12
        paddingBottom: 12, // 减小从16到12
        borderBottom: '1px solid var(--border-color)'
      }}>
        <div className="header-left">
          <h2>自动化任务</h2>
          <div className="current-time">
            <span className="time-label">当前时间:</span>
            <span className="time-value">{currentTime.toLocaleString('zh-CN')}</span>
          </div>
        </div>
        <div className="automation-actions">
          <div className="global-toggle">
            <label className="toggle-switch">
              <input type="checkbox" checked={automationEnabled} onChange={toggleAutomationEnabled} />
              <span className="slider"></span>
            </label>
            <span className={`toggle-label ${automationEnabled ? 'enabled' : 'disabled'}`}>
              {automationEnabled ? '自动化已启用' : '自动化已禁用'}
            </span>
          </div>
          <button className="action-button view-logs-button" onClick={() => setShowLogsModal(true)}>查看日志</button>
          <button className="action-button add-task-button" onClick={() => openTaskModal()}>+ 新建任务</button>
          <button className="action-button" onClick={refreshOrGenerateQueue}>更新队列</button>
          <button className="action-button clear-queue-button" onClick={clearQueue}>清空队列</button>
        </div>
      </div>

      <div className="automation-split" style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: 12,
        alignItems: 'start',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        height: 'calc(100vh - 240px)', // 增加可用高度
        maxHeight: 'calc(100vh - 240px)'
      }}>
        <div className="left-pane" style={{
          height: '100%',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <h4 style={{ margin: '0 0 8px 0', flexShrink: 0 }}>任务设置</h4> {/* 减小标题间距 */}
          <div className="tasks-list tasks-grid" style={{ 
            gridTemplateColumns: 'repeat(auto-fill, minmax(520px, 1fr))', // 固定宽度，不使用1fr拉伸
            justifyContent: 'start', // 左对齐，避免单个任务居中
            gap: 8,
            overflowY: 'auto',
            overflowX: 'hidden',
            flex: 1,
            minHeight: 0,
            paddingRight: 8
          }}>
            {tasks.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🤖</span>
                <p>还没有自动化任务</p>
                <button className="action-button" onClick={() => openTaskModal()}>创建第一个任务</button>
              </div>
            ) : (
              (() => {
                const orderMap = new Map(ordering.map((id, i) => [id, i]));
                const INF = 1e9;
                const sorted = tasks.slice().sort((a, b) => {
                  const ia = orderMap.has(a.id) ? (orderMap.get(a.id) as number) : INF;
                  const ib = orderMap.has(b.id) ? (orderMap.get(b.id) as number) : INF;
                  if (ia !== ib) return ia - ib;
                  // fallback by name
                  return a.name.localeCompare(b.name);
                });
                return sorted.map((task) => {
                  const idx = getOrderIndex(task.id);
                  const atTop = idx <= 0;
                  const atBottom = idx === ordering.length - 1;
                  // 显示的序号以全量 ordering 的索引为准，避免因 planned.position 导致的重复/混淆
                  const displayPos = idx >= 0 ? idx + 1 : undefined;
                  return (
                    <div
                      key={task.id}
                      className={`task-item task-card ${!task.enabled ? 'disabled' : ''}`}
                      style={{
                        position: 'relative',
                        padding: 10, // 减小padding从20到16
                        border: '1px solid var(--border-color)',
                        borderRadius: 12, // 减小圆角从16到12
                        background: 'var(--panel-bg, #fff)',
                        boxShadow: task.enabled ? '0 2px 8px rgba(0, 0, 0, 0.1)' : '0 1px 3px rgba(0, 0, 0, 0.05)',
                        transition: 'all 0.3s ease-in-out',
                        opacity: task.enabled ? 1 : 0.8,
                        borderColor: task.enabled ? 'var(--border-color)' : 'var(--muted-color, #d1d5db)'
                      }}
                    >
                      <div className="task-row" style={{ display: 'flex', gap: 12, height: '100%' }}>
                        <div className="task-preview-col" style={{ flex: '0 0 280px' }}> {/* 减小预览列宽度 */}
                          {task.task_type === 'text' && (
                            <div
                              className={`preview-box ${task.config?.link ? 'preview-box-clickable' : ''}`}
                              onClick={() => {
                                const link = task.config?.link?.trim?.();
                                if (link) window.open(link, '_blank');
                              }}
                              style={{ cursor: task.config?.link ? 'pointer' : 'default' }}
                            >
                              <div className="preview-header">
                                <div className="preview-title">{task.config?.title || '标题'}</div>
                              </div>
                              <div className="preview-content">
                                <div className="preview-message">{task.config?.message || '内容'}</div>
                              </div>
                              <div className="preview-footer">
                                <div className="preview-icon">
                                  {task.config?.icon ? (
                                    <img src={getIconSrc(task.config?.icon)} alt="icon" className="icon-img" />
                                  ) : (
                                    <div className="icon-placeholder">🏷️</div>
                                  )}
                                </div>
                                <div className="preview-signature">{task.config?.signature || '签名'}</div>
                              </div>
                              {task.config?.link && (
                                <div className="preview-link-indicator">
                                  <span className="link-icon">🔗</span>
                                </div>
                              )}
                            </div>
                          )}

                          {task.task_type === 'image' && (
                            <div
                              className={`image-preview-box ${task.config?.link ? 'preview-box-clickable' : ''}`}
                              onClick={() => {
                                const link = task.config?.link?.trim?.();
                                if (link) window.open(link, '_blank');
                              }}
                              style={{ cursor: task.config?.link ? 'pointer' : 'default' }}
                            >
                              {task.config?.image_data ? (
                                <img
                                  src={
                                    String(task.config?.image_data).startsWith('data:')
                                      ? task.config?.image_data
                                      : `data:image/png;base64,${task.config?.image_data}`
                                  }
                                  alt="预览"
                                  className="preview-image"
                                />
                              ) : (
                                <div className="image-placeholder">
                                  <span className="placeholder-icon">🌄</span>
                                  <p>暂无图片</p>
                                </div>
                              )}
                              {task.config?.link && (
                                <div className="preview-link-indicator">
                                  <span className="link-icon">🔗</span>
                                </div>
                              )}
                            </div>
                          )}

                          {task.task_type === 'text-to-image' && (
                            <div
                              className={`image-preview-box ${task.config?.link ? 'preview-box-clickable' : ''}`}
                              onClick={() => {
                                const link = task.config?.link?.trim?.();
                                if (link) window.open(link, '_blank');
                              }}
                              style={{ cursor: task.config?.link ? 'pointer' : 'default' }}
                            >
                              {t2iListPreviews[task.id] ? (
                                <img src={t2iListPreviews[task.id]} alt="预览" className="preview-image" />
                              ) : (
                                <div className="image-placeholder">
                                  <span className="placeholder-icon">📝</span>
                                  <p>制图预览</p>
                                </div>
                              )}
                              {task.config?.link && (
                                <div className="preview-link-indicator">
                                  <span className="link-icon">🔗</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="task-content-col" style={{ 
                          flex: '1 1 auto', 
                          minWidth: 0, 
                          display: 'flex', 
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: 100 // 进一步减小最小高度
                        }}>
                          {(() => {
                            const mode = getTaskMode(task);
                            const deviceNames = task.device_ids.map(deviceId => {
                              const device = settings.devices.find(d => d.serialNumber === deviceId);
                              return device ? (device.nickname || device.serialNumber) : deviceId;
                            });
                            
                            return (
                              <div className="task-content" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                {/* 右上角启用/禁用按钮 */}
                                <div className="task-status-toggle" style={{ 
                                  position: 'absolute',
                                  top: 12,
                                  right: 12,
                                  zIndex: 1
                                }}>
                                  <button
                                    className={`toggle-button ${task.enabled ? 'enabled' : 'disabled'}`}
                                    style={{ 
                                      width: 20,
                                      height: 20,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 10,
                                      fontWeight: 600,
                                      borderRadius: '50%',
                                      border: 'none',
                                      backgroundColor: task.enabled ? '#10b981' : '#6b7280',
                                      color: '#fff',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                    }}
                                    onClick={() => toggleTaskEnabled(task)}
                                    title={task.enabled ? '点击禁用' : '点击启用'}
                                    aria-label={task.enabled ? '禁用任务' : '启用任务'}
                                  >
                                    {task.enabled ? '✓' : '○'}
                                  </button>
                                </div>

                                {/* 任务标题行 */}
                                <div className="task-title-row" style={{ marginBottom: 8, paddingRight: 36 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <h3 className="task-name" style={{ 
                                      margin: 0, 
                                      fontSize: 16, 
                                      fontWeight: 700,
                                      flex: 1,
                                      minWidth: 0,
                                      overflow: 'hidden', 
                                      textOverflow: 'ellipsis', 
                                      whiteSpace: 'nowrap',
                                      color: task.enabled ? 'inherit' : 'var(--muted-color)',
                                      textAlign: 'left'
                                    }}>
                                      {task.name}
                                    </h3>
                                    {typeof displayPos !== 'undefined' && (
                                      <span className="priority-badge" style={{ 
                                        fontSize: 11, 
                                        fontWeight: 600,
                                        color: '#fff',
                                        backgroundColor: '#6366f1',
                                        padding: '3px 6px',
                                        borderRadius: 6,
                                        lineHeight: 1,
                                        flexShrink: 0
                                      }}>
                                        #{displayPos}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                  
                                {/* 任务信息行 */}
                                <div className="task-info-row" style={{ marginBottom: 12 }}>
                                  <div className="task-meta" style={{ 
                                    display: 'flex', 
                                    alignItems: 'center',
                                    gap: 8, 
                                    flexWrap: 'wrap',
                                    fontSize: 12,
                                    color: 'var(--muted-color)'
                                  }}>
                                    <div className="task-type-chip" style={{ 
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 3,
                                      padding: '3px 8px', 
                                      border: '1px solid var(--border-color)', 
                                      borderRadius: 12, 
                                      backgroundColor: 'var(--background-color, #f8f9fa)',
                                      fontWeight: 600,
                                      fontSize: 11
                                    }}>
                                      <span>{task.task_type === 'text' ? '📝' : task.task_type === 'image' ? '🖼️' : '🎨'}</span>
                                      <span>{task.task_type === 'text' ? '文本' : task.task_type === 'image' ? '图片' : '制图'}</span>
                                    </div>
                                    
                                    <div className="schedule-chip" style={{ 
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 3,
                                      padding: '3px 8px', 
                                      border: '1px solid var(--border-color)', 
                                      borderRadius: 12, 
                                      backgroundColor: 'var(--background-color, #f8f9fa)',
                                      fontWeight: 600,
                                      fontSize: 11
                                    }}>
                                      <span>{mode === 'fixed' ? '⏰' : mode === 'interval' ? '🔄' : '📅'}</span>
                                      <span style={{ 
                                        maxWidth: '80px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {getScheduleLabel(task)}
                                      </span>
                                    </div>
                                    
                                    <div className="device-info" style={{ 
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 3,
                                      fontWeight: 500,
                                      fontSize: 11
                                    }}>
                                      <span>📱</span>
                                      <span title={deviceNames.join(', ')}>
                                        {deviceNames.length === 0 ? '无设备' : `${deviceNames.length}台`}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* 操作按钮区域 */}
                                <div className="task-actions" style={{ 
                                  marginTop: 'auto',
                                  paddingTop: 8, // 减小padding从12到8
                                  borderTop: '1px solid var(--border-color)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 8
                                }}>
                                  {/* 左侧：优先级控制 */}
                                  <div className="priority-controls" style={{ display: 'flex', gap: 4 }}>
                                    {task.enabled && idx >= 0 && (
                                      <>
                                        <button 
                                          title="上移优先级" 
                                          aria-label="上移优先级" 
                                          onClick={() => moveOrder(task.id, -1)} 
                                          disabled={atTop}
                                          style={{
                                            width: 28,
                                            height: 28,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 12,
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 4,
                                            backgroundColor: atTop ? 'var(--disabled-bg, #f5f5f5)' : 'var(--background-color, #fff)',
                                            color: atTop ? 'var(--disabled-color, #ccc)' : 'inherit',
                                            cursor: atTop ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.2s'
                                          }}
                                        >
                                          ↑
                                        </button>
                                        <button 
                                          title="下移优先级" 
                                          aria-label="下移优先级" 
                                          onClick={() => moveOrder(task.id, 1)} 
                                          disabled={atBottom}
                                          style={{
                                            width: 28,
                                            height: 28,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 12,
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 4,
                                            backgroundColor: atBottom ? 'var(--disabled-bg, #f5f5f5)' : 'var(--background-color, #fff)',
                                            color: atBottom ? 'var(--disabled-color, #ccc)' : 'inherit',
                                            cursor: atBottom ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.2s'
                                          }}
                                        >
                                          ↓
                                        </button>
                                      </>
                                    )}
                                  </div>

                                  {/* 中间空白区域 */}
                                  <div style={{ flex: 1 }} />
                                  
                                  {/* 右侧：主要操作按钮 */}
                                  <div className="main-actions" style={{ display: 'flex', gap: 4 }}>
                                    <button 
                                      className="execute-button" 
                                      title="立即执行" 
                                      aria-label="立即执行" 
                                      onClick={() => executeTask(task)} 
                                      disabled={!task.enabled}
                                      style={{
                                        width: 28,
                                        height: 28,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        border: 'none',
                                        borderRadius: 4,
                                        backgroundColor: task.enabled ? '#3b82f6' : '#e5e7eb',
                                        color: task.enabled ? '#fff' : '#9ca3af',
                                        cursor: task.enabled ? 'pointer' : 'not-allowed',
                                        transition: 'all 0.2s'
                                      }}
                                    >
                                      ▶
                                    </button>
                                    <button 
                                      className="edit-button" 
                                      title="编辑任务" 
                                      aria-label="编辑任务" 
                                      onClick={() => openTaskModal(task)}
                                      style={{
                                        width: 28,
                                        height: 28,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 4,
                                        backgroundColor: 'var(--background-color, #fff)',
                                        color: 'inherit',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                      }}
                                    >
                                      ✎
                                    </button>
                                    <button 
                                      className="delete-button" 
                                      title="删除任务" 
                                      aria-label="删除任务" 
                                      onClick={() => deleteTask(task.id)}
                                      style={{
                                        width: 28,
                                        height: 28,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        border: '1px solid #ef4444',
                                        borderRadius: 4,
                                        backgroundColor: 'var(--background-color, #fff)',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                      }}
                                    >
                                      🗑
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>

        <div className="right-pane" style={{
          height: '100%',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {/* 标题 + 视图切换 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 12px 0', flexShrink: 0 }}>
            <h4 style={{ margin: 0 }}>今日执行队列</h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="action-button"
                onClick={() => setQueueView('table')}
                style={{
                  padding: '4px 10px',
                  background: queueView === 'table' ? '#3b82f6' : 'var(--background-color, #fff)',
                  color: queueView === 'table' ? '#fff' : 'inherit',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6
                }}
              >表格</button>
              <button
                className="action-button"
                onClick={() => setQueueView('agenda')}
                style={{
                  padding: '4px 10px',
                  background: queueView === 'agenda' ? '#3b82f6' : 'var(--background-color, #fff)',
                  color: queueView === 'agenda' ? '#fff' : 'inherit',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6
                }}
              >日程</button>
              {queueView === 'table' && (
                <div style={{ display: 'flex', gap: 10, marginLeft: 8, alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                  {/* 自动居中开关（表格视图） */}
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted-color)' }}>
                    <input
                      type="checkbox"
                      checked={autoCenterNow}
                      onChange={(e) => {
                        setAutoCenterNow(e.target.checked);
                        if (e.target.checked) {
                          // 立即尝试一次居中（表格）
                          requestAnimationFrame(() => centerNowInTable(true));
                        }
                      }}
                      style={{ margin: 0 }}
                    />
                    此时
                  </label>
                </div>
              )}
              {queueView === 'agenda' && (
                <div style={{ display: 'flex', gap: 10, marginLeft: 8, alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted-color)' }}>高度</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
                    <button
                      className="action-button"
                      onClick={() => {
                        const presets = [64, 640, 1280, 2560, 6400, 12800];
                        const idx = presets.findIndex(v => v === hourHeightPx);
                        const next = idx > 0 ? presets[idx - 1] : presets[0];
                        setHourHeightPx(next);
                      }}
                      title="减小高度"
                      aria-label="减小每小时高度"
                      style={{ width: 22, height: 22, minWidth: 22, padding: 0, border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >‹</button>
                    <div style={{ minWidth: 64, textAlign: 'center', fontSize: 11, color: 'var(--muted-color)' }}>{hourHeightPx} px/h</div>
                    <button
                      className="action-button"
                      onClick={() => {
                        const presets = [64, 640, 1280, 2560, 6400, 12800];
                        const idx = presets.findIndex(v => v === hourHeightPx);
                        const next = idx >= 0 && idx < presets.length - 1 ? presets[idx + 1] : presets[presets.length - 1];
                        setHourHeightPx(next);
                      }}
                      title="增大高度"
                      aria-label="增大每小时高度"
                      style={{ width: 22, height: 22, minWidth: 22, padding: 0, border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >›</button>
                  </div>
                  <button
                    className="action-button"
                    onClick={() => setHourHeightPx(6400)}
                    style={{ padding: '2px 4px', minWidth: 44, height: 22, border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--background-color, #fff)', fontSize: 11, lineHeight: 1 }}
                  >重置</button>
                  {/* 自动居中开关 */}
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted-color)' }}>
                    <input
                      type="checkbox"
                      checked={autoCenterNow}
                      onChange={(e) => {
                        setAutoCenterNow(e.target.checked);
                        if (e.target.checked) {
                          // 立即尝试一次居中
                          requestAnimationFrame(() => centerNow(true));
                        }
                      }}
                      style={{ margin: 0 }}
                    />
                    此时
                  </label>
                </div>
              )}
            </div>
          </div>

          {planned.length === 0 ? (
            <div className="empty-state">今日暂无队列</div>
          ) : (
            (() => {
              if (queueView === 'table') {
                // 表格视图：展示全部任务，支持滚动，并支持“当前时间”自动居中
                const nowTs = currentTime.getTime();
                const withTime = planned.map((p) => ({
                  ...p,
                  _ts: p.scheduled_at ? new Date(p.scheduled_at).getTime() : (p.executed_at ? new Date(p.executed_at).getTime() : 0)
                })).sort((a, b) => a._ts - b._ts);
                return (
                  <div
                    className="queue-container"
                    ref={tableScrollRef}
                    onScroll={() => { tableHasUserScrolledRef.current = true; }}
                    style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', border: '1px solid var(--border-color)', borderRadius: 8 }}
                  >
                    <table className="planned-table" style={{ width: '100%' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--panel-bg, #fff)', borderBottom: '1px solid #9ca3af' }}>
                        <tr>
                          <th>#</th>
                          <th>任务</th>
                          <th>开始时间</th>
                          <th>持续</th>
                        </tr>
                      </thead>
                      <tbody>
            {withTime.filter(p => p._ts > 0 && p._ts <= nowTs).map((p) => {
                          const t = tasks.find(x => x.id === p.task_id);
                          return (
              <tr key={p.id} className="row-past" style={{ opacity: 0.7 }}>
                              <td>{p.position}</td>
                              <td>{t?.name || p.task_id}</td>
                              <td>{(() => { const s = p.scheduled_at as any; return s ? new Date(s).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'; })()}</td>
                              <td>{(() => {
                                const sa = p.scheduled_at as any; const ea = p.scheduled_end_at as any; if (!sa || !ea) return '-';
                                const ms = new Date(ea).getTime() - new Date(sa).getTime();
                                const sec = Math.max(0, Math.round(ms / 1000));
                                if (sec >= 3600) { const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`; }
                                else if (sec >= 60) { const m = Math.floor(sec / 60); const s = sec % 60; return s === 0 ? `${m} 分钟` : `${m} 分钟 ${s} 秒`; }
                                return `${sec} 秒`;
                              })()}</td>
                            </tr>
                          );
                        })}
                        <tr className="now-separator" style={{ background: 'linear-gradient(90deg, #f59e0b, #ef4444, #f59e0b)', fontWeight: 'bold' }}>
                          <td colSpan={4} style={{ textAlign: 'center', color: '#fff', padding: '8px', fontSize: '14px', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>⏰ 当前时间：{currentTime.toLocaleString('zh-CN')} ⏰</td>
                        </tr>
            {withTime.filter(p => p._ts > nowTs).map((p) => {
                          const t = tasks.find(x => x.id === p.task_id);
                          return (
              <tr key={p.id}>
                              <td>{p.position}</td>
                              <td>{t?.name || p.task_id}</td>
                              <td>{(() => { const s = p.scheduled_at as any; return s ? new Date(s).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'; })()}</td>
                              <td>{(() => {
                                const sa = p.scheduled_at as any; const ea = p.scheduled_end_at as any; if (!sa || !ea) return '-';
                                const ms = new Date(ea).getTime() - new Date(sa).getTime();
                                const sec = Math.max(0, Math.round(ms / 1000));
                                if (sec >= 3600) { const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`; }
                                else if (sec >= 60) { const m = Math.floor(sec / 60); const s = sec % 60; return s === 0 ? `${m} 分钟` : `${m} 分钟 ${s} 秒`; }
                                return `${sec} 秒`;
                              })()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              }

              // 日程视图
              // 根据滑块设置每小时高度（像素）
              const hourHeight = Math.max(64, Math.min(12800, hourHeightPx));
              const minuteHeight = hourHeight / 60; // 每分钟高度(px)
              const totalHeight = 24 * hourHeight;
              const nowMin = (() => {
                const n = currentTime;
                return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60;
              })();
              const getMinutes = (iso?: string) => {
                if (!iso) return 0;
                const d = new Date(iso);
                return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
              };
              const orderMap = new Map(ordering.map((id, i) => [id, i]));

              // 自适应刻度密度与标签频率
              const drawMinute = minuteHeight >= 4;   // >= 4px/分钟 显示1分钟刻度
              const drawFive = minuteHeight >= 2;     // >= 2px/分钟 显示5分钟刻度
              const drawQuarter = minuteHeight >= 1;  // >= 1px/分钟 显示15分钟刻度

              const ticks: any[] = [];
              // 小时线（最粗）
              for (let i = 0; i <= 1440; i += 60) {
                const y = Math.min(i * minuteHeight, totalHeight - 1);
                ticks.push(
                  <div key={`tick-h-${i}`} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 2, background: 'var(--border-color)' }} />
                );
              }
              // 15分钟线（适中）
              if (drawQuarter) {
                for (let i = 15; i < 1440; i += 15) {
                  if (i % 60 === 0) continue;
                  const y = Math.min(i * minuteHeight, totalHeight - 1);
                  ticks.push(
                    <div key={`tick-q-${i}`} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.18)' }} />
                  );
                }
              }
              // 5分钟线（较淡）
              if (drawFive) {
                for (let i = 5; i < 1440; i += 5) {
                  if (i % 15 === 0) continue;
                  const y = Math.min(i * minuteHeight, totalHeight - 1);
                  ticks.push(
                    <div key={`tick-f-${i}`} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.12)' }} />
                  );
                }
              }
              // 1分钟线（最淡）
              if (drawMinute) {
                for (let i = 1; i < 1440; i += 1) {
                  if (i % 5 === 0) continue;
                  const y = Math.min(i * minuteHeight, totalHeight - 1);
                  ticks.push(
                    <div key={`tick-m-${i}`} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.06)' }} />
                  );
                }
              }

              // 标签频率：高密度→5分钟；中密度→15分钟；低密度→60分钟
              const labelStep = minuteHeight >= 8 ? 5 : (minuteHeight >= 2 ? 15 : 60);
              const labels: any[] = [];
              for (let m = 0; m <= 1440; m += labelStep) {
                const y = Math.min(m * minuteHeight + 2, totalHeight - 14);
                const hh = Math.floor(m / 60);
                const mm = m % 60;
                const label = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                labels.push(
                  <div key={`label-${m}`} style={{ position: 'absolute', top: y, left: 8, fontSize: 10, color: 'var(--muted-color)', userSelect: 'none' }}>{label}</div>
                );
              }
        const events = planned
                .filter(p => p.scheduled_at)
                .map(p => {
                  const s = Math.max(0, Math.min(1440, getMinutes(p.scheduled_at)));
                  const rawEnd = getMinutes(p.scheduled_end_at) || (s + 5);
                  const e = Math.max(s + 0.1, Math.min(1440, rawEnd));
                  const durationMin = Math.max(0.5, e - s);
          const top = s * minuteHeight;
          const height = Math.max(1, durationMin * minuteHeight);
                  const prio = orderMap.has(p.task_id) ? (orderMap.get(p.task_id) as number) : Number.MAX_SAFE_INTEGER;
                  return { p, s, e, top, height, prio };
                })
                .sort((a, b) => a.s - b.s || a.prio - b.prio);

              return (
                <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
                  {/* 可滚动容器 */}
                  <div
                    ref={agendaScrollRef}
                    onScroll={() => { hasUserScrolledRef.current = true; }}
                    style={{ position: 'relative', flex: 1, overflowY: 'auto', overflowX: 'hidden', border: '1px solid var(--border-color)', borderRadius: 8 }}
                  >
                    {/* 内容区域 */}
                    <div style={{ position: 'relative', height: totalHeight }}>
                      {/* 自适应刻度与标签 */}
                      {ticks}
                      {labels}

                      {/* 当前时间线 */}
                      <div style={{ position: 'absolute', top: Math.max(0, Math.min(totalHeight, nowMin * minuteHeight)), left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #f59e0b, #ef4444, #f59e0b)', boxShadow: '0 0 6px rgba(239,68,68,0.5)' }} />

                      {/* 事件块 */}
                      {events.map(({ p, top, height, prio, e }) => {
                        const t = tasks.find(x => x.id === p.task_id);
                        const isPast = e <= nowMin;
                        // 保证在模态层(overlay)之下：overlay z-index=2000；事件卡片最大不超过 <2000
                        const z = Math.max(1, 1900 - prio); // 优先级高仍更靠上，但整体低于模态层
                        const name = t?.name || p.task_id;
                        const startStr = p.scheduled_at ? new Date(p.scheduled_at).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                        const durationSec = (() => {
                          const sa = p.scheduled_at as any; const ea = p.scheduled_end_at as any; if (!sa || !ea) return 0;
                          return Math.max(0, Math.round((new Date(ea).getTime() - new Date(sa).getTime()) / 1000));
                        })();
                        const durationLabel = (() => {
                          const sec = durationSec;
                          if (sec >= 3600) { const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`; }
                          else if (sec >= 60) { const m = Math.floor(sec / 60); const s2 = sec % 60; return s2 === 0 ? `${m} 分钟` : `${m} 分钟 ${s2} 秒`; }
                          return sec > 0 ? `${sec} 秒` : '';
                        })();
                        return (
                          <div key={p.id} style={{ position: 'absolute', left: 80, right: 8, top, height, zIndex: z }}>
                            <div style={{
                              height: '100%',
                              boxSizing: 'border-box',
                              borderRadius: 8,
                              border: '1px solid var(--border-color)',
                              background: isPast ? 'rgba(107,114,128,0.15)' : 'rgba(59,130,246,0.12)',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                              backdropFilter: 'blur(2px)',
                              display: 'flex',
                              flexDirection: 'column',
                              padding: 8,
                              overflow: 'hidden'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted-color)' }}>{startStr}{durationLabel ? ` · ${durationLabel}` : ''}</div>
                                <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>#{orderMap.get(p.task_id) !== undefined ? (orderMap.get(p.task_id)! + 1) : '-'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>

      {showTaskModal && (
        <div className="modal-overlay" onClick={closeTaskModal}>
          <div className="modal-content task-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTask ? '编辑任务' : '新建任务'}</h3>
            </div>
            <div className="modal-body">
              <div className="task-form">
                <div className="form-group">
                  <label>任务名称</label>
                  <input type="text" value={newTask.name || ''} onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} placeholder="输入任务名称" />
                </div>

                <div className="form-group">
                  <label>任务类型</label>
                  <select
                    value={newTask.task_type || 'text'}
                    onChange={(e) => {
                      const nextType = e.target.value as 'text' | 'image' | 'text-to-image';
                      setNewTask({ ...newTask, task_type: nextType, config: getDefaultConfigFor(nextType) });
                    }}
                  >
                    <option value="text">文本消息</option>
                    <option value="image">图片内容</option>
                    <option value="text-to-image">制图内容</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>调度方式</label>
                  <div className="mode-selector" style={{ display: 'flex', gap: 8 }}>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="schedule-mode"
                        checked={scheduleMode === 'cron'}
                        onChange={() => {
                          setScheduleMode('cron');
                          setNewTask({
                            ...newTask,
                            // 只保留 cron
                            fixed_at: undefined,
                            interval_sec: undefined,
                            schedule: newTask.schedule || '0 9 * * *',
                          });
                        }}
                      />
                      Cron 表达式
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="schedule-mode"
                        checked={scheduleMode === 'fixed'}
                        onChange={() => {
                          setScheduleMode('fixed');
                          setNewTask({
                            ...newTask,
                            // 只保留 fixed
                            interval_sec: undefined,
                          });
                        }}
                      />
                      固定时间（一次性）
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="schedule-mode"
                        checked={scheduleMode === 'interval'}
                        onChange={() => {
                          setScheduleMode('interval');
                          setNewTask({
                            ...newTask,
                            // 只保留 interval
                            fixed_at: undefined,
                          });
                        }}
                      />
                      按间隔
                    </label>
                  </div>
                  <div className="field-hint">固定时间优先；其次按间隔最大值的紧迫度；Cron 最后。一秒只执行一个任务。</div>
                </div>

                {scheduleMode === 'cron' && (
                  <div className="form-group">
                    <label>执行时间（Cron）</label>
                    <select value={newTask.schedule || ''} onChange={(e) => setNewTask({ ...newTask, schedule: e.target.value })}>
                      <option value="">选择预设时间</option>
                      {cronPresets.map((preset) => (
                        <option key={preset.value} value={preset.value}>{preset.label}</option>
                      ))}
                    </select>
                    <input type="text" value={newTask.schedule || ''} onChange={(e) => setNewTask({ ...newTask, schedule: e.target.value })} placeholder="或输入自定义 cron 表达式" className="cron-input" />
                  </div>
                )}

                {scheduleMode === 'fixed' && (
                  <div className="form-group">
                    <label>固定时间（一次性）</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="datetime-local"
                        step={1}
                        value={(() => {
                          const iso = newTask.fixed_at;
                          if (!iso) return '';
                          const d = new Date(iso);
                          const pad = (n: number) => String(n).padStart(2, '0');
                          const yyyy = d.getFullYear();
                          const MM = pad(d.getMonth() + 1);
                          const dd = pad(d.getDate());
                          const hh = pad(d.getHours());
                          const mm = pad(d.getMinutes());
                          const ss = pad(d.getSeconds());
                          return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}`;
                        })()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) { setNewTask({ ...newTask, fixed_at: undefined }); return; }
                          const iso = new Date(val).toISOString();
                          setNewTask({ ...newTask, fixed_at: iso });
                        }}
                      />
                      {newTask.fixed_at && (
                        <button type="button" className="action-button" onClick={() => setNewTask({ ...newTask, fixed_at: undefined })}>清除</button>
                      )}
                    </div>
                  </div>
                )}

                {scheduleMode === 'interval' && (
                  <div className="form-group">
                    <label>间隔（秒）</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="number"
                        min={1}
                        max={86400}
                        placeholder="间隔秒数"
                        value={typeof newTask.interval_sec === 'number' ? newTask.interval_sec : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setNewTask({ ...newTask, interval_sec: v ? Math.max(1, Math.min(86400, Number(v))) : undefined });
                        }}
                      />
                    </div>
                    {typeof newTask.interval_sec === 'number' && newTask.interval_sec > 86400 && (
                      <div style={{ color: 'var(--danger-color)', marginTop: 4 }}>间隔不能超过24小时（86400秒）</div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label>目标设备</label>
                  <div className="device-checkboxes">
                    {settings.devices.map((device) => (
                      <label key={device.id} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={newTask.device_ids?.includes(device.serialNumber) || false}
                          onChange={(e) => {
                            const deviceIds = newTask.device_ids || [];
                            if (e.target.checked) {
                              setNewTask({ ...newTask, device_ids: [...deviceIds, device.serialNumber] });
                            } else {
                              setNewTask({ ...newTask, device_ids: deviceIds.filter(id => id !== device.serialNumber) });
                            }
                          }}
                        />
                        {device.nickname || device.serialNumber || `设备 ${device.id.slice(-4)}`}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>持续时间（秒）</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      min={1}
                      max={86400}
                      value={typeof newTask.duration_sec === 'number' ? newTask.duration_sec : 300}
                      onChange={(e) => {
                        const v = Number(e.target.value || 0);
                        const clamped = Math.max(1, Math.min(86400, v));
                        setNewTask({ ...newTask, duration_sec: clamped });
                      }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--muted-color)' }}>用于生成队列时的时间段长度，默认5分钟</span>
                  </div>
                </div>

                {newTask.task_type === 'text' && (
                  <div className="task-config">
                    <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>文本消息配置</span>
                      <button
                        type="button"
                        className="action-button"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.json,application/json';
                          input.onchange = (ev) => {
                            const file = (ev.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (r) => {
                              try {
                                const content = r.target?.result as string;
                                const json = JSON.parse(content);
                                const normalized = normalizeImportedConfig('text', json);
                                setNewTask((prev) => ({ ...prev, config: normalized }));
                                showToast('配置导入成功', 'success');
                              } catch (err) {
                                console.error('导入配置失败:', err);
                                showToast('配置导入失败：文件格式无效', 'error');
                              }
                            };
                            reader.readAsText(file);
                          };
                          input.click();
                        }}
                      >
                        导入配置
                      </button>
                    </h4>
                    <div className="form-group">
                      <label>标题</label>
                      <input type="text" value={newTask.config?.title || ''} onChange={(e) => setNewTask({ ...newTask, config: { ...newTask.config, title: e.target.value } })} placeholder="输入消息标题" />
                    </div>
                    <div className="form-group">
                      <label>内容</label>
                      <textarea value={newTask.config?.message || ''} onChange={(e) => setNewTask({ ...newTask, config: { ...newTask.config, message: e.target.value } })} placeholder="输入消息内容" rows={3} />
                    </div>
                    <div className="form-group">
                      <label>签名</label>
                      <input type="text" value={newTask.config?.signature || ''} onChange={(e) => setNewTask({ ...newTask, config: { ...newTask.config, signature: e.target.value } })} placeholder="输入消息签名" />
                    </div>
                    <div className="form-group">
                      <label>图标（Base64，可选）</label>
                      <input type="text" value={newTask.config?.icon || ''} onChange={(e) => setNewTask({ ...newTask, config: { ...newTask.config, icon: e.target.value } })} placeholder="粘贴图标的Base64数据，留空使用默认图标" />
                    </div>
                    <div className="form-group">
                      <label>跳转链接（可选）</label>
                      <input type="text" value={newTask.config?.link || ''} onChange={(e) => setNewTask({ ...newTask, config: { ...newTask.config, link: e.target.value } })} placeholder="https://example.com" />
                    </div>
                    <div className="form-group">
                      <label>预览</label>
                      <div className={`preview-box ${newTask.config?.link ? 'preview-box-clickable' : ''}`} title={newTask.config?.link ? '点击可跳转' : undefined} onClick={() => { const link = newTask.config?.link?.trim(); if (link) window.open(link, '_blank'); }} style={{ cursor: newTask.config?.link ? 'pointer' : 'default' }}>
                        <div className="preview-header">
                          <div className="preview-title">{newTask.config?.title || '标题'}</div>
                        </div>
                        <div className="preview-content">
                          <div className="preview-message">{newTask.config?.message || '内容'}</div>
                        </div>
                        <div className="preview-footer">
                          <div className="preview-icon">
                            {newTask.config?.icon ? (
                              <img src={getIconSrc(newTask.config?.icon)} alt="icon" className="icon-img" />
                            ) : (
                              <div className="icon-placeholder">🏷️</div>
                            )}
                          </div>
                          <div className="preview-signature">{newTask.config?.signature || '签名'}</div>
                        </div>
                        {newTask.config?.link && (
                          <div className="preview-link-indicator">
                            <span className="link-icon">🔗</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {newTask.task_type === 'image' && (
                  <div className="task-config">
                    <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>图片任务配置</span>
                      <button
                        type="button"
                        className="action-button"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.json,application/json';
                          input.onchange = (ev) => {
                            const file = (ev.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (r) => {
                              try {
                                const content = r.target?.result as string;
                                const json = JSON.parse(content);
                                const normalized = normalizeImportedConfig('image', json);
                                setNewTask((prev) => ({ ...prev, config: normalized }));
                                showToast('配置导入成功', 'success');
                              } catch (err) {
                                console.error('导入配置失败:', err);
                                showToast('配置导入失败：文件格式无效', 'error');
                              }
                            };
                            reader.readAsText(file);
                          };
                          input.click();
                        }}
                      >
                        导入配置
                      </button>
                    </h4>
                    <div className="form-group">
                      <label>上传图片</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = async (ev) => {
                            const dataUrl = ev.target?.result as string;
                            try {
                              const resized = await resizeImageTo296x152(dataUrl);
                              const algorithm = (newTask.config as any)?.algorithm || 'floyd_steinberg';
                              if (algorithm && algorithm !== 'original') {
                                try {
                                  const processed = await invoke<string>('process_image_with_algorithm', { image_data: resized, algorithm });
                                  setNewTask((prev) => ({ ...prev, config: { ...(prev.config || {}), image_data: processed } }));
                                } catch (err) {
                                  setNewTask((prev) => ({ ...prev, config: { ...(prev.config || {}), image_data: resized } }));
                                  console.warn('图片算法处理失败，已使用原图尺寸:', err);
                                }
                              } else {
                                setNewTask((prev) => ({ ...prev, config: { ...(prev.config || {}), image_data: resized } }));
                              }
                            } catch (err) {
                              console.error('图片处理失败:', err);
                              showToast('图片处理失败，请重试', 'error');
                            }
                          };
                          reader.onerror = () => showToast('图片读取失败', 'error');
                          reader.readAsDataURL(file);
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label>或粘贴Base64</label>
                      <textarea
                        value={newTask.config?.image_data || ''}
                        onChange={async (e) => {
                          const val = e.target.value;
                          if (!val) {
                            setNewTask({ ...newTask, config: { ...(newTask.config || {}), image_data: '' } });
                            return;
                          }
                          const dataUrl = val.startsWith('data:') ? val : `data:image/png;base64,${val}`;
                          try {
                            const resized = await resizeImageTo296x152(dataUrl);
                            setNewTask({ ...newTask, config: { ...(newTask.config || {}), image_data: resized } });
                          } catch (err) {
                            setNewTask({ ...newTask, config: { ...(newTask.config || {}), image_data: val } });
                          }
                        }}
                        placeholder="粘贴 data:image/png;base64,... 或纯Base64"
                        rows={3}
                      />
                    </div>

                    <div className="form-group">
                      <label>处理算法</label>
                      <select
                        value={newTask.config?.algorithm || 'floyd_steinberg'}
                        onChange={async (e) => {
                          const algorithm = e.target.value;
                          const current = newTask.config?.image_data as string | undefined;
                          setNewTask({ ...newTask, config: { ...(newTask.config || {}), algorithm } });
                          if (current && current.trim() && algorithm && algorithm !== 'original') {
                            try {
                              const processed = await invoke<string>('process_image_with_algorithm', { image_data: current, algorithm });
                              setNewTask((prev) => ({ ...prev, config: { ...(prev.config || {}), image_data: processed } }));
                            } catch (err) {
                              console.warn('切换算法处理失败:', err);
                            }
                          }
                        }}
                      >
                        <option value="original">原始</option>
                        <option value="floyd_steinberg">Floyd-Steinberg</option>
                        <option value="ordered">有序抖动</option>
                        <option value="random">随机抖动</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>跳转链接（可选）</label>
                      <input type="text" value={newTask.config?.link || ''} onChange={(e) => setNewTask({ ...newTask, config: { ...newTask.config, link: e.target.value } })} placeholder="https://example.com" />
                    </div>

                    {newTask.config?.image_data && (
                      <div className="form-group">
                        <label>预览</label>
                        <div className="image-preview" style={{ border: '1px solid var(--border-color)', padding: 8, display: 'inline-block' }}>
                          <img
                            src={(newTask.config?.image_data as string).startsWith('data:') ? (newTask.config?.image_data as string) : `data:image/png;base64,${newTask.config?.image_data}`}
                            alt="预览"
                            style={{ width: 296, height: 152, objectFit: 'cover' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {newTask.task_type === 'text-to-image' && (
                  <div className="task-config">
                    <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>制图任务配置</span>
                      <button
                        type="button"
                        className="action-button"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.json,application/json';
                          input.onchange = (ev) => {
                            const file = (ev.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (r) => {
                              try {
                                const content = r.target?.result as string;
                                const json = JSON.parse(content);
                                console.log('导入的原始配置:', json);
                                const normalized = normalizeImportedConfig('text-to-image', json);
                                console.log('标准化后的配置:', normalized);
                                setNewTask((prev) => ({ ...prev, config: normalized }));
                                showToast('配置导入成功', 'success');
                              } catch (err) {
                                console.error('导入配置失败:', err);
                                showToast('配置导入失败：文件格式无效', 'error');
                              }
                            };
                            reader.readAsText(file);
                          };
                          input.click();
                        }}
                      >
                        导入配置
                      </button>
                    </h4>
                    <div className="form-group">
                      <label>预览</label>
                      {t2iPreview ? (
                        <img src={t2iPreview} alt="预览" style={{ width: 296, height: 152, border: '1px solid var(--border-color)' }} />
                      ) : (
                        <div style={{ width: 296, height: 152, border: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-color)' }}>
                          暂无预览
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={newTask.enabled || false} onChange={(e) => setNewTask({ ...newTask, enabled: e.target.checked })} />
                    启用任务
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel" onClick={closeTaskModal}>取消</button>
              <button className="modal-save" onClick={saveTask}>{editingTask ? '更新' : '创建'}</button>
            </div>
          </div>
        </div>
      )}

      {showLogsModal && (
        <div className="modal-overlay" onClick={() => setShowLogsModal(false)}>
          <div className="modal-content logs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>执行日志</h3>
            </div>
            <div className="modal-body">
              <div className="logs-list">
                {logs.length === 0 ? (
                  <div className="empty-logs">
                    <p>暂无执行日志</p>
                  </div>
                ) : (
                  logs.map((log) => {
                    const task = tasks.find(t => t.id === log.task_id);
                    return (
                      <div key={log.id} className={`log-item ${log.success ? 'success' : 'error'}`}>
                        <div className="log-header">
                          <span className="log-task">{task?.name || '未知任务'}</span>
                          <span className="log-time">{formatTime(log.executed_at)}</span>
                          <span className={`log-status ${log.success ? 'success' : 'error'}`}>{log.success ? '成功' : '失败'}</span>
                        </div>
                        {log.error_message && (<div className="log-error">错误: {log.error_message}</div>)}
                        <div className="log-duration">执行时间: {log.duration_ms}ms</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-close" onClick={() => setShowLogsModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationTab;
