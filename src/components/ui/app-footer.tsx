export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[color:var(--line)] bg-[var(--surface)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-center sm:px-6 lg:px-8">
        <div className="text-sm text-[var(--text-3)]">
          © {year}{" "}
          <a
            href="https://github.com/shawnxie94/infinitum"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--text-2)] transition hover:text-[var(--accent)]"
          >
            由 Infinitum 驱动
          </a>
        </div>
      </div>
    </footer>
  );
}
