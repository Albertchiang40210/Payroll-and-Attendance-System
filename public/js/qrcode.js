// 打卡 QR Code 頁：僅管理員可用
const me = HR.getUser();
if (!HR.getToken() || !me || me.role !== 'ADMIN') {
    location.replace('/');
}
window.onSessionExpired = () => location.replace('/');

const messageBox = document.getElementById('message');

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

// ======================================================================
// 打卡 QR Code
// ======================================================================
const qrEmpty = document.getElementById('qr-empty');
const qrPrint = document.getElementById('qr-print');
const qrImg = document.getElementById('qr-img');
const qrCode = document.getElementById('qr-code');
const qrDownload = document.getElementById('qr-download');

function renderQr(data) {
    if (!data || !data.set) {
        qrEmpty.hidden = false;
        qrPrint.hidden = true;
        return;
    }
    qrEmpty.hidden = true;
    qrPrint.hidden = false;
    qrImg.src = data.qr_data_url;
    qrDownload.href = data.qr_data_url;
    qrCode.textContent = data.code;
}

async function loadQr() {
    const { res, data } = await HR.api('/kiosk/qr');
    if (res.ok) renderQr(data);
    else if (res.status !== 401) showMessage(HR.errorText(data, '讀取 QR Code 失敗'), 'error');
}

async function generateQr(confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    const { res, data } = await HR.api('/kiosk/qr/regenerate', { method: 'POST' });
    if (res.ok) {
        renderQr(data);
        showMessage('已產生新的 QR Code。', 'success');
    } else if (res.status !== 401) {
        showMessage(HR.errorText(data, '產生 QR Code 失敗'), 'error');
    }
}

document.getElementById('qr-create').addEventListener('click', () => generateQr());
document.getElementById('qr-regen').addEventListener('click', () =>
    generateQr('確定要重新產生嗎？\n舊的 QR Code 和所有已登記的員工手機都會失效，需要重新掃描。')
);
document.getElementById('qr-print-btn').addEventListener('click', () => window.print());

loadQr();
