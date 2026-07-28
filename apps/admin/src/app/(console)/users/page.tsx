"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Feedback, LoadingBlock } from "@/components/feedback";
import { Pagination } from "@/components/pagination";
import { apiRequest } from "@/lib/api";

type UserItem = {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  isPlatformAdmin: boolean;
  createdAt: string;
  memberships: Array<{
    role: string;
    workspace: {
      id: string;
      name: string;
      slug: string;
      status: string;
    };
  }>;
  _count: { memberships: number; sessions: number };
};

export default function UsersPage() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [variant, setVariant] =
    useState<"success" | "danger">("success");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    workspaceName: "",
    emailVerified: true,
    createWorkspace: true
  });

  async function load(targetPage = page): Promise<void> {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: "20"
      });
      if (query) params.set("query", query);
      if (status) params.set("status", status);
      const response = await apiRequest<{
        data: UserItem[];
        meta: { totalPages: number };
      }>(`/api/v1/admin/console/users?${params}`);
      setItems(response.data);
      setPages(response.meta.totalPages);
      setPage(targetPage);
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  async function createUser(event: FormEvent): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    try {
      const response = await apiRequest<{
        data: { user: { id: string } };
      }>("/api/v1/admin/console/users", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          workspaceName: form.workspaceName || undefined,
          status: "ACTIVE"
        })
      });
      setVariant("success");
      setMessage("User created successfully.");
      setForm({
        name: "",
        email: "",
        password: "",
        workspaceName: "",
        emailVerified: true,
        createWorkspace: true
      });
      await load(1);
      window.location.assign(`/users/${response.data.user.id}`);
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function setUserStatus(
    user: UserItem,
    next: "ACTIVE" | "SUSPENDED"
  ): Promise<void> {
    try {
      await apiRequest(`/api/v1/admin/console/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next })
      });
      setVariant("success");
      setMessage(`User ${next === "ACTIVE" ? "reactivated" : "suspended"}.`);
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Create, inspect, update, suspend and remove platform users."
      >
        <button
          className="btn btn-primary"
          type="button"
          aria-expanded={showCreate}
          onClick={() => setShowCreate(current => !current)}
        >
          <i className={`bi ${showCreate ? "bi-x-lg" : "bi-person-plus"} me-1`} />
          {showCreate ? "Close form" : "Create user"}
        </button>
      </PageHeader>

      <Feedback message={message} variant={variant} />

      {showCreate && (
        <div className="mb-4">
          <form className="card" onSubmit={createUser}>
          <div className="card-header"><strong>New user</strong></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Name</label>
                <input
                  className="form-control"
                  required
                  value={form.name}
                  onChange={event => setForm(current => ({
                    ...current, name: event.target.value
                  }))}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Email</label>
                <input
                  className="form-control"
                  type="email"
                  required
                  value={form.email}
                  onChange={event => setForm(current => ({
                    ...current, email: event.target.value
                  }))}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Temporary password</label>
                <input
                  className="form-control"
                  type="password"
                  minLength={8}
                  required
                  value={form.password}
                  onChange={event => setForm(current => ({
                    ...current, password: event.target.value
                  }))}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Workspace name</label>
                <input
                  className="form-control"
                  disabled={!form.createWorkspace}
                  value={form.workspaceName}
                  onChange={event => setForm(current => ({
                    ...current, workspaceName: event.target.value
                  }))}
                />
              </div>
              <div className="col-md-6">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    id="verified"
                    type="checkbox"
                    checked={form.emailVerified}
                    onChange={event => setForm(current => ({
                      ...current, emailVerified: event.target.checked
                    }))}
                  />
                  <label className="form-check-label" htmlFor="verified">
                    Mark email as verified
                  </label>
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    id="workspace"
                    type="checkbox"
                    checked={form.createWorkspace}
                    onChange={event => setForm(current => ({
                      ...current, createWorkspace: event.target.checked
                    }))}
                  />
                  <label className="form-check-label" htmlFor="workspace">
                    Create Free workspace and wallet
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="card-footer text-end">
            <button className="btn btn-primary" disabled={creating}>
              {creating ? "Creating…" : "Create user"}
            </button>
          </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <form
            className="row g-2"
            onSubmit={event => {
              event.preventDefault();
              void load(1);
            }}
          >
            <div className="col-md">
              <input
                className="form-control"
                placeholder="Search name or email"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={status}
                onChange={event => setStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                <option>ACTIVE</option>
                <option>SUSPENDED</option>
                <option>DELETED</option>
              </select>
            </div>
            <div className="col-auto">
              <button className="btn btn-outline-secondary">Search</button>
            </div>
          </form>
        </div>

        {loading ? <div className="card-body"><LoadingBlock /></div> :
          items.length === 0 ? (
            <div className="card-body">
              <EmptyState
                icon="bi-people"
                title="No users found"
                text="Change the filters or create the first user."
              />
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Status</th>
                    <th>Workspaces</th>
                    <th>Sessions</th>
                    <th>Created</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(user => (
                    <tr key={user.id}>
                      <td>
                        <a className="fw-semibold text-decoration-none" href={`/users/${user.id}`}>
                          {user.name}
                        </a>
                        {user.isPlatformAdmin && (
                          <span className="badge text-bg-dark ms-2">Admin</span>
                        )}
                        <div className="small text-secondary">{user.email}</div>
                      </td>
                      <td>
                        <span className={`badge ${
                          user.status === "ACTIVE"
                            ? "text-bg-success"
                            : user.status === "SUSPENDED"
                              ? "text-bg-warning"
                              : "text-bg-secondary"
                        }`}>{user.status}</span>
                        <div className="small text-secondary mt-1">
                          {user.emailVerifiedAt ? "Verified" : "Unverified"}
                        </div>
                      </td>
                      <td>
                        {user.memberships.slice(0, 2).map(item => (
                          <div className="small" key={item.workspace.id}>
                            {item.workspace.name} · {item.role}
                          </div>
                        ))}
                        {user._count.memberships > 2 && (
                          <div className="small text-secondary">
                            +{user._count.memberships - 2} more
                          </div>
                        )}
                      </td>
                      <td>{user._count.sessions}</td>
                      <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td className="text-end">
                        <div className="btn-group btn-group-sm">
                          <a className="btn btn-outline-primary" href={`/users/${user.id}`}>
                            Manage
                          </a>
                          {user.status === "ACTIVE" ? (
                            <button
                              className="btn btn-outline-danger"
                              disabled={user.isPlatformAdmin}
                              onClick={() => setUserStatus(user, "SUSPENDED")}
                            >
                              Suspend
                            </button>
                          ) : user.status === "SUSPENDED" ? (
                            <button
                              className="btn btn-outline-success"
                              onClick={() => setUserStatus(user, "ACTIVE")}
                            >
                              Reactivate
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <Pagination page={page} totalPages={pages} onChange={value => void load(value)} />
      </div>
    </>
  );
}
