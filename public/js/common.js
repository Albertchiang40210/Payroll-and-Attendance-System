// 兩個身分共用的工具：
//  - 老闆：帳號密碼登入（localStorage: token / user）
//  - 員工手機：掃 QR Code 登記後取得「裝置 token」（localStorage: kioskToken），只能選名字打卡
(function () {
    const TOKEN_KEY = 'token';
    const USER_KEY = 'user';
    const KIOSK_KEY = 'kioskToken';

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY));
        } catch (e) {
            return null;
        }
    }

    function setSession(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    const getKioskToken = () => localStorage.getItem(KIOSK_KEY);
    const setKioskToken = (t) => localStorage.setItem(KIOSK_KEY, t);
    const clearKioskToken = () => localStorage.removeItem(KIOSK_KEY);

    // 回傳 { res, data }。
    // options.kiosk = true 時改用裝置 token。
    // 已帶 token 卻收到 401（過期或通行碼已更換）時，清除對應的登入狀態並通知頁面。
    async function api(path, options = {}) {
        const { kiosk, ...fetchOptions } = options;
        const headers = { ...(fetchOptions.headers || {}) };
        const token = kiosk ? getKioskToken() : getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (fetchOptions.body) headers['Content-Type'] = 'application/json';

        const res = await fetch(`/api${path}`, { ...fetchOptions, headers });
        let data = null;
        try {
            data = await res.json();
        } catch (e) {
            data = null;
        }

        if (res.status === 401 && token) {
            if (kiosk) {
                clearKioskToken();
                if (typeof window.onKioskExpired === 'function') window.onKioskExpired(data && data.message);
            } else {
                clearSession();
                if (typeof window.onSessionExpired === 'function') window.onSessionExpired();
            }
        }
        return { res, data };
    }

    // 取出錯誤訊息：優先用 message，其次是欄位驗證的 errors 清單
    function errorText(data, fallback) {
        if (data && data.message) return data.message;
        if (data && Array.isArray(data.errors) && data.errors.length) {
            return data.errors.map((e) => e.message).join('；');
        }
        return fallback;
    }

    // logo 檔案不存在或載入失敗時直接移除，避免出現破圖
    function hideBrokenLogos() {
        document.querySelectorAll('img[data-logo]').forEach((img) => {
            const remove = () => img.remove();
            if (img.complete && img.naturalWidth === 0) remove();
            else img.addEventListener('error', remove, { once: true });
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideBrokenLogos);
    else hideBrokenLogos();

    // 取得目前位置（需使用者允許）；失敗時丟出可直接顯示給使用者的訊息
    function getPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('這支手機的瀏覽器不支援定位。'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve(pos.coords),
                (err) => {
                    reject(new Error(
                        err.code === 1
                            ? '沒有取得定位權限。請在瀏覽器或手機設定中允許這個網站使用位置，再試一次。'
                            : '定位失敗，請到訊號較好的地方（靠窗或戶外）再試一次。'
                    ));
                },
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
        });
    }

    window.HR = {
        getToken, getUser, setSession, clearSession,
        getKioskToken, setKioskToken, clearKioskToken,
        api, errorText, getPosition
    };
})();
