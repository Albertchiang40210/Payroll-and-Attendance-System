const views = {
    pair: document.getElementById('pair-view'),
    kiosk: document.getElementById('kiosk-view'),
    punch: document.getElementById('punch-view'),
    login: document.getElementById('login-view'),
    dashboard: document.getElementById('dashboard-view')
};

function showView(name) {
    Object.entries(views).forEach(([key, el]) => (el.hidden = key !== name));
    window.scrollTo(0, 0);
}

// ---------- 即時時鐘（台灣時間） ----------
const dateFmt = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
});
const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
});
function tickClock() {
    const now = new Date();
    document.querySelectorAll('.now-date').forEach((el) => (el.textContent = dateFmt.format(now)));
    document.querySelectorAll('.now-time').forEach((el) => (el.textContent = timeFmt.format(now)));
}
setInterval(tickClock, 1000);

function setMessage(el, text, type) {
    if (!text) {
        el.hidden = true;
        return;
    }
    el.textContent = text;
    el.className = `result ${type}`;
    el.hidden = false;
}

function makeCell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

// ======================================================================
// 打卡面板：顯示今天狀態、按鈕、最近紀錄。員工選名字後使用。
// ======================================================================
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
function formatDate(ymd, todayYmd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const label = `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`;
    return ymd === todayYmd ? `今天 ${label}` : label;
}

function createPanel(root, { load, punch }) {
    root.replaceChildren(document.getElementById('clock-panel-tpl').content.cloneNode(true));
    tickClock();

    const buttons = [...root.querySelectorAll('.clock-btn')];
    const resultEl = root.querySelector('.panel-result');
    const statusEl = root.querySelector('.status-line');
    const tbody = root.querySelector('.records-table tbody');
    const button = (type, punchType) =>
        buttons.find((b) => b.dataset.type === type && (b.dataset.punch || '正常') === punchType);

    function describe(label, rec) {
        if (!rec) return null;
        return rec.log_out
            ? `${label}：上班 ${rec.log_in}、下班 ${rec.log_out}`
            : `${label}：已上班 ${rec.log_in}，尚未下班`;
    }

    function render(data) {
        const normal = data.today.find((r) => r.punch_type === '正常');
        const overtime = data.today.find((r) => r.punch_type === '加班');

        // 依今天的紀錄決定哪些按鈕可按（避免誤按；後端也會再檢查）
        button('in', '正常').disabled = !!normal;
        button('out', '正常').disabled = !normal || !!normal.log_out;
        button('in', '加班').disabled = !(normal && normal.log_out) || !!overtime;
        button('out', '加班').disabled = !overtime || !!overtime.log_out;

        // 今天的打卡狀態
        const lines = [describe('今天', normal) || '今天還沒有打卡紀錄', describe('加班', overtime)].filter(Boolean);
        statusEl.textContent = lines.join('\n');
        statusEl.className = `status-line ${normal && normal.log_out ? 'done' : normal ? 'working' : 'none'}`;

        // 最近紀錄
        const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
        tbody.replaceChildren();
        if (data.recent.length === 0) {
            const tr = document.createElement('tr');
            const td = makeCell('最近 14 天沒有打卡紀錄', 'empty');
            td.colSpan = 4;
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }
        data.recent.forEach((r) => {
            const tr = document.createElement('tr');
            if (r.work_date === todayYmd) tr.className = 'today-row';
            tr.appendChild(makeCell(formatDate(r.work_date, todayYmd)));
            const typeTd = document.createElement('td');
            const tag = document.createElement('span');
            tag.className = r.punch_type === '加班' ? 'tag tag-ot' : 'tag';
            tag.textContent = r.punch_type;
            typeTd.appendChild(tag);
            tr.appendChild(typeTd);
            tr.appendChild(makeCell(r.log_in));
            tr.appendChild(makeCell(r.log_out || '尚未下班', r.log_out ? '' : 'pending'));
            tbody.appendChild(tr);
        });
    }

    async function refresh() {
        try {
            const { res, data } = await load();
            if (res.ok && data && Array.isArray(data.today)) {
                render(data);
                return;
            }
        } catch (err) {
            // 讀不到狀態時全部開放，由後端規則把關
        }
        buttons.forEach((b) => (b.disabled = false));
    }

    buttons.forEach((btn) => {
        btn.addEventListener('click', async () => {
            // 送出期間鎖住按鈕，避免手機連點造成重複請求
            buttons.forEach((b) => (b.disabled = true));
            setMessage(resultEl, null);

            try {
                const { res, data } = await punch(btn.dataset.type, btn.dataset.punch || '正常');
                if (res.ok) {
                    setMessage(resultEl, (data && data.message) || '打卡成功', 'success');
                } else if (res.status !== 401) {
                    setMessage(resultEl, HR.errorText(data, '打卡失敗，請再試一次。'), 'error');
                }
            } catch (err) {
                setMessage(resultEl, '連線失敗，請確認網路後再試一次。', 'error');
            } finally {
                await refresh();
            }
        });
    });

    return { refresh };
}

