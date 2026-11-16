const views = {
    pair: document.getElementById('pair-view'),
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

function createPanel(root, { load, punch, name, needLocation }) {
    root.replaceChildren(document.getElementById('clock-panel-tpl').content.cloneNode(true));
    tickClock();

    const buttons = [...root.querySelectorAll('.clock-btn')];
    const resultEl = root.querySelector('.panel-result');
    const statusEl = root.querySelector('.status-line');
    const recordList = root.querySelector('.record-list');
    const greetingHi = root.querySelector('.greeting-hi');
    const greetingSub = root.querySelector('.greeting-sub');
    const statEls = Object.fromEntries([...root.querySelectorAll('[data-stat]')].map((el) => [el.dataset.stat, el]));

    // 依台灣時間問候
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', hour12: false }).format(new Date()));
    const hello = hour >= 5 && hour < 11 ? '早安' : hour >= 11 && hour < 18 ? '午安' : '晚安';
    greetingHi.textContent = `🥟 ${hello}，${name || ''}`;
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
        greetingSub.textContent = normal && normal.log_out
            ? '今天辛苦了，好好休息！'
            : normal ? '工作加油！下班別忘了打卡喔'
            : '記得打上班卡喔';

        // 本月統計
        if (data.month) {
            statEls.work_days.textContent = data.month.work_days;
            statEls.total_hours.textContent = data.month.total_hours;
            statEls.day_off_days.textContent = data.month.day_off_days;
        }

        // 最近紀錄（手機用清單呈現，不用表格）
        const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
        recordList.replaceChildren();
        if (data.recent.length === 0) {
            const li = document.createElement('li');
            li.className = 'record-empty';
            li.textContent = '最近 14 天沒有打卡紀錄';
            recordList.appendChild(li);
            return;
        }
        data.recent.forEach((r) => {
            const li = document.createElement('li');
            li.className = `record${r.work_date === todayYmd ? ' today' : ''}${r.day_off ? ' off' : ''}`;

            const head = document.createElement('div');
            head.className = 'record-head';
            const date = document.createElement('span');
            date.className = 'record-date';
            date.textContent = formatDate(r.work_date, todayYmd);
            head.appendChild(date);

            const tag = document.createElement('span');
            tag.className = r.day_off ? 'tag tag-off' : r.punch_type === '加班' ? 'tag tag-ot' : 'tag';
            tag.textContent = r.punch_type;
            head.appendChild(tag);
            if (r.manual) {
                const m = document.createElement('span');
                m.className = 'tag tag-manual';
                m.textContent = '補登';
                head.appendChild(m);
            }
            li.appendChild(head);

            const times = document.createElement('div');
            times.className = 'record-times';
            if (r.day_off) {
                times.textContent = '整天沒有打卡';
            } else {
                const out = r.log_out ? r.log_out.slice(0, 5) : null;
                times.append(`上班 ${r.log_in.slice(0, 5)}　下班 `);
                const outSpan = document.createElement('span');
                outSpan.textContent = out || '尚未下班';
                if (!out) outSpan.className = 'pending';
                times.appendChild(outSpan);
            }
            li.appendChild(times);
            recordList.appendChild(li);
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
                // 店有設定「只能在店裡打卡」時，先取得手機位置一起送出
                let location = null;
                if (needLocation) {
                    setMessage(resultEl, '正在確認你的位置…', 'success');
                    try {
                        const c = await HR.getPosition();
                        location = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy };
                    } catch (err) {
                        setMessage(resultEl, err.message, 'error');
                        return;
                    }
                }

                const { res, data } = await punch(btn.dataset.type, btn.dataset.punch || '正常', location);
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
            showMyPunch(true);
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

// 手機登記被解除（換手機、離職）時，回到登記畫面
window.onKioskExpired = (message) => {
    route();
    setMessage(pairMessage, message || '這支手機的登記已失效，請向店長重新索取 QR Code。', 'error');
};

// 已登記的手機：直接顯示「自己」的打卡畫面（沒有名單可選，只能替自己打卡）
async function showMyPunch(justPaired = false) {
    showView('punch');
    setMessage(kioskMessage, null);
    // 同一個瀏覽器若也登入了老闆，提供回後台的入口；否則顯示「老闆登入」
    const adminLoggedIn = !!(HR.getToken() && HR.getUser() && HR.getUser().role === 'ADMIN');
    document.querySelectorAll('#punch-view [data-action="show-login"]').forEach((el) => (el.hidden = adminLoggedIn));
    document.querySelectorAll('#punch-view [data-action="back-admin"]').forEach((el) => (el.hidden = !adminLoggedIn));
    document.getElementById('kiosk-panel').replaceChildren();
    try {
        const { res, data } = await HR.api('/kiosk/me', { kiosk: true });
        if (!res.ok || !data) {
            if (res.status !== 401) setMessage(kioskMessage, HR.errorText(data, '讀取失敗，請稍後再試。'), 'error');
            return;
        }
        punchName.textContent = data.name;
        const panel = createPanel(document.getElementById('kiosk-panel'), {
            name: data.name,
            needLocation: data.location_required,
            load: () => HR.api('/kiosk/records', { kiosk: true }),
            punch: (type, punchType, location) =>
                HR.api('/kiosk/clock', {
                    method: 'POST',
                    kiosk: true,
                    body: JSON.stringify({ type, punch_type: punchType, ...(location && { location }) })
                })
        });
        panel.refresh();
        if (justPaired) {
            setMessage(kioskMessage, `✔ 手機登記完成！${data.name}，之後直接打開這個網址就能打卡。`, 'success');
        }
    } catch (err) {
        setMessage(kioskMessage, '網路連線失敗，請稍後再試。', 'error');
    }
}

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

const statEls = {
    staff: document.getElementById('stat-staff'),
    punched: document.getElementById('stat-punched'),
    working: document.getElementById('stat-working'),
    absent: document.getElementById('stat-absent')
};
const onboarding = document.getElementById('onboarding');
const absentCard = document.getElementById('absent-card');
const absentList = document.getElementById('absent-list');

async function loadDashboard() {
    try {
        const [att, emp] = await Promise.all([HR.api('/attendance/today'), HR.api('/employees')]);
        if (!att.res.ok || !Array.isArray(att.data) || !emp.res.ok || !Array.isArray(emp.data)) return;

        const rows = att.data;
        const staff = emp.data.filter((u) => u.punch && u.active);
        const punchedIds = new Set(rows.map((r) => r.userId));
        const workingIds = new Set(rows.filter((r) => !r.log_out).map((r) => r.userId));
        const absent = staff.filter((u) => !punchedIds.has(u.id));

        statEls.staff.textContent = staff.length;
        statEls.punched.textContent = staff.filter((u) => punchedIds.has(u.id)).length;
        statEls.working.textContent = workingIds.size;
        statEls.absent.textContent = absent.length;

        onboarding.hidden = staff.length > 0;

        absentList.replaceChildren();
        absentCard.hidden = absent.length === 0 || staff.length === 0;
        absent.forEach((u) => {
            const tag = document.createElement('span');
            tag.className = 'tag tag-lg';
            tag.textContent = u.name;
            absentList.appendChild(tag);
        });

        loadDay(dayInput.value || todayYmd());
    } catch (err) {
        console.error(err);
    }
}

// ---------- 出勤查詢（可選日期） ----------
const dayInput = document.getElementById('day-input');
const dayTitle = document.getElementById('day-title');
const dayAbsent = document.getElementById('day-absent');
const dayPrev = document.getElementById('day-prev');
const dayNext = document.getElementById('day-next');
const todayYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());

function shiftDate(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
}

async function loadDay(date) {
    const today = todayYmd();
    dayInput.value = date;

    const { res, data } = await HR.api(`/attendance/day?date=${encodeURIComponent(date)}`);
    if (!res.ok || !data) return;

    dayTitle.textContent = data.is_today ? '今日出勤' : data.is_future ? `${date}（還沒到）` : `${date} 出勤`;
    renderAttendance(data.rows, data.is_today, data.is_future);

    if (data.absent.length > 0) {
        dayAbsent.textContent = `${data.is_today ? '今天尚未打卡' : '當天休假'}：${data.absent.join('、')}`;
        dayAbsent.hidden = false;
    } else {
        dayAbsent.hidden = true;
    }
}

dayInput.addEventListener('change', () => {
    if (dayInput.value) loadDay(dayInput.value);
});
dayPrev.addEventListener('click', () => loadDay(shiftDate(dayInput.value || todayYmd(), -1)));
dayNext.addEventListener('click', () => loadDay(shiftDate(dayInput.value || todayYmd(), 1)));
document.getElementById('day-today').addEventListener('click', () => loadDay(todayYmd()));

function renderAttendance(data, isToday, isFuture) {
    attendanceTbody.replaceChildren();
    if (data.length === 0) {
        const tr = document.createElement('tr');
        const td = makeCell(isToday ? '今天還沒有人打卡' : isFuture ? '這一天還沒到' : '這一天沒有人打卡', 'empty');
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
        if (row.manual) {
            const m = document.createElement('span');
            m.className = 'tag tag-manual';
            m.style.marginLeft = '6px';
            m.textContent = '補登';
            typeCell.appendChild(m);
        }
        tr.appendChild(typeCell);

        tr.appendChild(makeCell(row.log_in));
        tr.appendChild(makeCell(row.log_out || '尚未下班', row.log_out ? '' : 'pending'));
        attendanceTbody.appendChild(tr);
    });
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
document.querySelectorAll('[data-action="back"], [data-action="back-admin"]').forEach((el) => el.addEventListener('click', () => route()));
document.getElementById('go-punch').addEventListener('click', () => showMyPunch());

function route() {
    const user = HR.getUser();
    if (HR.getToken() && user && user.role === 'ADMIN') {
        userNameDisplay.textContent = `${user.name}（管理員）`;
        document.getElementById('go-punch').hidden = !HR.getKioskToken();
        showView('dashboard');
        loadDashboard();
    } else if (HR.getKioskToken()) {
        showMyPunch();
    } else {
        showView('pair');
    }
    tickClock();
}

// 啟動：若網址帶有 #c=通行碼（掃 QR Code 進來），自動登記這支手機，並立刻把通行碼從網址列清掉
// 在 LINE、Facebook 等 App 內建的瀏覽器裡，資料和手機的瀏覽器是分開的，先提醒員工
if (/Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent)) {
    document.getElementById('inapp-warning').hidden = false;
}

(function init() {
    const match = /(?:^|[#&])c=([^&]+)/.exec(location.hash);
    if (match) {
        const code = decodeURIComponent(match[1]);
        history.replaceState(null, '', location.pathname);
        showView('pair');
        pairWith(code);
    } else {
        route();
    }
})();
