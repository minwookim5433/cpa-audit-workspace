/**
 * PDF text-layer helpers — text richness check + page text extraction
 */

function textFromContent(textContent) {
  return (textContent?.items || [])
    .map((item) => String(item?.str ?? ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function assessTextContent(textContent) {
  const items = textContent?.items || [];
  const text = textFromContent(textContent);
  const charCount = text.length;
  const itemCount = items.length;
  const isTextRich = itemCount >= 8 && charCount >= 40;

  return { isTextRich, charCount, itemCount, text };
}

export async function extractAllPageTexts(pdfDoc) {
  if (!pdfDoc?.numPages) return [];

  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pages.push({
      pageNumber,
      text: textFromContent(textContent),
    });
  }
  return pages;
}
