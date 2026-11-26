import React, { useState, useEffect, useCallback } from "react";
import {
  FolderKanban,
  Compass,
  Mail,
  Archive,
  Plus,
  ArrowLeft,
  LayoutDashboard,
  FolderOpen
} from "lucide-react";
import { api } from "../../services/api";
import ProjectsOverview from "./ProjectsOverview";
import ProjectsMyList from "./ProjectsMyList";
import ProjectsDiscover from "./ProjectsDiscover";
import ProjectsInvitations from "./ProjectsInvitations";
import ProjectsArchived from "./ProjectsArchived";
import ProjectCreateModal from "./ProjectCreateModal";
import ProjectWorkspace from "./ProjectWorkspace";

export default function ProjectsView({
  currentUser,
  communities = [],
  initialSection = "overview",
  initialProjectId = null
}) {
  const [section, setSection] = useState(initialSection); // "overview" | "my_projects" | "discover" | "invitations" | "archived"
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [myProjects, setMyProjects] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [projRes, invRes] = await Promise.all([
        api("/projects/my?status=active"),
        api("/projects/invitations/my")
      ]);
      setMyProjects(projRes.projects || []);
      setInvitations(invRes.receivedInvitations || []);
    } catch (err) {
      setError(err.message || "Failed to load projects data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  function handleSelectProject(projId) {
    setSelectedProjectId(projId);
  }

  function handleBackToProjects() {
    setSelectedProjectId(null);
    loadInitialData();
  }

  function handleProjectCreated(newProject) {
    setMyProjects((prev) => [newProject, ...prev]);
    setSelectedProjectId(newProject._id);
  }

  // If a project is selected, render the dedicated Workspace!
  if (selectedProjectId) {
    return (
      <ProjectWorkspace
        projectId={selectedProjectId}
        currentUser={currentUser}
        onBack={handleBackToProjects}
        onProjectDeleted={() => {
          setSelectedProjectId(null);
          setSection("my_projects");
          loadInitialData();
        }}
      />
    );
  }

  const pendingInvitesCount = invitations.length;

  return (
    <div className="projects-module-container">
      {/* Projects Module Header & Internal Navigation Bar */}
      <div className="projects-module-navbar">
        <div className="projects-nav-tabs">
          <button
            type="button"
            className={`projects-nav-tab ${section === "overview" ? "active" : ""}`}
            onClick={() => setSection("overview")}
          >
            <LayoutDashboard size={15} className="me-1" />
            <span>Overview</span>
          </button>

          <button
            type="button"
            className={`projects-nav-tab ${section === "my_projects" ? "active" : ""}`}
            onClick={() => setSection("my_projects")}
          >
            <FolderOpen size={15} className="me-1" />
            <span>My Projects</span>
            {myProjects.length > 0 && (
              <span className="nav-count-chip">{myProjects.length}</span>
            )}
          </button>

          <button
            type="button"
            className={`projects-nav-tab ${section === "discover" ? "active" : ""}`}
            onClick={() => setSection("discover")}
          >
            <Compass size={15} className="me-1" />
            <span>Discover Projects</span>
          </button>

          <button
            type="button"
            className={`projects-nav-tab ${section === "invitations" ? "active" : ""}`}
            onClick={() => setSection("invitations")}
          >
            <Mail size={15} className="me-1" />
            <span>Invitations</span>
            {pendingInvitesCount > 0 && (
              <span className="nav-badge-alert">{pendingInvitesCount}</span>
            )}
          </button>

          <button
            type="button"
            className={`projects-nav-tab ${section === "archived" ? "active" : ""}`}
            onClick={() => setSection("archived")}
          >
            <Archive size={15} className="me-1" />
            <span>Archived</span>
          </button>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm d-flex align-items-center gap-1 new-project-nav-btn"
          onClick={() => setIsCreateModalOpen(true)}
        >
          <Plus size={15} strokeWidth={2.4} />
          <span>New Project</span>
        </button>
      </div>

      {error && <div className="alert alert-danger mb-3 mx-3">{error}</div>}

      {/* Internal View Router */}
      <div className="projects-module-body">
        {section === "overview" && (
          <ProjectsOverview
            myProjects={myProjects}
            invitations={invitations}
            loading={loading}
            error={error}
            onRetry={loadInitialData}
            onNavigate={(targetSection) => setSection(targetSection)}
            onOpenCreate={() => setIsCreateModalOpen(true)}
            onSelectProject={handleSelectProject}
          />
        )}

        {section === "my_projects" && (
          <ProjectsMyList
            projects={myProjects}
            loading={loading}
            onOpenCreate={() => setIsCreateModalOpen(true)}
            onSelectProject={handleSelectProject}
          />
        )}

        {section === "discover" && (
          <ProjectsDiscover
            onSelectProject={handleSelectProject}
            onRequestJoinSuccess={loadInitialData}
          />
        )}

        {section === "invitations" && (
          <ProjectsInvitations
            onSelectProject={handleSelectProject}
            onRefreshOverview={loadInitialData}
          />
        )}

        {section === "archived" && (
          <ProjectsArchived
            onSelectProject={handleSelectProject}
            onProjectUpdated={loadInitialData}
          />
        )}
      </div>

      {/* Create Project Modal */}
      <ProjectCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onProjectCreated={handleProjectCreated}
        communities={communities}
      />
    </div>
  );
}
