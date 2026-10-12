// Renders index.html to resume.pdf with headless Chrome, exactly as the page
// prints, then enforces the size limit. Run by .github/workflows/pdf.yml on
// every push to main, so the PDF always matches the latest HTML.
//
//   npm install puppeteer && node scripts/build-pdf.mjs
import { execFileSync } from "node:child_process";
import { statSync, renameSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const MAX_BYTES = 7 * 1000 * 1000; // must stay below 7 MB
const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "resume.pdf");

const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve(root, "index.html")).href, {
    waitUntil: "networkidle0",
    timeout: 60_000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMediaType("print");
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
} finally {
  await browser.close();
}

let size = statSync(out).size;
console.log(`resume.pdf: ${(size / 1e6).toFixed(2)} MB`);

// Safety net: if the PDF ever grows past the limit (e.g. a huge photo is
// swapped in), recompress it with Ghostscript before giving up.
if (size >= MAX_BYTES) {
  const tmp = out + ".gs.pdf";
  execFileSync("gs", [
    "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.6", "-dPDFSETTINGS=/ebook",
    "-dNOPAUSE", "-dQUIET", "-dBATCH", `-sOutputFile=${tmp}`, out,
  ]);
  if (existsSync(tmp)) renameSync(tmp, out);
  size = statSync(out).size;
  console.log(`after compression: ${(size / 1e6).toFixed(2)} MB`);
}

if (size >= MAX_BYTES) {
  console.error("resume.pdf is still 7 MB or larger. Use a smaller photo.");
  process.exit(1);
}
