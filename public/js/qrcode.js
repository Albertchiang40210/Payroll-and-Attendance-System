// 員工登記 QR Code 頁：僅管理員可用
const me = HR.getUser();
if (!HR.getToken() || !me || me.role !== 'ADMIN') {
    location.replace('/');
}
window.onSessionExpired = () => location.replace('/');

const messageBox = document.getElementById('message');
const qrCard = document.getElementById('qr-card');
const qrImg = document.getElementById('qr-img');
const qrCode = document.getElementById('qr-code');
const qrState = document.getElementById('qr-state');
const qrCountdown = document.getElementById('qr-countdown');
const qrUses = document.getElementById('qr-uses');
const shareBtn = document.getElementById('qr-share');
const copyBtn = document.getElementById('qr-copy');
const createBtn = document.getElementById('qr-create');

let current = null; // 目前顯示的 QR Code 資料

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

// ---------- 顯示目前的 QR Code ----------
function render() {
    if (!current || !current.set) {
        qrCard.hidden = true;
        return;
    }
    qrCard.hidden = false;
    qrImg.src = current.qr_data_url;
    qrCode.textContent = current.code;

    const left = Math.max(0, Math.floor((new Date(current.expires_at) - Date.now()) / 1000));
    const full = current.uses >= current.max_uses;
    const expired = left <= 0;

    qrUses.textContent = `已登記 ${current.uses} / ${current.max_uses} 支手機`;
    qrImg.classList.toggle('qr-dead', expired || full);

    if (expired) {
        qrState.textContent = '已過期，請重新產生';
        qrState.className = 'qr-state bad';
        qrCountdown.textContent = '';
    } else if (full) {
        qrState.textContent = '名額已滿，請重新產生';
        qrState.className = 'qr-state bad';
        qrCountdown.textContent = '';
    } else {
        qrState.textContent = '請員工現在掃描';
        qrState.className = 'qr-state ok';
        const m = Math.floor(left / 60);
        const s = String(left % 60).padStart(2, '0');
        qrCountdown.textContent = `還有 ${m}:${s} 失效`;
    }
    shareBtn.disabled = copyBtn.disabled = expired || full;
}

setInterval(render, 1000);

// 定時向伺服器更新「已登記幾支手機」
async function refresh() {
    const { res, data } = await HR.api('/kiosk/qr');
    if (res.ok) {
        current = data;
        render();
    }
}
setInterval(() => {
    if (!document.hidden && current && current.set) refresh();
}, 5000);

// ---------- 產生 ----------
createBtn.addEventListener('click', async () => {
    messageBox.hidden = true;
    createBtn.disabled = true;
    try {
        const { res, data } = await HR.api('/kiosk/qr', {
            method: 'POST',
            body: JSON.stringify({
                ttl_minutes: Number(document.getElementById('ttl-select').value),
                max_uses: Number(document.getElementById('uses-select').value)
            })
        });
        if (res.ok) {
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

// ---------- 傳給員工（LINE 等）與複製連結 ----------
if (navigator.share) shareBtn.hidden = false;

shareBtn.addEventListener('click', async () => {
    if (!current) return;
    try {
        await navigator.share({
            title: '車庫小籠包 員工打卡登記',
            text: '請在時間內點開連結，登記你的手機後就能打卡：',
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
        showMessage('連結已複製，可以貼到 LINE 傳給員工。', 'success');
    } catch (err) {
        showMessage('複製失敗，請改用「用 LINE 傳給員工」或讓員工掃描 QR Code。', 'error');
    }
});

// ---------- 讓所有已登記的手機失效 ----------
document.getElementById('revoke-all').addEventListener('click', async () => {
    if (!window.confirm('確定要讓所有已登記的手機失效嗎？\n所有員工都需要重新登記手機才能打卡。')) return;
    const { res, data } = await HR.api('/kiosk/revoke-all', { method: 'POST' });
    if (res.ok) {
        current = null;
        render();
        showMessage((data && data.message) || '已讓所有手機失效', 'success');
    } else if (res.status !== 401) {
        showMessage(HR.errorText(data, '操作失敗'), 'error');
    }
});

refresh();
