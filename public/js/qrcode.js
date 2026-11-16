// 員工手機與打卡位置：僅管理員可用
const me = HR.getUser();
if (!HR.getToken() || !me || me.role !== 'ADMIN') {
    location.replace('/');
}
window.onSessionExpired = () => location.replace('/');

const messageBox = document.getElementById('message');
const empSelect = document.getElementById('emp-select');
const qrCard = document.getElementById('qr-card');
const qrImg = document.getElementById('qr-img');
const qrCode = document.getElementById('qr-code');
const qrFor = document.getElementById('qr-for');
const qrState = document.getElementById('qr-state');
const qrCountdown = document.getElementById('qr-countdown');
const shareBtn = document.getElementById('qr-share');
const copyBtn = document.getElementById('qr-copy');
const createBtn = document.getElementById('qr-create');
const deviceTbody = document.getElementById('device-tbody');

let current = null; // 目前顯示的 QR Code
let boundNotified = false;

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
// 員工手機登記
// ======================================================================
async function loadDevices() {
    const { res, data } = await HR.api('/kiosk/devices');
    if (!res.ok || !Array.isArray(data)) {
        if (res.status !== 401) showMessage(HR.errorText(data, '讀取員工名單失敗'), 'error');
        return;
    }

    // 下拉選單（保留目前選擇）
    const selected = empSelect.value;
    empSelect.replaceChildren();
    data.forEach((u) => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.bound ? `${u.name}（已登記）` : `${u.name}（尚未登記）`;
        empSelect.appendChild(opt);
    });
    if (selected) empSelect.value = selected;

    // 狀態表
    deviceTbody.replaceChildren();
    if (data.length === 0) {
        const tr = document.createElement('tr');
        const td = cell('還沒有員工，請先到「員工管理」新增。', 'empty');
        td.colSpan = 3;
        tr.appendChild(td);
        deviceTbody.appendChild(tr);
        createBtn.disabled = true;
        return;
    }
    createBtn.disabled = false;

    data.forEach((u) => {
        const tr = document.createElement('tr');
        const name = cell(u.name);
        name.style.fontWeight = '600';
        tr.appendChild(name);

        const status = document.createElement('td');
        const tag = document.createElement('span');
        tag.className = `tag ${u.bound ? 'badge-bound' : 'badge-unbound'}`;
        tag.textContent = u.bound ? '已登記' : '尚未登記';
        status.appendChild(tag);
        if (u.bound && u.since) {
            status.appendChild(document.createTextNode(` ${new Date(u.since).toLocaleDateString('zh-TW')} 起`));
        }
        tr.appendChild(status);

        const action = document.createElement('td');
        action.className = 'num';
        if (u.bound) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-ghost';
            btn.textContent = '解除';
            btn.addEventListener('click', () => unbind(u));
            action.appendChild(btn);
        }
        tr.appendChild(action);
        deviceTbody.appendChild(tr);
    });
}

async function unbind(u) {
    if (!window.confirm(`確定要解除「${u.name}」的手機嗎？\n他需要重新掃描專屬 QR Code 才能再打卡。`)) return;
    const { res, data } = await HR.api(`/kiosk/devices/${u.id}`, { method: 'DELETE' });
    if (res.ok) {
        showMessage((data && data.message) || '已解除', 'success');
        await loadDevices();
    } else if (res.status !== 401) {
        showMessage(HR.errorText(data, '操作失敗'), 'error');
    }
}

document.getElementById('revoke-all').addEventListener('click', async () => {
    if (!window.confirm('確定要讓所有員工的手機失效嗎？\n每位員工都需要重新掃描專屬 QR Code。')) return;
    const { res, data } = await HR.api('/kiosk/revoke-all', { method: 'POST' });
    if (res.ok) {
        current = null;
        render();
        showMessage((data && data.message) || '已讓所有手機失效', 'success');
        await loadDevices();
    } else if (res.status !== 401) {
        showMessage(HR.errorText(data, '操作失敗'), 'error');
    }
});

// ---------- 顯示目前的 QR Code ----------
function render() {
    if (!current || !current.set) {
        qrCard.hidden = true;
        return;
    }
    qrCard.hidden = false;
    qrImg.src = current.qr_data_url;
    qrCode.textContent = current.code;
    qrFor.textContent = `為「${current.employee.name}」登記手機`;

    const left = Math.max(0, Math.floor((new Date(current.expires_at) - Date.now()) / 1000));
    const used = current.uses >= current.max_uses;
    const expired = left <= 0;

    qrImg.classList.toggle('qr-dead', expired || used);
    if (used) {
        qrState.textContent = `✔ ${current.employee.name} 的手機已登記完成`;
        qrState.className = 'qr-state ok';
        qrCountdown.textContent = '';
    } else if (expired) {
        qrState.textContent = '已過期，請重新產生';
        qrState.className = 'qr-state bad';
        qrCountdown.textContent = '';
    } else {
        qrState.textContent = `請 ${current.employee.name} 現在掃描`;
        qrState.className = 'qr-state ok';
        const m = Math.floor(left / 60);
        const s = String(left % 60).padStart(2, '0');
        qrCountdown.textContent = `還有 ${m}:${s} 失效`;
    }
    shareBtn.disabled = copyBtn.disabled = expired || used;
}
setInterval(render, 1000);

