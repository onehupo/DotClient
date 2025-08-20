import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Settings } from '../types';

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
  fixed_at?: string;
  interval_sec?: number;  // 单一时间间隔（秒）
}

interface TaskExecutionLog {
  id: string;
  task_id: string;
  executed_at: string;
  success: boolean;
  error_message?: string;
  duration_ms: number;
}

interface AutomationPageProps {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  settings: Settings;
}

const AutomationPage: React.FC<AutomationPageProps> = ({ showToast, settings }) => {
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [logs, setLogs] = useState<TaskExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [editingTask, setEditingTask] = useState<AutomationTask | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [scheduleMode, setScheduleMode] = useState<'cron' | 'interval'>('cron'); // 调度模式
  const [intervalValue, setIntervalValue] = useState(300); // 间隔值（秒），默认5分钟
  const [intervalUnit, setIntervalUnit] = useState<'seconds' | 'minutes' | 'hours'>('minutes'); // 间隔单位
  const [newTask, setNewTask] = useState<Partial<AutomationTask>>({
    name: '',
    task_type: 'text',
    enabled: true,
    schedule: '0 9 * * *', // 默认每天9点
    device_ids: [],
    config: {
      type: 'text',
      title: '',
      message: '',
      signature: '',
      icon: null,
      link: null,
    }
  });

  // 预设的cron表达式
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

  // 预设的时间间隔选项
  const intervalPresets = [
    { label: '30秒', value: 30, unit: 'seconds' },
    { label: '1分钟', value: 60, unit: 'seconds' },
    { label: '5分钟', value: 300, unit: 'seconds' },
    { label: '15分钟', value: 900, unit: 'seconds' },
    { label: '30分钟', value: 1800, unit: 'seconds' },
    { label: '1小时', value: 3600, unit: 'seconds' },
    { label: '2小时', value: 7200, unit: 'seconds' },
    { label: '6小时', value: 21600, unit: 'seconds' },
    { label: '12小时', value: 43200, unit: 'seconds' },
    { label: '24小时', value: 86400, unit: 'seconds' },
  ];

  // 转换间隔值到秒
  const convertIntervalToSeconds = (value: number, unit: string): number => {
    switch (unit) {
      case 'minutes': return value * 60;
      case 'hours': return value * 3600;
      case 'seconds':
      default: return value;
    }
  };

  // 从秒转换到合适的单位和值
  const convertSecondsToInterval = (seconds: number): { value: number; unit: string } => {
    if (seconds >= 3600 && seconds % 3600 === 0) {
      return { value: seconds / 3600, unit: 'hours' };
    } else if (seconds >= 60 && seconds % 60 === 0) {
      return { value: seconds / 60, unit: 'minutes' };
    } else {
      return { value: seconds, unit: 'seconds' };
    }
  };

  // 加载任务列表
  const loadTasks = async () => {
    try {
      const tasksData = await invoke<AutomationTask[]>('automation_get_tasks');
      setTasks(tasksData);
    } catch (error) {
      console.error('加载任务失败:', error);
      showToast('加载任务失败', 'error');
    }
  };

  // 加载执行日志
  const loadLogs = async () => {
    try {
      const logsData = await invoke<TaskExecutionLog[]>('automation_get_logs', { limit: 100 });
      setLogs(logsData);
    } catch (error) {
      console.error('加载日志失败:', error);
      showToast('加载日志失败', 'error');
    }
  };

  // 加载全局自动化开关状态
  const loadAutomationEnabled = async () => {
    try {
      const enabled = await invoke<boolean>('automation_get_enabled');
      setAutomationEnabled(enabled);
    } catch (error) {
      console.error('加载自动化开关状态失败:', error);
      showToast('加载自动化开关状态失败', 'error');
    }
  };

  // 切换全局自动化开关
  const toggleAutomationEnabled = async () => {
    try {
      const newState = !automationEnabled;
      await invoke('automation_set_enabled', { enabled: newState });
      setAutomationEnabled(newState);
      showToast(
        newState ? '自动化已启用' : '自动化已禁用',
        newState ? 'success' : 'info'
      );
    } catch (error) {
      console.error('切换自动化开关失败:', error);
      showToast('切换自动化开关失败', 'error');
    }
  };

  // 同步设备API密钥到自动化系统
  const syncApiKeys = async () => {
    try {
      const deviceConfigs = settings.devices.map(device => [
        device.serialNumber,
        device.apiKey
      ]);
      
      await invoke('automation_sync_api_keys', { deviceConfigs });
      console.log('API密钥同步完成');
    } catch (error) {
      console.error('同步API密钥失败:', error);
    }
  };

  // 初始化加载
  useEffect(() => {
    const initLoad = async () => {
      setLoading(true);
      await Promise.all([
        loadTasks(), 
        loadLogs(),
        loadAutomationEnabled(), // 加载自动化开关状态
        syncApiKeys() // 同步API密钥
      ]);
      setLoading(false);
    };
    initLoad();
  }, [settings]); // 依赖settings，当设备配置变化时重新同步

  // 实时时间更新
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // 添加或更新任务
  const saveTask = async () => {
    try {
      if (!newTask.name?.trim()) {
        showToast('请输入任务名称', 'error');
        return;
      }

      if (!newTask.schedule?.trim() && scheduleMode === 'cron') {
        showToast('请设置执行时间', 'error');
        return;
      }

      if (scheduleMode === 'interval' && !intervalValue) {
        showToast('请设置时间间隔', 'error');
        return;
      }

      if (scheduleMode === 'interval' && convertIntervalToSeconds(intervalValue, intervalUnit) > 86400) {
        showToast('时间间隔不能超过24小时', 'error');
        return;
      }

      if (!newTask.device_ids?.length) {
        showToast('请选择至少一个设备', 'error');
        return;
      }

      // 根据任务类型创建正确的config结构
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
            texts: newTask.config?.texts || [],
            link: newTask.config?.link || null,
          };
          break;
        default:
          throw new Error('未知的任务类型');
      }

      const taskToSave: AutomationTask = {
        id: editingTask?.id || '',
        name: newTask.name!,
        task_type: newTask.task_type!,
        enabled: newTask.enabled!,
        schedule: scheduleMode === 'cron' ? newTask.schedule! : '', // cron模式才使用schedule
        device_ids: newTask.device_ids!,
        config: config,
        run_count: editingTask?.run_count || 0,
        error_count: editingTask?.error_count || 0,
        created_at: editingTask?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // 间隔模式使用 interval_sec 字段
        interval_sec: scheduleMode === 'interval' ? convertIntervalToSeconds(intervalValue, intervalUnit) : undefined,
        // 固定时间模式保留 fixed_at 字段
        fixed_at: scheduleMode === 'cron' ? editingTask?.fixed_at : undefined,
      };

      if (editingTask) {
        await invoke('automation_update_task', { task: taskToSave });
        showToast('任务更新成功', 'success');
      } else {
        await invoke('automation_add_task', { task: taskToSave });
        showToast('任务创建成功', 'success');
      }

      // 为任务关联的设备存储API密钥
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

  // 删除任务
  const deleteTask = async (taskId: string) => {
    if (!confirm('确定要删除这个任务吗？')) {
      return;
    }

    try {
      await invoke('automation_delete_task', { taskId });
      showToast('任务删除成功', 'success');
      await loadTasks();
    } catch (error) {
      console.error('删除任务失败:', error);
      showToast(`删除任务失败: ${error}`, 'error');
    }
  };

  // 切换任务启用状态
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

  // 手动执行任务
  const executeTask = async (task: AutomationTask) => {
    if (!task.enabled) {
      showToast('任务已禁用，无法执行', 'error');
      return;
    }

    // 获取API密钥
    const device = settings.devices.find(d => task.device_ids.includes(d.serialNumber));
    if (!device || !device.apiKey) {
      showToast('找不到设备或API密钥', 'error');
      return;
    }

    try {
      showToast(`正在执行任务: ${task.name}...`, 'info');
      
      await invoke('automation_execute_task', {
        taskId: task.id,
        apiKey: device.apiKey
      });
      
      showToast(`任务执行成功: ${task.name}`, 'success');
      await Promise.all([loadTasks(), loadLogs()]);
    } catch (error) {
      console.error('任务执行失败:', error);
      showToast(`任务执行失败: ${error}`, 'error');
    }
  };

  // 打开任务模态框
  const openTaskModal = (task?: AutomationTask) => {
    if (task) {
      setEditingTask(task);
      // 根据任务判断调度模式
      if (task.interval_sec) {
        setScheduleMode('interval');
        const intervalData = convertSecondsToInterval(task.interval_sec);
        setIntervalValue(intervalData.value);
        setIntervalUnit(intervalData.unit as 'seconds' | 'minutes' | 'hours');
      } else {
        setScheduleMode('cron');
      }
      setNewTask({
        name: task.name,
        task_type: task.task_type,
        enabled: task.enabled,
        schedule: task.schedule,
        device_ids: task.device_ids,
        config: task.config,
      });
    } else {
      setEditingTask(null);
      setScheduleMode('cron');
      setIntervalValue(300); // 默认5分钟
      setIntervalUnit('seconds');
      setNewTask({
        name: '',
        task_type: 'text',
        enabled: true,
        schedule: '0 9 * * *',
        device_ids: settings.selectedDeviceId ? (() => {
          const selectedDevice = settings.devices.find(d => d.id === settings.selectedDeviceId);
          return selectedDevice?.serialNumber ? [selectedDevice.serialNumber] : [];
        })() : [],
        config: {
          title: '',
          message: '',
          signature: '',
          icon: null,
          link: null,
        }
      });
    }
    setShowTaskModal(true);
  };

  // 关闭任务模态框
  const closeTaskModal = () => {
    setShowTaskModal(false);
    setEditingTask(null);
  };

  // 格式化时间
  const formatTime = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  // 格式化相对时间
  const formatRelativeTime = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = currentTime;
    const diffMs = date.getTime() - now.getTime();
    
    if (diffMs < 0) {
      return '已过期';
    }
    
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}天后`;
    } else if (diffHours > 0) {
      return `${diffHours}小时后`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}分钟后`;
    } else {
      return `${diffSeconds}秒后`;
    }
  };

  // 计算任务的下次执行时间
  const calculateNextRun = (task: AutomationTask): string => {
    const now = new Date();
    
    // 优先处理间隔模式
    if (task.interval_sec) {
      if (task.last_run) {
        const lastRun = new Date(task.last_run);
        const nextRun = new Date(lastRun.getTime() + task.interval_sec * 1000);
        return nextRun.toISOString();
      } else {
        // 从未执行过，立即执行
        return now.toISOString();
      }
    }
    
    // 处理固定时间
    if (task.fixed_at) {
      return new Date(task.fixed_at).toISOString();
    }
    
    // 处理cron表达式
    const cronExpr = task.schedule;
    
    // 基础的cron解析，支持常用格式
    if (cronExpr === '* * * * *') {
      // 每分钟
      const next = new Date(now);
      next.setSeconds(0, 0);
      next.setMinutes(next.getMinutes() + 1);
      return next.toISOString();
    } else if (cronExpr === '0 * * * *') {
      // 每小时
      const next = new Date(now);
      next.setMinutes(0, 0, 0);
      next.setHours(next.getHours() + 1);
      return next.toISOString();
    } else if (cronExpr.match(/^0 \d+ \* \* \*$/)) {
      // 每天固定时间，如 "0 9 * * *"
      const hour = parseInt(cronExpr.split(' ')[1]);
      const next = new Date(now);
      next.setHours(hour, 0, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next.toISOString();
    } else if (cronExpr.match(/^0 \d+ \* \* [1-5]$/)) {
      // 工作日固定时间，如 "0 9 * * 1-5"
      const hour = parseInt(cronExpr.split(' ')[1]);
      const next = new Date(now);
      next.setHours(hour, 0, 0, 0);
      
      // 如果今天已过时间或今天是周末，找下一个工作日
      while (next <= now || next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1);
        next.setHours(hour, 0, 0, 0);
      }
      return next.toISOString();
    } else if (cronExpr.match(/^0 \d+ \* \* [0,6]$/)) {
      // 周末固定时间，如 "0 10 * * 0,6"
      const hour = parseInt(cronExpr.split(' ')[1]);
      const next = new Date(now);
      next.setHours(hour, 0, 0, 0);
      
      // 如果今天已过时间或今天不是周末，找下一个周末
      while (next <= now || (next.getDay() !== 0 && next.getDay() !== 6)) {
        next.setDate(next.getDate() + 1);
        next.setHours(hour, 0, 0, 0);
      }
      return next.toISOString();
    }
    
    // 默认返回一小时后（对于复杂的cron表达式）
    const next = new Date(now.getTime() + 60 * 60 * 1000);
    return next.toISOString();
  };

  // 解析cron表达式或间隔时间为可读文本
  const parseScheduleExpression = (task: AutomationTask) => {
    if (task.interval_sec) {
      const interval = convertSecondsToInterval(task.interval_sec);
      return `每 ${interval.value} ${interval.unit === 'hours' ? '小时' : interval.unit === 'minutes' ? '分钟' : '秒'}`;
    }
    
    const preset = cronPresets.find(p => p.value === task.schedule);
    return preset ? preset.label : task.schedule;
  };

  if (loading) {
    return (
      <div className="automation-page">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="automation-page">
      <div className="automation-header">
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
              <input
                type="checkbox"
                checked={automationEnabled}
                onChange={toggleAutomationEnabled}
              />
              <span className="slider"></span>
            </label>
            <span className={`toggle-label ${automationEnabled ? 'enabled' : 'disabled'}`}>
              {automationEnabled ? '自动化已启用' : '自动化已禁用'}
            </span>
          </div>
          <button 
            className="action-button view-logs-button"
            onClick={() => setShowLogsModal(true)}
          >
            查看日志
          </button>
          <button 
            className="action-button add-task-button"
            onClick={() => openTaskModal()}
          >
            + 新建任务
          </button>
        </div>
      </div>

      {/* 任务统计 */}
      <div className="automation-stats">
        <div className="stat-item">
          <span className="stat-label">总任务数</span>
          <span className="stat-value">{tasks.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">启用任务</span>
          <span className="stat-value">{tasks.filter(t => t.enabled).length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">今日执行</span>
          <span className="stat-value">{logs.filter(l => new Date(l.executed_at).toDateString() === new Date().toDateString()).length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">下次执行</span>
          <span className="stat-value">
            {(() => {
              const enabledTasks = tasks.filter(t => t.enabled);
              if (enabledTasks.length === 0) return '-';
              
              const nextTimes = enabledTasks.map(t => new Date(calculateNextRun(t)));
              const earliest = new Date(Math.min(...nextTimes.map(d => d.getTime())));
              return formatRelativeTime(earliest.toISOString());
            })()}
          </span>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="tasks-list">
        {tasks.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🤖</span>
            <p>还没有自动化任务</p>
            <button 
              className="action-button"
              onClick={() => openTaskModal()}
            >
              创建第一个任务
            </button>
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className={`task-item ${!task.enabled ? 'disabled' : ''}`}>
              <div className="task-header">
                <div className="task-info">
                  <h3 className="task-name">{task.name}</h3>
                  <span className="task-type">{
                    task.task_type === 'text' ? '文本' : 
                    task.task_type === 'image' ? '图片' : '制图'
                  }</span>
                </div>
                <div className="task-actions">
                  <button
                    className={`toggle-button ${task.enabled ? 'enabled' : 'disabled'}`}
                    onClick={() => toggleTaskEnabled(task)}
                  >
                    {task.enabled ? '已启用' : '已禁用'}
                  </button>
                  <button
                    className="execute-button"
                    onClick={() => executeTask(task)}
                    disabled={!task.enabled}
                  >
                    立即执行
                  </button>
                  <button
                    className="edit-button"
                    onClick={() => openTaskModal(task)}
                  >
                    编辑
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => deleteTask(task.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
              <div className="task-details">
                <div className="task-schedule">
                  <span className="label">执行时间:</span>
                  <span className="value">{parseScheduleExpression(task)}</span>
                </div>
                <div className="task-devices">
                  <span className="label">目标设备:</span>
                  <span className="value">
                    {task.device_ids.map(deviceId => {
                      const device = settings.devices.find(d => d.serialNumber === deviceId);
                      return device ? (device.nickname || device.serialNumber) : deviceId;
                    }).join(', ')}
                  </span>
                </div>
                <div className="task-stats">
                  <span className="stat">执行次数: {task.run_count}</span>
                  <span className="stat">错误次数: {task.error_count}</span>
                  <span className="stat">上次执行: {formatTime(task.last_run)}</span>
                  <span className="stat next-run">
                    下次执行: {task.enabled ? formatRelativeTime(calculateNextRun(task)) : '已禁用'}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 任务创建/编辑模态框 */}
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
                  <input
                    type="text"
                    value={newTask.name || ''}
                    onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                    placeholder="输入任务名称"
                  />
                </div>

                <div className="form-group">
                  <label>任务类型</label>
                  <select
                    value={newTask.task_type || 'text'}
                    onChange={(e) => setNewTask({ 
                      ...newTask, 
                      task_type: e.target.value as 'text' | 'image' | 'text-to-image'
                    })}
                  >
                    <option value="text">文本消息</option>
                    <option value="image">图片内容</option>
                    <option value="text-to-image">制图内容</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>执行时间</label>
                  
                  {/* 调度模式选择 */}
                  <div className="schedule-mode-selector">
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="scheduleMode"
                        value="cron"
                        checked={scheduleMode === 'cron'}
                        onChange={(e) => setScheduleMode(e.target.value as 'cron' | 'interval')}
                      />
                      定时执行 (Cron)
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="scheduleMode"
                        value="interval"
                        checked={scheduleMode === 'interval'}
                        onChange={(e) => setScheduleMode(e.target.value as 'cron' | 'interval')}
                      />
                      间隔执行
                    </label>
                  </div>

                  {/* Cron模式 */}
                  {scheduleMode === 'cron' && (
                    <>
                      <select
                        value={newTask.schedule || ''}
                        onChange={(e) => setNewTask({ ...newTask, schedule: e.target.value })}
                      >
                        <option value="">选择预设时间</option>
                        {cronPresets.map((preset) => (
                          <option key={preset.value} value={preset.value}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={newTask.schedule || ''}
                        onChange={(e) => setNewTask({ ...newTask, schedule: e.target.value })}
                        placeholder="或输入自定义 cron 表达式"
                        className="cron-input"
                      />
                    </>
                  )}

                  {/* 间隔模式 */}
                  {scheduleMode === 'interval' && (
                    <>
                      <select
                        value={convertIntervalToSeconds(intervalValue, intervalUnit)}
                        onChange={(e) => {
                          const seconds = parseInt(e.target.value);
                          const preset = intervalPresets.find(p => p.value === seconds);
                          if (preset) {
                            setIntervalValue(preset.value);
                            setIntervalUnit('seconds');
                          }
                        }}
                      >
                        <option value="">选择预设间隔</option>
                        {intervalPresets.map((preset) => (
                          <option key={preset.value} value={preset.value}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <div className="interval-custom">
                        <input
                          type="number"
                          min="1"
                          max={intervalUnit === 'hours' ? 24 : intervalUnit === 'minutes' ? 1440 : 86400}
                          value={intervalValue}
                          onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
                          placeholder="间隔时间"
                          className="interval-input"
                        />
                        <select
                          value={intervalUnit}
                          onChange={(e) => {
                            const newUnit = e.target.value as 'seconds' | 'minutes' | 'hours';
                            setIntervalUnit(newUnit);
                            // 确保值在合理范围内
                            const maxValues = { seconds: 86400, minutes: 1440, hours: 24 };
                            if (intervalValue > maxValues[newUnit]) {
                              setIntervalValue(maxValues[newUnit]);
                            }
                          }}
                          className="interval-unit"
                        >
                          <option value="seconds">秒</option>
                          <option value="minutes">分钟</option>
                          <option value="hours">小时</option>
                        </select>
                      </div>
                      <div className="interval-hint">
                        最长可设置24小时间隔
                      </div>
                    </>
                  )}
                </div>

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
                              setNewTask({ 
                                ...newTask, 
                                device_ids: [...deviceIds, device.serialNumber] 
                              });
                            } else {
                              setNewTask({ 
                                ...newTask, 
                                device_ids: deviceIds.filter(id => id !== device.serialNumber)
                              });
                            }
                          }}
                        />
                        {device.nickname || device.serialNumber || `设备 ${device.id.slice(-4)}`}
                      </label>
                    ))}
                  </div>
                </div>

                {/* 根据任务类型显示不同的配置 */}
                {newTask.task_type === 'text' && (
                  <div className="task-config">
                    <h4>文本消息配置</h4>
                    <div className="form-group">
                      <label>标题</label>
                      <input
                        type="text"
                        value={newTask.config?.title || ''}
                        onChange={(e) => setNewTask({
                          ...newTask,
                          config: { ...newTask.config, title: e.target.value }
                        })}
                        placeholder="输入消息标题"
                      />
                    </div>
                    <div className="form-group">
                      <label>内容</label>
                      <textarea
                        value={newTask.config?.message || ''}
                        onChange={(e) => setNewTask({
                          ...newTask,
                          config: { ...newTask.config, message: e.target.value }
                        })}
                        placeholder="输入消息内容"
                        rows={3}
                      />
                    </div>
                    <div className="form-group">
                      <label>签名</label>
                      <input
                        type="text"
                        value={newTask.config?.signature || ''}
                        onChange={(e) => setNewTask({
                          ...newTask,
                          config: { ...newTask.config, signature: e.target.value }
                        })}
                        placeholder="输入消息签名"
                      />
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={newTask.enabled || false}
                      onChange={(e) => setNewTask({ ...newTask, enabled: e.target.checked })}
                    />
                    启用任务
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel" onClick={closeTaskModal}>
                取消
              </button>
              <button className="modal-save" onClick={saveTask}>
                {editingTask ? '更新' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 执行日志模态框 */}
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
                          <span className={`log-status ${log.success ? 'success' : 'error'}`}>
                            {log.success ? '成功' : '失败'}
                          </span>
                        </div>
                        {log.error_message && (
                          <div className="log-error">
                            错误: {log.error_message}
                          </div>
                        )}
                        <div className="log-duration">
                          执行时间: {log.duration_ms}ms
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-close" onClick={() => setShowLogsModal(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationPage;
