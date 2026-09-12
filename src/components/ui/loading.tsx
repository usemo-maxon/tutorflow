export function PageLoading() {
  return (
    <div className="page-loading" aria-label="Ładowanie">
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--wide" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
      </div>
    </div>
  );
}
