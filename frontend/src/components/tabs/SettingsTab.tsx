import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Bell, MessageSquare, Shield, Globe, Cpu, Database, Save, RefreshCw, Key, Plus, Trash2, X, Settings } from 'lucide-react';
import Modal from '../Modal';

interface CustomPushConfig {
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  contentType: string;
  enabled: boolean;
  fields: { type: string; key: string; value: string }[];
}

interface SettingsData {
  task: {
    taskExpireDays: number;
    taskCheckCron: string;
    cleanRecycleCron: string;
    lazyFileCleanupCron: string;
    maxRetries: number;
    retryInterval: number;
    enableAutoClearRecycle: boolean;
    enableAutoClearFamilyRecycle: boolean;
    enableAutoCleanLazyFiles: boolean;
    lazyFileRetentionHours: number;
    mediaSuffix: string;
    enableOnlySaveMedia: boolean;
    enableAutoCreateFolder: boolean;
    autoCreate: {
      accountId: string;
      targetFolderId: string;
      targetFolder: string;
    }
  };
  wecom: {
    enable: boolean;
    webhook: string;
  };
  telegram: {
    enable: boolean;
    proxyDomain: string;
    botToken: string;
    chatId: string;
    bot: {
      enable: boolean;
      botToken: string;
      chatId: string;
    }
  };
  wxpusher: {
    enable: boolean;
    spt: string;
  };
  proxy: {
    host: string;
    port: number;
    username: string;
    password: string;
    services: {
      telegram: boolean;
      tmdb: boolean;
      openai: boolean;
      cloud189: boolean;
      customPush: boolean;
    }
  };
  bark: {
    enable: boolean;
    serverUrl: string;
    key: string;
  };
  system: {
    username: string;
    password: string;
    baseUrl: string;
    apiKey: string;
  };
  pushplus: {
    enable: boolean;
    token: string;
    topic: string;
    channel: string;
    webhook: string;
    to: string;
  };
  customPush: CustomPushConfig[];
  strm?: {
    enable: boolean;
    useStreamProxy: boolean;
  };
  emby?: {
    enable: boolean;
    serverUrl: string;
    apiKey: string;
    proxy: {
      enable: boolean;
      port: number;
    }
  };
  tmdb?: {
    enableScraper: boolean;
    tmdbApiKey: string;
  };
  openai?: {
    enable: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    rename?: {
      template: string;
      movieTemplate: string;
    }
  };
  alist?: {
    enable: boolean;
    baseUrl: string;
    apiKey: string;
  };
}

const initialSettings: SettingsData = {
  task: {
    taskExpireDays: 3,
    taskCheckCron: '0 19-23 * * *',
    cleanRecycleCron: '0 */8 * * *',
    lazyFileCleanupCron: '0 */6 * * *',
    maxRetries: 3,
    retryInterval: 300,
    enableAutoClearRecycle: false,
    enableAutoClearFamilyRecycle: false,
    enableAutoCleanLazyFiles: false,
    lazyFileRetentionHours: 24,
    mediaSuffix: '.mkv;.iso;.ts;.mp4;.avi;.rmvb;.wmv;.m2ts;.mpg;.flv;.rm;.mov',
    enableOnlySaveMedia: false,
    enableAutoCreateFolder: false,
    autoCreate: { accountId: '', targetFolderId: '', targetFolder: '' }
  },
  wecom: { enable: false, webhook: '' },
  telegram: {
    enable: false,
    proxyDomain: '',
    botToken: '',
    chatId: '',
    bot: { enable: false, botToken: '', chatId: '' }
  },
  wxpusher: { enable: false, spt: '' },
  proxy: {
    host: '',
    port: 0,
    username: '',
    password: '',
    services: { telegram: false, tmdb: false, openai: false, cloud189: false, customPush: false }
  },
  bark: { enable: false, serverUrl: '', key: '' },
  system: { username: '', password: '', baseUrl: '', apiKey: '' },
  pushplus: { enable: false, token: '', topic: '', channel: '', webhook: '', to: '' },
  customPush: []
};

const SettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<SettingsData>(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Custom Push Modal State
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [editingPushIndex, setEditingPushIndex] = useState<number | null>(null);
  const [pushForm, setPushForm] = useState<CustomPushConfig>({
    name: '',
    description: '',
    url: '',
    method: 'POST',
    contentType: 'application/json',
    enabled: true,
    fields: []
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (data.success) {
        setSettings(data.data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await response.json();
      if (data.success) {
        alert('设置已成功保存');
      } else {
        alert('保存失败: ' + data.error);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('保存失败: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const generateApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let apiKey = '';
    for (let i = 0; i < 32; i++) {
      apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSettings(prev => ({
      ...prev,
      system: { ...prev.system, apiKey }
    }));
  };

  const updateSettings = (path: string, value: any) => {
    const parts = path.split('.');
    setSettings(prev => {
      const newSettings = { ...prev };
      let current: any = newSettings;
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return newSettings;
    });
  };

  // Custom Push Handlers
  const handlePushSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newConfigs = [...(settings.customPush || [])];
    if (editingPushIndex !== null) {
      newConfigs[editingPushIndex] = pushForm;
    } else {
      newConfigs.push(pushForm);
    }
    updateSettings('customPush', newConfigs);
    setIsPushModalOpen(false);
  };

  const deletePushConfig = (index: number) => {
    if (!confirm('确定删除此推送配置吗？')) return;
    const newConfigs = settings.customPush.filter((_, i) => i !== index);
    updateSettings('customPush', newConfigs);
  };

  const testPush = async (config: CustomPushConfig) => {
    try {
      const response = await fetch('/api/custom-push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await response.json();
      if (data.success) alert('推送测试成功');
      else alert('测试失败: ' + data.error);
    } catch (e) {
      alert('测试失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={32} className="text-[#0b57d0] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      {/* System Credentials */}
      <section className="space-y-4">
        <h3 className="text-xl font-medium text-slate-900 flex items-center gap-3">
          <Shield size={24} className="text-[#0b57d0]" /> 访问认证
        </h3>
        <div className="bg-white rounded-3xl border border-slate-200/60 p-8 space-y-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">管理员用户名</label>
              <input 
                type="text" 
                value={settings.system.username}
                onChange={(e) => updateSettings('system.username', e.target.value)}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">管理员密码</label>
              <input 
                type="password" 
                value={settings.system.password}
                onChange={(e) => updateSettings('system.password', e.target.value)}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
                placeholder="留空则不修改"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">系统 API Key</label>
            <div className="flex gap-3">
              <input 
                type="text" 
                value={settings.system.apiKey}
                onChange={(e) => updateSettings('system.apiKey', e.target.value)}
                placeholder="系统 API Key" 
                className="flex-1 px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
              />
              <button 
                onClick={generateApiKey}
                className="px-6 py-3 bg-[#d3e3fd] text-[#041e49] rounded-2xl text-sm font-medium hover:bg-[#c2e7ff] transition-colors flex items-center gap-2"
              >
                <Key size={18} /> 生成
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Task Settings */}
      <section className="space-y-4">
        <h3 className="text-xl font-medium text-slate-900 flex items-center gap-3">
          <Database size={24} className="text-[#0b57d0]" /> 任务设置
        </h3>
        <div className="bg-white rounded-3xl border border-slate-200/60 p-8 space-y-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">任务过期天数</label>
              <input 
                type="number" 
                value={settings.task.taskExpireDays}
                onChange={(e) => updateSettings('task.taskExpireDays', parseInt(e.target.value))}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">最大重试次数</label>
              <input 
                type="number" 
                value={settings.task.maxRetries}
                onChange={(e) => updateSettings('task.maxRetries', parseInt(e.target.value))}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">重试间隔 (秒)</label>
              <input 
                type="number" 
                value={settings.task.retryInterval}
                onChange={(e) => updateSettings('task.retryInterval', parseInt(e.target.value))}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">任务检查定时 (Cron)</label>
            <input 
              type="text" 
              value={settings.task.taskCheckCron}
              onChange={(e) => updateSettings('task.taskCheckCron', e.target.value)}
              className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <label className="flex items-center gap-3 cursor-pointer group p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
              <div 
                onClick={() => updateSettings('task.enableAutoClearRecycle', !settings.task.enableAutoClearRecycle)}
                className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                  settings.task.enableAutoClearRecycle ? 'bg-[#0b57d0] border-[#0b57d0]' : 'border-slate-300 bg-white'
                }`}
              >
                {settings.task.enableAutoClearRecycle && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
              </div>
              <div>
                <span className="text-sm font-medium text-slate-900">自动清空回收站</span>
                <p className="text-[10px] text-slate-400">定期清理个人云回收站</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
              <div 
                onClick={() => updateSettings('task.enableOnlySaveMedia', !settings.task.enableOnlySaveMedia)}
                className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                  settings.task.enableOnlySaveMedia ? 'bg-[#0b57d0] border-[#0b57d0]' : 'border-slate-300 bg-white'
                }`}
              >
                {settings.task.enableOnlySaveMedia && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
              </div>
              <div>
                <span className="text-sm font-medium text-slate-900">仅转存媒体文件</span>
                <p className="text-[10px] text-slate-400">跳过图片、文档等非媒体文件</p>
              </div>
            </label>
          </div>
        </div>
      </section>

      {/* Push Notifications */}
      <section className="space-y-4">
        <h3 className="text-xl font-medium text-slate-900 flex items-center gap-3">
          <Bell size={24} className="text-[#b3261e]" /> 消息推送
        </h3>
        <div className="bg-white rounded-3xl border border-slate-200/60 p-8 space-y-6 shadow-sm">
          {/* WeCom */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#d3e3fd] text-[#0b57d0] flex items-center justify-center">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">企业微信推送</p>
                  <p className="text-xs text-slate-500">通过 Webhook 推送任务状态</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={settings.wecom.enable}
                  onChange={(e) => updateSettings('wecom.enable', e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0b57d0]"></div>
              </label>
            </div>
            {settings.wecom.enable && (
              <div className="px-4 animate-in slide-in-from-top-2 duration-200">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Webhook URL</label>
                <input 
                  type="text" 
                  value={settings.wecom.webhook}
                  onChange={(e) => updateSettings('wecom.webhook', e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
                  placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                />
              </div>
            )}
          </div>

          {/* Telegram */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#d3e3fd] text-[#0b57d0] flex items-center justify-center">
                  <Globe size={20} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Telegram 推送</p>
                  <p className="text-xs text-slate-500">使用 Bot 推送通知</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={settings.telegram.enable}
                  onChange={(e) => updateSettings('telegram.enable', e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0b57d0]"></div>
              </label>
            </div>
            {settings.telegram.enable && (
              <div className="px-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 block">Bot Token</label>
                    <input 
                      type="text" 
                      value={settings.telegram.botToken}
                      onChange={(e) => updateSettings('telegram.botToken', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 block">Chat ID</label>
                    <input 
                      type="text" 
                      value={settings.telegram.chatId}
                      onChange={(e) => updateSettings('telegram.chatId', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Network Proxy */}
      <section className="space-y-4">
        <h3 className="text-xl font-medium text-slate-900 flex items-center gap-3">
          <Globe size={24} className="text-[#0b57d0]" /> 网络代理
        </h3>
        <div className="bg-white rounded-3xl border border-slate-200/60 p-8 space-y-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">代理地址</label>
              <input 
                type="text" 
                value={settings.proxy.host}
                onChange={(e) => updateSettings('proxy.host', e.target.value)}
                placeholder="127.0.0.1"
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">代理端口</label>
              <input 
                type="number" 
                value={settings.proxy.port}
                onChange={(e) => updateSettings('proxy.port', parseInt(e.target.value))}
                placeholder="7890"
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">代理用户名</label>
              <input 
                type="text" 
                value={settings.proxy.username}
                onChange={(e) => updateSettings('proxy.username', e.target.value)}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">代理密码</label>
              <input 
                type="password" 
                value={settings.proxy.password}
                onChange={(e) => updateSettings('proxy.password', e.target.value)}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
              />
            </div>
          </div>
          <div className="pt-2">
            <p className="text-xs font-medium text-slate-500 mb-3">代理服务选择</p>
            <div className="flex flex-wrap gap-3">
              {['telegram', 'tmdb', 'openai', 'cloud189', 'customPush'].map(service => (
                <button
                  key={service}
                  type="button"
                  onClick={() => updateSettings(`proxy.services.${service}`, !(settings.proxy.services as any)[service])}
                  className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
                    (settings.proxy.services as any)[service]
                      ? 'bg-[#0b57d0] text-white border-[#0b57d0]'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {service === 'cloud189' ? '天翼网盘' : service.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Custom Push Management */}
      <section className="space-y-4">
        <h3 className="text-xl font-medium text-slate-900 flex items-center gap-3">
          <Bell size={24} className="text-[#b3261e]" /> 自定义推送列表
        </h3>
        <div className="bg-white rounded-3xl border border-slate-200/60 p-8 space-y-6 shadow-sm">
          <div className="flex justify-end">
            <button 
              type="button"
              onClick={() => {
                setEditingPushIndex(null);
                setPushForm({ name: '', description: '', url: '', method: 'POST', contentType: 'application/json', enabled: true, fields: [] });
                setIsPushModalOpen(true);
              }}
              className="px-4 py-2 bg-[#d3e3fd] text-[#041e49] rounded-xl text-sm font-medium hover:bg-[#c2e7ff] transition-colors flex items-center gap-2"
            >
              <Plus size={18} /> 添加推送
            </button>
          </div>
          
          <div className="space-y-3">
            {(settings.customPush || []).length === 0 ? (
              <div className="text-center py-8 text-slate-400 italic text-sm">暂未配置自定义推送</div>
            ) : (
              settings.customPush.map((push, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${push.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                      <Bell size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{push.name}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[300px]">{push.description || push.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      type="button"
                      onClick={() => testPush(push)}
                      className="p-2 hover:bg-white rounded-full text-[#0b57d0] transition-colors"
                      title="测试"
                    >
                      <RefreshCw size={18} />
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setEditingPushIndex(index);
                        setPushForm(push);
                        setIsPushModalOpen(true);
                      }}
                      className="p-2 hover:bg-white rounded-full text-slate-500 transition-colors"
                    >
                      <Settings size={18} />
                    </button>
                    <button 
                      type="button"
                      onClick={() => deletePushConfig(index)}
                      className="p-2 hover:bg-white rounded-full text-red-500 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <div className="flex justify-end pt-4 gap-4 sticky bottom-8 z-10">
        <button 
          type="button"
          onClick={loadSettings}
          className="px-8 py-3 bg-white border border-slate-300 text-slate-700 rounded-full font-medium shadow-lg hover:bg-slate-50 transition-all flex items-center gap-2"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} /> 放弃修改
        </button>
        <button 
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-10 py-3 bg-[#0b57d0] text-white rounded-full font-medium shadow-lg hover:bg-[#0b57d0]/90 hover:shadow-xl transition-all flex items-center gap-2 disabled:opacity-70"
        >
          {saving ? <RefreshCw size={20} className="animate-spin" /> : <Save size={20} />} 保存设置
        </button>
      </div>

      <Modal 
        isOpen={isPushModalOpen} 
        onClose={() => setIsPushModalOpen(false)} 
        title={editingPushIndex !== null ? "编辑推送配置" : "添加推送配置"}
      >
        <form onSubmit={handlePushSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">名称</label>
              <input type="text" value={pushForm.name} onChange={e => setPushForm({...pushForm, name: e.target.value})} required className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">方法</label>
              <select value={pushForm.method} onChange={e => setPushForm({...pushForm, method: e.target.value as any})} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm">
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Webhook URL</label>
            <input type="url" value={pushForm.url} onChange={e => setPushForm({...pushForm, url: e.target.value})} required className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm" />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-slate-500">字段配置 (支持 {"{{"}content{"}}"})</label>
              <button 
                type="button" 
                onClick={() => setPushForm({...pushForm, fields: [...pushForm.fields, {type:'string', key:'', value:''}]})} 
                className="text-[#0b57d0] text-xs font-medium flex items-center gap-1"
              >
                <Plus size={14} /> 添加
              </button>
            </div>
            <div className="space-y-2">
              {pushForm.fields.map((f, i) => (
                <div key={i} className="flex gap-2 items-start bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <select 
                    value={f.type} 
                    onChange={e => {
                      const newFields = [...pushForm.fields];
                      newFields[i].type = e.target.value;
                      setPushForm({...pushForm, fields: newFields});
                    }} 
                    className="bg-transparent text-xs outline-none"
                  >
                    <option value="string">String</option>
                    <option value="json">JSON</option>
                  </select>
                  <input 
                    placeholder="Key" 
                    value={f.key} 
                    onChange={e => {
                      const newFields = [...pushForm.fields];
                      newFields[i].key = e.target.value;
                      setPushForm({...pushForm, fields: newFields});
                    }} 
                    className="flex-1 bg-transparent text-xs outline-none border-b border-slate-200" 
                  />
                  <input 
                    placeholder="Value" 
                    value={f.value} 
                    onChange={e => {
                      const newFields = [...pushForm.fields];
                      newFields[i].value = e.target.value;
                      setPushForm({...pushForm, fields: newFields});
                    }} 
                    className="flex-[2] bg-transparent text-xs outline-none border-b border-slate-200" 
                  />
                  <button 
                    type="button" 
                    onClick={() => setPushForm({...pushForm, fields: pushForm.fields.filter((_, idx) => idx !== i)})} 
                    className="text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              checked={pushForm.enabled}
              onChange={e => setPushForm({...pushForm, enabled: e.target.checked})}
              className="w-4 h-4 rounded border-slate-300 text-[#0b57d0]"
            />
            <span className="text-sm font-medium text-slate-700">启用此推送</span>
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsPushModalOpen(false)} className="px-6 py-2.5 rounded-full text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">取消</button>
            <button type="submit" className="px-8 py-2.5 bg-[#0b57d0] text-white rounded-full text-sm font-medium shadow-sm hover:bg-[#0b57d0]/90 transition-all">保存配置</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SettingsTab;