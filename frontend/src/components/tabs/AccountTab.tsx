import React, { useState, useEffect } from 'react';
import { Plus, Trash2, MoreVertical, User, RotateCcw, Shield, Database, Globe, RefreshCw, Key } from 'lucide-react';
import { motion } from 'motion/react';
import Modal from '../Modal';
import { ToastType } from '../Toast';

interface Account {
  id: number;
  username: string;
  alias?: string;
  isDefault: boolean;
  accountType: 'personal' | 'family';
  familyId?: string;
  cloudStrmPrefix?: string;
  localStrmPrefix?: string;
  capacity?: {
    cloudCapacityInfo?: { totalSize: number; usedSize: number; };
    familyCapacityInfo?: { totalSize: number; usedSize: number; };
  };
}

interface AccountTabProps {
  onShowToast?: (message: string, type: ToastType) => void;
  onShowConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning' | 'info') => void;
  onShowPrompt?: (title: string, message: string, onConfirm: (value: string) => void, initialValue?: string) => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const createEmptyFormData = () => ({
  username: '',
  password: '',
  cookies: '',
  alias: '',
  accountType: 'personal' as 'personal' | 'family',
  familyId: '',
  validateCode: '',
  cloudStrmPrefix: '',
  localStrmPrefix: ''
});

const AccountTab: React.FC<AccountTabProps> = ({ onShowToast, onShowConfirm, onShowPrompt }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState(createEmptyFormData());

  useEffect(() => { fetchAccounts(); }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success) setAccounts(data.data || []);
    } catch (e) { console.error('获取账号失败:', e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...(editingAccount ? { username: editingAccount.username } : {}),
        ...formData,
        familyId: formData.accountType === 'family' ? formData.familyId : ''
      };
      const res = await fetch(editingAccount ? `/api/accounts/${editingAccount.id}` : '/api/accounts', {
        method: editingAccount ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setEditingAccount(null);
        setFormData(createEmptyFormData());
        fetchAccounts();
        onShowToast?.(editingAccount ? '账号更新成功' : '账号添加成功', 'success');
      }
      else onShowToast?.('操作失败: ' + data.error, 'error');
    } catch (e) { onShowToast?.('提交失败', 'error'); }
  };

