import type { ReactNode } from "react";

interface PageHeadingProps {
  title: ReactNode;
  description?: ReactNode;
  /** 1 for the page's own heading, 2 for a heading that replaces the page's content. */
  level?: 1 | 2;
}

/** The heading treatment every screen shares, so no page invents its own size or weight. */
export function PageHeading({
  title,
  description,
  level = 1,
}: PageHeadingProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div>
      <Heading className="text-xl font-semibold">{title}</Heading>
      {description !== undefined && (
        <p className="mt-2 text-neutral-600">{description}</p>
      )}
    </div>
  );
}
