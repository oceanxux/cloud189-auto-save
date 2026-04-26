import React, { useState, useEffect, useRef } from 'react';
import { Plus, Rss, MoreVertical, RefreshCw, Edit2, Trash2, Folder, ExternalLink, Search, Play, Check, CheckCircle2, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Modal from '../Modal';
import FolderSelector, { SelectedFolder } from '../FolderSelector';
import { ToastType } from '../Toast';
import { useClickOutside } from '../../utils/useClickOutside';

interface Resource {
  id?: number | string;
  title: string;
  shareLink: string;
  accessCode?: string;
  detailLink?: string;
  subscriptionUuid?: string;
  shareCode?: string;
  shareId?: string;
  shareMode?: string;
  shareFileId?: string;
  shareFileName?: string;
  isFolder?: boolean;
  heat?: number;
  createDate?: string;
  accessURL?: string;
  checkRegex?: string;
  replaceRegex?: string;
  targetFolderId?: string;
  targetFolderName?: string;
  status?: string;
  type?: 'normal' | 'lazy';
}

interface Subscription {
  id: number;
  uuid: string;
  name: string;
  remark?: string;
  enabled: boolean;
  resourceCount?: number;
  validResourceCount?: number;
  invalidResourceCount?: number;
  lastRefreshStatus?: string;
  lastRefreshMessage?: string;
}

interface Props {
  onTransfer?: (data?: any) => void;
  onShowToast?: (message: string, type: ToastType) => void;
  onShowConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning' | 'info') => void;
}

const SubscriptionTab: React.FC<Props> = ({ onTransfer, onShowToast, onShowConfirm }) => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [subForm, setSubForm] = useState({ uuid: '', name: '', remark: '', enabled: true });

  const [isResourcesModalOpen, setIsResourcesModalOpen] = useState(false);
  const [viewingSub, setViewingSub] = useState<Subscription | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [resLoading, setResLoading] = useState(false);
  const [resourcePage, setResourcePage] = useState(1);
  const [resourceTotal, setResourceTotal] = useState(0);
  const RESOURCE_PAGE_SIZE = 30;

  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [resourceForm, setResourceForm] = useState<Resource>({ title: '', shareLink: '', accessCode: '', checkRegex: '', replaceRegex: '', targetFolderId: '', targetFolderName: '', status: 'active', type: 'normal' });
  const [isFolderSelectorOpen, setIsFolderSelectorOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchSubscriptions(); }, []);
  useClickOutside(menuRef, () => setOpenMenuId(null), openMenuId !== null);

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/subscriptions');
      const data = await response.json();
      if (data.success) setSubscriptions(data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingSub ? `/api/subscriptions/${editingSub.id}` : '/api/subscriptions';
    const method = editingSub ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subForm) });
      const data = await res.json();
      if (data.success) { 
        setIsSubModalOpen(false); 
        fetchSubscriptions(); 
        onShowToast?.('订阅已成功保存', 'success');
      } else {
        onShowToast?.('保存失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('保存失败', 'error'); }
  };

  const handleEditSubscription = (sub: Subscription) => {
    setEditingSub(sub);
    setSubForm({ uuid: sub.uuid, name: sub.name, remark: sub.remark || '', enabled: sub.enabled });
    setIsSubModalOpen(true);
  };

  const handleDeleteSubscription = async (id: number) => {
    onShowConfirm?.('删除订阅', '确定要删除此订阅吗？关联的所有资源记录也将被移除。', async () => {
      try {
        const res = await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
        if ((await res.json()).success) {
          fetchSubscriptions();
          onShowToast?.('订阅已删除', 'success');
        } else {
          onShowToast?.('删除失败', 'error');
        }
      } catch (e) { onShowToast?.('删除失败', 'error'); }
    }, 'danger');
  };

  const handleRunSubscription = async (id: number) => {
    try {
      const res = await fetch(`/api/subscriptions/${id}/refresh`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowToast?.('检查指令已发送', 'success');
      } else {
        onShowToast?.('执行失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('执行失败', 'error'); }
  };

  const fetchResources = async (subId: number, pageNum = 1) => {
    setResLoading(true);
    try {
      const res = await fetch(`/api/subscriptions/${subId}/remote-resources?pageNum=${pageNum}&pageSize=${RESOURCE_PAGE_SIZE}`);
      const data = await res.json();
      if (data.success) {
        setResources(data.data?.items || []);
        setResourcePage(data.data?.pageNum || pageNum);
        setResourceTotal(data.data?.total || 0);
      } else {
        onShowToast?.('加载资源失败: ' + data.error, 'error');
      }
    } catch (e) { console.error(e); }
    finally { setResLoading(false); }
  };

  const handleResourceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingSub) return;
    const url = editingResource ? `/api/subscriptions/resources/${editingResource.id}` : `/api/subscriptions/${viewingSub.id}/resources`;
    const method = editingResource ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resourceForm) });
      const data = await res.json();
      if (data.success) { 
        setIsResourceModalOpen(false); 
        fetchResources(viewingSub.id); 
          onShowToast?.('资源配置已保存', 'success');
        } else {
          onShowToast?.('保存失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('保存失败', 'error'); }
  };

  const handleDeleteResource = async (id: number) => {
    onShowConfirm?.('删除资源', '确定要删除此资源记录吗？', async () => {
      try {
        const res = await fetch(`/api/subscriptions/resources/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          if (viewingSub) fetchResources(viewingSub.id);
          onShowToast?.('资源已删除', 'success');
        } else {
          onShowToast?.('删除失败', 'error');
        }
      } catch (e) { onShowToast?.('删除失败', 'error'); }
    }, 'danger');
  };

  const handleTransferResource = (resource: Resource) => {
    onTransfer?.({
      title: resource.title,
      taskName: resource.title,
      resourceTitle: resource.title,
      resourceName: resource.title,
      shareLink: resource.shareLink,
      accessCode: resource.accessCode || '',
      isFolder: resource.isFolder !== false,
      shareFileId: resource.shareFileId || '',
      shareFolderId: resource.shareFileId || '',
      shareFolderName: resource.shareFileName || resource.title,
      shareId: resource.shareId || '',
      shareMode: resource.shareMode || '',
      enableTaskScraper: true,
      enableOrganizer: true
    });
    onShowToast?.(`已载入任务创建表单: ${resource.title}`, 'success');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="workbench-page">
      <section className="workbench-hero !py-3">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-black tracking-tight">资源订阅中心</h1><p className="text-[10px] font-bold text-slate-400 opacity-60 mt-0.5">自动同步外部资源站更新</p></div>
          <div className="flex gap-2.5">
            <button onClick={() => { setEditingSub(null); setSubForm({ uuid: '', name: '', remark: '', enabled: true }); setIsSubModalOpen(true); }} className="workbench-primary-button px-5 py-2 text-xs"><Plus size={16} /> 新建订阅</button>
            <button onClick={fetchSubscriptions} className="workbench-toolbar-button p-2"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between px-2">
        <h2 className="workbench-section-title"><Rss size={18} className="text-orange-500" /> 活跃订阅 ({subscriptions.length})</h2>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <AnimatePresence mode="popLayout">
          {subscriptions.map(sub => (
            <motion.div layout key={sub.id} className={`workbench-panel p-5 group relative transition-all ${openMenuId === sub.id ? 'z-20 overflow-visible' : 'overflow-hidden'}`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0"><Rss size={24} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1"><h3 className="text-sm font-black truncate">{sub.name}</h3><span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${sub.enabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-200 text-slate-500'}`}>{sub.enabled ? '在线' : '停用'}</span></div>
                    <div className="text-[10px] font-bold text-slate-400">UUID: {sub.uuid} • 资源: {sub.resourceCount || 0} • 状态: {sub.lastRefreshStatus || 'unknown'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => handleRunSubscription(sub.id)} className="p-2.5 bg-orange-500 text-white rounded-xl shadow-sm hover:scale-110 transition-all"><Play size={16} fill="currentColor" /></button>
                  <div ref={openMenuId === sub.id ? menuRef : undefined} className="relative">
                    <button onClick={() => setOpenMenuId(openMenuId === sub.id ? null : sub.id)} className="p-2.5 hover:bg-slate-100 rounded-xl transition-all"><MoreVertical size={18} /></button>
                    <AnimatePresence>{openMenuId === sub.id && (
                      <motion.div initial={{ opacity: 0, scale: 0.95, x: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-0 top-full mt-1 w-40 glass-modal rounded-2xl py-1 z-[2000] shadow-2xl border border-[var(--border-color)] overflow-hidden">
                        <button onClick={() => { setOpenMenuId(null); fetchResources(sub.id, 1); setViewingSub(sub); setIsResourcesModalOpen(true); }} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-black flex items-center gap-2"><Folder size={13} /> 资源管理</button>
                        <button onClick={() => { setOpenMenuId(null); handleEditSubscription(sub); }} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-black flex items-center gap-2"><Edit2 size={13} /> 修改订阅</button>
                        <div className="h-px bg-[var(--border-color)] my-1" />
                        <button onClick={() => { setOpenMenuId(null); handleDeleteSubscription(sub.id); }} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-black text-red-500 flex items-center gap-2"><Trash2 size={13} /> 彻底删除</button>
                      </motion.div>
                    )}</AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Modal isOpen={isSubModalOpen} onClose={() => setIsSubModalOpen(false)} title="配置订阅详情">
        <form id="modal-form" onSubmit={handleSubSubmit} className="space-y-6">
          <div className="workbench-form-item"><label className="workbench-label">订阅 UUID</label><input type="text" required value={subForm.uuid} onChange={e => setSubForm({...subForm, uuid: e.target.value})} className="workbench-input font-mono text-xs" /></div>
          <div className="workbench-form-item"><label className="workbench-label">订阅显示名称</label><input type="text" required value={subForm.name} onChange={e => setSubForm({...subForm, name: e.target.value})} className="workbench-input font-bold" /></div>
          <div className="workbench-form-item"><label className="workbench-label">备注</label><textarea value={subForm.remark} onChange={e => setSubForm({...subForm, remark: e.target.value})} className="workbench-input min-h-24 resize-y" /></div>
          <div className="flex items-center gap-3 pt-1 px-1"><div onClick={() => setSubForm({...subForm, enabled: !subForm.enabled})} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${subForm.enabled ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`}>{subForm.enabled && <Check size={14} strokeWidth={4} className="text-white" />}</div><span className="text-sm font-bold">启用此订阅</span></div>
        </form>
      </Modal>

      <Modal isOpen={isResourcesModalOpen} onClose={() => setIsResourcesModalOpen(false)} title={`管理资源: ${viewingSub?.name}`} className="max-w-5xl w-[min(96vw,80rem)]">
        <div className="space-y-6">
          <div className="flex justify-between items-center px-1"><span className="text-[10px] font-black uppercase text-slate-400">远端资源 {resourceTotal} 条 • 当前第 {resourcePage} 页</span><button onClick={() => { setEditingResource(null); setResourceForm({ title: '', shareLink: '', accessCode: '', checkRegex: '', replaceRegex: '', targetFolderId: '', targetFolderName: '', status: 'active', type: 'normal' }); setIsResourceModalOpen(true); }} className="workbench-toolbar-button px-4 py-2 text-[10px] font-black"><Plus size={14} /> 手动补充</button></div>
          <div className="grid gap-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
            {resLoading && <div className="p-4 text-center text-xs font-bold text-slate-400">正在加载远端订阅资源...</div>}
            {!resLoading && resources.length === 0 && <div className="p-4 text-center text-xs font-bold text-slate-400">暂无资源</div>}
            {resources.map(res => (
              <div key={res.id} className="p-4 bg-[var(--bg-main)] rounded-2xl border border-[var(--border-color)] flex flex-col md:flex-row md:items-center gap-3 md:justify-between group hover:shadow-md transition-all overflow-hidden">
                <div className="min-w-0 flex-1"><h4 className="text-xs font-black break-all md:truncate">{res.title}</h4><div className="mt-1 text-[9px] font-bold text-slate-400 break-all">{res.isFolder === false ? '文件' : '文件夹'} • 热度 {res.heat || 0} • {res.detailLink || res.shareLink}</div></div>
                <div className="flex gap-1 opacity-100 transition-all shrink-0 self-end md:self-auto">
                  <button onClick={() => handleTransferResource(res)} className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all" title="转到任务中心"><ArrowRightLeft size={16} /></button>
                  <a href={res.detailLink || res.shareLink} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-sky-500 transition-all" title="打开订阅详情"><ExternalLink size={16} /></a>
                  <button onClick={() => { setEditingResource(res); setResourceForm({ ...res }); setIsResourceModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-500 transition-all"><Edit2 size={16} /></button>
                  <button onClick={() => typeof res.id === 'number' && handleDeleteResource(res.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 px-1">
            <button disabled={resLoading || resourcePage <= 1 || !viewingSub} onClick={() => viewingSub && fetchResources(viewingSub.id, resourcePage - 1)} className="workbench-toolbar-button px-4 py-2 text-[10px] font-black disabled:opacity-30">上一页</button>
            <button disabled={resLoading || resourcePage * RESOURCE_PAGE_SIZE >= resourceTotal || !viewingSub} onClick={() => viewingSub && fetchResources(viewingSub.id, resourcePage + 1)} className="workbench-toolbar-button px-4 py-2 text-[10px] font-black disabled:opacity-30">下一页</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isResourceModalOpen} onClose={() => setIsResourceModalOpen(false)} title={editingResource ? '修改订阅资源' : '添加订阅资源'}>
        <form id="modal-form" onSubmit={handleResourceSubmit} className="space-y-6">
          <div className="workbench-form-item"><label className="workbench-label">资源名称</label><input type="text" required value={resourceForm.title} onChange={e => setResourceForm({ ...resourceForm, title: e.target.value })} className="workbench-input font-bold" placeholder="例如：田曦薇作品合集" /></div>
          <div className="workbench-form-item"><label className="workbench-label">分享链接</label><input type="text" required value={resourceForm.shareLink} onChange={e => setResourceForm({ ...resourceForm, shareLink: e.target.value })} className="workbench-input font-mono text-xs" placeholder="粘贴天翼云盘分享链接" /></div>
          <div className="workbench-form-item"><label className="workbench-label">访问码</label><input type="text" value={resourceForm.accessCode || ''} onChange={e => setResourceForm({ ...resourceForm, accessCode: e.target.value })} className="workbench-input font-mono" placeholder="私密分享时填写，可选" /></div>
        </form>
      </Modal>

      <FolderSelector isOpen={isFolderSelectorOpen} onClose={() => setIsFolderSelectorOpen(false)} accountId={0} title="选择存入目录" onSelect={(f: SelectedFolder) => { setResourceForm({ ...resourceForm, targetFolderId: f.id, targetFolderName: f.name }); setIsFolderSelectorOpen(false); }} />
    </motion.div>
  );
};

export default SubscriptionTab;
