# 교실 알람 확장 (시간표/아침활동/알림장/PWA/하이클래스 복사) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 "교실 수업 알리미"(index.html + js/bell.js) 위에 오늘 요일 시간표(오른쪽 세로), 아침활동 안내판(자동 닫힘), 알림장(교사 안내문 + 학생 5명 할일/1인1역 + 하이클래스용 복사), PIN 편집 보호, Firebase Firestore 실시간 동기화, PWA 홈 화면 설치 기능을 추가한다.

**Architecture:** 순수 로직(시간 계산, 오늘 시간표 행 구성, 하이클래스 문구 조합, PIN 검사, 엑셀 파싱, 설치 안내 분기)은 프레임워크 없는 ES 모듈로 작성해 Vitest로 단위 테스트한다. DOM 렌더링과 Firebase 연동은 그 순수 함수를 감싸는 얇은 wiring 코드로 작성하고 브라우저에서 수동으로 검증한다. 기존 `js/bell.js`(수업종 음성 알리미)는 건드리지 않고 그대로 유지한다.

**Tech Stack:** 순수 HTML/CSS/JS(ES 모듈, 번들러 없음), Firebase Firestore(모듈러 SDK v12, CDN ESM import), SheetJS `xlsx`(CDN, 엑셀 파싱), Web Speech API(기존 유지), Vitest(단위 테스트), GitHub Pages(기존 배포 방식 유지), PWA(manifest.json + service worker).

## Global Constraints

- 저장소 루트: `D:\alarm` (GitHub: imzerguser-cpu/alarm). 모든 경로는 이 루트 기준.
- 기존 `index.html`, `js/bell.js`의 기능(음성 알리미, 시작/중지, 오늘의 알림 시간표)은 삭제·변경하지 않는다. 새 기능만 같은 화면에 추가한다.
- 새 JS 파일은 전부 ES 모듈(`export`/`import`)로 작성하고 `<script type="module">`로 로드한다. `js/bell.js`는 기존 방식(classic script) 그대로 둔다.
- Firebase는 v12 모듈러 SDK를 CDN URL(`https://www.gstatic.com/firebasejs/12.18.0/...`)에서 ESM으로 직접 import한다 (번들러 불필요).
- PIN 보호는 캐주얼한 수준(강력한 보안 아님)이 스펙상 명시적으로 합의된 사항이다 — Firebase Auth 등 강한 인증을 임의로 추가하지 않는다.
- 위젯화는 "PWA 홈 화면 설치"이지 태블릿을 한 화면에 잠그는 키오스크 모드가 아니다 — 설치 후에도 사용자가 자유롭게 다른 앱으로 전환할 수 있어야 한다.
- 순수 로직 함수(계산/변환/포맷)는 반드시 Vitest 단위 테스트를 먼저 작성한다(TDD). DOM 렌더링, Firestore 호출, 실제 파일 업로드처럼 브라우저/네트워크가 필요한 wiring 코드는 단위 테스트 대상에서 제외하고, 각 태스크의 "브라우저 확인" 단계에서 수동으로 검증한다 — 이 구분은 스펙 9절(테스트 방법)과 일치한다.
- 참고 스펙: `docs/superpowers/specs/2026-09-08-classroom-alarm-expansion-design.md`

---

## Task 1: 테스트 도구 설정 (Vitest)

**Files:**
- Create: `package.json`
- Create: `tests/sanity.test.js`

**Interfaces:**
- Produces: `npm test` 명령으로 `tests/**/*.test.js`를 실행하는 Vitest 러너. 이후 모든 태스크는 이 명령을 그대로 사용한다.

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "classroom-alarm",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: 의존성 설치**

Run: `npm install`
Expected: `node_modules`가 생성되고 에러 없이 종료.

- [ ] **Step 3: 실패하는(→통과할) 확인용 테스트 작성**

```js
// tests/sanity.test.js
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs basic assertions', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test`
Expected: `tests/sanity.test.js` 1개 테스트 PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/sanity.test.js
git commit -m "chore: add vitest test harness"
```

(참고: `package-lock.json`과 `node_modules/`는 `.gitignore`에 `node_modules/`를 추가해 커밋에서 제외한다. `.gitignore`가 없다면 `node_modules/\n` 내용으로 새로 만들어 함께 커밋한다.)

---

## Task 2: 시간대 순수 로직 (`js/schedule-times.js`)

**Files:**
- Create: `js/schedule-times.js`
- Test: `tests/schedule-times.test.js`

**Interfaces:**
- Produces:
  - `PERIODS`: `{ id: string, label: string, start: 'HH:MM', end: 'HH:MM', kind: 'fixed'|'class' }[]` — 아침활동~8교시까지 11개 구간(스펙 2절 시간대 그대로).
  - `getDayKey(date: Date): 'sun'|'mon'|'tue'|'wed'|'thu'|'fri'|'sat'`
  - `getCurrentPeriodId(date: Date): string|null` — 현재 시각이 속한 `PERIODS[].id`, 쉬는시간/등교전/하교후면 `null`.
  - `isMorningActive(date: Date): boolean` — 08:40~09:00(끝 미포함) 사이인지.
- Consumes: 없음 (최하위 모듈).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/schedule-times.test.js
import { describe, it, expect } from 'vitest';
import { PERIODS, getDayKey, getCurrentPeriodId, isMorningActive } from '../js/schedule-times.js';

function at(h, m) {
  const d = new Date(2026, 8, 8); // 2026-09-08 (화요일)
  d.setHours(h, m, 0, 0);
  return d;
}

describe('PERIODS', () => {
  it('has 11 defined slots from 아침활동 to 8교시', () => {
    expect(PERIODS).toHaveLength(11);
    expect(PERIODS[0].id).toBe('morning');
    expect(PERIODS.at(-1).id).toBe('p8');
  });
});

describe('getDayKey', () => {
  it('maps 2026-09-08 (Tue) to "tue"', () => {
    expect(getDayKey(new Date(2026, 8, 8))).toBe('tue');
  });
  it('maps 2026-09-07 (Mon) to "mon"', () => {
    expect(getDayKey(new Date(2026, 8, 7))).toBe('mon');
  });
});

describe('getCurrentPeriodId', () => {
  it('returns "p1" during 1교시 (09:15)', () => {
    expect(getCurrentPeriodId(at(9, 15))).toBe('p1');
  });
  it('returns null during a break (09:45)', () => {
    expect(getCurrentPeriodId(at(9, 45))).toBeNull();
  });
  it('returns "p6" at 14:15', () => {
    expect(getCurrentPeriodId(at(14, 15))).toBe('p6');
  });
  it('returns null before school (08:00)', () => {
    expect(getCurrentPeriodId(at(8, 0))).toBeNull();
  });
  it('excludes the end boundary (09:40 is break, not p1)', () => {
    expect(getCurrentPeriodId(at(9, 40))).toBeNull();
  });
});

describe('isMorningActive', () => {
  it('is true at 08:50', () => {
    expect(isMorningActive(at(8, 50))).toBe(true);
  });
  it('is false at exactly 09:00 (end excluded)', () => {
    expect(isMorningActive(at(9, 0))).toBe(false);
  });
  it('is false at 08:39', () => {
    expect(isMorningActive(at(8, 39))).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- tests/schedule-times.test.js`
Expected: FAIL — `Cannot find module '../js/schedule-times.js'`

- [ ] **Step 3: 구현 작성**

```js
// js/schedule-times.js
export const PERIODS = [
  { id: 'morning', label: '아침활동', start: '08:40', end: '09:00', kind: 'fixed' },
  { id: 'p1', label: '1교시', start: '09:00', end: '09:40', kind: 'class' },
  { id: 'p2', label: '2교시', start: '09:50', end: '10:30', kind: 'class' },
  { id: 'playtime', label: '중간놀이시간', start: '10:30', end: '10:50', kind: 'fixed' },
  { id: 'p3', label: '3교시', start: '10:50', end: '11:30', kind: 'class' },
  { id: 'p4', label: '4교시', start: '11:40', end: '12:20', kind: 'class' },
  { id: 'lunch', label: '점심시간', start: '12:20', end: '13:20', kind: 'fixed' },
  { id: 'p5', label: '5교시', start: '13:20', end: '14:00', kind: 'class' },
  { id: 'p6', label: '6교시', start: '14:10', end: '14:50', kind: 'class' },
  { id: 'p7', label: '7교시', start: '15:00', end: '15:40', kind: 'class' },
  { id: 'p8', label: '8교시', start: '15:50', end: '16:30', kind: 'class' },
];

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function getDayKey(date) {
  return DAY_KEYS[date.getDay()];
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function getCurrentPeriodId(date) {
  const nowMin = date.getHours() * 60 + date.getMinutes();
  for (const period of PERIODS) {
    if (nowMin >= toMinutes(period.start) && nowMin < toMinutes(period.end)) {
      return period.id;
    }
  }
  return null;
}

export function isMorningActive(date) {
  const nowMin = date.getHours() * 60 + date.getMinutes();
  return nowMin >= toMinutes('08:40') && nowMin < toMinutes('09:00');
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- tests/schedule-times.test.js`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: Commit**

```bash
git add js/schedule-times.js tests/schedule-times.test.js
git commit -m "feat: add pure period-time helpers (schedule-times.js)"
```

---

## Task 3: 오늘 시간표 행 구성 순수 로직 (`js/timetable.js`)

**Files:**
- Create: `js/timetable.js`
- Test: `tests/timetable.test.js`

