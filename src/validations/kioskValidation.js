const { z } = require('zod');

exports.pairSchema = z.object({
  body: z.object({ code: z.string().min(1, "請輸入通行碼").max(64) }),
});

// 員工手機只能替自己打卡，所以不需要（也不接受）指定員工
exports.kioskClockSchema = z.object({
  body: z.object({
    type: z.enum(['in', 'out']),
    punch_type: z.enum(['正常', '加班']).optional(),
    // 手機回報的位置（店有設定位置限制時才會檢查）
    location: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().min(0).optional(),
    }).optional(),
  }),
});

exports.locationSchema = z.object({
  body: z.object({
    lat: z.number().min(-90, "緯度不正確").max(90, "緯度不正確"),
    lng: z.number().min(-180, "經度不正確").max(180, "經度不正確"),
    radius: z.number().int().min(50, "範圍至少 50 公尺").max(1000, "範圍最多 1000 公尺"),
  }),
});

exports.createQrSchema = z.object({
  body: z.object({
    userId: z.coerce.number().int().positive("請選擇員工"),
    ttl_minutes: z.coerce.number().int().min(1, "有效時間至少 1 分鐘").max(120, "有效時間最長 120 分鐘").optional(),
  }),
});

exports.unbindSchema = z.object({
  params: z.object({ userId: z.coerce.number().int().positive() }),
});
