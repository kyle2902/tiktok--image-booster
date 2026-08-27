export default async function handler(req, res) {
  const apiKey = process.env.MAGIC_HOUR_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "MAGIC_HOUR_API_KEY is not configured"
    });
  }

  try {
    // =========================
    // POST: 画像を受け取りAI処理開始
    // =========================

    if (req.method === "POST") {

      const { image, scaleFactor = 2 } = req.body || {};

      if (!image) {
        return res.status(400).json({
          error: "画像がありません"
        });
      }

      if (![2, 4].includes(Number(scaleFactor))) {
        return res.status(400).json({
          error: "scaleFactor must be 2 or 4"
        });
      }

      // Base64画像を分解
      const match = image.match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
      );

      if (!match) {
        return res.status(400).json({
          error: "画像形式を読み取れませんでした"
        });
      }

      const contentType = match[1];
      const base64Data = match[2];

      const extensionMap = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/heic": "heic",
        "image/heif": "heif",
        "image/avif": "avif",
        "image/tiff": "tiff",
        "image/bmp": "bmp"
      };

      const extension =
        extensionMap[contentType] || "jpg";

      const binary = Buffer.from(base64Data, "base64");

      // =========================
      // ① Magic HourへアップロードURLを要求
      // =========================

      const uploadResponse = await fetch(
        "https://api.magichour.ai/v1/files/upload-urls",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            items: [
              {
                type: "image",
                extension: extension
              }
            ]
          })
        }
      );

      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok) {
        return res.status(uploadResponse.status).json({
          error: uploadData
        });
      }

      const uploadInfo = uploadData.items?.[0];

      if (!uploadInfo) {
        return res.status(500).json({
          error: "アップロードURLを取得できませんでした"
        });
      }

      // =========================
      // ② Magic Hourへ画像アップロード
      // =========================

      const putResponse = await fetch(
        uploadInfo.upload_url,
        {
          method: "PUT",
          headers: {
            "Content-Type": contentType
          },
          body: binary
        }
      );

      if (!putResponse.ok) {
        const errorText = await putResponse.text();

        return res.status(putResponse.status).json({
          error: "画像アップロードに失敗しました",
          details: errorText
        });
      }

      // =========================
      // ③ Creative AI Upscaler開始
      // =========================

      const upscaleResponse = await fetch(
        "https://api.magichour.ai/v1/ai-image-upscaler",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            name: "AI Image Upscaler",
            scale_factor: Number(scaleFactor),

            style: {
              enhancement: "Creative"
            },

            assets: {
              image_file_path: uploadInfo.file_path
            }
          })
        }
      );

      const upscaleData = await upscaleResponse.json();

      if (!upscaleResponse.ok) {
        return res.status(upscaleResponse.status).json({
          error: upscaleData
        });
      }

      return res.status(200).json({
        success: true,
        project_id: upscaleData.id,
        credits_charged: upscaleData.credits_charged
      });
    }

    // =========================
    // GET: 処理状況を確認
    // =========================

    if (req.method === "GET") {

      const projectId = req.query?.project_id;

      if (!projectId) {
        return res.status(400).json({
          error: "project_id is required"
        });
      }

      const statusResponse = await fetch(
        `https://api.magichour.ai/v1/image-projects/${encodeURIComponent(projectId)}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Accept": "application/json"
          }
        }
      );

      const statusData = await statusResponse.json();

      if (!statusResponse.ok) {
        return res.status(statusResponse.status).json({
          error: statusData
        });
      }

      const outputUrl =
        statusData.downloads?.[0]?.url || null;

      return res.status(200).json({
        status: statusData.status,
        output_url: outputUrl
      });
    }

    return res.status(405).json({
      error: "Method not allowed"
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
}