// 定時向伺服器確認是否已有人掃描
async function refresh() {
    const { res, data } = await HR.api('/kiosk/qr');
    if (!res.ok) return;
    const firstLoad = current === null;
    const wasUsed = current && current.set && current.uses >= current.max_uses;
    current = data;
    // 剛打開頁面時就已經用過的 QR Code，不要再跳「已登記完成」的提示
    if (firstLoad && current.set && current.uses >= current.max_uses) boundNotified = true;
    render();
    if (current.set && current.uses >= current.max_uses && !wasUsed && !boundNotified) {
        boundNotified = true;
        showMessage(`${current.employee.name} 的手機已登記完成。`, 'success');
        loadDevices();
    }
}
setInterval(() => {
    if (!document.hidden && current && current.set && current.uses < current.max_uses) refresh();
}, 3000);

createBtn.addEventListener('click', async () => {
    messageBox.hidden = true;
    createBtn.disabled = true;
    try {
        const { res, data } = await HR.api('/kiosk/qr', {
            method: 'POST',
            body: JSON.stringify({
                userId: Number(empSelect.value),
                ttl_minutes: Number(document.getElementById('ttl-select').value)
            })
        });
        if (res.ok) {
            boundNotified = false;
            current = data;
            render();
            qrCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (res.status !== 401) {
            showMessage(HR.errorText(data, '產生 QR Code 失敗'), 'error');
        }
    } catch (err) {
        showMessage('連線失敗，請稍後再試。', 'error');
    } finally {
        createBtn.disabled = false;
    }
});

if (navigator.share) shareBtn.hidden = false;

shareBtn.addEventListener('click', async () => {
    if (!current) return;
    try {
        await navigator.share({
            title: '車庫小籠包 員工打卡登記',
            text: `${current.employee.name}，請在時間內點開連結，登記你的手機後就能打卡：`,
            url: current.url
        });
    } catch (err) {
        // 使用者取消分享，不需處理
    }
});

copyBtn.addEventListener('click', async () => {
    if (!current) return;
    try {
        await navigator.clipboard.writeText(current.url);
        showMessage('連結已複製，可以貼到 LINE 傳給他本人。', 'success');
    } catch (err) {
        showMessage('複製失敗，請改用「用 LINE 傳給他」或讓他掃描 QR Code。', 'error');
    }
});

// ======================================================================
// 只能在店裡打卡（定位限制）
// ======================================================================
const locStatus = document.getElementById('loc-status');
const locSet = document.getElementById('loc-set');
const locTest = document.getElementById('loc-test');
const locClear = document.getElementById('loc-clear');
const radiusSelect = document.getElementById('radius-select');
let store = null;

const getPosition = HR.getPosition;

// 兩點距離（公尺）
function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

function renderLocation() {
    if (store && store.set) {
        locStatus.textContent = `✔ 已設定：員工要在店的 ${store.radius} 公尺內才能打卡`;
        locStatus.className = 'status-line done';
        locClear.hidden = false;
        radiusSelect.value = String(store.radius);
    } else {
        locStatus.textContent = '尚未設定：目前員工在哪裡都能打卡';
        locStatus.className = 'status-line none';
        locClear.hidden = true;
    }
}

async function loadLocation() {
    const { res, data } = await HR.api('/kiosk/location');
    if (res.ok) {
        store = data;
        renderLocation();
    }
}

locSet.addEventListener('click', async () => {
    if (!window.confirm('請確認你現在人就在店裡。\n要把你目前的位置設為店的位置嗎？')) return;
    locSet.disabled = true;
    locSet.textContent = '定位中…';
    try {
        const c = await getPosition();
        if (c.accuracy > 100) {
            if (!window.confirm(`目前定位誤差約 ${Math.round(c.accuracy)} 公尺，偏大。\n建議走到靠窗或戶外再試一次。仍要使用這個位置嗎？`)) return;
        }
        const { res, data } = await HR.api('/kiosk/location', {
            method: 'PUT',
            body: JSON.stringify({ lat: c.latitude, lng: c.longitude, radius: Number(radiusSelect.value) })
        });
        if (res.ok) {
            store = data;
            renderLocation();
            showMessage('已設定店的位置。員工之後要在店附近才能打卡。', 'success');
        } else if (res.status !== 401) {
            showMessage(HR.errorText(data, '設定失敗'), 'error');
        }
    } catch (err) {
        showMessage(err.message, 'error');
    } finally {
        locSet.disabled = false;
        locSet.textContent = '把我現在的位置設為店的位置';
    }
});

locTest.addEventListener('click', async () => {
    if (!store || !store.set) {
        showMessage('還沒有設定店的位置。', 'error');
        return;
    }
    locTest.disabled = true;
    try {
        const c = await getPosition();
        const d = Math.round(distanceMeters(store.lat, store.lng, c.latitude, c.longitude));
        const ok = d <= store.radius;
        showMessage(
            `你現在離店約 ${d} 公尺（定位誤差約 ${Math.round(c.accuracy)} 公尺）。${ok ? '在範圍內，可以打卡。' : '超出範圍，不能打卡。'}`,
            ok ? 'success' : 'error'
        );
    } catch (err) {
        showMessage(err.message, 'error');
    } finally {
        locTest.disabled = false;
    }
});

locClear.addEventListener('click', async () => {
    if (!window.confirm('確定要取消位置限制嗎？\n取消後員工在哪裡都能打卡。')) return;
    const { res, data } = await HR.api('/kiosk/location', { method: 'DELETE' });
    if (res.ok) {
        store = { set: false };
        renderLocation();
        showMessage((data && data.message) || '已取消位置限制', 'success');
    } else if (res.status !== 401) {
        showMessage(HR.errorText(data, '操作失敗'), 'error');
    }
});

// ---------- 初始化 ----------
loadDevices();
refresh();
loadLocation();
