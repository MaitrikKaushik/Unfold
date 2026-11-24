import { createClient } from "redis";
import logger from "./logger.js";

export let redisClient = null;

export async function connectRedis() {
  if (!process.env.REDIS_URL) {
    logger.info("Redis is not configured; application will run without cache.");
    return null;
  }

  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on("error", (error) => logger.error("Redis client error", { message: error.message }));
  await redisClient.connect();
  logger.info("Redis connected");
  return redisClient;
}

export async function closeRedis() {
  if (redisClient?.isOpen) await redisClient.quit();
  redisClient = null;
}

// Shared cache helpers for feed/search modules. Cache failures are non-fatal:
// Redis is an optimisation and MongoDB remains the source of truth.
export async function getCachedJson(key) {
  if (!redisClient?.isReady) return null;
  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.warn("Redis cache read failed", { key, message: error.message });
    return null;
  }
}

export async function setCachedJson(key, value, ttlSeconds = 60) {
  if (!redisClient?.isReady) return false;
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: Math.max(1, Number(ttlSeconds) || 60) });
    return true;
  } catch (error) {
    logger.warn("Redis cache write failed", { key, message: error.message });
    return false;
  }
}

export async function deleteCacheKeys(...keys) {
  if (!redisClient?.isReady || keys.length === 0) return 0;
  try {
    return await redisClient.del(keys.flat().filter(Boolean));
  } catch (error) {
    logger.warn("Redis cache invalidation failed", { message: error.message });
    return 0;
  }
}
