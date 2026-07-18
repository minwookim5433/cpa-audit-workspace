/**
 * PDF text-layer helpers — text richness check + page text extraction
 */
import { assessTextContent as assessPdfTextContent } from "./workspace-pdf-text.js";

export function assessTextContent(textContent) {
  return assessPdfTextContent(textContent);
}

export async function extractAllPageTexts(pdfDoc) {
  if (!pdfDoc?.numPages) return [];

  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent({ disableNormalization: true });
    const assess = assessTextContent(textContent);
    pages.push({
      pageNumber,
      text: assess.text,
    });
  }
  return pages;
}
