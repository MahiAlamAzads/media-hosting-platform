import { DocsCopyButton } from "@/components/docs-copy-button";
import { PageHeader } from "@/components/page-header";
import { aiAgentSkills } from "@/lib/ai-agent-skills";

export default function AiAgentSkillsPage() {
  return (
    <>
      <PageHeader
        title="AI agent integration skills"
        subtitle="Copy a complete, security-focused instruction file into your coding agent."
      >
        <a
          className="btn btn-outline-primary"
          href="/dashboard/api-docs/integrations"
        >
          Integration guide
        </a>
      </PageHeader>

      <div className="alert alert-warning">
        Paste one skill into your AI agent, then ask it to integrate Media
        Platform into the current repository. Replace example domains only
        through environment variables; never paste a live API key into an AI
        chat.
      </div>

      <div className="row g-4">
        {aiAgentSkills.map((skill) => (
          <div className="col-12" key={skill.id} id={skill.id}>
            <section className="card">
              <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div>
                  <strong>{skill.title}</strong>
                  <div className="text-secondary small">
                    {skill.description}
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <code>{skill.filename}</code>
                  <DocsCopyButton value={skill.content} />
                </div>
              </div>
              <div className="card-body p-0">
                <pre className="integration-code-block ai-skill-code mb-0">
                  <code>{skill.content}</code>
                </pre>
              </div>
            </section>
          </div>
        ))}
      </div>
    </>
  );
}
