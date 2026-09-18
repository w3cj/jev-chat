import type { ReactNode } from "react";

/**
 * A link off to a tool's source. Always a new tab, never a referrer; an href that isn't http(s)
 * renders as plain text.
 */
export function ExtLink({
  href,
  className = "",
  children,
}: {
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  if (!href || !/^https?:\/\//i.test(href)) return <span className={className}>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`link link-hover ${className}`.trim()}
    >
      {children}
    </a>
  );
}
