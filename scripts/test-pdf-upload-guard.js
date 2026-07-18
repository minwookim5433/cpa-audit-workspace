/**
 * PDF upload size guard — unit checks (no browser)
 */
const PDF_UPLOAD_WARN_BYTES = 30 * 1024 * 1024;
const PDF_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const PDF_UPLOAD_MOBILE_WARN_BYTES = 20 * 1024 * 1024;
const PDF_PAGE_COUNT_NOTICE = 300;

function formatFileSizeMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function classifyUpload(sizeBytes, { isMobile = false } = {}) {
  if (sizeBytes > PDF_UPLOAD_MAX_BYTES) {
    return { action: "block", sizeMb: formatFileSizeMb(sizeBytes) };
  }
  if (sizeBytes > PDF_UPLOAD_WARN_BYTES) {
    return { action: "warn", sizeMb: formatFileSizeMb(sizeBytes), isMobile };
  }
  if (isMobile && sizeBytes > PDF_UPLOAD_MOBILE_WARN_BYTES) {
    return { action: "mobile-warn", sizeMb: formatFileSizeMb(sizeBytes) };
  }
  return { action: "allow", sizeMb: formatFileSizeMb(sizeBytes) };
}

function pageNotice(pageCount) {
  return Number(pageCount) > PDF_PAGE_COUNT_NOTICE;
}

const mb = (n) => n * 1024 * 1024;
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

assert(classifyUpload(mb(5)).action === "allow", "A: 5MB should allow");
assert(classifyUpload(mb(35)).action === "warn", "B: 35MB should warn");
assert(classifyUpload(mb(55)).action === "block", "C: 55MB should block");
assert(classifyUpload(mb(25), { isMobile: true }).action === "mobile-warn", "mobile 25MB warn");
assert(classifyUpload(mb(25), { isMobile: false }).action === "allow", "desktop 25MB allow");
assert(pageNotice(301) === true, "D: 301 pages notice");
assert(pageNotice(300) === false, "300 pages no notice");
assert(formatFileSizeMb(mb(35)) === "35.0", "size MB format");

console.log("test-pdf-upload-guard: all passed");