  const openCreateModal = () => {
    setEditingAccount(null);
    setFormData(createEmptyFormData());
    setIsModalOpen(true);
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      username: account.username,
      password: '',
      cookies: '',
      alias: account.alias || '',
      accountType: account.accountType || 'personal',
      familyId: account.familyId || '',
      validateCode: '',
      cloudStrmPrefix: account.cloudStrmPrefix || '',
      localStrmPrefix: account.localStrmPrefix || ''
    });
    setIsModalOpen(true);
  };

  const handleUpdateStrmPrefix = async (account: Account, type: 'cloud' | 'local') => {
    const currentValue = type === 'cloud' ? (account.cloudStrmPrefix || '') : (account.localStrmPrefix || '');
    
    onShowPrompt?.(
      type === 'cloud' ? '修改云端前缀' : '修改本地前缀',
      type === 'cloud' ? '请输入新的云端同步前缀' : '请输入新的本地同步前缀',
      async (nextValue) => {
        if (nextValue === null || nextValue === currentValue) return;

        try {
          const res = await fetch(`/api/accounts/${account.id}/strm-prefix`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ strmPrefix: nextValue, type })
          });
          const data = await res.json();
          if (data.success) {
            fetchAccounts();
            onShowToast?.('同步前缀已更新', 'success');
          }
          else onShowToast?.('更新失败: ' + data.error, 'error');
        } catch (error) {
          onShowToast?.('更新失败', 'error');
        }
      },
      currentValue
    );
  };

  const handleSetDefaultAccount = async (id: number) => {
    try {
      const res = await fetch(`/api/accounts/${id}/default`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchAccounts();
        onShowToast?.('已设置为默认账号', 'success');
      } else {
        onShowToast?.('设置失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('设置失败', 'error'); }
  };

  const handleDeleteAccount = async (id: number) => {
    // 强制先停止点击穿透
    if (!id) return;
    
    onShowConfirm?.('彻底删除账号', '确定要彻底删除此账号吗？此操作将移除所有关联配置，不可撤销。', async () => {
      try {
        const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          onShowToast?.('账号已删除', 'success');
          fetchAccounts();
        } else {
          onShowToast?.('删除失败: ' + data.error, 'error');
        }
      } catch (e) {
        onShowToast?.('网络请求失败，请稍后重试', 'error');
      }
    }, 'danger');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="workbench-page">
      <section className="workbench-hero !py-3">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-black tracking-tight text-[var(--text-primary)]">账号与存储中心</h1><p className="text-[10px] font-bold text-slate-400 opacity-60">管理云盘授权与存储配额</p></div>
          <div className="flex gap-2.5">
            <button onClick={openCreateModal} className="workbench-primary-button px-5 py-2 text-xs"><Plus size={16} /> 添加账号</button>
            <button onClick={fetchAccounts} className="workbench-toolbar-button p-2"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </div>
      </section>

      <div className="workbench-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-[var(--border-color)] text-[10px] font-black uppercase text-[var(--text-secondary)]">
                <th className="px-6 py-5">操作控制</th>
                <th className="px-6 py-5">关联用户</th>
                <th className="px-6 py-5">云盘配额</th>
                <th className="px-6 py-5">家庭空间</th>
                <th className="px-6 py-5">同步前缀</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading && accounts.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-20 text-center animate-pulse font-bold text-slate-400">正在同步状态...</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-20 text-center font-bold text-slate-300 italic">暂无账号绑定</td></tr>
              ) : accounts.map(account => (
                <tr key={account.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4 relative z-10">
                      <button onClick={() => handleSetDefaultAccount(account.id)} className={`text-xl transition-all hover:scale-110 active:scale-90 ${account.isDefault ? 'text-amber-400' : 'text-slate-300'}`}>{account.isDefault ? '★' : '☆'}</button>
                      <button onClick={() => openEditModal(account)} className="text-blue-500 font-bold hover:underline py-1">编辑</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account.id); }} className="text-red-500 font-bold hover:underline py-1">删除</button>
                    </div>
                  </td>
                  <td className="px-6 py-5"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[var(--app-accent)] text-white flex items-center justify-center font-black text-xs">{(account.username || 'U')[0].toUpperCase()}</div><div><div className="font-bold text-[var(--text-primary)]">{account.username}</div><div className="text-[9px] font-black uppercase text-slate-400">{account.alias || account.accountType}</div></div></div></td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400"><span>{formatBytes(account.capacity?.cloudCapacityInfo?.usedSize || 0)}</span><span>{formatBytes(account.capacity?.cloudCapacityInfo?.totalSize || 0)}</span></div>
                      <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(((account.capacity?.cloudCapacityInfo?.usedSize || 0) / (account.capacity?.cloudCapacityInfo?.totalSize || 1)) * 100, 100)}%` }} /></div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400"><span>{formatBytes(account.capacity?.familyCapacityInfo?.usedSize || 0)}</span><span>{formatBytes(account.capacity?.familyCapacityInfo?.totalSize || 0)}</span></div>
                      <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.min(((account.capacity?.familyCapacityInfo?.usedSize || 0) / (account.capacity?.familyCapacityInfo?.totalSize || 1)) * 100, 100)}%` }} /></div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="space-y-1 text-[9px] font-bold leading-tight max-w-[180px]">
                      <button
                        type="button"
                        onClick={() => handleUpdateStrmPrefix(account, 'cloud')}
                        className="block truncate text-left text-sky-500 hover:underline"
                        title={account.cloudStrmPrefix || '点击设置云端同步前缀'}
                      >
                        云: {account.cloudStrmPrefix || '点击设置'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateStrmPrefix(account, 'local')}
                        className="block truncate text-left text-indigo-500 hover:underline"
                        title={account.localStrmPrefix || '点击设置本地同步前缀'}
                      >
                        本: {account.localStrmPrefix || '点击设置'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingAccount(null); }} title={editingAccount ? "修改账号信息" : "添加账号"}>
        <form id="modal-form" onSubmit={handleSubmit} className="space-y-6 py-1">
          <div className="grid grid-cols-2 gap-6">
            <div className="workbench-form-item"><label className="workbench-label">用户名</label><input type="text" required value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="workbench-input" readOnly={!!editingAccount} /></div>
            <div className="workbench-form-item"><label className="workbench-label">密码</label><input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="workbench-input" placeholder={editingAccount ? "留空表示不更新密码" : "加密存储"} /></div>
          </div>
          <div className="workbench-form-item"><label className="workbench-label">网页 Cookie (备用)</label><textarea rows={2} value={formData.cookies} onChange={e => setFormData({...formData, cookies: e.target.value})} className="workbench-input text-xs font-mono" placeholder="粘贴 Cookie" /></div>
          <div className="grid grid-cols-2 gap-6">
            <div className="workbench-form-item"><label className="workbench-label">显示别名</label><input type="text" value={formData.alias} onChange={e => setFormData({...formData, alias: e.target.value})} className="workbench-input" placeholder="用于区分账号" /></div>
            <div className="workbench-form-item"><label className="workbench-label">账号类型</label><select value={formData.accountType} onChange={e => setFormData({...formData, accountType: e.target.value as any})} className="workbench-select font-bold"><option value="personal">个人云盘</option><option value="family">家庭云盘</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="workbench-form-item"><label className="workbench-label">云端同步前缀</label><input type="text" value={formData.cloudStrmPrefix} onChange={e => setFormData({...formData, cloudStrmPrefix: e.target.value})} className="workbench-input font-mono text-xs" placeholder="例如: /movie 或 http://alist:5244/d/天翼云盘" /></div>
            <div className="workbench-form-item"><label className="workbench-label">本地同步前缀</label><input type="text" value={formData.localStrmPrefix} onChange={e => setFormData({...formData, localStrmPrefix: e.target.value})} className="workbench-input font-mono text-xs" placeholder="例如: /mnt/media/movie" /></div>
          </div>
          {formData.accountType === 'family' && (
            <div className="workbench-form-item"><label className="workbench-label">家庭 ID</label><input type="text" value={formData.familyId} onChange={e => setFormData({...formData, familyId: e.target.value})} className="workbench-input" placeholder="留空则自动识别" /></div>
          )}
          <div className="workbench-form-item"><label className="workbench-label">验证码</label><input type="text" value={formData.validateCode} onChange={e => setFormData({...formData, validateCode: e.target.value})} className="workbench-input" placeholder="仅在登录要求验证码时填写" /></div>
        </form>
      </Modal>
    </motion.div>
  );
};

export default AccountTab;
