import { unlink } from "node:fs/promises";
import express from "express";
import multer from "multer";
import { MediaPlatformClient } from "./media-platform-client.mjs";

const router = express.Router();
const upload = multer({
  dest: ".tmp/uploads/"
});

const client = new MediaPlatformClient({
  baseUrl: process.env.MEDIA_PLATFORM_API_URL,
  apiKey: process.env.MEDIA_PLATFORM_API_KEY
});

router.post(
  "/media",
  upload.single("file"),
  async (req, res, next) => {
    if (!req.file) {
      res.status(400).json({
        error: "file is required"
      });
      return;
    }

    const visibility =
      req.body.visibility === "PRIVATE"
        ? "PRIVATE"
        : "PUBLIC";

    try {
      const uploaded =
        await client.uploadFile(
          req.file.path,
          {
            contentType:
              req.file.mimetype,
            visibility
          }
        );

      res.status(201).json({
        assetId: uploaded.assetId,
        filename:
          req.file.originalname,
        visibility,
        imgUrl: uploaded.imgUrl,
        fileUrl: uploaded.fileUrl,
        deliveryUrl:
          visibility === "PRIVATE"
            ? await client.createDeliveryUrl(
                uploaded.assetId
              )
            : null
      });
    } catch (error) {
      next(error);
    } finally {
      await unlink(req.file.path).catch(
        () => undefined
      );
    }
  }
);

export default router;
