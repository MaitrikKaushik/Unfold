import Project from "../../models/Project.js";
import ProjectMembership from "../../models/ProjectMembership.js";
import Community from "../../models/Community.js";
import { readStore } from "../../data/store.js";

const ROLE_HIERARCHY = {
  viewer: 1,
  collaborator: 2,
  admin: 3,
  owner: 4
};

/**
 * Middleware that loads project by :id or :projectId and verifies visibility/membership.
 * Attaches req.project and req.projectMembership (if any).
 */
export async function requireProjectAccess(req, res, next) {
  try {
    const projectId = req.params.id || req.params.projectId;
    if (!projectId) {
      return res.status(400).json({ success: false, error: { code: "INVALID_PROJECT_ID", message: "Project ID is required." } });
    }

    const project = await Project.findById(projectId).populate("ownerId", "username displayName avatar");
    if (!project) {
      return res.status(404).json({ success: false, error: { code: "PROJECT_NOT_FOUND", message: "Project not found." } });
    }

    req.project = project;

    // Check membership if user is authenticated
    if (req.user) {
      const membership = await ProjectMembership.findOne({
        projectId: project._id,
        userId: req.user._id,
        status: "active"
      });
      if (membership) {
        req.projectMembership = membership;
      }
    }

    // Owner check: if user is project owner, treat as owner membership even if membership record is being synced
    if (req.user && String(project.ownerId?._id || project.ownerId) === String(req.user._id)) {
      if (!req.projectMembership) {
        req.projectMembership = {
          projectId: project._id,
          userId: req.user._id,
          role: "owner",
          status: "active"
        };
      }
    }

    // Visibility enforcement:
    // 1. Private: Must have active membership
    if (project.visibility === "private") {
      if (!req.projectMembership) {
        return res.status(403).json({
          success: false,
          error: { code: "FORBIDDEN", message: "This project is private. You must be an invited member to access it." }
        });
      }
    }

    // 2. Community: Accessible to community members or project members
    if (project.visibility === "community" && !req.projectMembership) {
      let isCommunityMember = false;
      if (req.user && project.communityId) {
        try {
          const store = await readStore();
          const legacyUserId = req.user.legacyId || String(req.user._id);
          isCommunityMember = (store.memberships || []).some(
            (m) => m.userId === legacyUserId && m.communityId === project.communityId && m.status === "active"
          );
        } catch {
          isCommunityMember = false;
        }
      }

      if (!isCommunityMember) {
        return res.status(403).json({
          success: false,
          error: { code: "COMMUNITY_MEMBER_REQUIRED", message: "This project is restricted to members of its associated community." }
        });
      }
    }

    return next();
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: "PROJECT_ACCESS_ERROR", message: err.message } });
  }
}

/**
 * Middleware requiring a minimum project role: 'viewer' | 'collaborator' | 'admin' | 'owner'
 */
export function requireProjectRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: "AUTH_REQUIRED", message: "Please log in to continue." } });
    }

    if (!req.projectMembership) {
      return res.status(403).json({
        success: false,
        error: { code: "MEMBERSHIP_REQUIRED", message: "You are not a member of this project." }
      });
    }

    const userRoleLevel = ROLE_HIERARCHY[req.projectMembership.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userRoleLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        error: {
          code: "INSUFFICIENT_PROJECT_PERMISSIONS",
          message: `This action requires ${minRole} permissions or higher on this project.`
        }
      });
    }

    return next();
  };
}
