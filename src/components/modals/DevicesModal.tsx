import React from 'react';
import type { Settings, Device } from '../../types';

interface DevicesModalProps {
  settings: Settings;
  setSettings: (s: Settings) => void;
  onSave: () => void;
  onClose: () => void;
}

const DevicesModal: React.FC<DevicesModalProps> = ({ settings, setSettings, onSave, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
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
                          ? (newDevices.length > 0 ? newDevices[0].id : '')
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
                          d.id === device.id ? { ...d, nickname: e.target.value } : d
                        );
                        setSettings({ ...settings, devices: newDevices });
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
                          d.id === device.id ? { ...d, serialNumber: e.target.value } : d
                        );
                        setSettings({ ...settings, devices: newDevices });
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
                        d.id === device.id ? { ...d, apiKey: e.target.value } : d
                      );
                      setSettings({ ...settings, devices: newDevices });
                    }}
                    placeholder="输入API密钥"
                    title={device.apiKey || '输入API密钥'}
                  />
                </div>
              </div>
            ))}
            <button 
              className="add-device-btn"
              onClick={() => {
                const newDevice: Device = {
                  id: Date.now().toString(),
                  apiKey: '',
                  serialNumber: '',
                  nickname: ''
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
          <button className="modal-cancel" onClick={onClose}>取消</button>
          <button className="modal-save" onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  );
};

export default DevicesModal;
