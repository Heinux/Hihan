import type { Context } from "@netlify/edge-functions";

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const hemParam = url.searchParams.get("hem") || "N";

const today = new Date();
const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth()+1).padStart(2,'0')}-${String(today.getUTCDate()).padStart(2,'0')}`;

const ogImageUrl = dateParam
  ? `${url.origin}/og/${dateParam}/${hemParam}`
  : `${url.origin}/og/${todayStr}/N`;



  // Build title from date
  const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

  let title = "Planisphère Céleste — Carte du ciel & Calendrier d'Hénoch";

  if (dateParam) {
    let year = 0, month = 0, day = 0;
    if (dateParam.includes("/")) {
      const parts = dateParam.split("/").map(Number);
      if (parts.length === 3 && parts.every(n => !isNaN(n))) { [day, month, year] = parts; }
    } else {
      const parts = dateParam.split(/(?!^)-/).map(Number);
      if (parts.length === 3 && parts.every(n => !isNaN(n))) { [year, month, day] = parts; }
    }
    const mnth = MONTHS[month - 1] || "";
    const yrStr = year <= 0 ? `-${Math.abs(year - 1)}` : `${year}`;
    title = `${String(day).padStart(2, "0")} ${mnth} ${yrStr} — Planisphère Céleste`;
  }

  // Fetch the original HTML
  const response = await context.next();
  const html = await response.text();

  // Inject dynamic OG meta tags
  const modifiedHtml = html
    .replace(/<meta property="og:image"[^>]*>/,  `<meta property="og:image" content="${ogImageUrl}">`)
    .replace(/<meta property="og:image:width"[^>]*>/, `<meta property="og:image:width" content="1200">`)
    .replace(/<meta property="og:image:height"[^>]*>/, `<meta property="og:image:height" content="630">`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${ogImageUrl}">`)
    .replace(/<title>[^<]*<\/title>/,            `<title>${title}</title>`)
    .replace(/<meta property="og:title"[^>]*>/,  `<meta property="og:title" content="${title}">`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}">`)
    .replace(/<meta property="og:url"[^>]*>/,    `<meta property="og:url" content="${request.url}">`);

  return new Response(modifiedHtml, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      "content-type": "text/html; charset=utf-8",
    },
  });
};

export const config = { path: "/" };