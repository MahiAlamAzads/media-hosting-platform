"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type Folder = {
  id: string;
  name: string;
  pathKey: string;
  depth: number;
};

export default function FoldersPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [error, setError] = useState("");

  async function loadFolders() {
    try {
      const payload = await apiRequest<{ data: Folder[] }>("/api/v1/folders");
      setFolders(payload.data);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load folders.");
    }
  }

  useEffect(() => {
    void loadFolders();
  }, []);

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/v1/folders", {
        method: "POST",
        body: JSON.stringify({ name: form.get("name"), parentId: null })
      });
      event.currentTarget.reset();
      await loadFolders();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create folder.");
    }
  }

  return (
    <section className="content">
      <div className="page-heading">
        <div>
          <h1>Folders</h1>
          <p className="muted">Organize each workspace without exposing disk paths.</p>
        </div>
        <form className="folder-create" onSubmit={createFolder}>
          <input name="name" placeholder="New folder name" required maxLength={100} />
          <button className="primary">Create folder</button>
        </form>
      </div>

      {error && <div className="notice error-notice">{error}</div>}

      <div className="folder-grid">
        {folders.map(folder => (
          <article className="folder-card" key={folder.id}>
            <div className="folder-symbol">▰</div>
            <strong>{folder.name}</strong>
            <span className="muted">{folder.pathKey}</span>
          </article>
        ))}
        {folders.length === 0 && (
          <article className="card">
            <strong>No folders yet</strong>
            <p className="muted">Create a folder to organize uploaded assets.</p>
          </article>
        )}
      </div>
    </section>
  );
}
