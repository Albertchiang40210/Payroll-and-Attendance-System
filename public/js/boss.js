// 薪資核算頁：僅管理員可用
const user = HR.getUser();
if (!HR.getToken() || !user || user.role !== 'ADMIN') {
    location.replace('/');
}

window.onSessionExpired = () => location.replace('/');

const monthInput = document.getElementById('month-input');
const calcBtn = document.getElementById('calc-btn');
const errorBox = document.getElementById('salary-error');
const resultCard = document.getElementById('result-card');
const resultTitle = document.getElementById('result-title');
const salaryTbody = document.getElementById('salary-tbody');
const salaryTfoot = document.getElementById('salary-tfoot');
const detailTbody = document.getElementById('detail-tbody');

// 預設為本月（台灣時間）
monthInput.value = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 7);


// 月份加減（YYYY-MM），不受瀏覽器月份選單的年份範圍影響
function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
}

document.getElementById('logout-btn').addEventListener('click', () => {
    HR.clearSession();
    location.replace('/');
});

function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

function emptyRow(colSpan, text) {
    const tr = document.createElement('tr');
    const td = cell(text, 'empty');
    td.colSpan = colSpan;
    tr.appendChild(td);
    return tr;
}

const money = (n) => `$${Number(n).toLocaleString('zh-TW')}`;

function render(month, summary, details) {
    resultTitle.textContent = `${month.replace('-', ' 年 ')} 月薪資`;
    salaryTbody.replaceChildren();
    salaryTfoot.replaceChildren();
    detailTbody.replaceChildren();

    if (summary.length === 0) {
        salaryTbody.appendChild(emptyRow(5, '這個月份沒有完整的打卡紀錄'));
    } else {
        let total = 0;
        summary.forEach((s) => {
            total += s.total_salary;
            const tr = document.createElement('tr');
            const name = cell(s.name);
            name.style.fontWeight = '600';
            tr.appendChild(name);
            tr.appendChild(cell(money(s.hourly_rate), 'num'));
            tr.appendChild(cell(`${s.total_hours} 小時`, 'num'));
            tr.appendChild(cell(`${s.day_off_count || 0} 天`, 'num'));
            tr.appendChild(cell(money(s.total_salary), 'num salary'));
            salaryTbody.appendChild(tr);
        });

        const foot = document.createElement('tr');
        const label = cell('合計');
        label.colSpan = 4;
        foot.appendChild(label);
        foot.appendChild(cell(money(total), 'num'));
        salaryTfoot.appendChild(foot);
    }

    if (details.length === 0) {
        detailTbody.appendChild(emptyRow(7, '沒有明細'));
    } else {
        details.forEach((d) => {
            const tr = document.createElement('tr');
            if (d.day_off) tr.style.color = '#5b6470';
            tr.appendChild(cell(d.work_date));
            tr.appendChild(cell(d.name));
            tr.appendChild(cell(d.manual ? `${d.punch_type}（補登）` : d.punch_type));
            tr.appendChild(cell(d.day_off ? '—' : d.log_in));
            tr.appendChild(cell(d.day_off ? '—' : d.log_out));
            tr.appendChild(cell(d.day_hours, 'num'));
            tr.appendChild(cell(money(d.earned), 'num'));
            detailTbody.appendChild(tr);
        });
    }

    resultCard.hidden = false;
}

async function calculate() {
    const month = monthInput.value;
    errorBox.hidden = true;
    if (!month) {
        errorBox.textContent = '請選擇月份';
        errorBox.hidden = false;
        return;
    }

    calcBtn.disabled = true;
    try {
        const { res, data } = await HR.api(`/salary?month=${encodeURIComponent(month)}`);
        if (res.ok && data && Array.isArray(data.summary)) {
            render(month, data.summary, data.details || []);
        } else if (res.status !== 401) {
            resultCard.hidden = true;
            errorBox.textContent = HR.errorText(data, '薪資計算失敗');
            errorBox.hidden = false;
        }
    } catch (err) {
        resultCard.hidden = true;
        errorBox.textContent = '連線失敗，請稍後再試。';
        errorBox.hidden = false;
    } finally {
        calcBtn.disabled = false;
    }
}

document.getElementById('month-prev').addEventListener('click', () => {
    monthInput.value = shiftMonth(monthInput.value || new Date().toISOString().slice(0, 7), -1);
    calculate();
});
document.getElementById('month-next').addEventListener('click', () => {
    monthInput.value = shiftMonth(monthInput.value || new Date().toISOString().slice(0, 7), 1);
    calculate();
});
calcBtn.addEventListener('click', calculate);
monthInput.addEventListener('change', calculate);
calculate();
