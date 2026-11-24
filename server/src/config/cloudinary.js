import { v2 as cloudinary } from "cloudinary";

const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
};

export function isCloudinaryConfigured() {
  return Boolean(cloudinaryConfig.cloud_name && cloudinaryConfig.api_key && cloudinaryConfig.api_secret);
}

export function configureCloudinary() {
  if (isCloudinaryConfigured()) cloudinary.config(cloudinaryConfig);
  return isCloudinaryConfigured();
}

export { cloudinary };
