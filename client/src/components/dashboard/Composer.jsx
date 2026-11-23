import React, { useState } from "react";
import Icon from "./Icon";

const CATEGORIES = ["Discussion", "Question", "Resource"];

export default function Composer({ communityName, user, posting, onPublish }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Discussion");
  const [link, setLink] = useState("");
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);

  function reset() {
    setTitle("");
    setText("");
    setLink("");
    setCategory("Discussion");
    setImage(null);
  }

  function submit(e) {
    e.preventDefault();

    const form = new FormData();
    if (title.trim()) form.append("title", title.trim());
    form.append("category", category);
    if (link.trim()) form.append("link", link.trim());
    if (text.trim()) form.append("text", text.trim());
    if (image) form.append("image", image);

    onPublish(form, reset);
  }

  const placeholder =
    category === "Question"
      ? "What is your question? Provide relevant context…"
      : category === "Resource"
      ? "Describe this resource and how it helps…"
      : "What would you like to share?";

  return (
    <section className="composer" id="composer" aria-label="Create a post">
      <div className="composer-heading">
        <div className="avatar">{user.username.slice(0, 1).toUpperCase()}</div>
        <div>
          <strong>Create a post</strong>
          <p>Share knowledge, questions, or resources with {communityName}.</p>
        </div>
      </div>

      <form onSubmit={submit}>
        <div className="composer-category-row mb-3">
          <span className="category-select-label">Category:</span>
          <div className="category-pills">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`cat-pill-btn ${category === cat ? "selected" : ""}`}
                onClick={() => setCategory(cat)}
                aria-pressed={category === cat}
              >
                <Icon
                  name={
                    cat === "Discussion"
                      ? "messageSquare"
                      : cat === "Question"
                      ? "helpCircle"
                      : "link"
                  }
                  size={15}
                />
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-2">
          <input
            id="composer-title"
            type="text"
            className="form-control post-title-input"
            maxLength={150}
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <textarea
          className="form-control post-input mb-2"
          rows="3"
          maxLength={2000}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {category === "Resource" && (
          <div className="mb-2 resource-link-input-wrap">
            <div className="input-group">
              <span className="input-group-text bg-white text-muted">
                <Icon name="link" size={15} />
              </span>
              <input
                type="url"
                className="form-control form-control-sm"
                placeholder="Website URL (e.g. https://example.com)"
                maxLength={500}
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="composer-footer">
          <label className="upload-label" title="Attach an image">
            <Icon name="image" size={15} />
            Add image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => setImage(e.target.files?.[0] || null)}
            />
          </label>
          <span className="muted small">
            {image ? image.name : `${text.length}/2000`}
          </span>
          <button
            type="submit"
            className="btn btn-dark btn-sm"
            disabled={posting || (!text.trim() && !title.trim() && !image)}
          >
            {posting ? "Publishing…" : "Publish post"}
            {!posting && <Icon name="arrowRight" size={15} />}
          </button>
        </div>
      </form>
    </section>
  );
}
