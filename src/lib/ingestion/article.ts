import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export async function fetchArticleContent(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "infinitum-feed-bot/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Article fetch failed with status ${response.status}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  return article?.textContent?.trim() || null;
}
