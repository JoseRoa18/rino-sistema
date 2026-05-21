/**
 * Utilidades de exportación para el módulo de Reportes.
 *
 *   - exportCSV(filename, rows, columns)   → descarga .csv (Blob nativo)
 *   - exportPDF(opts)                       → descarga .pdf (jsPDF + autoTable, dynamic import)
 *   - printReport()                         → window.print()
 *
 * `columns` es un array de `{ key, label, fmt? }`. `fmt(value, row)` se aplica
 * antes de imprimir. Si no se pasa, se hace String(value).
 */

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  // RFC 4180: si contiene coma, comilla o salto de línea → escapar entre comillas
  // y duplicar las comillas internas.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCSV(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const raw = row?.[c.key];
          const v = c.fmt ? c.fmt(raw, row) : raw;
          return csvEscape(v);
        })
        .join(',')
    )
    .join('\r\n');
  // BOM para que Excel detecte UTF-8 sin pedir importación
  return '﻿' + header + '\r\n' + body;
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCSV(filename, rows, columns) {
  const content = buildCSV(rows || [], columns || []);
  const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  downloadBlob(content, safeName, 'text/csv;charset=utf-8;');
}

// ---------------------------------------------------------------------------
// PDF (carga jsPDF dinámicamente para no inflar el bundle inicial)
// ---------------------------------------------------------------------------

/**
 * Genera y descarga un PDF tabular.
 *
 * opts = {
 *   filename,
 *   title,            // título grande
 *   subtitle?,        // línea bajo el título (ej. rango de fechas)
 *   meta?,            // pares [['Generado', '...'], ...] que se imprimen como info
 *   tables: [{ title?, columns, rows }],
 *   orientation?: 'portrait' | 'landscape',
 * }
 */
export async function exportPDF(opts) {
  const { default: jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = autoTableMod.default || autoTableMod;

  const orientation = opts.orientation || 'portrait';
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'letter' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;
  let cursorY = 50;

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(opts.title || 'Reporte', marginX, cursorY);
  cursorY += 8;

  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(opts.subtitle, marginX, cursorY + 10);
    cursorY += 18;
  } else {
    cursorY += 6;
  }

  // Meta (pares clave/valor en columna estrecha a la derecha)
  if (Array.isArray(opts.meta) && opts.meta.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105); // slate-600
    const metaLines = opts.meta.map(([k, v]) => `${k}: ${v}`);
    metaLines.forEach((line, i) => {
      doc.text(line, pageWidth - marginX, 56 + i * 11, { align: 'right' });
    });
  }

  cursorY += 8;

  // Línea separadora
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.5);
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
  cursorY += 14;

  // Tablas
  const tables = opts.tables || [];
  tables.forEach((tbl, idx) => {
    if (tbl.title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(tbl.title, marginX, cursorY);
      cursorY += 6;
    }

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [tbl.columns.map((c) => c.label)],
      body: (tbl.rows || []).map((row) =>
        tbl.columns.map((c) => {
          const raw = row?.[c.key];
          const v = c.fmt ? c.fmt(raw, row) : raw;
          return v == null ? '' : String(v);
        })
      ),
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 5,
        lineColor: [226, 232, 240],
        lineWidth: 0.3,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [241, 245, 249], // slate-100
        textColor: [51, 65, 85],     // slate-700
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
      columnStyles: tbl.columns.reduce((acc, c, i) => {
        if (c.align === 'right') acc[i] = { halign: 'right' };
        if (c.align === 'center') acc[i] = { halign: 'center' };
        return acc;
      }, {}),
    });

    cursorY = doc.lastAutoTable.finalY + 16;

    // Saltar página si la próxima tabla no entra
    if (
      idx < tables.length - 1 &&
      cursorY > doc.internal.pageSize.getHeight() - 100
    ) {
      doc.addPage();
      cursorY = 50;
    }
  });

  // Footer en todas las páginas
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.text(
      `Sistema Rino · Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 20,
      { align: 'center' }
    );
  }

  const safeName = opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`;
  doc.save(safeName);
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

export function printReport() {
  if (typeof window !== 'undefined') {
    window.print();
  }
}

// ---------------------------------------------------------------------------
// Helpers de formato comunes para columnas
// ---------------------------------------------------------------------------

export const fmt = {
  money(v) {
    const n = Number(v) || 0;
    return `$${n.toFixed(2)}`;
  },
  int(v) {
    return String(Math.round(Number(v) || 0));
  },
  num(v, decimals = 2) {
    const n = Number(v) || 0;
    return n.toFixed(decimals);
  },
  pct(v, decimals = 1) {
    const n = Number(v) || 0;
    return `${n.toFixed(decimals)}%`;
  },
  date(v) {
    if (!v) return '';
    return new Date(v).toLocaleDateString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  },
  datetime(v) {
    if (!v) return '';
    return new Date(v).toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  },
};
