import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type PdfSection =
  | { type: "kv"; title: string; items: Array<[string, string]> }
  | { type: "table"; title: string; head: string[]; rows: (string | number)[][] };

export function downloadPdf(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  sections: PdfSection[];
}) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  let y = margin;

  doc.setFontSize(18);
  doc.text(opts.title, margin, y);
  y += 22;
  if (opts.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(opts.subtitle, margin, y);
    doc.setTextColor(0);
    y += 16;
  }
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
  doc.setTextColor(0);
  y += 18;

  for (const s of opts.sections) {
    if (y > 720) { doc.addPage(); y = margin; }
    doc.setFontSize(12);
    doc.text(s.title, margin, y);
    y += 8;

    if (s.type === "kv") {
      autoTable(doc, {
        startY: y + 4,
        theme: "plain",
        styles: { fontSize: 10, cellPadding: 3 },
        body: s.items.map(([k, v]) => [k, v]),
        columnStyles: { 0: { textColor: [110, 110, 110], cellWidth: 180 }, 1: { fontStyle: "bold" } },
      });
      y = (doc as any).lastAutoTable.finalY + 16;
    } else {
      autoTable(doc, {
        startY: y + 4,
        head: [s.head],
        body: s.rows.map((r) => r.map((c) => String(c))),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [35, 35, 45], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 246, 250] },
      });
      y = (doc as any).lastAutoTable.finalY + 16;
    }
  }

  doc.save(opts.filename);
}
