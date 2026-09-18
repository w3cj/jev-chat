import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExtLink } from "./ExtLink.tsx";

describe("ExtLink", () => {
  it("opens a web URL in a new tab without a referrer", () => {
    const html = renderToStaticMarkup(<ExtLink href="https://example.com/a">Source</ExtLink>);

    expect(html).toBe(
      '<a href="https://example.com/a" target="_blank" rel="noreferrer" class="link link-hover">Source</a>',
    );
  });

  it.each([undefined, "#", "javascript:alert(1)", "ftp://example.com"])(
    "renders %s as plain text",
    (href) => {
      const html = renderToStaticMarkup(
        <ExtLink href={href} className="font-medium">
          Source
        </ExtLink>,
      );

      expect(html).toBe('<span class="font-medium">Source</span>');
    },
  );
});
