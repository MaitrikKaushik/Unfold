import mongoose from "mongoose";
import Community from "../models/Community.js";
import Membership from "../models/Membership.js";

export const GENERAL_COMMUNITY = {
  id: "general",
  slug: "general",
  name: "General",
  description: "A shared space for thoughts, discoveries and conversations across Unfold.",
  isGeneral: true
};

const DEFAULT_COMMUNITIES = [
  { name: "Technology", slug: "technology", description: "Technology, products and ideas." },
  { name: "Programming", slug: "programming", description: "Code, tools and software engineering." },
  { name: "Gaming", slug: "gaming", description: "Games, studios and gaming culture." }
];

export async function seedDefaultCommunities() {
  for (const community of DEFAULT_COMMUNITIES) {
    await Community.updateOne(
      { slug: community.slug },
      { $setOnInsert: { ...community, isSystem: true, visibility: "public" } },
      { upsert: true }
    );
  }
}

export async function resolveCommunity(value) {
  if (!value || value === "general") return null;
  if (mongoose.isValidObjectId(value)) {
    const byId = await Community.findById(value);
    if (byId) return byId;
  }
  return Community.findOne({ slug: String(value).toLowerCase() });
}

export function serializeCommunity(community) {
  if (!community) return GENERAL_COMMUNITY;
  return {
    id: String(community._id),
    slug: community.slug,
    name: community.name,
    description: community.description || "",
    cover: community.cover || { url: "", publicId: "" },
    memberCount: community.memberCount || 0,
    createdAt: community.createdAt || null,
    isGeneral: false
  };
}

export async function isActiveMember({ userId, communityId, session } = {}) {
  if (!communityId) return true;
  let query = Membership.exists({ communityId, userId, status: "active" });
  if (session) query = query.session(session);
  return Boolean(await query);
}

export async function assertActiveMember({ userId, communityId, session } = {}) {
  const active = await isActiveMember({ userId, communityId, session });
  if (!active) {
    const error = new Error("Join this community before publishing there.");
    error.status = 403;
    error.code = "JOIN_REQUIRED";
    throw error;
  }
  return true;
}

export async function joinCommunity({ userId, communityId }) {
  const existing = await Membership.findOne({ communityId, userId });
  const wasActive = existing?.status === "active";
  const membership = await Membership.findOneAndUpdate(
    { communityId, userId },
    {
      $set: { status: "active", joinedAt: wasActive ? existing.joinedAt : new Date() },
      $setOnInsert: { role: "member" }
    },
    { new: true, upsert: true, runValidators: true }
  );
  if (!wasActive) await Community.updateOne({ _id: communityId }, { $inc: { memberCount: 1 } });
  return membership;
}

export async function leaveCommunity({ userId, communityId }) {
  const membership = await Membership.findOneAndUpdate(
    { communityId, userId, status: "active", role: { $ne: "owner" } },
    { $set: { status: "left" } },
    { new: true }
  );
  if (membership) await Community.updateOne({ _id: communityId, memberCount: { $gt: 0 } }, { $inc: { memberCount: -1 } });
  return membership;
}

export async function getMembership({ userId, communityId, session } = {}) {
  if (!communityId) return { isMember: true, role: "member" };
  let query = Membership.findOne({ userId, communityId, status: "active" });
  if (session) query = query.session(session);
  const membership = await query.lean();
  return { isMember: Boolean(membership), role: membership?.role || null };
}
