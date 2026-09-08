export function formatHiClassText(generalNotice, students, todos, submits) {
  const lines = [];
  const trimmed = (generalNotice || '').trim();
  if (trimmed) {
    lines.push(trimmed, '');
  }
  lines.push('[오늘의 할 일]');
  for (const student of students) {
    const todo = (todos && todos[String(student.no)]) || '';
    const submit = (submits && submits[String(student.no)]) || '';
    lines.push(
      `${student.no}. ${student.name} - 해야할일: ${todo || '(없음)'} / 제출할것: ${submit || '(없음)'}`,
    );
  }
  return lines.join('\n');
}
