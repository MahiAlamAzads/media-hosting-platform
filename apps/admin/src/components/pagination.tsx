export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <div className="d-flex align-items-center justify-content-between border-top p-3"><span className="text-secondary small">Page {page} of {totalPages}</span><div className="btn-group"><button className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button><button className="btn btn-outline-secondary btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button></div></div>;
}
