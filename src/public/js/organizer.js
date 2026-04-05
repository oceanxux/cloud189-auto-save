let organizerTaskList = [];

async function fetchOrganizerTasks() {
    try {
        const keyword = document.getElementById('organizerSearch')?.value?.trim() || '';
        const response = await fetch(`/api/organizer/tasks?search=${encodeURIComponent(keyword)}`);
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || '加载整理器列表失败');
        }
        organizerTaskList = data.data || [];
        renderOrganizerTable();
    } catch (error) {
        message.warning('加载整理器列表失败: ' + error.message);
    }
}

function renderOrganizerTable() {
    const tbody = document.querySelector('#organizerTable tbody');
    if (!tbody) {
        return;
    }
    tbody.innerHTML = '';
    if (!organizerTaskList.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">暂无任务</td></tr>';
        return;
    }

    organizerTaskList.forEach(task => {
        const taskName = task.shareFolderName ? `${task.resourceName}/${task.shareFolderName}` : task.resourceName || '未知';
        const accountLabel = `${task.account.username}${task.account.accountType === 'family' ? ' [家庭云]' : ' [个人云]'}`;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <button type="button" class="btn-warning" onclick="runOrganizerTask(${task.id})">执行整理</button>
                <button type="button" onclick="showEditTaskModal(${task.id})">修改任务</button>
            </td>
            <td>${taskName}</td>
            <td>${accountLabel}</td>
            <td>${task.enableOrganizer ? '<span style="color:#52c41a;">已启用</span>' : '<span style="color:#999;">未启用</span>'}</td>
            <td>${formatDateTime(task.lastOrganizedAt)}</td>
            <td title="${task.lastOrganizeError || ''}">${task.lastOrganizeError || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}

async function runOrganizerTask(taskId) {
    const task = organizerTaskList.find(item => item.id === taskId) || getTaskById(taskId);
    if (!task) {
        message.warning('任务不存在');
        return;
    }
    loading.show();
    try {
        const response = await fetch(`/api/organizer/tasks/${taskId}/run`, {
            method: 'POST'
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || '执行整理失败');
        }
        message.success(data.data?.message || '整理完成');
        await fetchOrganizerTasks();
        await fetchTasks();
    } catch (error) {
        message.warning('执行整理失败: ' + error.message);
    } finally {
        loading.hide();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const organizerSearch = document.getElementById('organizerSearch');
    organizerSearch?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            fetchOrganizerTasks();
        }
    });
});
