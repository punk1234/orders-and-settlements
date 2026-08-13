import { toCsv } from './csv';

describe('toCsv', () => {
  interface Row {
    name: string;
    amount: number;
  }

  const columns = [
    { header: 'Name', value: (r: Row) => r.name },
    { header: 'Amount', value: (r: Row) => r.amount },
  ];

  it('writes a header row followed by one row per record, CRLF-terminated', () => {
    const csv = toCsv<Row>([{ name: 'Acme', amount: 1000 }], columns);
    expect(csv).toBe('Name,Amount\r\nAcme,1000\r\n');
  });

  it('produces just the header (plus trailing CRLF) for an empty dataset', () => {
    const csv = toCsv<Row>([], columns);
    expect(csv).toBe('Name,Amount\r\n');
  });

  it('quotes a field containing a comma', () => {
    const csv = toCsv<Row>([{ name: 'Acme, Inc', amount: 1 }], columns);
    expect(csv).toContain('"Acme, Inc"');
  });

  it('quotes a field containing a double quote, doubling the internal quote', () => {
    const csv = toCsv<Row>([{ name: 'The "Best" Co', amount: 1 }], columns);
    expect(csv).toContain('"The ""Best"" Co"');
  });

  it('quotes a field containing a newline', () => {
    const csv = toCsv<Row>([{ name: 'Line1\nLine2', amount: 1 }], columns);
    expect(csv).toContain('"Line1\nLine2"');
  });

  it('renders null/undefined values as an empty field', () => {
    const csv = toCsv<{ name: string | null }>([{ name: null }], [
      { header: 'Name', value: (r) => r.name },
    ]);
    expect(csv).toBe('Name\r\n\r\n');
  });
});
