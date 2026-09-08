export function formatHiClassText(generalNotice, students, todos) {
  const lines = [];
  const trimmed = (generalNotice || '').trim();
  if (trimmed) {
    lines.push(trimmed, '');
  }
  lines.push('[오늘의 할 일]');
  for (const student of students) {
    const todo = (todos && todos[String(student.no)]) || '';
    lines.push(`${student.no}. ${student.name} - ${todo || '(없음)'}`);
  }
  return lines.join('\n');
}
