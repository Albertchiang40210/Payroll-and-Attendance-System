const { z } = require('zod');

exports.aiRecognizeSchema = z.object({
  body: z.object({
    image_base64: z.string().min(1, "圖片 Base64 編碼不能為空"),
  }),
});
