export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

// A field needs quoting if it contains a comma, a double quote, or a
// newline (RFC 4180). Internal double quotes are escaped by doubling them.
function escapeCsvField(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvField(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(c.value(row))).join(','));
  // CRLF line endings per RFC 4180 — also what Excel expects for a clean
  // import rather than one long unbroken line.
  return [header, ...lines].join('\r\n') + '\r\n';
}
