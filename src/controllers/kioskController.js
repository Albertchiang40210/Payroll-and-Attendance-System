const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const qrcode = require('qrcode-generator');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const catchAsync = require('../utils/catchAsync');
const { performPunch, getRecentRecords } = require('../services/punchService');

const DEFAULT_TTL_MINUTES = 10;
const MAX_ACCURACY_METERS = 300; // 定位誤差超過這個值就視為不可靠，請員工重試
// 去掉容易看錯的字元（0/O、1/I），方便必要時手動輸入
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const httpError = (status, message) => {
    const error = new Error(message);
    error.statusCode = status;
    return error;
};

const generateCode = () =>
    Array.from({ length: 10 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

// ---------- 店的位置（只能在店裡打卡） ----------
const getSetting = async (key) => {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row ? row.value : null;
};
const setSetting = (key, value) =>
    prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });

const getStoreLocation = async () => {
    const [lat, lng, radius] = await Promise.all([
        getSetting('store_lat'), getSetting('store_lng'), getSetting('store_radius')
    ]);
    if (lat === null || lng === null || radius === null) return null;
    return { lat: Number(lat), lng: Number(lng), radius: Number(radius) };
};

// 兩點距離（公尺），haversine
const distanceMeters = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
};

// 有設定店的位置時，打卡必須在範圍內；回傳離店距離（供紀錄），未啟用限制時回傳 null
const verifyLocation = async (location) => {
    const store = await getStoreLocation();
    if (!store) return null;

    if (!location) {
        throw httpError(400, '需要確認你在店裡，請允許網站使用你的位置後再打卡。');
    }
    if (location.accuracy !== undefined && location.accuracy > MAX_ACCURACY_METERS) {
        throw httpError(400, `手機定位誤差太大（約 ${Math.round(location.accuracy)} 公尺），請稍等幾秒、或走到靠窗處再試一次。`);
    }
    const distance = Math.round(distanceMeters(store.lat, store.lng, location.lat, location.lng));
    if (distance > store.radius) {
        throw httpError(403, `你好像不在店裡附近（離店約 ${distance} 公尺），請到店裡再打卡。`);
    }
    return distance;
};

// 只有「在職且需要打卡」的人可以綁定手機、打卡（員工，以及選擇要打卡的管理員）
const getActiveEmployee = async (userId) => {
    const user = await prisma.user.findFirst({
        where: { id: userId, punch: true, active: true },
        select: { id: true, name: true }
    });
    if (!user) throw httpError(404, '找不到此員工，或已停用。');
    return user;
};

// ======================================================================
// 員工手機
// ======================================================================

// 以專屬 QR Code 登記手機：該手機從此只屬於這位員工，他的舊手機自動失效
exports.pair = catchAsync(async (req, res) => {
    const invalid = () => httpError(401, '通行碼不正確、已過期或已用完，請向店長重新索取。');

    const code = req.body.code.trim().toUpperCase();
    const row = await prisma.pairingCode.findUnique({ where: { code } });
    if (!row || row.expiresAt <= new Date() || row.uses >= row.maxUses) throw invalid();

    // 以單一條件式更新搶佔名額，避免多支手機同時掃描時超過上限
    const claimed = await prisma.pairingCode.updateMany({
        where: { id: row.id, uses: { lt: row.maxUses }, expiresAt: { gt: new Date() } },
        data: { uses: { increment: 1 } }
    });
    if (claimed.count !== 1) throw invalid();

    const user = await getActiveEmployee(row.userId);
    const [, device] = await prisma.$transaction([
        prisma.device.deleteMany({ where: { userId: user.id } }),
        prisma.device.create({ data: { userId: user.id } })
    ]);

    const token = jwt.sign({ kiosk: true, did: device.id }, process.env.JWT_SECRET, { expiresIn: '365d' });
    res.json({ status: 'success', token, name: user.name });
});

// 這支手機屬於誰
exports.me = catchAsync(async (req, res) => {
    res.json({
        id: req.kioskUser.id,
        name: req.kioskUser.name,
        location_required: (await getStoreLocation()) !== null
    });
});

exports.records = catchAsync(async (req, res) => {
    res.json({ name: req.kioskUser.name, ...(await getRecentRecords(req.kioskUser.id, 14)) });
});