// ======================================================================
// 員工手機：掃 QR Code 登記 → 選名字 → 打卡
// ======================================================================
const pairMessage = document.getElementById('pair-message');
const pairForm = document.getElementById('pair-form');
const pairBtn = document.getElementById('pair-btn');
const pairCodeInput = document.getElementById('pair-code');
const nameGrid = document.getElementById('name-grid');
const kioskMessage = document.getElementById('kiosk-message');
const punchName = document.getElementById('punch-name');

async function pairWith(code) {
    pairBtn.disabled = true;
    setMessage(pairMessage, '登記中…', 'success');
    try {
        const { res, data } = await HR.api('/kiosk/pair', {
            method: 'POST',
            body: JSON.stringify({ code })
        });
        if (res.ok && data && data.token) {
            HR.setKioskToken(data.token);
            pairCodeInput.value = '';
            setMessage(pairMessage, null);
            route();
        } else {
            setMessage(pairMessage, HR.errorText(data, '登記失敗，請重新掃描 QR Code。'), 'error');
        }
    } catch (err) {
        setMessage(pairMessage, '網路連線失敗，請稍後再試。', 'error');
    } finally {
        pairBtn.disabled = false;
    }
}

pairForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = pairCodeInput.value.trim();
    if (code) pairWith(code);
});

// 通行碼更換後，舊手機需重新掃描
window.onKioskExpired = (message) => {
    route();
    setMessage(pairMessage, message || '通行碼已更新，請重新掃描 QR Code。', 'error');
};

async function loadNames() {
    setMessage(kioskMessage, null);
    nameGrid.replaceChildren();
    try {
        const { res, data } = await HR.api('/kiosk/employees', { kiosk: true });
        if (!res.ok || !Array.isArray(data)) {
            if (res.status !== 401) setMessage(kioskMessage, HR.errorText(data, '讀取名單失敗，請稍後再試。'), 'error');
            return;
        }
        if (data.length === 0) {
            setMessage(kioskMessage, '還沒有員工名單，請老闆先到後台新增員工。', 'error');
            return;
        }
        data.forEach((emp) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-name';
            btn.textContent = emp.name;
            btn.addEventListener('click', () => openPunch(emp));
            nameGrid.appendChild(btn);
        });
    } catch (err) {
        setMessage(kioskMessage, '網路連線失敗，請稍後再試。', 'error');
    }
}

let kioskPanel = null;
function openPunch(emp) {
    punchName.textContent = emp.name;
    kioskPanel = createPanel(document.getElementById('kiosk-panel'), {
        load: () => HR.api(`/kiosk/records?userId=${emp.id}`, { kiosk: true }),
        punch: (type, punchType) =>
            HR.api('/kiosk/clock', {
                method: 'POST',
                kiosk: true,
                body: JSON.stringify({ userId: emp.id, type, punch_type: punchType })
            })
    });
    showView('punch');
    kioskPanel.refresh();
}

