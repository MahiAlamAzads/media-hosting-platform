import { PageHeader } from "@/components/page-header";

const cards = [
  {
    title: "5-minute integration",
    description: "Upload PUBLIC images for a permanent imgUrl or PRIVATE media for signed delivery.",
    href: "/dashboard/api-docs/integrations",
    icon: "bi-rocket-takeoff",
    action: "Open guide"
  },
  {
    title: "AI agent skills",
    description: "Copy a complete skill into ChatGPT, Claude, Cursor, Copilot or another coding agent.",
    href: "/dashboard/api-docs/ai-agent-skills",
    icon: "bi-stars",
    action: "Copy skills"
  },
  {
    title: "Framework examples",
    description: "Next.js, Node.js, Express, Fastify and PHP server-side integration examples.",
    href: "/dashboard/api-docs/integrations#examples",
    icon: "bi-code-square",
    action: "Browse examples"
  },
  {
    title: "API keys",
    description: "Create least-privilege keys for uploads, media reads and optional media updates.",
    href: "/dashboard/api-keys",
    icon: "bi-key",
    action: "Manage keys"
  }
] as const;

export default function DashboardApiDocsPage() {
  return (
    <>
      <PageHeader
        title="Developer integration"
        subtitle="Everything a customer developer needs to upload and deliver media safely."
      >
        <a className="btn btn-primary" href="/dashboard/api-docs/integrations">
          Start integration
        </a>
      </PageHeader>

      <div className="alert alert-success">
        <strong>Customer documentation only.</strong> Internal endpoint inventories, administrator APIs and the full OpenAPI schema are restricted to the separate Admin Console.
      </div>

      <div className="row g-4">
        {cards.map(card => (
          <div className="col-md-6" key={card.href}>
            <div className="card h-100">
              <div className="card-body">
                <i className={`bi ${card.icon} fs-2 text-primary`} />
                <h2 className="h5 mt-3">{card.title}</h2>
                <p className="text-secondary">{card.description}</p>
                <a className="btn btn-outline-primary" href={card.href}>
                  {card.action}
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-4">
        <div className="card-header fw-semibold">Recommended customer scopes</div>
        <div className="card-body">
          <div className="d-flex flex-wrap gap-2 mb-3">
            <code>uploads:write</code>
            <code>media:read</code>
          </div>
          <p className="text-secondary small mb-0">
            Add <code>media:write</code> only when the customer application must rename, move or change asset visibility after upload.
          </p>
        </div>
      </div>
    </>
  );
}