**Interfaces:**
- Consumes: `PERIODS` from `js/schedule-times.js` (Task 2).
- Produces:
  - `buildTodayRows(weeklySchedule: Record<string, Record<string,string>>, dayKey: string, currentPeriodId: string|null): { id, time, label, subject, isCurrent }[]`
  - `renderTimetable(container: HTMLElement, rows: ReturnType<typeof buildTodayRows>): void` — DOM 렌더러(단위 테스트 대상 아님, Task 4에서 브라우저로 확인).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/timetable.test.js
import { describe, it, expect } from 'vitest';
import { buildTodayRows } from '../js/timetable.js';

const SAMPLE_TUE = {
  tue: {
    p1: '국어', p2: '수학', p3: '사회', p4: '창(동)', p5: '미술',
    p6: '미술', p7: '신나는 실내 액티브 챌린지', p8: '신나는 실내 액티브 챌린지',
  },
};

describe('buildTodayRows', () => {
  it('includes fixed slots and subject slots with subjects, marks current period', () => {
    const rows = buildTodayRows(SAMPLE_TUE, 'tue', 'p2');
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual([
      'morning', 'p1', 'p2', 'playtime', 'p3', 'p4', 'lunch', 'p5', 'p6', 'p7', 'p8',
    ]);
    expect(rows.find((r) => r.id === 'p2').isCurrent).toBe(true);
    expect(rows.find((r) => r.id === 'p1').isCurrent).toBe(false);
    expect(rows.find((r) => r.id === 'p6').subject).toBe('미술');
  });

  it('skips class slots with no subject for that day (e.g. Wed has no p7 given)', () => {
    const rows = buildTodayRows({ wed: { p1: '국어' } }, 'wed', null);
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain('p7');
    expect(ids).not.toContain('p8');
    expect(ids).toContain('morning');
    expect(ids).toContain('lunch');
  });

  it('uses the period label as subject for fixed slots', () => {
    const rows = buildTodayRows({}, 'mon', null);
    expect(rows.find((r) => r.id === 'lunch').subject).toBe('점심시간');
    expect(rows.find((r) => r.id === 'morning').subject).toBe('아침활동');
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- tests/timetable.test.js`
Expected: FAIL — `Cannot find module '../js/timetable.js'`

- [ ] **Step 3: 구현 작성**

```js
// js/timetable.js
import { PERIODS } from './schedule-times.js';

export function buildTodayRows(weeklySchedule, dayKey, currentPeriodId) {
  const daySubjects = (weeklySchedule && weeklySchedule[dayKey]) || {};
  const rows = [];
  for (const period of PERIODS) {
    let subject;
    if (period.kind === 'class') {
      const value = daySubjects[period.id];
      if (!value) continue;
      subject = value;
    } else {
      subject = period.label;
    }
    rows.push({
      id: period.id,
      time: `${period.start}~${period.end}`,
      label: period.label,
      subject,
      isCurrent: period.id === currentPeriodId,
    });
  }
  return rows;
}

export function renderTimetable(container, rows) {
  container.innerHTML = '';
  for (const row of rows) {
    const el = document.createElement('div');
    el.className = 'timetable-row' + (row.isCurrent ? ' current' : '');
    const time = document.createElement('span');
    time.className = 'tt-time';
    time.textContent = row.time;
    const label = document.createElement('span');
    label.className = 'tt-label';
    label.textContent = row.label;
    const subject = document.createElement('span');
    subject.className = 'tt-subject';
    subject.textContent = row.subject;
    el.append(time, label, subject);
    container.appendChild(el);
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- tests/timetable.test.js`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: Commit**

```bash
git add js/timetable.js tests/timetable.test.js
git commit -m "feat: add today-timetable row builder (timetable.js)"
```

---

## Task 4: 화면 레이아웃 뼈대 + 초기 시드 데이터 (`index.html`, `css/app.css`, `js/seed-data.js`, `js/main.js`)

**Files:**
- Create: `css/app.css`
- Create: `js/seed-data.js`
- Create: `js/main.js`
- Modify: `index.html` (전체 body 구조 재배치 — 아래 "최종 형태" 전체로 교체)

**Interfaces:**
- Consumes: `getDayKey`, `getCurrentPeriodId` (`js/schedule-times.js`, Task 2), `buildTodayRows`, `renderTimetable` (`js/timetable.js`, Task 3).
- Produces: `js/seed-data.js`의 `INITIAL_SCHEDULE`, `INITIAL_ROSTER` — Task 7·9에서 Firestore 초기값으로 재사용. `index.html`의 DOM id들(`timetablePanel`, `morningBanner`, `morningBannerText`, `noticeBoard`, `noticeGeneralText`, `studentList`, `hiclassCopyBtn`, `editModeBtn`, `pinModal`, `pinInput`, `pinSubmitBtn`, `installBtn`, `installMessage`, `excelUploadBtn`, `excelFileInput`) — 이후 모든 태스크가 이 id들을 그대로 사용한다.

이 태스크는 순수 로직 단위 테스트가 없다 (레이아웃/DOM 배치). 대신 브라우저로 직접 확인한다.

- [ ] **Step 1: 초기 시드 데이터 작성**

정규 시간표(스펙 6절, 3학년 2학기)와 방과후 시간표(3~4학년)를 하나의 요일별 구조로 합친다.

```js
// js/seed-data.js
export const INITIAL_SCHEDULE = {
  mon: {
    p1: '국어', p2: '과학', p3: '과학', p4: '체육', p5: '음악',
    p6: '피아노', p7: '피아노', p8: '뉴스포츠/돌봄',
  },
  tue: {
    p1: '국어', p2: '수학', p3: '사회', p4: '창(동)', p5: '미술',
    p6: '미술', p7: '신나는 실내 액티브 챌린지', p8: '신나는 실내 액티브 챌린지',
  },
  wed: {
    p1: '국어', p2: '수학', p3: '체육', p4: '과학', p5: '영어',
    p6: '컴퓨터', p7: '컴퓨터', p8: '돌봄',
  },
  thu: {
    p1: '음악', p2: '국어', p3: '수학', p4: '사회', p5: '도덕',
    p6: '컴퓨터', p7: '컴퓨터/AI코딩여행', p8: '컴퓨터',
  },
  fri: {
    p1: '체육', p2: '영어', p3: '국어', p4: '수학', p5: '창체',
    p6: '방송댄스', p7: '방송댄스', p8: '원어민영어',
  },
};

export const INITIAL_ROSTER = [];
```

- [ ] **Step 2: index.html을 아래 최종 형태로 교체**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>교실 수업 알리미</title>
  <link rel="manifest" href="manifest.json">
  <link rel="stylesheet" href="css/app.css">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Malgun Gothic', sans-serif; background: #0e1420; color: #fff; }
    .bell-wrap { max-width: 900px; margin: 0 auto; padding: 24px 20px 80px; }
    .bell-wrap h1 { text-align: center; font-size: 1.4rem; color: #ffcc00; margin-bottom: 20px; }

    .clock-card {
      background: #1a2233; border-radius: 16px; padding: 16px; text-align: center; margin-bottom: 20px;
    }
    #nextAlarmInfo { margin-top: 8px; font-size: 1.1rem; color: #ffcc00; min-height: 1.4em; }

    .control-bar {
      display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;
    }
    .control-bar button {
      padding: 12px 22px; border-radius: 10px; border: none; font-weight: bold; font-size: 1rem; cursor: pointer;
    }
    #startBellBtn { background: #2ecc71; color: #062; }
    #stopBellBtn { background: #555; color: #fff; }
    #testVoiceBtn { background: #4285F4; color: #fff; }
    #bellStatus { font-size: 0.95rem; color: #9aa7bd; width: 100%; text-align: center; margin-top: 4px; }
    #bellStatus.on { color: #2ecc71; }

    .schedule-card { background: #1a2233; border-radius: 14px; padding: 20px; margin-bottom: 16px; }
    .schedule-card h2 { margin: 0 0 14px; font-size: 1.05rem; color: #ffcc00; }
    .schedule-row {
      display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #2a344a; flex-wrap: wrap;
    }
    .schedule-row:last-child { border-bottom: none; }
    .schedule-row input[type="time"] {
      width: 140px; padding: 8px; border-radius: 8px; border: 1px solid #3a4864; background: #0e1420; color: #fff;
    }
    .schedule-row input[type="text"] {
      flex: 1; min-width: 220px; padding: 8px; border-radius: 8px; border: 1px solid #3a4864; background: #0e1420; color: #fff;
    }
    .schedule-row button {
      padding: 8px 12px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.85rem;
    }
    .row-test-btn { background: #4285F4; color: #fff; }
    .row-del-btn { background: #e74c3c; color: #fff; }

    .schedule-actions { display: flex; gap: 10px; margin-top: 16px; }
    #addRowBtn { background: #34495e; color: #fff; }
    #saveScheduleBtn { background: #ffcc00; color: #111; }
    .schedule-actions button {
      padding: 10px 18px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer;
    }

    .alarm-banner {
      position: fixed; left: 0; right: 0; top: 0; padding: 30px 20px; text-align: center;
      background: #ffcc00; color: #111; font-size: 1.6rem; font-weight: bold; z-index: 999;
      box-shadow: 0 6px 20px rgba(0,0,0,0.3); display: none;
    }
    .alarm-banner.show { display: block; }
    .alarm-banner button {
      margin-top: 14px; padding: 8px 16px; border-radius: 8px; border: none; background: #111; color: #ffcc00;
      font-weight: bold; cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="alarmBanner" class="alarm-banner">
    <div id="alarmBannerText"></div>
    <button id="alarmBannerCloseBtn">닫기</button>
  </div>

  <div class="app-grid">
    <header class="top-clock">
      <div id="clockNow">00:00:00</div>
      <div id="clockDate"></div>
    </header>

    <div id="morningBanner" class="morning-banner" hidden>
      <div id="morningBannerText"></div>
    </div>

    <main class="center-col">
      <section id="noticeBoard" class="notice-board">
        <div id="noticeGeneralText" class="notice-general"></div>
        <div id="studentList" class="student-list"></div>
        <button id="hiclassCopyBtn" class="hiclass-btn">📋 하이클래스용 복사</button>
      </section>

      <div class="bell-wrap">
        <h1>🔔 교실 수업 알리미</h1>

        <div class="clock-card">
          <div id="nextAlarmInfo"></div>
        </div>

        <div class="control-bar">
          <button id="startBellBtn">▶ 알리미 시작</button>
          <button id="stopBellBtn" disabled>⏹ 알리미 중지</button>
          <button id="testVoiceBtn">🔊 음성 테스트</button>
          <div id="bellStatus">알리미가 꺼져 있습니다. 시작 버튼을 눌러주세요.</div>
        </div>

        <div class="schedule-card">
          <h2>오늘의 알림 시간표</h2>
          <div id="scheduleList"></div>
          <div class="schedule-actions">
            <button id="addRowBtn">+ 알림 추가</button>
            <button id="saveScheduleBtn">저장</button>
          </div>
        </div>
      </div>
    </main>

    <aside id="timetablePanel" class="timetable-panel"></aside>
  </div>

  <div class="toolbar">
    <button id="editModeBtn">✏️ 편집</button>
    <button id="excelUploadBtn">📥 엑셀로 학생 명단 가져오기</button>
    <input id="excelFileInput" type="file" accept=".xlsx,.xls" hidden>
    <button id="installBtn">📲 홈 화면에 추가</button>
    <div id="installMessage" class="install-message"></div>
  </div>

  <div id="pinModal" class="pin-modal" hidden>
    <div class="pin-modal-inner">
      <p>편집 PIN을 입력하세요</p>
      <input id="pinInput" type="password" inputmode="numeric" maxlength="4">
      <button id="pinSubmitBtn">확인</button>
    </div>
  </div>

  <script src="js/bell.js"></script>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: 레이아웃 CSS 작성**

```css
/* css/app.css */
.app-grid {
  display: grid;
  grid-template-columns: 1fr 280px;
  grid-template-areas:
    "clock   timetable"
    "banner  timetable"
    "center  timetable";
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 20px 0;
}

.top-clock { grid-area: clock; text-align: center; }
.top-clock #clockNow { font-size: 3rem; font-weight: bold; letter-spacing: 2px; color: #fff; }
.top-clock #clockDate { font-size: 1.1rem; color: #ffcc00; margin-top: 4px; }

.morning-banner {
  grid-area: banner;
  background: #ffcc00; color: #111; border-radius: 14px;
  padding: 18px 20px; text-align: center; font-size: 1.2rem; font-weight: bold;
}
.morning-banner[hidden] { display: none; }

.center-col { grid-area: center; }

.notice-board {
  background: #1a2233; border-radius: 14px; padding: 20px; margin-bottom: 16px;
}
.notice-general {
  min-height: 2.4em; padding: 10px; border-radius: 8px; background: #0e1420;
  color: #fff; margin-bottom: 14px; white-space: pre-wrap;
}
.student-list { display: flex; flex-direction: column; gap: 8px; }
.student-row {
  display: flex; align-items: center; gap: 10px; background: #0e1420;
  border-radius: 8px; padding: 8px 10px;
}
.student-row .s-name { width: 70px; font-weight: bold; color: #ffcc00; flex-shrink: 0; }
.student-row .s-role { width: 90px; color: #9aa7bd; font-size: 0.85rem; flex-shrink: 0; }
.student-row .s-todo {
  flex: 1; min-width: 0; background: transparent; color: #fff; border: none;
  border-bottom: 1px solid #2a344a; padding: 4px;
}
.hiclass-btn {
  margin-top: 14px; padding: 10px 16px; border-radius: 8px; border: none;
  background: #34495e; color: #fff; font-weight: bold; cursor: pointer;
}

.timetable-panel {
  grid-area: timetable; background: #1a2233; border-radius: 14px; padding: 14px;
  display: flex; flex-direction: column; gap: 6px; height: fit-content;
}
.timetable-row {
  display: flex; flex-direction: column; gap: 2px; padding: 8px 10px;
  border-radius: 8px; background: #0e1420;
}
.timetable-row.current { background: #ffcc00; color: #111; }
.timetable-row .tt-time { font-size: 0.75rem; color: #9aa7bd; }
.timetable-row.current .tt-time { color: #333; }
.timetable-row .tt-label { font-size: 0.8rem; }
.timetable-row .tt-subject { font-weight: bold; }

.toolbar {
  max-width: 1200px; margin: 16px auto 0; padding: 0 20px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.toolbar button {
  padding: 10px 16px; border-radius: 8px; border: none; background: #34495e;
  color: #fff; font-weight: bold; cursor: pointer;
}
.install-message { color: #9aa7bd; font-size: 0.9rem; }
.install-message.show { color: #ffcc00; }

.pin-modal {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.pin-modal[hidden] { display: none; }
.pin-modal-inner {
  background: #1a2233; padding: 24px; border-radius: 14px; text-align: center;
}
.pin-modal-inner input {
  display: block; margin: 12px auto; padding: 10px; font-size: 1.4rem;
  text-align: center; width: 140px; border-radius: 8px; border: 1px solid #3a4864;
  background: #0e1420; color: #fff;
}
.pin-modal-inner button {
  padding: 10px 20px; border-radius: 8px; border: none; background: #ffcc00;
  color: #111; font-weight: bold; cursor: pointer;
}

@media (max-width: 800px) {
  .app-grid {
    grid-template-columns: 1fr;
    grid-template-areas: "clock" "banner" "timetable" "center";
  }
}
```

- [ ] **Step 4: main.js에서 오늘 시간표를 시드 데이터로 부트스트랩 렌더**

```js
// js/main.js
import { getDayKey, getCurrentPeriodId } from './schedule-times.js';
import { buildTodayRows, renderTimetable } from './timetable.js';
import { INITIAL_SCHEDULE } from './seed-data.js';

function renderTimetableNow() {
  const now = new Date();
  const dayKey = getDayKey(now);
  const currentPeriodId = getCurrentPeriodId(now);
  const rows = buildTodayRows(INITIAL_SCHEDULE, dayKey, currentPeriodId);
  renderTimetable(document.getElementById('timetablePanel'), rows);
}

renderTimetableNow();
setInterval(renderTimetableNow, 30000);
```

(참고: Task 7에서 `INITIAL_SCHEDULE` 하드코딩 부분을 Firestore 구독으로 교체한다.)

- [ ] **Step 5: 브라우저로 확인**

`index.html`을 브라우저로 열어(로컬 파일 열기 또는 `npx serve .`) 다음을 눈으로 확인한다:
- 상단 중앙에 시계·날짜가 크게 보인다.
- 오른쪽에 오늘 요일 시간표가 세로로 나열되고, 현재 시각에 해당하는 교시가 노란색으로 강조된다.
- 기존 수업종 알리미(시작/중지/음성테스트, 오늘의 알림 시간표)가 그대로 동작한다.
- 화요일이면 6~8교시까지, 다른 요일이면 각 요일에 정의된 만큼만 표시된다(빈 슬롯은 안 보임).

- [ ] **Step 6: Commit**

```bash
git add index.html css/app.css js/seed-data.js js/main.js
git commit -m "feat: add layout grid, seed schedule data, and bootstrap timetable render"
```

---

## Task 5: 편집 PIN 잠금 (`js/pin-lock.js`)

**Files:**
- Create: `js/pin-lock.js`
- Test: `tests/pin-lock.test.js`
- Modify: `js/main.js` (PIN 배선 추가)

**Interfaces:**
- Consumes: `index.html`의 `#editModeBtn`, `#pinModal`, `#pinInput`, `#pinSubmitBtn` (Task 4).
- Produces:
  - `checkPin(input: string, correctPin: string): boolean`
  - `initPinLock({ buttonEl, modalEl, inputEl, submitEl, correctPin, onUnlock }): void`
  - `window.__EDIT_MODE__: boolean` 전역 플래그 — Task 7·9의 인라인 편집 UI가 이 값을 읽어 편집 가능 여부를 결정한다.

PIN 값은 우선 코드 상수(`EDIT_PIN = '1234'`)로 두고, 이후 필요하면 사용자가 직접 바꿀 수 있도록 `js/main.js` 상단에 명확히 표시한다(스펙 4.7: 캐주얼한 보호 수준이 합의된 사항).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/pin-lock.test.js
import { describe, it, expect } from 'vitest';
import { checkPin } from '../js/pin-lock.js';

describe('checkPin', () => {
  it('returns true for exact match', () => {
    expect(checkPin('1234', '1234')).toBe(true);
  });
  it('trims surrounding whitespace from input', () => {
    expect(checkPin(' 1234 ', '1234')).toBe(true);
  });
  it('returns false for mismatch', () => {
    expect(checkPin('0000', '1234')).toBe(false);
  });
  it('returns false for non-string input', () => {
    expect(checkPin(1234, '1234')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- tests/pin-lock.test.js`
Expected: FAIL — `Cannot find module '../js/pin-lock.js'`

- [ ] **Step 3: 구현 작성**

```js
// js/pin-lock.js
export function checkPin(input, correctPin) {
  return typeof input === 'string' && input.trim() === String(correctPin);
}

export function initPinLock({ buttonEl, modalEl, inputEl, submitEl, correctPin, onUnlock }) {
  const open = () => {
    modalEl.hidden = false;
    inputEl.value = '';
    inputEl.focus();
  };
  const close = () => { modalEl.hidden = true; };
  const submit = () => {
    if (checkPin(inputEl.value, correctPin)) {
      close();
      onUnlock();
    } else {
      alert('PIN이 올바르지 않습니다.');
      inputEl.value = '';
      inputEl.focus();
    }
  };
  buttonEl.addEventListener('click', open);
  submitEl.addEventListener('click', submit);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) close();
  });
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- tests/pin-lock.test.js`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: main.js에 배선 추가**

```js
// js/main.js 상단에 추가
import { initPinLock } from './pin-lock.js';

const EDIT_PIN = '1234'; // TODO: 원하는 PIN으로 바꾸세요.
window.__EDIT_MODE__ = false;

initPinLock({
  buttonEl: document.getElementById('editModeBtn'),
  modalEl: document.getElementById('pinModal'),
  inputEl: document.getElementById('pinInput'),
  submitEl: document.getElementById('pinSubmitBtn'),
  correctPin: EDIT_PIN,
  onUnlock: () => {
    window.__EDIT_MODE__ = true;
    document.body.classList.add('edit-mode');
  },
});
```

`css/app.css`에 편집모드 표시용 스타일을 추가한다:

```css
/* css/app.css 끝에 추가 */
body.edit-mode .notice-general,
body.edit-mode .s-todo {
  outline: 1px dashed #ffcc00;
}
```

- [ ] **Step 6: 브라우저로 확인**

`✏️ 편집` 버튼 클릭 → PIN 입력창이 뜨는지, 틀린 PIN(예: `0000`)을 넣으면 alert가 뜨고 창이 안 닫히는지, 올바른 PIN(`1234`)을 넣으면 창이 닫히고 안내문/할일 칸에 점선 테두리(편집 가능 표시)가 생기는지 확인한다.

- [ ] **Step 7: Commit**

```bash
git add js/pin-lock.js tests/pin-lock.test.js js/main.js css/app.css
git commit -m "feat: add PIN-gated edit mode"
```

---

## Task 6: Firebase 초기화 + Firestore 저장/구독 래퍼 (`js/firebase-config.js`, `js/store.js`)

**Files:**
- Create: `js/firebase-config.js`
- Create: `js/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Produces:
  - `db` (Firestore 인스턴스, `js/firebase-config.js`에서 export)
  - `shouldResetDaily(storedDateKey: string|null|undefined, todayDateKey: string): boolean` — 순수 함수, 단위 테스트 대상.
  - `subscribeSchedule(callback)`, `subscribeRoster(callback)`, `subscribeDaily(callback)` — `callback(data, fromCache: boolean)` 형태로 호출된다. `fromCache`가 `true`면 오프라인이라 마지막 캐시 데이터를 보여주고 있다는 뜻이며, Task 9에서 "연결 끊김" 표시에 사용한다.
  - `saveSchedule(weeklyData)`, `saveRoster(list)`, `saveDaily(data)`, `ensureTodayDaily(todayDateKey)` — Firestore를 직접 호출하는 wiring 함수(단위 테스트 대상 아님, Task 7·9에서 브라우저로 검증).
- Consumes: 없음.

**중요 — 이 태스크는 사용자의 실제 Firebase 프로젝트 정보가 있어야 끝까지 검증할 수 있다.** 사용자가 Firebase 콘솔(https://console.firebase.google.com)에서:
1. 기존 계정으로 새 프로젝트(또는 기존 프로젝트)를 만들고,
2. "Firestore Database"를 테스트 모드로 활성화하고,
3. "프로젝트 설정 → 일반 → 내 앱 → 웹 앱 추가"에서 나오는 `firebaseConfig` 값을 알려줘야
`js/firebase-config.js`의 `REPLACE_ME` 값을 실제 값으로 채울 수 있다. 이 단계가 끝나기 전까지 Firestore 연동 부분은 콘솔에 연결 에러가 뜨는 게 정상이며, 순수 로직(`shouldResetDaily`) 테스트와 레이아웃은 정상 동작한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/store.test.js
import { describe, it, expect } from 'vitest';
import { shouldResetDaily } from '../js/store.js';

describe('shouldResetDaily', () => {
  it('returns true when stored date differs from today', () => {
    expect(shouldResetDaily('2026-09-07', '2026-09-08')).toBe(true);
  });
  it('returns false when dates match', () => {
    expect(shouldResetDaily('2026-09-08', '2026-09-08')).toBe(false);
  });
  it('returns true when stored date is missing', () => {
    expect(shouldResetDaily(undefined, '2026-09-08')).toBe(true);
    expect(shouldResetDaily(null, '2026-09-08')).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- tests/store.test.js`
Expected: FAIL — `Cannot find module '../js/store.js'`

- [ ] **Step 3: firebase-config.js 작성 (플레이스홀더)**

```js
// js/firebase-config.js
// 아래 값은 Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱(웹)에서 확인한 값으로
// 반드시 교체해야 합니다. 교체 전에는 Firestore 동기화가 동작하지 않습니다.
export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};
```

- [ ] **Step 4: store.js 작성**

```js
// js/store.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export function shouldResetDaily(storedDateKey, todayDateKey) {
  return storedDateKey !== todayDateKey;
}

export function subscribeSchedule(callback) {
  return onSnapshot(doc(db, 'schedule', 'weekly'), { includeMetadataChanges: true }, (snap) => {
    callback(snap.exists() ? snap.data() : {}, snap.metadata.fromCache);
  });
}

export function saveSchedule(weeklyData) {
  return setDoc(doc(db, 'schedule', 'weekly'), weeklyData);
}

export function subscribeRoster(callback) {
  return onSnapshot(doc(db, 'roster', 'students'), { includeMetadataChanges: true }, (snap) => {
    callback(snap.exists() ? (snap.data().list || []) : [], snap.metadata.fromCache);
  });
}

export function saveRoster(list) {
  return setDoc(doc(db, 'roster', 'students'), { list });
}

export function subscribeDaily(callback) {
  return onSnapshot(doc(db, 'daily', 'current'), { includeMetadataChanges: true }, (snap) => {
    callback(snap.exists() ? snap.data() : null, snap.metadata.fromCache);
  });
}

export function saveDaily(data) {
  return setDoc(doc(db, 'daily', 'current'), data, { merge: true });
}

export async function ensureTodayDaily(todayDateKey) {
  const ref = doc(db, 'daily', 'current');
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : null;
  if (!current || shouldResetDaily(current.date, todayDateKey)) {
    const fresh = { date: todayDateKey, morningNotice: '', generalNotice: '', todos: {} };
    await setDoc(ref, fresh);
    return fresh;
  }
  return current;
}
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `npm test -- tests/store.test.js`
Expected: `shouldResetDaily` 관련 3개 테스트 PASS. (이 파일은 Firestore 함수도 export하지만, Vitest는 import 시점에 `initializeApp`을 호출하므로 Node 환경에서도 앱 객체 생성 자체는 성공한다 — 실제 네트워크 호출은 함수가 호출될 때만 발생하므로 테스트에는 영향 없음.)

- [ ] **Step 6: Firestore 보안 규칙 파일 작성**

PIN이 캐주얼한 보호 수준이라는 스펙 4.7의 합의에 따라, Firestore 규칙도 별도 로그인 없이 열어둔다(문서화된 트레이드오프).

```
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

이 파일은 Firebase 콘솔의 "Firestore Database → 규칙" 탭에 사용자가 직접 붙여넣어야 적용된다(자동 배포 안 함 — Firebase CLI 로그인이 필요한 작업이라 이 플랜 범위 밖).

- [ ] **Step 7: Commit**

```bash
git add js/firebase-config.js js/store.js tests/store.test.js firestore.rules
git commit -m "feat: add Firebase init and Firestore store wrappers"
```

---

## Task 7: 시간표 Firestore 연동 + 편집 폼

**Files:**
- Modify: `js/main.js` (하드코딩된 `INITIAL_SCHEDULE` 사용 부분을 Firestore 구독으로 교체, 편집 폼 배선 추가)
- Modify: `index.html` (시간표 편집 폼 마크업 추가)
- Modify: `css/app.css` (편집 폼 스타일 추가)

**Interfaces:**
- Consumes: `subscribeSchedule`, `saveSchedule` (`js/store.js`, Task 6), `INITIAL_SCHEDULE` (`js/seed-data.js`, Task 4), `buildTodayRows`/`renderTimetable` (Task 3), `getDayKey`/`getCurrentPeriodId` (Task 2), `window.__EDIT_MODE__` (Task 5).
- Produces: Firestore `schedule/weekly` 문서에 저장된 요일별 시간표(초기값 없으면 `INITIAL_SCHEDULE`로 시딩). Task 9가 같은 Firestore 프로젝트를 계속 사용.

이 태스크는 Firestore 실 연동이라 단위 테스트가 아니라 브라우저 수동 확인으로 검증한다(스펙 9절).

- [ ] **Step 1: index.html에 편집 폼 추가**

`#timetablePanel` 바로 뒤, `</aside>` 앞에 편집 폼을 추가한다 (평소엔 숨김, 편집모드일 때만 보임):

```html
    <!-- </aside> 앞에 추가 -->
    <div id="timetableEditForm" class="timetable-edit-form" hidden>
      <h3>시간표 편집</h3>
      <label>요일
        <select id="ttEditDay">
          <option value="mon">월</option>
          <option value="tue">화</option>
          <option value="wed">수</option>
          <option value="thu">목</option>
          <option value="fri">금</option>
        </select>
      </label>
      <label>교시
        <select id="ttEditPeriod">
          <option value="p1">1교시</option>
          <option value="p2">2교시</option>
          <option value="p3">3교시</option>
          <option value="p4">4교시</option>
          <option value="p5">5교시</option>
          <option value="p6">6교시</option>
          <option value="p7">7교시</option>
          <option value="p8">8교시</option>
        </select>
      </label>
      <label>과목
        <select id="ttEditSubjectPreset">
          <option value="국어">국어</option>
          <option value="수학">수학</option>
          <option value="사회">사회</option>
          <option value="과학">과학</option>
          <option value="영어">영어</option>
          <option value="도덕">도덕</option>
          <option value="실과">실과</option>
          <option value="음악">음악</option>
          <option value="미술">미술</option>
          <option value="체육">체육</option>
          <option value="창체">창체</option>
          <option value="방과후">방과후</option>
          <option value="__custom">기타(직접입력)</option>
        </select>
      </label>
      <input id="ttEditSubjectCustom" type="text" placeholder="과목명 직접 입력" hidden>
      <button id="ttEditApplyBtn">적용</button>
    </div>
```

- [ ] **Step 2: app.css에 폼 스타일 추가**

```css
/* css/app.css 끝에 추가 */
.timetable-edit-form {
  grid-area: timetable; margin-top: 10px; background: #1a2233; border-radius: 14px;
  padding: 14px; display: flex; flex-direction: column; gap: 8px;
}
.timetable-edit-form[hidden] { display: none; }
.timetable-edit-form label { display: flex; flex-direction: column; font-size: 0.85rem; color: #9aa7bd; gap: 4px; }
.timetable-edit-form select, .timetable-edit-form input[type="text"] {
  padding: 8px; border-radius: 8px; border: 1px solid #3a4864; background: #0e1420; color: #fff;
}
.timetable-edit-form button {
  padding: 10px; border-radius: 8px; border: none; background: #ffcc00; color: #111;
  font-weight: bold; cursor: pointer;
}
body.edit-mode .timetable-edit-form { display: flex; }
```

- [ ] **Step 3: main.js를 Firestore 연동으로 교체**

`js/main.js`의 Task 4 Step 4 블록(`renderTimetableNow` + `setInterval` 호출)을 아래로 교체한다:

```js
// js/main.js — 기존 renderTimetableNow/setInterval 블록을 아래로 교체
import { subscribeSchedule, saveSchedule } from './store.js';
import { INITIAL_SCHEDULE } from './seed-data.js';

let currentSchedule = INITIAL_SCHEDULE;

function renderTimetableNow() {
  const now = new Date();
  const dayKey = getDayKey(now);
  const currentPeriodId = getCurrentPeriodId(now);
  const rows = buildTodayRows(currentSchedule, dayKey, currentPeriodId);
  renderTimetable(document.getElementById('timetablePanel'), rows);
}

subscribeSchedule((data) => {
  currentSchedule = Object.keys(data).length ? data : INITIAL_SCHEDULE;
  if (!Object.keys(data).length) {
    saveSchedule(INITIAL_SCHEDULE); // 최초 1회 시드 업로드
  }
  renderTimetableNow();
});

setInterval(renderTimetableNow, 30000);

// 시간표 편집 폼 배선
const subjectPreset = document.getElementById('ttEditSubjectPreset');
const subjectCustom = document.getElementById('ttEditSubjectCustom');
subjectPreset.addEventListener('change', () => {
  subjectCustom.hidden = subjectPreset.value !== '__custom';
});
document.getElementById('ttEditApplyBtn').addEventListener('click', () => {
  const day = document.getElementById('ttEditDay').value;
  const period = document.getElementById('ttEditPeriod').value;
  const subject = subjectPreset.value === '__custom' ? subjectCustom.value.trim() : subjectPreset.value;
  if (!subject) return;
  const next = { ...currentSchedule, [day]: { ...currentSchedule[day], [period]: subject } };
  saveSchedule(next);
});
```

- [ ] **Step 4: 브라우저로 확인**

1. `js/firebase-config.js`에 실제 Firebase 프로젝트 값을 채운 뒤 `index.html`을 브라우저로 연다.
2. 콘솔에 Firestore 연결 에러가 없는지 확인 → Firebase 콘솔의 Firestore Database에 `schedule/weekly` 문서가 `INITIAL_SCHEDULE` 내용으로 자동 생성됐는지 확인.
3. `✏️ 편집` → PIN(`1234`) → 시간표 편집 폼에서 요일/교시/과목을 골라 "적용" → 오른쪽 시간표가 즉시 바뀌는지, Firestore 문서도 갱신되는지 확인.
4. 다른 브라우저 탭(또는 시크릿 창)으로 같은 페이지를 열어, 한쪽에서 편집하면 다른 쪽 시간표도 곧 갱신되는지 확인(실시간 동기화).

- [ ] **Step 5: Commit**

```bash
git add index.html css/app.css js/main.js
git commit -m "feat: sync timetable with Firestore and add subject edit form"
```

---

## Task 8: 하이클래스 문구 조합 순수 로직 (`js/notice-format.js`)

**Files:**
- Create: `js/notice-format.js`
- Test: `tests/notice-format.test.js`

**Interfaces:**
- Produces: `formatHiClassText(generalNotice: string, students: {no:number,name:string,role:string}[], todos: Record<string,string>): string`
- Consumes: 없음.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/notice-format.test.js
import { describe, it, expect } from 'vitest';
import { formatHiClassText } from '../js/notice-format.js';

const students = [
  { no: 1, name: '김하늘', role: '칠판지우개' },
  { no: 2, name: '이도윤', role: '우유당번' },
];

describe('formatHiClassText', () => {
  it('includes the general notice followed by a blank line and per-student todos', () => {
    const text = formatHiClassText('내일 준비물: 색연필', students, { 1: '수학익힘 3쪽', 2: '' });
    expect(text).toBe(
      '내일 준비물: 색연필\n\n[오늘의 할 일]\n1. 김하늘 - 수학익힘 3쪽\n2. 이도윤 - (없음)'
    );
  });

  it('omits the notice block entirely when generalNotice is empty', () => {
    const text = formatHiClassText('', students, { 1: '', 2: '' });
    expect(text).toBe('[오늘의 할 일]\n1. 김하늘 - (없음)\n2. 이도윤 - (없음)');
  });

  it('trims whitespace from the general notice', () => {
    const text = formatHiClassText('  공지  ', [], {});
    expect(text.startsWith('공지\n\n')).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- tests/notice-format.test.js`
Expected: FAIL — `Cannot find module '../js/notice-format.js'`

- [ ] **Step 3: 구현 작성**

```js
// js/notice-format.js
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
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- tests/notice-format.test.js`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: Commit**

```bash
git add js/notice-format.js tests/notice-format.test.js
git commit -m "feat: add HiClass notice text formatter"
```

---

## Task 9: 알림장 UI + 아침활동 안내판 + Firestore 연동

**Files:**
- Modify: `js/main.js` (알림장 렌더링, 아침활동 배너, Firestore `roster`/`daily` 연동, 연결 끊김 표시 추가)
- Modify: `index.html` (알림장 안내문 편집용 textarea 토글 + 연결 상태 표시 span 추가)

**Interfaces:**
- Consumes: `subscribeRoster`, `saveRoster`, `subscribeDaily`, `saveDaily`, `ensureTodayDaily` (`js/store.js`, Task 6), `formatHiClassText` (`js/notice-format.js`, Task 8), `isMorningActive` (`js/schedule-times.js`, Task 2), `getDayKey` (Task 2), `window.__EDIT_MODE__` (Task 5), `INITIAL_ROSTER` (`js/seed-data.js`, Task 4).
- Produces: Firestore `roster/students`, `daily/current` 문서. `#studentList`에 학생별 행(`data-no` 속성 포함, `.s-todo`는 편집모드에서 입력 가능한 `<input>`)을 렌더. Task 10(엑셀 업로드), Task 11(하이클래스 복사)이 같은 `roster`/`daily` 상태를 사용.

브라우저 수동 확인으로 검증한다(스펙 9절).

- [ ] **Step 1: index.html에 연결 상태 표시 span 추가**

`<header class="top-clock">` 안, `#clockDate` 바로 뒤(타이머 위젯보다 앞)에 추가:

```html
      <div id="clockDate"></div>
      <span id="connStatus" class="conn-status" hidden>⚠ 연결 끊김 — 마지막으로 받은 내용을 보여주고 있어요</span>
```

`css/app.css` 끝에 스타일도 추가한다:

```css
/* css/app.css 끝에 추가 */
.conn-status { display: block; margin-top: 4px; font-size: 0.85rem; color: #e74c3c; }
.conn-status[hidden] { display: none; }
```

- [ ] **Step 2: 날짜 형식 헬퍼를 store 밖에 두지 않고 main.js에서 바로 사용하도록 date-key 함수 추가**

`js/main.js` 상단(다른 import들 옆)에 추가:

```js
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setConnStatus(fromCache) {
  document.getElementById('connStatus').hidden = !fromCache;
}
```

- [ ] **Step 3: main.js에 알림장 + 아침활동 상태/렌더 로직 추가**

```js
// js/main.js — 아래 블록을 파일 끝에 추가
import {
  subscribeRoster, saveRoster, subscribeDaily, saveDaily, ensureTodayDaily,
} from './store.js';
import { formatHiClassText } from './notice-format.js';
import { isMorningActive } from './schedule-times.js';
import { INITIAL_ROSTER } from './seed-data.js';

let roster = INITIAL_ROSTER;
let daily = { date: toDateKey(new Date()), morningNotice: '', generalNotice: '', todos: {} };

function renderStudentList() {
  const container = document.getElementById('studentList');
  container.innerHTML = '';
  for (const student of roster) {
    const row = document.createElement('div');
    row.className = 'student-row';
    row.dataset.no = String(student.no);

    const name = document.createElement('span');
    name.className = 's-name';
    name.textContent = `${student.no}. ${student.name}`;

    const role = document.createElement('span');
    role.className = 's-role';
    role.textContent = student.role || '';

    const todo = document.createElement('input');
    todo.className = 's-todo';
    todo.type = 'text';
    todo.placeholder = '해야할일 / 제출할 것';
    todo.value = (daily.todos && daily.todos[String(student.no)]) || '';
    todo.disabled = !window.__EDIT_MODE__;
    todo.addEventListener('change', () => {
      const nextTodos = { ...daily.todos, [String(student.no)]: todo.value };
      saveDaily({ todos: nextTodos });
    });

    row.append(name, role, todo);
    container.appendChild(row);
  }
}

function renderNoticeGeneral() {
  const el = document.getElementById('noticeGeneralText');
  el.textContent = daily.generalNotice || '';
  el.contentEditable = window.__EDIT_MODE__ ? 'true' : 'false';
}

function renderMorningBanner() {
  const banner = document.getElementById('morningBanner');
  const active = isMorningActive(new Date()) && !!daily.morningNotice;
  banner.hidden = !active;
  if (active) {
    document.getElementById('morningBannerText').textContent = daily.morningNotice;
  }
}

document.getElementById('noticeGeneralText').addEventListener('blur', (e) => {
  if (!window.__EDIT_MODE__) return;
  saveDaily({ generalNotice: e.target.textContent });
});

subscribeRoster((list, fromCache) => {
  roster = list.length ? list : INITIAL_ROSTER;
  setConnStatus(fromCache);
  renderStudentList();
});

ensureTodayDaily(toDateKey(new Date())).then(() => {
  subscribeDaily((data, fromCache) => {
    if (!data) return;
    daily = data;
    setConnStatus(fromCache);
    renderStudentList();
    renderNoticeGeneral();
    renderMorningBanner();
  });
});

setInterval(renderMorningBanner, 15000);
```

- [ ] **Step 4: 브라우저로 확인**

1. `✏️ 편집` 모드 진입 후 알림장 상단 안내문(`#noticeGeneralText`)을 클릭해 텍스트를 입력하고 다른 곳을 클릭(blur) → Firestore `daily/current.generalNotice`에 저장되는지 확인.
2. 편집모드에서 학생 행의 "해야할일" 입력칸에 텍스트를 쓰고 포커스를 벗어나면 저장되는지 확인 (roster가 비어 있으면 Task 10에서 엑셀 업로드 후 다시 확인).
3. 시스템 시간을 08:45로 맞추고 `daily.morningNotice`에 값을 넣은 뒤(Firebase 콘솔에서 직접 입력해도 됨) 배너가 뜨는지, 09:00을 넘기면 자동으로 사라지는지 확인.
4. 개발자도구에서 네트워크를 오프라인으로 바꾼 뒤 데이터를 바꿔보면 화면 상단에 "⚠ 연결 끊김" 문구가 뜨는지, 온라인으로 되돌리면 문구가 사라지는지 확인.

- [ ] **Step 5: Commit**

```bash
git add js/main.js index.html
git commit -m "feat: wire notice board and morning activity banner to Firestore"
```

---

## Task 10: 엑셀 학생 명단 업로드 (`js/excel-import.js`)

**Files:**
- Create: `js/excel-import.js`
- Test: `tests/excel-import.test.js`
- Modify: `index.html` (SheetJS CDN 스크립트 추가)
- Modify: `js/main.js` (업로드 버튼 배선)

**Interfaces:**
- Consumes: `saveRoster` (`js/store.js`, Task 6), `#excelUploadBtn`/`#excelFileInput` (`index.html`, Task 4), 전역 `XLSX`(CDN, `wireExcelInput` 내부에서만 사용).
- Produces: `parseRosterRows(aoa: any[][]): {no:number,name:string,role:string}[]` (throws on bad rows), `wireExcelInput({ buttonEl, fileInputEl, onParsed })`.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/excel-import.test.js
import { describe, it, expect } from 'vitest';
import { parseRosterRows } from '../js/excel-import.js';

describe('parseRosterRows', () => {
  it('parses rows and skips a header row like ["번호","이름"]', () => {
    const aoa = [['번호', '이름'], [1, '김하늘'], [2, '이도윤']];
    expect(parseRosterRows(aoa)).toEqual([
      { no: 1, name: '김하늘', role: '' },
      { no: 2, name: '이도윤', role: '' },
    ]);
  });

  it('parses rows with no header (first row already numeric)', () => {
    const aoa = [[1, '김하늘'], [2, '이도윤']];
    expect(parseRosterRows(aoa)).toEqual([
      { no: 1, name: '김하늘', role: '' },
      { no: 2, name: '이도윤', role: '' },
    ]);
  });

  it('throws with the offending row number when name is missing', () => {
    const aoa = [['번호', '이름'], [1, '김하늘'], [2, '']];
    expect(() => parseRosterRows(aoa)).toThrow(/3행/);
  });

  it('throws when the number column is not numeric', () => {
    const aoa = [['번호', '이름'], ['가', '김하늘']];
    expect(() => parseRosterRows(aoa)).toThrow(/2행/);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- tests/excel-import.test.js`
Expected: FAIL — `Cannot find module '../js/excel-import.js'`

- [ ] **Step 3: 구현 작성**

```js
// js/excel-import.js
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
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- tests/excel-import.test.js`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: index.html에 SheetJS CDN 추가**

`</head>` 바로 앞에 추가:

```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
```

- [ ] **Step 6: main.js에 배선 추가**

```js
// js/main.js 끝에 추가
import { wireExcelInput } from './excel-import.js';

wireExcelInput({
  buttonEl: document.getElementById('excelUploadBtn'),
  fileInputEl: document.getElementById('excelFileInput'),
  onParsed: (list) => {
    // 기존 1인1역(role) 값은 이름이 같으면 유지
    const merged = list.map((s) => {
      const prev = roster.find((r) => r.name === s.name);
      return prev ? { ...s, role: prev.role } : s;
    });
    saveRoster(merged);
  },
});
```

- [ ] **Step 7: 브라우저로 확인**

번호·이름 두 열짜리 xlsx 파일을 만들어(예: 헤더 "번호","이름" + 5행) `📥 엑셀로 학생 명단 가져오기` 버튼으로 업로드 → 알림장 왼쪽 학생 목록이 5명으로 갱신되는지 확인. 이름 열이 비어있는 잘못된 파일도 하나 만들어 업로드해 에러 alert가 뜨고 기존 명단이 유지되는지 확인.

- [ ] **Step 8: Commit**

```bash
git add js/excel-import.js tests/excel-import.test.js index.html js/main.js
git commit -m "feat: add Excel roster import"
```

---

## Task 11: 하이클래스용 복사 버튼

**Files:**
- Modify: `js/main.js` (복사 버튼 배선)

**Interfaces:**
- Consumes: `formatHiClassText` (`js/notice-format.js`, Task 8), 전역 `roster`/`daily` 상태(Task 9), `#hiclassCopyBtn` (`index.html`, Task 4).

- [ ] **Step 1: main.js에 배선 추가**

```js
// js/main.js 끝에 추가
document.getElementById('hiclassCopyBtn').addEventListener('click', async () => {
  const text = formatHiClassText(daily.generalNotice, roster, daily.todos);
  try {
    await navigator.clipboard.writeText(text);
    alert('클립보드에 복사했습니다. 하이클래스에 붙여넣어 주세요.');
  } catch (err) {
    alert('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
  }
});
```

- [ ] **Step 2: 브라우저로 확인**

알림장 안내문과 학생별 할일을 채운 뒤 `📋 하이클래스용 복사` 클릭 → 메모장 등에 붙여넣어 `formatHiClassText`가 만든 형식(안내문 + 빈 줄 + `[오늘의 할 일]` + 학생별 줄)과 일치하는지 확인.

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "feat: add HiClass clipboard copy button"
```

---

## Task 12: PWA 설치 안내 (`js/pwa-install.js`)

**Files:**
- Create: `js/pwa-install.js`
- Test: `tests/pwa-install.test.js`
- Modify: `js/main.js` (설치 버튼 배선)

**Interfaces:**
- Consumes: `#installBtn`, `#installMessage` (`index.html`, Task 4).
- Produces: `getInstallInstructions(userAgent: string): { auto: boolean, message: string }`, `wireInstallButton({ buttonEl, messageEl, userAgent? })`.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/pwa-install.test.js
import { describe, it, expect } from 'vitest';
import { getInstallInstructions } from '../js/pwa-install.js';

const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
const DESKTOP_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';

describe('getInstallInstructions', () => {
  it('gives manual share-sheet instructions for iOS Safari', () => {
    const info = getInstallInstructions(IOS_SAFARI);
    expect(info.auto).toBe(false);
    expect(info.message).toMatch(/홈 화면에 추가/);
  });
  it('marks Android Chrome as auto-installable', () => {
    const info = getInstallInstructions(ANDROID_CHROME);
    expect(info.auto).toBe(true);
  });
  it('falls back to generic instructions elsewhere', () => {
    const info = getInstallInstructions(DESKTOP_FIREFOX);
    expect(info.auto).toBe(false);
    expect(info.message.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- tests/pwa-install.test.js`
Expected: FAIL — `Cannot find module '../js/pwa-install.js'`

- [ ] **Step 3: 구현 작성**

```js
// js/pwa-install.js
export function getInstallInstructions(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroidChrome = /android/.test(ua) && /chrome/.test(ua);
  if (isIOS) {
    return { auto: false, message: 'Safari 하단 공유 버튼을 누르고 "홈 화면에 추가"를 선택하세요.' };
  }
  if (isAndroidChrome) {
    return { auto: true, message: '설치 팝업이 뜨면 "설치"를 눌러주세요.' };
  }
  return { auto: false, message: '브라우저 메뉴에서 "홈 화면에 추가" 또는 "앱 설치"를 찾아 선택하세요.' };
}

export function wireInstallButton({ buttonEl, messageEl, userAgent = navigator.userAgent }) {
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
  buttonEl.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    } else {
      const info = getInstallInstructions(userAgent);
      messageEl.textContent = info.message;
      messageEl.classList.add('show');
    }
  });
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- tests/pwa-install.test.js`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: main.js에 배선 추가**

```js
// js/main.js 끝에 추가
import { wireInstallButton } from './pwa-install.js';

wireInstallButton({
  buttonEl: document.getElementById('installBtn'),
  messageEl: document.getElementById('installMessage'),
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
```

- [ ] **Step 6: 브라우저로 확인**

안드로이드/크롬 계열에서 `📲 홈 화면에 추가` 클릭 시 설치 팝업이 뜨는지, 데스크톱 Firefox 등 미지원 브라우저에서는 안내 문구가 뜨는지 확인. 설치 후 아이콘으로 실행하면 주소창 없이 전체화면으로 열리는지, 태블릿 홈 버튼으로 내렸다가 다시 아이콘을 눌러 잘 돌아오는지 확인.

- [ ] **Step 7: Commit**

```bash
git add js/pwa-install.js tests/pwa-install.test.js js/main.js
git commit -m "feat: add PWA install button with fallback instructions"
```

---

## Task 13: PWA 매니페스트, 아이콘, 서비스워커

**Files:**
- Create: `manifest.json`
- Create: `icons/icon.svg`
- Create: `sw.js`

**Interfaces:**
- Consumes: `index.html`의 `<link rel="manifest" href="manifest.json">` (Task 4에 이미 포함됨), `js/pwa-install.js`의 서비스워커 등록 코드(Task 12에 이미 포함됨).

- [ ] **Step 1: 아이콘 작성**

```svg
<!-- icons/icon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0e1420"/>
  <path d="M256 96c-17 0-31 14-31 31v8c-56 13-98 63-98 123v72l-32 48v16h322v-16l-32-48v-72c0-60-42-110-98-123v-8c0-17-14-31-31-31z" fill="#ffcc00"/>
  <circle cx="256" cy="420" r="24" fill="#ffcc00"/>
</svg>
```

- [ ] **Step 2: manifest.json 작성**

```json
{
  "name": "교실 수업 알리미",
  "short_name": "수업알리미",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#0e1420",
  "theme_color": "#0e1420",
  "icons": [
    { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
    { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 3: sw.js 작성**

```js
// sw.js
const CACHE_NAME = 'classroom-alarm-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/bell.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 4: 브라우저로 확인**

크롬 개발자도구 → Application 탭 → Manifest에서 매니페스트가 정상 파싱되는지(아이콘 포함), Service Workers 항목에 `sw.js`가 등록·activated 상태인지 확인. 네트워크를 오프라인으로 바꾸고 새로고침해도 페이지 뼈대(HTML/CSS)가 뜨는지 확인.

- [ ] **Step 5: Commit**

```bash
git add manifest.json icons/icon.svg sw.js
git commit -m "feat: add PWA manifest, icon, and service worker"
```

---

## Task 14: 아침활동 타이머 (`js/timer.js`)

**Files:**
- Create: `js/timer.js`
- Test: `tests/timer.test.js`
- Modify: `index.html` (`.top-clock` 헤더 안에 타이머 위젯 마크업 추가)
- Modify: `css/app.css` (타이머 위젯 스타일 추가)

**Interfaces:**
- Produces: `formatCountdown(remainingSeconds: number): string`("MM:SS"), `computeRemaining(totalSeconds: number, startedAtMs: number, nowMs: number): number`, `clampMinutesToSeconds(minutes: number|string): number|null`, `wireTimerWidget({ presetButtons, customInput, customSetBtn, displayEl, startBtn, pauseBtn, resetBtn })`.
- Consumes: 없음. 타이머는 아침활동 시간대와 무관하게 항상 켤 수 있는 상시 위젯이므로 `isMorningActive`에 의존하지 않는다(스펙 4.3).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/timer.test.js
import { describe, it, expect } from 'vitest';
import { formatCountdown, computeRemaining, clampMinutesToSeconds } from '../js/timer.js';

describe('formatCountdown', () => {
  it('formats 65 seconds as 01:05', () => {
    expect(formatCountdown(65)).toBe('01:05');
  });
  it('formats 0 as 00:00', () => {
    expect(formatCountdown(0)).toBe('00:00');
  });
  it('clamps negative values to 00:00', () => {
    expect(formatCountdown(-5)).toBe('00:00');
  });
});

describe('computeRemaining', () => {
  it('subtracts elapsed seconds from total', () => {
    const start = 1_000_000;
    expect(computeRemaining(180, start, start + 65_000)).toBe(115);
  });
  it('never goes below 0', () => {
    const start = 1_000_000;
    expect(computeRemaining(60, start, start + 65_000)).toBe(0);
  });
});

describe('clampMinutesToSeconds', () => {
  it('converts minutes to seconds', () => {
    expect(clampMinutesToSeconds(3)).toBe(180);
  });
  it('returns null for zero or negative input', () => {
    expect(clampMinutesToSeconds(0)).toBeNull();
    expect(clampMinutesToSeconds(-1)).toBeNull();
  });
  it('returns null for non-numeric input', () => {
    expect(clampMinutesToSeconds('abc')).toBeNull();
  });
  it('clamps to a 60-minute ceiling', () => {
    expect(clampMinutesToSeconds(120)).toBe(3600);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- tests/timer.test.js`
Expected: FAIL — `Cannot find module '../js/timer.js'`

- [ ] **Step 3: 구현 작성**

```js
// js/timer.js
export function formatCountdown(remainingSeconds) {
  const clamped = Math.max(0, Math.round(remainingSeconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function computeRemaining(totalSeconds, startedAtMs, nowMs) {
  const elapsed = Math.floor((nowMs - startedAtMs) / 1000);
  return Math.max(0, totalSeconds - elapsed);
}

export function clampMinutesToSeconds(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(Math.min(n, 60) * 60);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ko-KR';
  window.speechSynthesis.speak(utter);
}

export function wireTimerWidget({
  presetButtons, customInput, customSetBtn, displayEl, startBtn, pauseBtn, resetBtn,
}) {
  let totalSeconds = 0;
  let startedAtMs = null;
  let remaining = 0;
  let intervalId = null;

  function render() {
    displayEl.textContent = formatCountdown(remaining);
  }

  function setTotal(seconds) {
    totalSeconds = seconds;
    remaining = seconds;
    startedAtMs = null;
    clearInterval(intervalId);
    intervalId = null;
    render();
  }

  function tick() {
    remaining = computeRemaining(totalSeconds, startedAtMs, Date.now());
    render();
    if (remaining <= 0) {
      clearInterval(intervalId);
      intervalId = null;
      speak('타이머가 끝났습니다.');
      displayEl.classList.add('done');
    }
  }

  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => setTotal(Number(btn.dataset.seconds)));
  });

  customSetBtn.addEventListener('click', () => {
    const seconds = clampMinutesToSeconds(customInput.value);
    if (seconds === null) {
      alert('1~60 사이의 분(숫자)을 입력해주세요.');
      return;
    }
    setTotal(seconds);
  });

  startBtn.addEventListener('click', () => {
    if (totalSeconds <= 0 || intervalId) return;
    displayEl.classList.remove('done');
    startedAtMs = Date.now() - (totalSeconds - remaining) * 1000;
    intervalId = setInterval(tick, 1000);
  });

  pauseBtn.addEventListener('click', () => {
    clearInterval(intervalId);
    intervalId = null;
  });

  resetBtn.addEventListener('click', () => setTotal(totalSeconds));

  render();
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- tests/timer.test.js`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: index.html에 타이머 위젯 마크업 추가**

`<header class="top-clock">` 안, `#clockDate` 바로 뒤에 추가:

```html
      <div id="clockDate"></div>
      <div class="timer-widget">
        <div class="timer-presets">
          <button data-seconds="60">1분</button>
          <button data-seconds="180">3분</button>
          <button data-seconds="300">5분</button>
          <button data-seconds="600">10분</button>
        </div>
        <input id="timerCustomMinutes" type="number" min="1" max="60" placeholder="분">
        <button id="timerCustomSetBtn">설정</button>
        <div id="timerDisplay" class="timer-display">00:00</div>
        <div class="timer-controls">
          <button id="timerStartBtn">시작</button>
          <button id="timerPauseBtn">일시정지</button>
          <button id="timerResetBtn">초기화</button>
        </div>
      </div>
```

(`timer-presets` 안의 4개 버튼은 `document.querySelectorAll('.timer-presets button')`로 한 번에 선택할 수 있도록 별도 id 없이 `data-seconds` 속성만 둔다.)

- [ ] **Step 6: css/app.css에 스타일 추가**

```css
/* css/app.css 끝에 추가 */
.timer-widget {
  margin-top: 10px; display: flex; align-items: center; justify-content: center;
  gap: 8px; flex-wrap: wrap;
}
.timer-presets { display: flex; gap: 6px; }
.timer-widget button {
  padding: 6px 12px; border-radius: 8px; border: none; background: #34495e;
  color: #fff; cursor: pointer; font-size: 0.85rem;
}
#timerCustomMinutes {
  width: 60px; padding: 6px; border-radius: 8px; border: 1px solid #3a4864;
  background: #0e1420; color: #fff;
}
.timer-display {
  font-size: 1.6rem; font-weight: bold; color: #ffcc00; min-width: 80px; text-align: center;
}
.timer-display.done { color: #e74c3c; }
.timer-controls { display: flex; gap: 6px; }
```

- [ ] **Step 7: main.js에 배선 추가**

```js
// js/main.js 끝에 추가
import { wireTimerWidget } from './timer.js';

wireTimerWidget({
  presetButtons: Array.from(document.querySelectorAll('.timer-presets button')),
  customInput: document.getElementById('timerCustomMinutes'),
  customSetBtn: document.getElementById('timerCustomSetBtn'),
  displayEl: document.getElementById('timerDisplay'),
  startBtn: document.getElementById('timerStartBtn'),
  pauseBtn: document.getElementById('timerPauseBtn'),
  resetBtn: document.getElementById('timerResetBtn'),
});
```

- [ ] **Step 8: 브라우저로 확인**

`3분` 프리셋 클릭 → 표시가 `03:00`으로 바뀌는지, `시작` 클릭 후 몇 초 기다렸다가 `일시정지` → 숫자가 멈추는지 → 다시 `시작` → 이어서 줄어드는지 확인. 직접입력에 `1`을 넣고 `설정` → `01:00`으로 바뀌는지 확인. 아주 짧은 시간(예: 프리셋을 임시로 5초로 바꿔 테스트하거나 그냥 1분을 기다려)으로 끝까지 실행해 종료 음성과 빨간색 강조가 나오는지 확인.

- [ ] **Step 9: Commit**

```bash
git add js/timer.js tests/timer.test.js index.html css/app.css js/main.js
git commit -m "feat: add morning-activity countdown timer with presets"
```

---

## Task 15: PC 플로팅 미니 위젯 (`js/floating-widget.js`, 선택 기능)

**Files:**
- Create: `js/floating-widget.js`
- Test: `tests/floating-widget.test.js`
- Modify: `index.html` (툴바에 버튼/안내 문구 추가)
- Modify: `css/app.css` (버튼 비활성 스타일 추가)
- Modify: `js/main.js` (배선 추가)

**Interfaces:**
- Consumes: `#floatingWidgetBtn`, `#floatingWidgetMessage` (index.html), 메인 화면의 실시간 상태(현재 시각 텍스트, 현재 교시 라벨/과목, 타이머 표시 텍스트) — `getContent()` 콜백으로 main.js가 제공.
- Produces: `isDocumentPipSupported(win?: Window): boolean`, `openFloatingWidget({ getContent }): Promise<Window|null>`, `wireFloatingWidgetButton({ buttonEl, messageEl, getContent }): void`.

크롬/엣지 데스크톱에만 있는 `documentPictureInPicture` API를 쓰므로, 실제 플로팅 창 동작 자체는 지원 브라우저로 수동 확인한다. 지원 여부 판별 로직(`isDocumentPipSupported`)만 순수 함수라 단위 테스트한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/floating-widget.test.js
import { describe, it, expect } from 'vitest';
import { isDocumentPipSupported } from '../js/floating-widget.js';

describe('isDocumentPipSupported', () => {
  it('returns true when the API is present on the given window object', () => {
    expect(isDocumentPipSupported({ documentPictureInPicture: {} })).toBe(true);
  });
  it('returns false when the API is missing', () => {
    expect(isDocumentPipSupported({})).toBe(false);
  });
  it('returns false for undefined', () => {
    expect(isDocumentPipSupported(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- tests/floating-widget.test.js`
Expected: FAIL — `Cannot find module '../js/floating-widget.js'`

- [ ] **Step 3: 구현 작성**

```js
// js/floating-widget.js
export function isDocumentPipSupported(win) {
  return typeof win === 'object' && win !== null && 'documentPictureInPicture' in win;
}

export async function openFloatingWidget({ getContent }) {
  if (!isDocumentPipSupported(window)) return null;

  const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 260, height: 160 });

  const style = pipWindow.document.createElement('style');
  style.textContent = `
    body { margin: 0; background: #0e1420; color: #fff; font-family: 'Malgun Gothic', sans-serif;
           display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
    .fw-time { font-size: 2rem; font-weight: bold; }
    .fw-period { color: #ffcc00; margin-top: 6px; font-size: 1rem; }
    .fw-timer { margin-top: 6px; font-size: 1.3rem; }
  `;
  pipWindow.document.head.appendChild(style);

  const root = pipWindow.document.createElement('div');
  root.innerHTML = `
    <div class="fw-time" id="fwTime">00:00:00</div>
    <div class="fw-period" id="fwPeriod"></div>
    <div class="fw-timer" id="fwTimer"></div>
  `;
  pipWindow.document.body.appendChild(root);

  const intervalId = setInterval(() => {
    const content = getContent();
    pipWindow.document.getElementById('fwTime').textContent = content.time;
    pipWindow.document.getElementById('fwPeriod').textContent = content.period;
    pipWindow.document.getElementById('fwTimer').textContent = content.timer;
  }, 1000);

  pipWindow.addEventListener('pagehide', () => clearInterval(intervalId));

  return pipWindow;
}

export function wireFloatingWidgetButton({ buttonEl, messageEl, getContent }) {
  if (!isDocumentPipSupported(window)) {
    buttonEl.disabled = true;
    messageEl.textContent = '이 브라우저는 지원하지 않습니다 (데스크톱 크롬/엣지 최신 버전에서 사용해주세요).';
    return;
  }
  buttonEl.addEventListener('click', () => openFloatingWidget({ getContent }));
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- tests/floating-widget.test.js`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: index.html 툴바에 버튼 추가**

`.toolbar` 안, `#installMessage` 뒤에 추가:

```html
      <button id="floatingWidgetBtn">🪟 PC 플로팅 위젯 열기</button>
      <div id="floatingWidgetMessage" class="install-message"></div>
```

- [ ] **Step 6: css/app.css에 비활성 버튼 스타일 추가**

```css
/* css/app.css 끝에 추가 */
.toolbar button:disabled { background: #333; color: #777; cursor: not-allowed; }
```

- [ ] **Step 7: main.js에 배선 추가**

```js
// js/main.js 끝에 추가
import { wireFloatingWidgetButton } from './floating-widget.js';

wireFloatingWidgetButton({
  buttonEl: document.getElementById('floatingWidgetBtn'),
  messageEl: document.getElementById('floatingWidgetMessage'),
  getContent: () => ({
    time: document.getElementById('clockNow').textContent,
    period: (() => {
      const current = document.querySelector('.timetable-row.current .tt-subject');
      return current ? current.textContent : '';
    })(),
    timer: document.getElementById('timerDisplay').textContent,
  }),
});
```

- [ ] **Step 8: 브라우저로 확인**

데스크톱 크롬/엣지 최신 버전에서 `🪟 PC 플로팅 위젯 열기` 클릭 → 작은 창이 뜨고 다른 창(예: 메모장) 위로 옮겨도 항상 위에 떠 있는지, 시계·현재 교시·타이머가 몇 초 간격으로 갱신되는지 확인. 파이어폭스 등 미지원 브라우저에서는 버튼이 비활성화되고 안내 문구가 보이는지 확인.

- [ ] **Step 9: Commit**

```bash
git add js/floating-widget.js tests/floating-widget.test.js index.html css/app.css js/main.js
git commit -m "feat: add optional PC floating mini widget via Document Picture-in-Picture"
```

---

## 최종 확인 (전체 플로우)

모든 태스크 완료 후:

1. `npm test` — 전체 단위 테스트(Task 2,3,5,6,8,10,12,14,15) PASS 확인.
2. 브라우저에서 `index.html` 열어: 상단 시계/날짜, 오른쪽 시간표(현재 교시 강조), 아침활동 배너(시간 되면 자동 표시·자동 닫힘), 아침활동 타이머(프리셋/직접입력/시작/일시정지/초기화/종료 알림), 알림장(안내문 + 학생 5명 + 하이클래스 복사), 기존 수업종 알리미, PIN 편집, 엑셀 업로드, PWA 설치, PC 플로팅 위젯(지원 브라우저)까지 전부 스펙 9절 순서대로 재확인.
3. `git log --oneline`으로 태스크별 커밋이 순서대로 쌓였는지 확인 후 `git push`는 사용자 확인 후 진행한다(이 플랜은 push를 자동으로 하지 않는다).
