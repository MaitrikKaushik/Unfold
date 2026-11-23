import React from "react";
import Icon from "./Icon";

export default function ExploreView({ communities, joined, onSelectCommunity }) {
  return (
    <section className="explore-page">
      <header className="explore-header">
        <p className="eyebrow">DISCOVER</p>
        <h1>Explore communities</h1>
        <p className="muted">
          Open a community to read its feed. Join from the community header when you want to
          contribute.
        </p>
      </header>

      {communities.length ? (
        <div className="explore-grid">
          {communities.map((community) => (
            <article className="explore-card" key={community.id}>
              <span className="community-icon">{community.name.slice(0, 1)}</span>
              <div className="explore-card-body">
                <h2>{community.name}</h2>
                <p>{community.description || "A space for community discussion."}</p>
              </div>
              <div className="explore-card-footer">
                <span
                  className={`membership-badge${joined.includes(community.id) ? " is-member" : ""}`}
                >
                  {joined.includes(community.id) ? "Joined" : "Not joined"}
                </span>
                <button
                  type="button"
                  className="explore-open-btn"
                  onClick={() => onSelectCommunity(community.id)}
                >
                  Open <Icon name="arrowRight" size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-symbol">
            <Icon name="community" size={26} />
          </div>
          <h3>No communities available.</h3>
          <p>Communities will appear here once they are available.</p>
        </div>
      )}
    </section>
  );
}
