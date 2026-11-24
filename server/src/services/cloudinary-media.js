import { cloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";

/**
 * Upload a validated in-memory Multer file to Cloudinary.
 * Route/controller code must enforce file size, MIME type and ownership first.
 */
export function uploadBufferToCloudinary(buffer, {
  folder = "unfold/posts",
  resourceType = "auto"
} = {}) {
  if (!isCloudinaryConfigured()) {
    const error = new Error("Cloudinary is not configured. Set CLOUDINARY_* credentials.");
    error.status = 503;
    error.code = "CLOUDINARY_NOT_CONFIGURED";
    throw error;
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error("A non-empty file buffer is required.");
    error.status = 400;
    error.code = "EMPTY_MEDIA_FILE";
    throw error;
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, use_filename: false, unique_filename: true },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Cloudinary did not return an upload result."));
        return resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          format: result.format,
          bytes: result.bytes,
          width: result.width || null,
          height: result.height || null
        });
      }
    );
    stream.end(buffer);
  });
}

export async function deleteCloudinaryAsset(publicId, resourceType = "image") {
  if (!isCloudinaryConfigured() || !publicId) return null;
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
