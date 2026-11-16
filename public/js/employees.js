// 員工管理頁：僅管理員可用
const me = HR.getUser();
if (!HR.getToken() || !me || me.role !== 'ADMIN') {
    location.replace('/');
}
window.onSessionExpired = () => location.replace('/');

const messageBox = document.getElementById('message');
const tbody = document.getElementById('employee-tbody');
const addForm = document.getElementById('add-form');
const addBtn = document.getElementById('add-btn');
const addRole = document.getElementById('add-role');
const adminUsernameField = document.getElementById('admin-username-field');
const adminPasswordField = document.getElementById('admin-password-field');
const editCard = document.getElementById('edit-card');
const editForm = document.getElementById('edit-form');
const editTitle = document.getElementById('edit-title');
const editName = document.getElementById('edit-name');
const editRate = document.getElementById('edit-rate');
const editSave = document.getElementById('edit-save');

let editingId = null;

document.getElementById('logout-btn').addEventListener('click', () => {
    HR.clearSession();
    location.replace('/');
});

function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = `result ${type}`;
    messageBox.hidden = false;
    messageBox.scrollIntoView({ block: 'nearest' });
}

function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

// ======================================================================
// 員工名單
// ======================================================================
async function loadEmployees() {
    const { res, data } = await HR.api('/employees');
    if (!res.ok || !Array.isArray(data)) {
        if (res.status !== 401) showMessage(HR.errorText(data, '讀取員工名單失敗'), 'error');
        return;
    }

    tbody.replaceChildren();
    if (data.length === 0) {
        const tr = document.createElement('tr');
        const td = cell('還沒有員工', 'empty');
        td.colSpan = 5;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    data.forEach((u) => {
        const tr = document.createElement('tr');
        if (!u.active) tr.style.opacity = '0.55';

        const name = cell(u.name);
        name.style.fontWeight = '600';
        tr.appendChild(name);

        const roleCell = document.createElement('td');
        const roleTag = document.createElement('span');
        roleTag.className = 'tag';
        roleTag.textContent = u.role === 'ADMIN' ? '管理員' : '員工';
        roleCell.appendChild(roleTag);
        tr.appendChild(roleCell);

        tr.appendChild(cell(`$${Number(u.hourly_rate).toLocaleString('zh-TW')}`, 'num'));
        tr.appendChild(cell(u.active ? '在職' : '已停用'));

        const actionCell = document.createElement('td');
        actionCell.className = 'num';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-ghost';
        editBtn.textContent = '修改';
        editBtn.addEventListener('click', () => startEdit(u));
        actionCell.appendChild(editBtn);

        // 管理員帳號不可停用，避免把自己鎖在外面
        if (u.role !== 'ADMIN') {
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'btn btn-ghost';
            toggleBtn.style.marginLeft = '6px';
            toggleBtn.textContent = u.active ? '停用' : '啟用';
            toggleBtn.addEventListener('click', () => toggleActive(u));
            actionCell.appendChild(toggleBtn);
        }
        tr.appendChild(actionCell);

        tbody.appendChild(tr);
    });
}

async function toggleActive(u) {
    if (u.active && !window.confirm(`確定要停用「${u.name}」嗎？\n他會從打卡名單消失，過去的紀錄會保留。`)) return;
    const { res, data } = await HR.api(`/employees/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !u.active })
    });
    if (res.ok) {
        showMessage(`${u.name} 已${u.active ? '停用' : '啟用'}。`, 'success');
        await loadEmployees();
    } else if (res.status !== 401) {
        showMessage(HR.errorText(data, '操作失敗'), 'error');
    }
}

// ---------- 新增 ----------
addRole.addEventListener('change', () => {
    const isAdmin = addRole.value === 'ADMIN';
    adminUsernameField.hidden = !isAdmin;
    adminPasswordField.hidden = !isAdmin;
    document.getElementById('add-username').required = isAdmin;
    document.getElementById('add-password').required = isAdmin;
});

addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageBox.hidden = true;
    addBtn.disabled = true;

    const body = {
        name: document.getElementById('add-name').value.trim(),
        hourly_rate: Number(document.getElementById('add-rate').value),
        role: addRole.value
    };
    if (addRole.value === 'ADMIN') {
        body.username = document.getElementById('add-username').value.trim();
        body.password = document.getElementById('add-password').value;
    }

    try {
        const { res, data } = await HR.api('/employees', { method: 'POST', body: JSON.stringify(body) });
        if (res.ok) {
            showMessage((data && data.message) || '新增成功', 'success');
            addForm.reset();
            addRole.dispatchEvent(new Event('change'));
            await loadEmployees();
        } else if (res.status !== 401) {
            showMessage(HR.errorText(data, '新增失敗'), 'error');
        }
    } catch (err) {
        showMessage('連線失敗，請稍後再試。', 'error');
    } finally {
        addBtn.disabled = false;
    }
});

// ---------- 修改 ----------
function startEdit(u) {
    editingId = u.id;
    editTitle.textContent = u.name;
    editName.value = u.name;
    editRate.value = u.hourly_rate;
    editCard.hidden = false;
    editCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    editName.focus();
}

document.getElementById('edit-cancel').addEventListener('click', () => {
    editingId = null;
    editCard.hidden = true;
});

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (editingId === null) return;
    messageBox.hidden = true;
    editSave.disabled = true;

    try {
        const { res, data } = await HR.api(`/employees/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify({ name: editName.value.trim(), hourly_rate: Number(editRate.value) })
        });
        if (res.ok) {
            showMessage((data && data.message) || '修改成功', 'success');
            editingId = null;
            editCard.hidden = true;
            await loadEmployees();
        } else if (res.status !== 401) {
            showMessage(HR.errorText(data, '修改失敗'), 'error');
        }
    } catch (err) {
        showMessage('連線失敗，請稍後再試。', 'error');
    } finally {
        editSave.disabled = false;
    }
});

loadEmployees();
