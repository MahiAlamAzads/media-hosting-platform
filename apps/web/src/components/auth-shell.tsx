import { ThemeToggle } from "@/components/theme-toggle";

export function AuthShell({
  title,
  subtitle,
  children,
  footer
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="mp-auth">
      <section className="mp-auth-context">
        <div className="mp-auth-topline">
          <a className="mp-brand" href="/">
            <span className="mp-triangle" aria-hidden="true" />
            <span>Media Platform</span>
          </a>
          <ThemeToggle compact />
        </div>

        <div className="mp-auth-message">
          <h1>Media infrastructure without hidden complexity.</h1>
          <p>
            Upload, organize, transform and deliver files from one
            auditable workspace.
          </p>
        </div>

        <p className="mp-auth-proof">
          Secure sessions · scoped API keys · signed delivery
        </p>
      </section>

      <section className="mp-auth-form">
        <div className="mp-auth-form-inner">
          <h2>{title}</h2>
          <p>{subtitle}</p>
          {children}
          {footer && <div className="mp-auth-footer">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
