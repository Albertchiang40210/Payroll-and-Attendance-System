const API_URL = '/api';

// State
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user'));

// DOM Elements
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const userNameDisplay = document.getElementById('user-name-display');
const adminSection = document.getElementById('admin-section');
const attendanceTbody = document.getElementById('attendance-tbody');
const clockBtns = document.querySelectorAll('.clock-btn');
const aiBtn = document.getElementById('ai-recognize-btn');
const toastEl = document.getElementById('toast');

// Utility: Toast Notification
function showToast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast show ${type}`;
    setTimeout(() => {
        toastEl.className = 'toast';
    }, 3000);
}

// Utility: Switch Views
function updateView() {
    if (token && user) {
        loginView.classList.remove('active');
        dashboardView.classList.add('active');
        userNameDisplay.textContent = `${user.name} (${user.role === 'ADMIN' ? '管理員' : '員工'})`;
        
        if (user.role === 'ADMIN') {
            adminSection.classList.remove('hidden');
            fetchTodayAttendance();
        } else {
            adminSection.classList.add('hidden');
        }
    } else {
        dashboardView.classList.remove('active');
        loginView.classList.add('active');
    }
}

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            token = data.token;
            user = data.data.user;
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            showToast('登入成功！');
            updateView();
        } else {
            showToast(data.message || '登入失敗', 'error');
        }
    } catch (err) {
        showToast('網路錯誤', 'error');
    }
});

// Logout
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    token = null;
    user = null;
    updateView();
});

// Clock In / Out
clockBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const type = e.target.dataset.type;
        try {
            const res = await fetch(`${API_URL}/clock`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ type })
            });
            const data = await res.json();
            
            if (res.ok) {
                showToast(data.message);
                if (user.role === 'ADMIN') fetchTodayAttendance();
            } else {
                showToast(data.message, 'error');
            }
        } catch (err) {
            showToast('連線失敗', 'error');
        }
    });
});

// AI Recognize (Stub)
aiBtn.addEventListener('click', async () => {
    aiBtn.textContent = '🤖 辨識中...';
    aiBtn.disabled = true;
    
    try {
        const res = await fetch(`${API_URL}/clock/ai-recognize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ image_base64: 'fake-base64-string' })
        });
        const data = await res.json();
        
        if (res.ok) {
            showToast(`辨識成功: ${data.data.recognized_user} (${data.data.confidence})`);
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('連線失敗', 'error');
    } finally {
        aiBtn.textContent = '🤖 啟動 AI 視覺打卡 (測試)';
        aiBtn.disabled = false;
    }
});

// Fetch Attendance (Admin)
async function fetchTodayAttendance() {
    try {
        const res = await fetch(`${API_URL}/attendance/today`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (res.ok) {
            attendanceTbody.innerHTML = '';
            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.name}</td>
                    <td><span style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px;">${row.punch_type}</span></td>
                    <td>${row.log_in}</td>
                    <td>${row.log_out || '--:--:--'}</td>
                `;
                attendanceTbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error(err);
    }
}

// Init
updateView();
