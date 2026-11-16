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
const adminPunchField = document.getElementById('admin-punch-field');
const editPunch = document.getElementById('edit-punch');
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
        if (!u.punch) {
            const noPunch = document.createElement('span');
            noPunch.className = 'tag tag-off';
            noPunch.style.marginLeft = '6px';
            noPunch.textContent = '不打卡';
            roleCell.appendChild(noPunch);
        }
        tr.appendChild(roleCell);

        tr.appendChild(cell(`$${Number(u.hourly_rate).toLocaleString('zh-TW')}`, 'num'));
        tr.appendChild(cell(u.active ? '在職' : '已離職'));

        const actionCell = document.createElement('td');
        actionCell.className = 'num';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-ghost';
        editBtn.textContent = '修改';
        editBtn.addEventListener('click', () => startEdit(u));
        actionCell.appendChild(editBtn);

        // 依狀況只顯示合適的按鈕，避免「離職」與「刪除」搞混、也避免誤刪歷史紀錄：
        //  - 在職且已有打卡紀錄：只能「離職」（保留紀錄）
        //  - 在職但還沒有任何紀錄（新增錯、測試用）：可直接「刪除」
        //  - 已離職：可「復職」，或「永久刪除」
        const addAction = (label, onClick, danger) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `btn btn-ghost${danger ? ' btn-danger-ghost' : ''}`;
            b.style.marginLeft = '6px';
            b.textContent = label;
            b.addEventListener('click', onClick);
            actionCell.appendChild(b);
        };
        const hasRecords = (u.attendance_count || 0) > 0;
        const isSelf = u.id === me.id;

        if (u.active) {
            // 管理員帳號不可標記離職，避免把自己鎖在外面
            if (u.role !== 'ADMIN' && hasRecords) addAction('離職', () => toggleActive(u));
            if (!hasRecords && !isSelf) addAction('刪除', () => removeUser(u), true);
        } else {
            addAction('復職', () => toggleActive(u));
            addAction('永久刪除', () => removeUser(u), true);
        }
        tr.appendChild(actionCell);

        tbody.appendChild(tr);
    });
}

async function toggleActive(u) {
    if (u.active && !window.confirm(`確定要把「${u.name}」標記為離職嗎？\n他會從打卡名單消失，他的手機也不能再打卡；過去的打卡和薪資紀錄會保留，之後也可以「復職」。`)) return;
    const { res, data } = await HR.api(`/employees/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !u.active })
    });
    if (res.ok) {
        showMessage(`${u.name} 已${u.active ? '標記為離職' : '恢復在職'}。`, 'success');
        await loadEmployees();
    } else if (res.status !== 401) {
        showMessage(HR.errorText(data, '操作失敗'), 'error');
    }
}

async function removeUser(u) {
    const n = u.attendance_count || 0;
    let text = `確定要永久刪除「${u.name}」嗎？`;
    if (n > 0) {
        text += `\n\n他有 ${n} 筆打卡紀錄，會一起被刪除，薪資歷史也會消失，無法復原。\n如果只是離職，不需要刪除，保留紀錄比較好。`;
    }
    if (!window.confirm(text)) return;
    // 有打卡紀錄時再確認一次，避免誤刪
    if (n > 0 && !window.confirm(`最後確認：真的要刪除「${u.name}」和他的 ${n} 筆打卡紀錄嗎？`)) return;

    const { res, data } = await HR.api(`/employees/${u.id}`, { method: 'DELETE' });
    if (res.ok) {
        showMessage((data && data.message) || '已刪除', 'success');
        if (editingId === u.id) {
            editingId = null;
            editCard.hidden = true;
        }
        await loadEmployees();
    } else if (res.status !== 401) {
        showMessage(HR.errorText(data, '刪除失敗'), 'error');
    }
}

// ---------- 新增 ----------
addRole.addEventListener('change', () => {
    const isAdmin = addRole.value === 'ADMIN';
    adminUsernameField.hidden = !isAdmin;
    adminPasswordField.hidden = !isAdmin;
    adminPunchField.hidden = !isAdmin;
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
        body.punch = document.getElementById('add-punch').checked;
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
    editPunch.checked = !!u.punch;
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
            body: JSON.stringify({ name: editName.value.trim(), hourly_rate: Number(editRate.value), punch: editPunch.checked })
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
