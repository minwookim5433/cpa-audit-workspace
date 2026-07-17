const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

global.XLSX = XLSX;
global.window = global;
eval(fs.readFileSync(path.join(__dirname, "..", "analytical-calc.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "..", "ar-analysis.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "..", "final-report.js"), "utf8"));

(async () => {
  class MockFile {
    constructor(name, buf) {
      this.name = name;
      this._buf = buf;
    }
    async arrayBuffer() {
      return this._buf.buffer.slice(this._buf.byteOffset, this._buf.byteOffset + this._buf.byteLength);
    }
  }

  const csv = fs.readFileSync(path.join(__dirname, "..", "sample-data", "ar-risk-scenario-sample.csv"));
  const dataset = await global.AnalyticalCalc.parseAnalyticalFile(new MockFile("s.csv", csv));
  const account = dataset.accounts.find((a) => a.account === "매출채권");
  const conc = global.AnalyticalCalc.calculateConcentration(account);
  const html = global.FinalReport.buildDocument(
    [
      {
        id: "t",
        account: "매출채권",
        fileName: "s.csv",
        procedureLabels: ["거래처 집중도"],
        savedAt: new Date().toISOString(),
        sourceData: { format: "ar", priorAmount: account.priorAmount, currentAmount: account.currentAmount },
        items: [{ type: "concentration", ...conc }],
      },
    ],
    {},
    new Date().toISOString()
  );

  const block = html.match(/<table class="fr-table fr-concentration-table">[\s\S]*?<\/table>/);
  console.log("hasConcTable:", !!block);
  console.log("hasColgroup:", block && block[0].includes("<colgroup"));
  console.log("colCount:", block ? (block[0].match(/<col\b/g) || []).length : 0);
  console.log("hasConcCss:", html.includes(".fr-concentration-table"));
})();
