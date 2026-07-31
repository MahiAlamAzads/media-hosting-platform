"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";
import { formatBytes, formatMoneyMinor } from "@/lib/billing-format";

type UserDetail = {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  isPlatformAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  memberships: Array<{
    id: string;
    role: string;
    workspace: {
      id: string;
      name: string;
      slug: string;
      status: string;
      storageUsedBytes: string;
      storageLimitBytes: string;
      subscription: null | {
        status: string;
        currency: "BDT" | "USD";
        revenueModel: string;
        subscriptionTerm: string;
        planVersion: { plan: { name: string } };
      };
      prepaidWallet: null | {
        currency: "BDT" | "USD";
        balanceMinor: string;
        reservedMinor: string;
      };
      _count: {
        mediaAssets: number;
        apiKeys: number;
        folders: number;
        members: number;
      };
    };
  }>;
  sessions: Array<{
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    expiresAt: string;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
};

export default function UserDetailPage() {
  const params = useParams<{ userId: string }>();
  const [data, setData] = useState<UserDetail | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    status: "ACTIVE",
    emailVerified: true,
  });
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "danger">("success");
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    const response = await apiRequest<{ data: UserDetail }>(
      `/api/v1/admin/console/users/${params.userId}`,
    );
    setData(response.data);
    setForm({
      name: response.data.name,
      email: response.data.email,
      password: "",
      status:
        response.data.status === "DELETED" ? "SUSPENDED" : response.data.status,
      emailVerified: Boolean(response.data.emailVerifiedAt),
    });
  }

  useEffect(() => {
    void load().catch((error) => {
      setVariant("danger");
      setMessage((error as Error).message);
    });
  }, [params.userId]);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`/api/v1/admin/console/users/${params.userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          status: form.status,
          emailVerified: form.emailVerified,
          ...(form.password ? { password: form.password } : {}),
        }),
      });
      await load();
      setVariant("success");
      setMessage("User updated.");
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revokeSessions(): Promise<void> {
    setBusy(true);
    try {
      const response = await apiRequest<{
        data: { revokedSessions: number };
      }>(`/api/v1/admin/console/users/${params.userId}/revoke-sessions`, {
        method: "POST",
      });
      await load();
      setVariant("success");
      setMessage(`${response.data.revokedSessions} session(s) revoked.`);
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(): Promise<void> {
    if (!window.confirm("Soft-delete this user and revoke all sessions?"))
      return;
    setBusy(true);
    try {
      await apiRequest(`/api/v1/admin/console/users/${params.userId}`, {
        method: "DELETE",
      });
      window.location.assign("/users");
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
      setBusy(false);
    }
  }

  if (!data) return <LoadingBlock label="Loading user…" />;

  return (
    <>
      <PageHeader
        title={data.name}
        subtitle={`${data.email} · created ${new Date(data.createdAt).toLocaleDateString()}`}
      >
        <a className="btn btn-outline-secondary" href="/users">
          Back to users
        </a>
        <button
          className="btn btn-outline-warning"
          disabled={busy}
          onClick={revokeSessions}
        >
          Revoke sessions
        </button>
        <button
          className="btn btn-outline-danger"
          disabled={busy || data.isPlatformAdmin || data.status === "DELETED"}
          onClick={deleteUser}
        >
          Delete user
        </button>
      </PageHeader>

      <Feedback message={message} variant={variant} />

      <div className="row g-4">
        <div className="col-xl-5">
          <form className="card" onSubmit={save}>
            <div className="card-header">
              <strong>User profile and access</strong>
            </div>
            <div className="card-body vstack gap-3">
              <div>
                <label className="form-label">Name</label>
                <input
                  className="form-control"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input
                  className="form-control"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="form-label">Reset password</label>
                <input
                  className="form-control"
                  type="password"
                  placeholder="Leave blank to keep current password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  disabled={data.isPlatformAdmin || data.status === "DELETED"}
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  <option>ACTIVE</option>
                  <option>SUSPENDED</option>
                </select>
              </div>
              <div className="form-check">
                <input
                  id="verified"
                  className="form-check-input"
                  type="checkbox"
                  checked={form.emailVerified}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      emailVerified: event.target.checked,
                    }))
                  }
                />
                <label className="form-check-label" htmlFor="verified">
                  Email verified
                </label>
              </div>
            </div>
            <div className="card-footer text-end">
              <button
                className="btn btn-primary"
                disabled={busy || data.status === "DELETED"}
              >
                Save changes
              </button>
            </div>
          </form>
        </div>

        <div className="col-xl-7">
          <div className="card mb-4">
            <div className="card-header">
              <strong>Workspaces and billing</strong>
            </div>
            <div className="card-body vstack gap-3">
              {data.memberships.map((item) => {
                const wallet = item.workspace.prepaidWallet;
                const subscription = item.workspace.subscription;
                return (
                  <div className="border rounded p-3" key={item.id}>
                    <div className="d-flex justify-content-between gap-2">
                      <div>
                        <strong>{item.workspace.name}</strong>
                        <div className="small text-secondary">
                          {item.role} · {item.workspace.status}
                        </div>
                      </div>
                      <a
                        className="btn btn-sm btn-outline-primary"
                        href={`/workspaces?query=${item.workspace.slug}`}
                      >
                        Open
                      </a>
                    </div>
                    <div className="row g-3 mt-1 small">
                      <div className="col-sm-4">
                        <span className="text-secondary d-block">Plan</span>
                        {subscription?.planVersion.plan.name ?? "—"}
                      </div>
                      <div className="col-sm-4">
                        <span className="text-secondary d-block">Revenue</span>
                        {subscription?.revenueModel?.replaceAll("_", " ") ??
                          "—"}
                      </div>
                      <div className="col-sm-4">
                        <span className="text-secondary d-block">Wallet</span>
                        {wallet
                          ? formatMoneyMinor(
                              BigInt(wallet.balanceMinor) -
                                BigInt(wallet.reservedMinor),
                              wallet.currency,
                            )
                          : "—"}
                      </div>
                      <div className="col-sm-4">
                        <span className="text-secondary d-block">Storage</span>
                        {formatBytes(item.workspace.storageUsedBytes)} /{" "}
                        {formatBytes(item.workspace.storageLimitBytes)}
                      </div>
                      <div className="col-sm-4">
                        <span className="text-secondary d-block">Assets</span>
                        {item.workspace._count.mediaAssets}
                      </div>
                      <div className="col-sm-4">
                        <span className="text-secondary d-block">Members</span>
                        {item.workspace._count.members}
                      </div>
                    </div>
                  </div>
                );
              })}
              {data.memberships.length === 0 && (
                <div className="text-secondary">No workspace membership.</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <strong>Active sessions</strong>
            </div>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Last used</th>
                    <th>IP</th>
                    <th>Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((session) => (
                    <tr key={session.id}>
                      <td>{new Date(session.createdAt).toLocaleString()}</td>
                      <td>
                        {session.lastUsedAt
                          ? new Date(session.lastUsedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td>{session.ipAddress ?? "—"}</td>
                      <td className="text-truncate" style={{ maxWidth: 260 }}>
                        {session.userAgent ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {data.sessions.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center text-secondary py-3"
                      >
                        No active sessions.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
