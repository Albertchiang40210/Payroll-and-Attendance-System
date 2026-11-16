// 補打卡頁：僅管理員可用
const me = HR.getUser();
if (!HR.getToken() || !me || me.role !== 'ADMIN') {
    location.replace('/');
}
window.onSessionExpired = () => location.replace('/');

const messageBox = document.getElementById('message');
const empSelect = document.getElementById('emp-select');
const monthInput = document.getElementById('month-input');
const form = document.getElementById('record-form');
const formTitle = document.getElementById('form-title');
const formSub = document.getElementById('form-sub');
const recDate = document.getElementById('rec-date');
const recType = document.getElementById('rec-type');
const recIn = document.getElementById('rec-in');
const recOut = document.getElementById('rec-out');
const recNote = document.getElementById('rec-note');
const recSave = document.getElementById('rec-save');
const recCancel = document.getElementById('rec-cancel');
const listTitle = document.getElementById('list-title');
const tbody = document.getElementById('record-tbody');

const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

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

function formatDate(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`;
}

// ---------- 表單模式：補登 / 修改 ----------
function setCreateMode(date) {
    editingId = null;
    form.reset();
    recDate.max = todayYmd;
    recDate.value = date || todayYmd;
    recDate.disabled = false;
    recType.disabled = false;
    formTitle.textContent = '補打卡';
    formSub.textContent = '新增一筆紀錄。上班時間必填，下班時間可以先留白。';
    recSave.textContent = '補登';
    recCancel.hidden = true;
}

function setEditMode(rec) {
    editingId = rec.id;
    recDate.value = rec.work_date;
    recDate.disabled = true;
    recType.value = rec.punch_type;
    recType.disabled = true;
    recIn.value = rec.log_in.slice(0, 5);
    recOut.value = rec.log_out ? rec.log_out.slice(0, 5) : '';
    recNote.value = rec.note || '';
    formTitle.textContent = `修改紀錄：${rec.work_date}（${rec.punch_type}）`;
    formSub.textContent = '日期與類型不能改；要改請刪除這筆後重新補登。';
    recSave.textContent = '儲存修改';
    recCancel.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

recCancel.addEventListener('click', () => setCreateMode());

// ---------- 列表 ----------
async function loadList() {
    const userId = empSelect.value;
    const month = monthInput.value;
    if (!userId || !month) return;

    const { res, data } = await HR.api(`/records?userId=${encodeURIComponent(userId)}&month=${encodeURIComponent(month)}`);
    if (!res.ok || !data) {
        if (res.status !== 401) showMessage(HR.errorText(data, '讀取紀錄失敗'), 'error');
        return;
    }

    listTitle.textContent = `${data.name} ${month.replace('-', ' 年 ')} 月紀錄`;

    const items = [
        ...data.records.map((r) => ({ date: r.work_date, rec: r })),
        ...data.day_offs.map((d) => ({ date: d, dayOff: true }))
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    tbody.replaceChildren();
    if (items.length === 0) {
        const tr = document.createElement('tr');
        const td = cell('這個月沒有紀錄', 'empty');
        td.colSpan = 6;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    items.forEach((it) => {
        const tr = document.createElement('tr');
        tr.appendChild(cell(formatDate(it.date)));

        const typeTd = document.createElement('td');
        const tag = document.createElement('span');
        tag.className = it.dayOff ? 'tag tag-off' : it.rec.punch_type === '加班' ? 'tag tag-ot' : 'tag';
        tag.textContent = it.dayOff ? '休假' : it.rec.punch_type;
        typeTd.appendChild(tag);
        tr.appendChild(typeTd);

        const actionTd = document.createElement('td');
        actionTd.className = 'num';

        if (it.dayOff) {
            const td = cell('整天沒有打卡', 'dayoff-note');
            td.colSpan = 3;
            tr.appendChild(td);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-ghost';
            btn.textContent = '補打卡';
            btn.addEventListener('click', () => {
                setCreateMode(it.date);
                form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                recIn.focus();
            });
            actionTd.appendChild(btn);
        } else {
            tr.appendChild(cell(it.rec.log_in));
            tr.appendChild(cell(it.rec.log_out || '尚未下班', it.rec.log_out ? '' : 'pending'));

            const noteTd = document.createElement('td');
            if (it.rec.manual) {
                const m = document.createElement('span');
                m.className = 'tag tag-manual';
                m.textContent = '補登';
                noteTd.appendChild(m);
            }
            if (it.rec.note) noteTd.appendChild(document.createTextNode(` ${it.rec.note}`));
            if (!it.rec.manual && it.rec.in_distance !== null && it.rec.in_distance !== undefined) {
                const d = document.createElement('span');
                d.className = 'dayoff-note';
                d.textContent = ` 打卡時離店 ${it.rec.in_distance} 公尺`;
                noteTd.appendChild(d);
            }
            tr.appendChild(noteTd);

            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'btn btn-ghost';
            edit.textContent = '修改';
            edit.addEventListener('click', () => setEditMode(it.rec));

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'btn btn-ghost';
            del.style.marginLeft = '6px';
            del.textContent = '刪除';
            del.addEventListener('click', () => removeRecord(it.rec));

            actionTd.appendChild(edit);
            actionTd.appendChild(del);
        }

        if (it.dayOff) tr.appendChild(cell(''));
        tr.appendChild(actionTd);
        tbody.appendChild(tr);
    });
}

async function removeRecord(rec) {
    if (!window.confirm(`確定要刪除 ${rec.work_date} 的【${rec.punch_type}】紀錄嗎？\n刪除後這天若沒有其他打卡，會變成休假。`)) return;
    const { res, data } = await HR.api(`/records/${rec.id}`, { method: 'DELETE' });
    if (res.ok) {
        showMessage((data && data.message) || '已刪除', 'success');
        if (editingId === rec.id) setCreateMode();
        await loadList();
    } else if (res.status !== 401) {
        showMessage(HR.errorText(data, '刪除失敗'), 'error');
    }
}

// ---------- 儲存 ----------
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageBox.hidden = true;
    recSave.disabled = true;

    try {
        let result;
        if (editingId === null) {
            const body = {
                userId: Number(empSelect.value),
                work_date: recDate.value,
                punch_type: recType.value,
                clock_in: recIn.value
            };
            if (recOut.value) body.clock_out = recOut.value;
            if (recNote.value.trim()) body.note = recNote.value.trim();
            result = await HR.api('/records', { method: 'POST', body: JSON.stringify(body) });
        } else {
            result = await HR.api(`/records/${editingId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    clock_in: recIn.value,
                    clock_out: recOut.value || null,
                    note: recNote.value.trim() || null
                })
            });
        }

        const { res, data } = result;
        if (res.ok) {
            showMessage((data && data.message) || '已儲存', 'success');
            // 補登的日期若在別的月份，切換到那個月份方便確認
            if (editingId === null && recDate.value.slice(0, 7) !== monthInput.value) {
                monthInput.value = recDate.value.slice(0, 7);
            }
            setCreateMode();
            await loadList();
        } else if (res.status !== 401) {
            showMessage(HR.errorText(data, '儲存失敗'), 'error');
        }
    } catch (err) {
        showMessage('連線失敗，請稍後再試。', 'error');
    } finally {
        recSave.disabled = false;
    }
});

// ---------- 初始化 ----------
async function init() {
    monthInput.value = todayYmd.slice(0, 7);
    setCreateMode();

    const { res, data } = await HR.api('/employees');
    if (!res.ok || !Array.isArray(data)) {
        if (res.status !== 401) showMessage(HR.errorText(data, '讀取員工名單失敗'), 'error');
        return;
    }

    const staff = data.filter((u) => u.role === 'EMPLOYEE');
    if (staff.length === 0) {
        showMessage('還沒有員工，請先到「員工管理」新增。', 'error');
        return;
    }
    staff.forEach((u) => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.active ? u.name : `${u.name}（已停用）`;
        empSelect.appendChild(opt);
    });
    loadList();
}

empSelect.addEventListener('change', () => {
    setCreateMode();
    loadList();
});
monthInput.addEventListener('change', loadList);

init();
