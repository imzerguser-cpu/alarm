export function parseRosterRows(aoa) {
  const rows = aoa.filter((r) => r && r.length && r[0] !== '' && r[0] !== undefined && r[0] !== null);
  const firstIsNumeric = rows.length > 0 && /^[0-9]+$/.test(String(rows[0][0]).trim());
  const startIndex = firstIsNumeric ? 0 : 1;
  const list = [];
  for (let i = startIndex; i < rows.length; i++) {
    const [noRaw, nameRaw] = rows[i];
    const no = Number(noRaw);
    const name = String(nameRaw ?? '').trim();
    if (!Number.isFinite(no) || !name) {
      throw new Error(`엑셀 ${i + 1}행 형식이 올바르지 않습니다: [${noRaw}, ${nameRaw}]`);
    }
    list.push({ no, name, role: '' });
  }
  return list;
}

export function wireExcelInput({ buttonEl, fileInputEl, onParsed }) {
  buttonEl.addEventListener('click', () => fileInputEl.click());
  fileInputEl.addEventListener('change', async () => {
    const file = fileInputEl.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const aoa = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });
    try {
      const list = parseRosterRows(aoa);
      onParsed(list);
    } catch (err) {
      alert(err.message);
    } finally {
      fileInputEl.value = '';
    }
  });
}
