const fs = require("fs");
const path = require("path");

const pages = [
  ["TEST / SAMPLE / NOT A REAL BANK STATEMENT", "TEST - Operion Demo Plumbing", "Statement period: August 1, 2026 - August 31, 2026", "Synthetic account: TEST-ACCOUNT-001", "Synthetic institution: TEST BANK - NOT A REAL FINANCIAL INSTITUTION", "Beginning balance: $10,000.00", "Ending balance: $13,250.00"],
  ["TEST TRANSACTIONS - SYNTHETIC DATA ONLY", "08/03  Synthetic deposit                 $5,000.00", "08/08  Synthetic supplier payment         ($1,200.00)", "08/15  Synthetic deposit                 $3,500.00", "08/22  Synthetic operating expense          ($800.00)", "08/28  Synthetic deposit                 $2,000.00"],
  ["TEST SUMMARY - SYNTHETIC DATA ONLY", "Total synthetic deposits: $10,500.00", "Total synthetic withdrawals: $7,250.00", "Transaction count: 5", "Negative balance indicators: None", "This PDF is a deterministic test fixture and is not a financial document." ]
];

function escapePdf(value) { return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"); }
const objects = [null, "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [7 0 R 8 0 R 9 0 R] /Count 3 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
for (let i = 0; i < pages.length; i++) {
  const page = 7 + i;
  const stream = ["BT", "/F1 14 Tf", "72 720 Td", ...pages[i].flatMap((line, index) => [`(${escapePdf(line)}) Tj`, index < pages[i].length - 1 ? "0 -32 Td" : ""]), "ET"].join("\n");
  objects[page] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page - 3} 0 R >>`;
  objects[page - 3] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
}
let pdf = "%PDF-1.4\n";
const offsets = [0];
for (let i = 1; i < objects.length; i++) { offsets[i] = Buffer.byteLength(pdf); pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`; }
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, "0") + " 00000 n ").join("\n")}\ntrailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const target = path.join(__dirname, "..", "fixtures", "test-bank-statement.pdf");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, pdf);
console.log(target);
