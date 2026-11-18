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

const personSelect = document.getElementById('person-select');
const incompleteBox = document.getElementById('incomplete-box');
const personRow = personSelect.closest('.export-group'); // 沒有員工可選時整組隱藏

let lastReport = null; // 目前顯示的月份資料，供匯出使用

function render(month, summary, details, incomplete) {
    lastReport = { month, summary, details };
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
            tr.appendChild(cell(s.rate_changed ? `${money(s.hourly_rate)}（月中調薪）` : money(s.hourly_rate), 'num'));
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

    // 只打上班卡、沒打下班卡的日子不會計薪，要讓老闆在轉交報表前看得到
    incompleteBox.replaceChildren();
    incompleteBox.hidden = incomplete.length === 0;
    if (incomplete.length > 0) {
        const head = document.createElement('strong');
        head.textContent = `⚠ 有 ${incomplete.length} 筆只打了上班卡、沒打下班卡，未計入薪資（請到打卡紀錄補登後再重新計算）：`;
        incompleteBox.appendChild(head);
        const ul = document.createElement('ul');
        incomplete.forEach((r) => {
            const li = document.createElement('li');
            li.textContent = `${r.name}　${r.work_date}　${r.punch_type}　${r.log_in} 上班`;
            ul.appendChild(li);
        });
        incompleteBox.appendChild(ul);
    }

    personSelect.replaceChildren();
    summary.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.emp_id;
        opt.textContent = s.name;
        personSelect.appendChild(opt);
    });
    personRow.hidden = summary.length === 0;

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
            render(month, data.summary, data.details || [], data.incomplete || []);
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

// 單一員工的整月明細：依日期由前到後排列，最後附上合計
document.getElementById('export-person').addEventListener('click', () => {
    if (!lastReport) return;
    const { month, summary, details } = lastReport;
    const empId = Number(personSelect.value);
    const person = summary.find((s) => s.emp_id === empId);
    if (!person) return;
    const rows = details
        .filter((d) => d.emp_id === empId)
        .sort((a, b) => (a.work_date === b.work_date ? 0 : a.work_date < b.work_date ? -1 : 1));
    CSV.download(`${person.name}_${month}_明細.csv`, [
        ['日期', '類型', '上班', '下班', '工時（小時）', '金額', '補登'],
        ...rows.map((d) => [
            d.work_date, d.punch_type, d.day_off ? '' : d.log_in, d.day_off ? '' : d.log_out,
            d.day_hours, d.earned, d.manual ? '是' : ''
        ]),
        ['合計', '', '', '', person.total_hours, person.total_salary, '']
    ]);
});

// ---------- 下載 Excel（由伺服器產生 .xlsx） ----------
const EXCEL_NAMES = { payroll: '應發薪資', details: '每人打卡明細' };

async function downloadExcel(type, button) {
    const month = (lastReport && lastReport.month) || monthInput.value;
    if (!month) return;
    errorBox.hidden = true;
    button.disabled = true;
    try {
        const res = await fetch(`/api/salary/export?month=${encodeURIComponent(month)}&type=${type}`, {
            headers: { Authorization: `Bearer ${HR.getToken()}` }
        });
        if (res.status === 401) {
            HR.clearSession();
            window.onSessionExpired();
            return;
        }
        if (!res.ok) {
            let data = null;
            try { data = await res.json(); } catch (e) { data = null; }
            errorBox.textContent = HR.errorText(data, '下載失敗');
            errorBox.hidden = false;
            return;
        }
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = `${EXCEL_NAMES[type]}_${month}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
        errorBox.textContent = '連線失敗，請稍後再試。';
        errorBox.hidden = false;
    } finally {
        button.disabled = false;
    }
}

const payrollBtn = document.getElementById('export-payroll');
const detailsBtn = document.getElementById('export-all-details');
payrollBtn.addEventListener('click', () => downloadExcel('payroll', payrollBtn));
detailsBtn.addEventListener('click', () => downloadExcel('details', detailsBtn));
