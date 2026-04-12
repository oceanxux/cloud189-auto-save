import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Link2, MoreVertical, RefreshCw, Edit2, Trash2, Folder, Play, CheckCircle2, AlertCircle, HelpCircle, ChevronLeft, Search, X, Check } from 'lucide-react';
import Modal from '../Modal';

interface Account {
  id: number;
  username: string;
  alias: string | null;
}

interface Subscription {
  id: number;
  name: string;
}

interface StrmDirectory {
  accountId: number;
  folderId: string;
  name: string;
  path: string;
}

interface StrmConfig {
  id: number;
  name: string;
  type: 'normal' | 'subscription';
  accountIds: number[];
  directories: StrmDirectory[];
  subscriptionId: number | null;
  resourceIds: number[];
  localPathPrefix: string | null;
  excludePattern: string | null;
  overwriteExisting: boolean;
  enabled: boolean;
  enableCron: boolean;
  cronExpression: string | null;
  lastCheckTime: string | null;
  lastRunAt: string | null;
}

interface Resource {
  id: number;
  title: string;
}

interface FolderEntry {
  id: string;
  name: string;
  isFolder: boolean;
  path: string;
}

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return '从未';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const StrmConfigTab: React.FC = () => {
  const [configs, setConfigs] = useState<StrmConfig[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<StrmConfig | null>(null);
  const [formData, setFormData] = useState<Partial<StrmConfig>>({
    name: '',
    type: 'normal',
    accountIds: [],
    directories: [],
    subscriptionId: null,
    resourceIds: [],
    localPathPrefix: '',
    excludePattern: '',
    overwriteExisting: false,
    enabled: true,
    enableCron: false,
    cronExpression: ''
  });

  // Folder Selector State
  const [isFolderSelectorOpen, setIsFolderSelectorOpen] = useState(false);
  const [selectorAccountId, setSelectorAccountId] = useState<number | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string, name: string }[]>([]);
  const [folderEntries, setFolderEntries] = useState<FolderEntry[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/strm/configs');
      const data = await response.json();
      if (data.success) {
        setConfigs(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch STRM configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/accounts');
      const data = await response.json();
      if (data.success) {
        setAccounts(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      const response = await fetch('/api/subscriptions');
      const data = await response.json();
      if (data.success) {
        setSubscriptions(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch subscriptions:', error);
    }
  };

  const fetchResources = async (subId: number) => {
    try {
      const response = await fetch(`/api/subscriptions/${subId}/resources`);
      const data = await response.json();
      if (data.success) {
        setResources(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch resources:', error);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchAccounts();
    fetchSubscriptions();
  }, []);

  useEffect(() => {
    if (formData.subscriptionId) {
      fetchResources(formData.subscriptionId);
    } else {
      setResources([]);
    }
  }, [formData.subscriptionId]);

  const handleOpenAddModal = () => {
    setEditingConfig(null);
    setFormData({
      name: '',
      type: 'normal',
      accountIds: [],
      directories: [],
      subscriptionId: null,
      resourceIds: [],
      localPathPrefix: '',
      excludePattern: '',
      overwriteExisting: false,
      enabled: true,
      enableCron: false,
      cronExpression: ''
    });
    setIsModalOpen(true);
  };

  const handleEditConfig = (config: StrmConfig) => {
    setEditingConfig(config);
    setFormData({ ...config });
    setIsModalOpen(true);
  };

  const handleDeleteConfig = async (id: number) => {
    if (!confirm('确定要删除这个STRM配置吗？')) return;
    try {
      const response = await fetch(`/api/strm/configs/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        fetchConfigs();
      }
    } catch (error) {
      alert('操作失败');
    }
  };

  const handleToggleConfig = async (config: StrmConfig) => {
    try {
      const response = await fetch(`/api/strm/configs/${config.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !config.enabled })
      });
      const data = await response.json();
      if (data.success) {
        fetchConfigs();
      }
    } catch (error) {
      alert('操作失败');
    }
  };

  const handleRunConfig = async (id: number) => {
    try {
      const response = await fetch(`/api/strm/configs/${id}/run`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        alert(data.data || '任务已开始执行');
        fetchConfigs();
      } else {
        alert('执行失败: ' + data.error);
      }
    } catch (error) {
      alert('操作失败');
    }
  };

  const handleResetTime = async (id: number) => {
    if (!confirm('确定要重置该订阅配置的增量时间吗？')) return;
    try {
      const response = await fetch(`/api/strm/configs/${id}/reset`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        alert('已重置增量时间');
        fetchConfigs();
      }
    } catch (error) {
      alert('操作失败');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingConfig ? `/api/strm/configs/${editingConfig.id}` : '/api/strm/configs';
      const response = await fetch(url, {
        method: editingConfig ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await response.json();
      if (data.success) {
        setIsModalOpen(false);
        fetchConfigs();
      } else {
        alert('保存失败: ' + data.error);
      }
    } catch (error) {
      alert('操作失败');
    }
  };

  const fetchFolderEntries = async (accountId: number, folderId: string = '') => {
    setFolderLoading(true);
    try {
      const response = await fetch(`/api/file-manager/list?accountId=${accountId}&folderId=${encodeURIComponent(folderId)}`);
      const data = await response.json();
      if (data.success) {
        setFolderEntries((data.data.entries || []).filter((e: any) => e.isFolder));
      }
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    } finally {
      setFolderLoading(false);
    }
  };

  const handleOpenFolderSelector = (accountId: number) => {
    setSelectorAccountId(accountId);
    setFolderStack([]);
    setFolderEntries([]);
    setIsFolderSelectorOpen(true);
    fetchFolderEntries(accountId);
  };

  const handleEnterFolder = (entry: FolderEntry) => {
    const newStack = [...folderStack, { id: entry.id, name: entry.name }];
    setFolderStack(newStack);
    fetchFolderEntries(selectorAccountId!, entry.id);
  };

  const handleGoBack = () => {
    const newStack = [...folderStack];
    newStack.pop();
    setFolderStack(newStack);
    const parentFolder = newStack[newStack.length - 1];
    fetchFolderEntries(selectorAccountId!, parentFolder?.id || '');
  };

  const handleSelectFolder = (entry?: FolderEntry) => {
    if (!selectorAccountId) return;
    
    let folderId = '';
    let folderName = '根目录';
    let folderPath = '/';
    
    if (entry) {
        folderId = entry.id;
        folderName = entry.name;
        // Construct path from stack
        folderPath = '/' + folderStack.map(s => s.name).concat(entry.name).join('/');
    } else if (folderStack.length > 0) {
        const last = folderStack[folderStack.length - 1];
        folderId = last.id;
        folderName = last.name;
        folderPath = '/' + folderStack.map(s => s.name).join('/');
    } else {
        folderId = '-11'; // Common root ID in this app
        folderName = '全部文件';
        folderPath = '/';
    }

    const newDirectories = [...(formData.directories || [])];
    const exists = newDirectories.findIndex(d => d.accountId === selectorAccountId && d.folderId === folderId);
    
    if (exists === -1) {
      newDirectories.push({
        accountId: selectorAccountId,
        folderId,
        name: folderName,
        path: folderPath
      });
      
      // Also ensure this account is selected in accountIds
      if (!formData.accountIds?.includes(selectorAccountId)) {
        setFormData({
          ...formData,
          directories: newDirectories,
          accountIds: [...(formData.accountIds || []), selectorAccountId]
        });
      } else {
        setFormData({ ...formData, directories: newDirectories });
      }
    }
    
    setIsFolderSelectorOpen(false);
  };

  const removeDirectory = (index: number) => {
    const newDirs = [...(formData.directories || [])];
    newDirs.splice(index, 1);
    setFormData({ ...formData, directories: newDirs });
  };

  const getAccountLabel = (id: number) => {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return `账号${id}`;
    return acc.alias ? `${acc.username} (${acc.alias})` : acc.username;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button 
          onClick={handleOpenAddModal}
          className="bg-[#0b57d0] text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-[#0b57d0]/90 transition-all shadow-sm flex items-center gap-2"
        >
          <Plus size={18} /> 新建配置
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-medium text-slate-500">名称</th>
                <th className="px-6 py-4 font-medium text-slate-500">类型</th>
                <th className="px-6 py-4 font-medium text-slate-500">目标</th>
                <th className="px-6 py-4 font-medium text-slate-500">定时</th>
                <th className="px-6 py-4 font-medium text-slate-500">状态</th>
                <th className="px-6 py-4 font-medium text-slate-500">最后运行</th>
                <th className="px-6 py-4 font-medium text-slate-500 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-slate-500">加载中...</td>
                </tr>
              ) : configs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-slate-500">暂无配置</td>
                </tr>
              ) : configs.map(config => (
                <tr key={config.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${config.enabled ? 'bg-[#c2e7ff] text-[#001d35]' : 'bg-slate-100 text-slate-400'}`}>
                        <Link2 size={20} />
                      </div>
                      <span className="font-medium text-slate-900">{config.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {config.type === 'normal' ? '普通' : '订阅'}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    {config.type === 'normal' ? (
                      config.directories?.length ? `${config.accountIds.length} 个账号 / ${config.directories.length} 个目录` : `${config.accountIds.length} 个账号 / 全量`
                    ) : (
                      `${subscriptions.find(s => s.id === config.subscriptionId)?.name || config.subscriptionId || '-'} / ${config.resourceIds.length || '全部资源'}`
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                    {config.enableCron ? config.cronExpression : '未启用'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${config.enabled ? 'bg-[#c4eed0] text-[#0d4f1f]' : 'bg-slate-100 text-slate-500'}`}>
                      {config.enabled ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {formatDateTime(config.lastRunAt)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => handleRunConfig(config.id)}
                        className="p-2 hover:bg-[#0b57d0]/10 rounded-full text-[#0b57d0] transition-colors"
                        title="立即执行"
                      >
                        <Play size={18} />
                      </button>
                      <button 
                        onClick={() => handleEditConfig(config)}
                        className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                        title="编辑"
                      >
                        <Edit2 size={18} />
                      </button>
                      <div className="relative group/menu">
                        <button className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                          <MoreVertical size={18} />
                        </button>
                        <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl shadow-lg border border-slate-100 py-1 hidden group-hover/menu:block z-[210]">
                          <button 
                            onClick={() => handleToggleConfig(config)}
                            className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 ${config.enabled ? 'text-orange-600' : 'text-green-600'}`}
                          >
                            {config.enabled ? '停用' : '启用'}
                          </button>
                          {config.type === 'subscription' && (
                            <button 
                              onClick={() => handleResetTime(config.id)}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                            >
                              <RefreshCw size={14} /> 重置时间
                            </button>
                          )}
                          <button 
                            onClick={() => handleDeleteConfig(config.id)}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 text-red-600"
                          >
                            <Trash2 size={14} /> 删除
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingConfig ? "编辑STRM配置" : "新建STRM配置"}
      >
        <form onSubmit={handleSaveConfig} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">配置名称</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              required 
              className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20" 
              placeholder="例如：电影全量生成"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">生成类型</label>
              <select 
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value as 'normal' | 'subscription'})}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
              >
                <option value="normal">普通 (账号/目录)</option>
                <option value="subscription">订阅 (按资源)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">本地路径前缀 (可选)</label>
              <input 
                type="text" 
                value={formData.localPathPrefix || ''}
                onChange={e => setFormData({...formData, localPathPrefix: e.target.value})}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20" 
                placeholder="/volume1/media"
              />
            </div>
          </div>

          {formData.type === 'normal' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">选择账号</label>
                <div className="flex flex-wrap gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  {accounts.map(acc => (
                    <label key={acc.id} className="flex items-center gap-2 cursor-pointer group">
                      <div 
                        onClick={() => {
                          const newIds = [...(formData.accountIds || [])];
                          const index = newIds.indexOf(acc.id);
                          if (index > -1) newIds.splice(index, 1);
                          else newIds.push(acc.id);
                          setFormData({...formData, accountIds: newIds});
                        }}
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                          formData.accountIds?.includes(acc.id) ? 'bg-[#0b57d0] border-[#0b57d0]' : 'border-slate-300 bg-white group-hover:border-[#0b57d0]'
                        }`}
                      >
                        {formData.accountIds?.includes(acc.id) && <Check size={14} className="text-white" />}
                      </div>
                      <span className="text-sm text-slate-600">{acc.alias || acc.username}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">指定目录 (可选)</label>
                  <div className="flex items-center gap-2">
                    <select 
                      className="text-xs border border-slate-300 rounded-full px-3 py-1 bg-white outline-none"
                      onChange={(e) => {
                        if (e.target.value) handleOpenFolderSelector(Number(e.target.value));
                        e.target.value = '';
                      }}
                    >
                      <option value="">点击账号选择目录...</option>
                      {accounts.filter(a => formData.accountIds?.includes(a.id)).map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.alias || acc.username}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {!formData.directories?.length ? (
                    <p className="text-xs text-slate-500 italic p-4 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                      未选择目录，将按账号媒体目录整体生成。
                    </p>
                  ) : (
                    formData.directories.map((dir, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl group hover:border-[#0b57d0]/30 transition-colors">
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-slate-900 truncate">{dir.name}</span>
                          <span className="text-[10px] text-slate-500 truncate">{getAccountLabel(dir.accountId)} / {dir.path}</span>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => removeDirectory(idx)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">选择订阅</label>
                <select 
                  value={formData.subscriptionId || ''}
                  onChange={e => setFormData({...formData, subscriptionId: Number(e.target.value), resourceIds: []})}
                  required
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
                >
                  <option value="">请选择订阅</option>
                  {subscriptions.map(sub => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>
              </div>

              {formData.subscriptionId && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">选择资源 (可选)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-200 max-h-48 overflow-y-auto custom-scrollbar">
                    {resources.map(res => (
                      <label key={res.id} className="flex items-center gap-2 cursor-pointer group">
                        <div 
                          onClick={() => {
                            const newIds = [...(formData.resourceIds || [])];
                            const index = newIds.indexOf(res.id);
                            if (index > -1) newIds.splice(index, 1);
                            else newIds.push(res.id);
                            setFormData({...formData, resourceIds: newIds});
                          }}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                            formData.resourceIds?.includes(res.id) ? 'bg-[#0b57d0] border-[#0b57d0]' : 'border-slate-300 bg-white group-hover:border-[#0b57d0]'
                          }`}
                        >
                          {formData.resourceIds?.includes(res.id) && <Check size={12} className="text-white" />}
                        </div>
                        <span className="text-xs text-slate-600 truncate" title={res.title}>{res.title}</span>
                      </label>
                    ))}
                    {resources.length === 0 && <p className="col-span-2 text-center text-xs text-slate-500 py-4">该订阅暂无资源</p>}
                  </div>
                  <p className="text-[10px] text-slate-400">不勾选任何资源则生成该订阅下的所有资源。</p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">排除模式 (正则, 可选)</label>
              <input 
                type="text" 
                value={formData.excludePattern || ''}
                onChange={e => setFormData({...formData, excludePattern: e.target.value})}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20" 
                placeholder="\.(txt|pdf)$"
              />
            </div>
            <div className="flex items-end pb-3">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div 
                  onClick={() => setFormData({...formData, overwriteExisting: !formData.overwriteExisting})}
                  className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                    formData.overwriteExisting ? 'bg-[#0b57d0] border-[#0b57d0]' : 'border-slate-300 group-hover:border-[#0b57d0]'
                  }`}
                >
                  {formData.overwriteExisting && <Check size={14} className="text-white" />}
                </div>
                <span className="text-sm font-medium text-slate-700">覆盖已存在的 .strm 文件</span>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div 
                  onClick={() => setFormData({...formData, enabled: !formData.enabled})}
                  className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                    formData.enabled ? 'bg-[#0b57d0] border-[#0b57d0]' : 'border-slate-300 group-hover:border-[#0b57d0]'
                  }`}
                >
                  {formData.enabled && <Check size={14} className="text-white" />}
                </div>
                <span className="text-sm font-medium text-slate-700">启用配置</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <div 
                  onClick={() => setFormData({...formData, enableCron: !formData.enableCron})}
                  className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                    formData.enableCron ? 'bg-[#0b57d0] border-[#0b57d0]' : 'border-slate-300 group-hover:border-[#0b57d0]'
                  }`}
                >
                  {formData.enableCron && <Check size={14} className="text-white" />}
                </div>
                <span className="text-sm font-medium text-slate-700">定时任务</span>
              </label>
            </div>
          </div>

          {formData.enableCron && (
            <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
              <label className="text-sm font-medium text-slate-700">Cron 表达式</label>
              <input
                type="text"
                value={formData.cronExpression || ''}
                onChange={e => setFormData({ ...formData, cronExpression: e.target.value })}
                placeholder="例如：0 0 * * *"
                className="w-full px-5 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-6 py-3 bg-white border border-slate-300 text-slate-700 rounded-full font-medium hover:bg-slate-50 transition-all"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-10 py-3 bg-[#0b57d0] text-white rounded-full font-medium shadow-lg hover:bg-[#0b57d0]/90 transition-all flex items-center gap-2"
            >
              <Check size={20} /> 保存配置
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isFolderSelectorOpen}
        onClose={() => setIsFolderSelectorOpen(false)}
        title={`选择目录 - ${getAccountLabel(selectorAccountId || 0)}`}
        footer={
          <div className="px-8 py-6 flex justify-end gap-3 border-t border-slate-100">
             <button 
                onClick={() => handleSelectFolder()} 
                className="px-6 py-2.5 rounded-full text-sm font-medium bg-[#0b57d0] text-white hover:bg-[#0b57d0]/90 transition-colors shadow-sm"
              >
                选择当前目录
              </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-2xl overflow-x-auto text-xs text-slate-500 whitespace-nowrap scrollbar-none">
            <span className="shrink-0">根目录</span>
            {folderStack.map((folder, i) => (
              <React.Fragment key={folder.id}>
                <span>/</span>
                <span className={i === folderStack.length - 1 ? 'text-slate-900 font-medium' : ''}>{folder.name}</span>
              </React.Fragment>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {folderStack.length > 0 && (
              <button 
                onClick={handleGoBack}
                className="p-2.5 hover:bg-slate-100 rounded-2xl text-slate-600 transition-colors border border-slate-200"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <div className="flex-1 font-medium text-slate-700 text-sm">
              {folderStack.length === 0 ? '根目录' : folderStack[folderStack.length - 1].name}
            </div>
            <button 
              onClick={() => fetchFolderEntries(selectorAccountId!, folderStack[folderStack.length-1]?.id)}
              className="p-2.5 hover:bg-slate-100 rounded-2xl text-slate-500 transition-colors border border-slate-200"
              title="刷新"
            >
              <RefreshCw size={20} className={folderLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {folderLoading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500">加载中...</td>
                  </tr>
                ) : folderEntries.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500">当前目录没有子目录</td>
                  </tr>
                ) : folderEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td 
                      className="px-4 py-3 font-medium text-slate-900 cursor-pointer flex items-center gap-3"
                      onClick={() => handleEnterFolder(entry)}
                    >
                      <Folder size={18} className="text-[#0b57d0]" />
                      <span className="truncate flex-1">{entry.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectFolder(entry);
                        }}
                        className="px-3 py-1.5 bg-[#0b57d0]/10 text-[#0b57d0] hover:bg-[#0b57d0]/20 rounded-xl text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        选择
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StrmConfigTab;