// 只能替「綁定的這位員工」打卡
exports.clock = catchAsync(async (req, res) => {
    const { type, punch_type, location } = req.body;
    const distance = await verifyLocation(location);
    const result = await performPunch({
        userId: req.kioskUser.id,
        type,
        punchType: punch_type || '正常',
        distance
    });
    res.json({ status: 'success', time: result.time, message: `${req.kioskUser.name}\n${result.message}` });
});

// ======================================================================
// 老闆後台
// ======================================================================

const buildQrPayload = (req, row, user) => {
    // 通行碼放在網址的 # 後面：瀏覽器不會把它送到伺服器，也不會留在紀錄裡
    // openExternalBrowser=1：從 LINE 點開時，改用手機的瀏覽器（Chrome/Safari）開啟，
    // 這樣登記資料才會留在平常使用的瀏覽器裡
    const url = `${req.protocol}://${req.get('host')}/?openExternalBrowser=1#c=${row.code}`;
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
    return {
        set: true,
        code: row.code,
        url,
        qr_data_url: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
        expires_at: row.expiresAt.toISOString(),
        max_uses: row.maxUses,
        uses: row.uses,
        employee: { id: user.id, name: user.name }
    };
};

// 目前有效（尚未過期）的登記 QR Code；沒有則回傳 set: false
exports.getQr = catchAsync(async (req, res) => {
    const row = await prisma.pairingCode.findFirst({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true } } }
    });
    res.json(row ? buildQrPayload(req, row, row.user) : { set: false });
});

// 為某位員工產生登記 QR Code：同時間只保留一組，舊的立即作廢；不影響已登記的手機
exports.createQr = catchAsync(async (req, res) => {
    const user = await getActiveEmployee(Number(req.body.userId));
    const ttl = Number(req.body.ttl_minutes) || DEFAULT_TTL_MINUTES;

    await prisma.pairingCode.deleteMany();
    const row = await prisma.pairingCode.create({
        data: {
            code: generateCode(),
            userId: user.id,
            expiresAt: new Date(Date.now() + ttl * 60 * 1000),
            maxUses: 1
        }
    });
    res.json(buildQrPayload(req, row, user));
});

// 每位在職員工的手機登記狀態
exports.listDevices = catchAsync(async (req, res) => {
    const users = await prisma.user.findMany({
        where: { punch: true, active: true },
        select: {
            id: true,
            name: true,
            devices: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 }
        },
        orderBy: { id: 'asc' }
    });
    res.json(users.map((u) => ({
        id: u.id,
        name: u.name,
        bound: u.devices.length > 0,
        since: u.devices.length > 0 ? u.devices[0].createdAt.toISOString() : null
    })));
});

// 解除某位員工的手機（換手機、手機遺失時）
exports.unbind = catchAsync(async (req, res) => {
    const userId = Number(req.params.userId);
    const result = await prisma.device.deleteMany({ where: { userId } });
    await prisma.pairingCode.deleteMany({ where: { userId } });
    res.json({ message: result.count > 0 ? '已解除這位員工的手機登記。' : '這位員工目前沒有登記的手機。' });
});

// 讓所有員工的手機失效
exports.revokeAllDevices = catchAsync(async (req, res) => {
    await prisma.device.deleteMany();
    await prisma.pairingCode.deleteMany();
    res.json({ message: '已讓所有員工的手機失效，需要重新登記。' });
});

// 店的位置設定
exports.getLocation = catchAsync(async (req, res) => {
    const store = await getStoreLocation();
    res.json(store ? { set: true, ...store } : { set: false });
});

exports.setLocation = catchAsync(async (req, res) => {
    const { lat, lng, radius } = req.body;
    await Promise.all([
        setSetting('store_lat', String(lat)),
        setSetting('store_lng', String(lng)),
        setSetting('store_radius', String(radius))
    ]);
    res.json({ set: true, lat, lng, radius });
});

exports.clearLocation = catchAsync(async (req, res) => {
    await prisma.setting.deleteMany({ where: { key: { in: ['store_lat', 'store_lng', 'store_radius'] } } });
    res.json({ message: '已取消位置限制，員工在哪裡都能打卡。' });
});