document.getElementById('punch-back').addEventListener('click', () => {
    kioskPanel = null;
    showView('kiosk');
    loadNames();
});

// ======================================================================
// 老闆：帳號密碼登入、今日出勤
// ======================================================================
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const userNameDisplay = document.getElementById('user-name-display');
const attendanceTbody = document.getElementById('attendance-tbody');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage(loginError, null);
    loginBtn.disabled = true;

    try {
        const { res, data } = await HR.api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                username: document.getElementById('username').value,
                password: document.getElementById('password').value
            })
        });

        if (res.ok && data && data.token) {
            if (data.data.user.role !== 'ADMIN') {
                setMessage(loginError, '此入口僅限老闆使用。員工請用手機掃描 QR Code 打卡。', 'error');
                return;
            }
            HR.setSession(data.token, data.data.user);
            loginForm.reset();
            route();
        } else {
            setMessage(loginError, HR.errorText(data, '登入失敗，請確認帳號密碼。'), 'error');
        }
    } catch (err) {
        setMessage(loginError, '網路連線失敗，請稍後再試。', 'error');
    } finally {
        loginBtn.disabled = false;
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    HR.clearSession();
    route();
});

// 登入過期時回到登入頁
window.onSessionExpired = () => {
    showView('login');
    setMessage(loginError, '登入已過期，請重新登入。', 'error');
};

async function fetchTodayAttendance() {
    try {
        const { res, data } = await HR.api('/attendance/today');
        if (!res.ok || !Array.isArray(data)) return;

        attendanceTbody.replaceChildren();
        if (data.length === 0) {
            const tr = document.createElement('tr');
            const td = makeCell('今天還沒有人打卡', 'empty');
            td.colSpan = 4;
            tr.appendChild(td);
            attendanceTbody.appendChild(tr);
            return;
        }

        data.forEach((row) => {
            const tr = document.createElement('tr');
            tr.appendChild(makeCell(row.name));

            const typeCell = document.createElement('td');
            const tag = document.createElement('span');
            tag.className = row.punch_type === '加班' ? 'tag tag-ot' : 'tag';
            tag.textContent = row.punch_type;
            typeCell.appendChild(tag);
            tr.appendChild(typeCell);

            tr.appendChild(makeCell(row.log_in));
            tr.appendChild(makeCell(row.log_out || '--:--:--'));
            attendanceTbody.appendChild(tr);
        });
    } catch (err) {
        console.error(err);
    }
}

// ======================================================================
// 路由：依身分決定顯示哪個畫面
// ======================================================================
document.querySelectorAll('[data-action="show-login"]').forEach((el) =>
    el.addEventListener('click', () => {
        setMessage(loginError, null);
        showView('login');
    })
);
document.querySelectorAll('[data-action="back"]').forEach((el) => el.addEventListener('click', () => route()));

function route() {
    const user = HR.getUser();
    if (HR.getToken() && user && user.role === 'ADMIN') {
        userNameDisplay.textContent = `${user.name}（管理員）`;
        showView('dashboard');
        fetchTodayAttendance();
    } else if (HR.getKioskToken()) {
        showView('kiosk');
        loadNames();
    } else {
        showView('pair');
    }
    tickClock();
}

// 啟動：若網址帶有 #c=通行碼（掃 QR Code 進來），自動登記這支手機，並立刻把通行碼從網址列清掉
(function init() {
    const match = /(?:^|[#&])c=([^&]+)/.exec(location.hash);
    if (match) {
        const code = decodeURIComponent(match[1]);
        history.replaceState(null, '', location.pathname + location.search);
        showView('pair');
        pairWith(code);
    } else {
        route();
    }
})();
