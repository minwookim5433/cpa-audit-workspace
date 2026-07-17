const fs = require("fs");
const path = require("path");

const aging = ["정상", "30일이내", "31-60일", "61-90일", "91-180일", "180일초과"];
const names = [
  "A상사", "B산업", "C전자", "D물류", "E건설", "F식품", "G바이오", "H테크", "I유통", "J제약",
  "K화학", "L섬유", "M철강", "N에너지", "O모터", "P디스플", "Q반도체", "R소프트", "S물산", "T엔지니",
  "U파트너", "V글로벌", "W코퍼", "X인더", "Y메디", "Z오토", "알파상사", "베타산업", "감마전자", "델타물류",
  "엡실론건설", "제타식품", "에타바이오", "쎄타테크", "카파유통",
];

let seed = 1;
const rnd = (min, max) => {
  seed = (seed * 16807) % 2147483647;
  return min + ((seed - 1) / 2147483646) * (max - min);
};
const rndi = (min, max) => Math.round(rnd(min, max));

const arRows = names.map((c, i) => {
  const priorOpen = rndi(5_000_000, 1_200_000_000);
  const priorClose = rndi(Math.round(priorOpen * 0.7), Math.round(priorOpen * 1.5));
  const curOpen = rndi(Math.round((priorOpen + priorClose) / 2 * 0.85), Math.round((priorOpen + priorClose) / 2 * 1.15));
  const curClose = rndi(Math.round(curOpen * 0.75), Math.round(curOpen * 1.6));
  const priorSales = rndi(20_000_000, 4_000_000_000);
  const curSales = rndi(Math.round(priorSales * 0.75), Math.round(priorSales * 1.4));
  return {
    account: "매출채권",
    customer: c,
    priorOpen,
    priorClose,
    curOpen,
    curClose,
    priorSales,
    curSales,
    aging: aging[i % aging.length],
    days: rndi(15, 240),
    related: i < 3 || i % 11 === 0 ? "Y" : "N",
  };
});

const otherRows = [
  { account: "매출", customer: "(합계)", priorOpen: 0, priorClose: 0, curOpen: 0, curClose: 0, priorSales: 45_000_000_000, curSales: 52_000_000_000, aging: "", days: "", related: "N" },
  { account: "재고자산", customer: "(합계)", priorOpen: 620_000_000, priorClose: 680_000_000, curOpen: 680_000_000, curClose: 710_000_000, priorSales: 0, curSales: 0, aging: "", days: "", related: "N" },
  { account: "매입채무", customer: "(합계)", priorOpen: 390_000_000, priorClose: 420_000_000, curOpen: 420_000_000, curClose: 455_000_000, priorSales: 0, curSales: 0, aging: "", days: "", related: "N" },
];

const header = "계정과목,거래처,전기기초잔액,전기기말잔액,당기기초잔액,당기기말잔액,전기매출액,당기매출액,만기구간,회수일수,특수관계자 여부";
const toLine = (r) => [
  r.account, r.customer, r.priorOpen, r.priorClose, r.curOpen, r.curClose,
  r.priorSales, r.curSales, r.aging, r.days, r.related,
].join(",");

const lines = [header, ...arRows.map(toLine), ...otherRows.map(toLine)];
const out = path.join(__dirname, "..", "sample-data", "ar-analysis-sample.csv");
fs.writeFileSync(out, "\uFEFF" + lines.join("\n"), "utf8");
console.log("Wrote", out, "rows:", lines.length - 1);
