export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only"
    });
  }

  try {
    const apiKey = process.env.MAGIC_HOUR_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "MAGIC_HOUR_API_KEY is not configured"
      });
    }

    const { image, scaleFactor = 2 } = req.body || {};

    if (!image) {
      return res.status(400).json({
        error: "image is required"
      });
    }

    if (![2, 4].includes(Number(scaleFactor))) {
      return res.status(400).json({
        error: "scaleFactor must be 2 or 4"
      });
    }

    // Base64 → binary
    const matches = image.match(/^data:(.+);base64,(.+)$/);

    if (!matches) {
      return res.status(400).json({
        error: "Invalid image format"
      });
    }

    const contentType = matches[1];
    const base64Data = matches[2];

    const binary = Buffer.from(base64Data, "base64");

    // ① Magic HourからアップロードURLを取得
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
          files: [
            {
              filename: "image.png",
              content_type: contentType
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

    const fileInfo =
      uploadData.items?.[0] ||
      uploadData.files?.[0];

    if (!fileInfo) {
      return res.status(500).json({
        error: "Upload information was not returned",
        details: uploadData
      });
    }

    // ② Magic Hourのストレージへ画像をアップロード
    const putResponse = await fetch(
      fileInfo.upload_url,
      {
        method: "PUT",
        headers: {
          "Content-Type": contentType
        },
        body: binary
      }
    );

    if (!putResponse.ok) {
      const text = await putResponse.text();

      return res.status(putResponse.status).json({
        error: "Image upload failed",
        details: text
      });
    }

    // ③ AIアップスケール開始
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
          name: "My Image Upscaler",
          scale_factor: Number(scaleFactor),
          style: {
            mode: "preserve"
          },
          assets: {
            image_file_path: fileInfo.file_path
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

    // ④ プロジェクトIDを返す
    return res.status(200).json({
      success: true,
      project_id: upscaleData.id,
      credits_charged: upscaleData.credits_charged
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
}
