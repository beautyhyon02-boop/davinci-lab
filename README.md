# 다빈치랩 (DaVinci LaB) — 프로젝트 README

> **v21 · 업데이트: 2026-03-24**

---

## 🎯 프로젝트 목표

학원 전용 통합 학습 관리 플랫폼.  
학생 · 관리자(선생님) · 학부모 3개 역할로 로그인 후 각자의 맞춤 대시보드를 제공합니다.

---

## ✅ 완료된 기능

| # | 기능 | 경로 |
|---|------|------|
| 1 | 로그인 시스템 (admin 5명·학생 50명·학부모 50명, DB 기반) | `/login.html` |
| 2 | REST API 기반 학생 데이터 저장/조회 | DB 테이블: `student_profiles` |
| 3 | 학생 생활기록부 9개 탭 + 관리자 뷰 | `student/record.html`, `admin/record.html` |
| 4 | 시험 플래너 (D-day 자동 생성, 4주 계획) | `student/exam.html`, `admin/exam.html`, `parent/exam.html` |
| 5 | 📖 문제집명·페이지 학생 직접 입력 (인라인 + 날짜별 패널) | `student/exam.html` |
| 6 | 공지/알림 시스템 (카테고리·고정·중요) | `admin/notice.html`, `student/notice.html`, `parent/notice.html` |
| 7 | 학부모 계정 50명 + 자녀 연결 | DB 테이블: `parent_profiles` |
| 8 | 모바일 PWA (하단 네비, 홈 화면 설치, 오프라인 캐시) | `manifest.json`, `sw.js`, `css/mobile.css` |
| 9 | 상담관리 시스템 (일정·이력·신청·확정·거절) | `admin/consult.html`, `student/consult.html`, `parent/consult.html` |
| 10 | ✅ 출결 DB 연동 (관리자 입력·일괄 등록·월간 캘린더, 학생 열람) | `admin/attendance.html`, `student/attendance.html` |
| 11 | ✅ 수행평가 완전 리뉴얼 – 학생이 공지 등록(이미지 선택사항) → 관리자 전체 동시 확인(admin_id 필터 없음) → 피드백 → 반복 상호작용 → 최종 확정, 30초 폴링 실시간 알림 | `admin/assessment.html`, `student/assessment.html`, `js/assessment.js` |
| 12 | ✅ 관리자 대시보드 실시간 통계 (출결·수행평가·상담 DB 연동) | `admin/dashboard.html` |
| 13 | ✅ 학부모 수행평가 열람 (D-day·피드백·상태 표시) | `parent/assessment.html` |
| 14 | ✅ 학생 대시보드 실시간 통계 (출결·플래너·수행평가·공지 DB 연동) | `student/dashboard.html` |
| 15 | ✅ 성적 관리 DB 연동 (관리자 학생 목록·내신·모의고사 DB 조회) | `admin/grades.html` |
| 16 | ✅ 중학교 성적 5등급제 전환 (A~E, 90/80/70/60/미만) | 전체 grades 파일 |
| 17 | ✅ 학부모 대시보드 DB 연동 (자녀 수행평가·출결·플랜·공지 실시간) | `parent/dashboard.html` |
| 18 | ✅ 관리자 성적 직접 입력 UI (드로어 내신/모의고사 추가·삭제) | `admin/grades.html` |
| 19 | ✅ 학부모 출결 현황 DB 연동 (월간 캘린더·요약·목록 실시간) | `parent/attendance.html` |
| 20 | ✅ 학부모 학습 플랜 열람 신규 (플래너 선택·KPI·달력·목록 뷰) | `parent/learning.html` |
| 21 | ✅ 성적 인라인 편집 (드로어 행에서 직접 수정·PATCH API 저장) | `admin/grades.html` |
| 22 | ✅ 성적 추이 차트 실데이터 연동 (학기별·모의고사 DB 기반 차트) | `admin/grades.html` |
| 23 | ✅ **학부모 성적 확인 DB 연동** (자녀 내신·모의고사·추이 차트 실데이터) | `parent/grades.html` |
| 24 | ✅ **관리자 플래너 코멘트 입력 UI** (선생님 코멘트 → 학생 화면에 표시) | `admin/exam.html` |
| 25 | ✅ **졸업생/비활성화 아카이브** (학생 목록에서 제외·복원·목록 표시) | `admin/students.html` |

---

## 📊 v21 수행평가 핵심 수정 내용

### 🔴 문제 원인 분석 및 해결

| 문제 | 원인 | 해결 |
|------|------|------|
| 학생 제출 → admin 미표시 | `js/assessment.js`가 `</body>` 이전 로드 시 `DOMContentLoaded` 이미 발생해 핸들러 미실행 | `document.readyState` 체크 패턴으로 전환 (`defer` 속성 + 즉시 실행 fallback) |
| admin fetch 경로 오류 | `tables/assessments` → `admin/tables/...`로 잘못 해석 | `../tables/...` 상대경로로 통일 (admin 페이지 URL 기준 올바름) |
| 이미지 필수 조건 | 이미지 없으면 제출 불가 → 학생이 제출 못함 | 이미지를 선택 사항으로 변경 |
| 관리자 동시 알림 | `admin_id` 기반 필터로 특정 관리자만 조회 | 필터 제거 → 전체 assessments 조회로 모든 관리자 동시 확인 |
| 대시보드 실시간 알림 없음 | `js/admin.js`에 폴링 없음 | 30초 폴링 + Web Notification API 추가 |

### ✅ 수정된 파일
- `js/assessment.js` (v5) — 전체 재작성
- `admin/assessment.html` — `defer` 속성 추가
- `student/assessment.html` — 이미지 필수 → 선택으로 변경
- `js/admin.js` — 30초 폴링 + 브라우저 알림 추가

### 📱 관리자 실시간 알림 동작 방식
1. 학생이 수행평가 공지 등록 → DB에 `unread_admin: true` 저장
2. **admin 대시보드** (`js/admin.js`): 30초마다 DB 조회 → 새 `unread_admin` 감지 시 인앱 토스트 + 브라우저 알림 + 알림음
3. **admin 수행평가 관리** (`js/assessment.js`): 30초마다 DB 조회 → 신규 제출/재제출 감지 시 동일 알림 발송
4. **모든 관리자 계정**에서 동일 DB를 조회하므로 어느 계정으로 로그인해도 동시에 확인 가능

> ⚠️ 스마트폰 앱 연동 Push 알림은 서버 측 VAPID 키 및 Service Worker Push API가 필요하여 순수 정적 사이트에서 구현 불가. 대신 PWA + 브라우저 알림(Web Notification API) + 30초 폴링으로 최대한 유사하게 구현됨. 알림을 받으려면 브라우저 알림 권한을 허용해야 함.

## 📊 v19 신규 기능 상세

### ① 학부모 성적 확인 DB 연동 (`parent/grades.html`)
| 항목 | 상세 |
|------|------|
| **자녀 탭** | `parent_profiles` → `child_ids` 기반 자녀 전환 (동적 생성) |
| **성적 불러오기** | `grades_school` + `grades_mock` DB에서 자녀 성적 일괄 로드 |
| **학년도 드롭다운** | DB에 존재하는 연도 자동 생성 |
| **내신 추이 차트** | 학기별 그룹핑 → grade9(1~9등급) / grade5·Mid(A~E 수치변환) |
| **Y축 레이블** | 등급제에 따라 `1~9등급` / `A~E` 자동 전환 |
| **모의고사 추이** | 날짜순 정렬 · 탐구 데이터 있을 때만 라인 추가 |
| **빈 데이터** | Canvas에 "데이터 없음" 안내 메시지 표시 |

### ② 관리자 플래너 코멘트 (`admin/exam.html`)
| 항목 | 상세 |
|------|------|
| **코멘트 입력** | 드로어 할일 행마다 선생님 코멘트 입력 필드 |
| **저장** | 플래너 저장 시 `admin_comment` 필드 DB 반영 |
| **학생 확인** | `student/exam.html`에서 코멘트 읽기 전용 표시 |
| **학생 메모** | `student_memo` 필드 관리자 드로어에서 읽기 전용 표시 |

### ③ 졸업생/비활성화 아카이브 (`admin/students.html`)
| 항목 | 상세 |
|------|------|
| **졸업/비활성화 버튼** | 학생 상세 모달 하단에 "졸업/비활성화" 버튼 추가 |
| **status 업데이트** | PATCH API → `status: '졸업'` 업데이트 |
| **활성 목록 제외** | 졸업/비활성 학생은 활성 학생 목록에서 자동 제외 |
| **아카이브 목록 보기** | 학생 목록 하단 "졸업/비활성 학생 보기" 토글 버튼 |
| **복원** | 아카이브 목록에서 "복원" 버튼 클릭 → `status: '재원'`으로 전환 |

---

## 🗂 주요 URL

### 공통
| 경로 | 설명 |
|------|------|
| `/login.html` | 로그인 (admin/student/parent 통합) |
| `/index.html` | 서비스 소개 메인 |

### 관리자 (admin/)
| 경로 | 설명 |
|------|------|
| `admin/dashboard.html` | 관리자 대시보드 (DB 실시간 통계) |
| `admin/students.html` | 학생 관리 **(졸업생 아카이브 v19)** |
| `admin/attendance.html` | 출결 관리 (DB 연동) |
| `admin/assessment.html` | 수행평가 관리 (DB 연동) |
| `admin/grades.html` | 성적 조회·입력·편집·차트 |
| `admin/record.html` | 학생부 열람 |
| `admin/exam.html` | 시험 플래너 관리 **(코멘트 입력 v19)** |
| `admin/report.html` | 학생 종합 리포트 (출결·성적·수행평가·플랜 DB 연동) |
| `admin/notice.html` | 공지/알림 관리 |
| `admin/consult.html` | 상담 관리 |
| `admin/parents.html` | 학부모 계정 관리 |

### 학생 (student/)
| 경로 | 설명 |
|------|------|
| `student/dashboard.html` | 학생 대시보드 (DB 실시간 통계) |
| `student/attendance.html` | 출결 현황 (DB 연동) |
| `student/assessment.html` | 수행평가 목록·피드백 열람 (DB 연동) |
| `student/exam.html` | 시험 플래너 + 문제집명·페이지 입력 |
| `student/grades.html` | 성적 관리 (DB 연동, 5등급제 A~E) |
| `student/record.html` | 학생부 관리 |
| `student/notice.html` | 공지사항 |
| `student/consult.html` | 상담 신청 · 이력 열람 |

### 학부모 (parent/)
| 경로 | 설명 |
|------|------|
| `parent/dashboard.html` | 학부모 대시보드 (DB 연동) |
| `parent/attendance.html` | 자녀 출결 현황 (DB 연동) |
| `parent/learning.html` | 자녀 학습 플랜 열람 (DB 연동) |
| `parent/exam.html` | 자녀 시험 플래너 열람 |
| `parent/assessment.html` | 자녀 수행평가 열람 (DB 연동) |
| `parent/grades.html` | **자녀 성적 확인 (DB 연동·추이 차트 v19)** |
| `parent/notice.html` | 공지사항 열람 |
| `parent/consult.html` | 상담 신청 · 이력 열람 |

---

## 🗃 데이터 모델

| 테이블 | 설명 |
|--------|------|
| `student_profiles` | 학생 기본 정보 (50명, status 필드로 졸업/비활성 관리) |
| `parent_profiles` | 학부모 정보 + 자녀 연결 (50명) |
| `student_records` | 학생부 섹션별 기록 |
| `grades_school` | 내신 성적 — 연도·학기·교과·단위·점수·등급 |
| `grades_mock` | 모의고사 성적 — 국/수/영/탐구 점수+백분위 |
| `attendance` | 출결 기록 (날짜·상태·입퇴원시간·메모) |
| `assessments` | 수행평가 (과목·유형·마감일·피드백·상태·이력) |
| `exam_planners` | 시험 플래너 메타 (시험일·범위·과목·학기) |
| `planner_tasks` | 플래너 일별 과제 (subject·task_content·is_done·student_memo·admin_comment) |
| `exam_schedules` | 시험 일정 |
| `notices` | 공지사항 |
| `notice_reads` | 공지 읽음 기록 |
| `consultations` | 상담 이력 |
| `consult_requests` | 상담 신청 |

---

## 🔐 테스트 계정

| 역할 | ID | 비밀번호 |
|------|-----|---------|
| 관리자 | admin ~ admin5 | dvlAdmin! |
| 학생 | s001 ~ s050 | dvl2024! |
| 학부모 | parent-01 ~ parent-50 | dvlParent! |

---

## ⏳ 미구현 / 다음 단계

| 우선순위 | 항목 |
|---------|------|
| 🟢 낮음 | 실시간 알림 (푸시 알림) |
| 🟢 낮음 | 학생부 PDF 출력 기능 |

---

## 🚀 배포

Publish 탭 → 게시하기 버튼으로 배포.

---

## ✅ 완료된 기능

| # | 기능 | 경로 |
|---|------|------|
| 1 | 로그인 시스템 (admin 5명·학생 50명·학부모 50명, DB 기반) | `/login.html` |
| 2 | REST API 기반 학생 데이터 저장/조회 | DB 테이블: `student_profiles` |
| 3 | 학생 생활기록부 9개 탭 + 관리자 뷰 | `student/record.html`, `admin/record.html` |
| 4 | 시험 플래너 (D-day 자동 생성, 4주 계획) | `student/exam.html`, `admin/exam.html`, `parent/exam.html` |
| 5 | 📖 문제집명·페이지 학생 직접 입력 (인라인 + 날짜별 패널) | `student/exam.html` |
| 6 | 공지/알림 시스템 (카테고리·고정·중요) | `admin/notice.html`, `student/notice.html`, `parent/notice.html` |
| 7 | 학부모 계정 50명 + 자녀 연결 | DB 테이블: `parent_profiles` |
| 8 | 모바일 PWA (하단 네비, 홈 화면 설치, 오프라인 캐시) | `manifest.json`, `sw.js`, `css/mobile.css` |
| 9 | 상담관리 시스템 (일정·이력·신청·확정·거절) | `admin/consult.html`, `student/consult.html`, `parent/consult.html` |
| 10 | ✅ 출결 DB 연동 (관리자 입력·일괄 등록·월간 캘린더, 학생 열람) | `admin/attendance.html`, `student/attendance.html`, `js/attendance.js` |
| 11 | ✅ 수행평가 DB 연동 (관리자 등록·피드백·상태관리, 학생 열람·메모) | `admin/assessment.html`, `student/assessment.html`, `js/assessment.js` |
| 12 | ✅ **관리자 대시보드 실시간 통계** (출결·수행평가·상담 DB 연동) | `admin/dashboard.html`, `js/admin.js` |
| 13 | ✅ **학부모 수행평가 열람 페이지 신규** (D-day·피드백·상태 표시) | `parent/assessment.html` |
| 14 | ✅ **학생 대시보드 실시간 통계** (출결·플래너·수행평가·공지 DB 연동) | `student/dashboard.html`, `js/student-dashboard.js` |
| 15 | ✅ **성적 관리 DB 연동** (관리자 학생 목록·내신·모의고사 DB 조회) | `admin/grades.html` |
| 16 | ✅ **중학교 성적 5등급제 전환** (A~E, 90/80/70/60/미만) | 전체 grades 파일 |
| 17 | ✅ **학부모 대시보드 DB 연동** (자녀 수행평가·출결·플랜·공지 실시간) | `parent/dashboard.html` |
| 18 | ✅ **관리자 성적 직접 입력 UI** (드로어 내신/모의고사 추가·삭제) | `admin/grades.html` |
| 19 | ✅ **학부모 출결 현황 DB 연동** (월간 캘린더·요약·목록 실시간) | `parent/attendance.html` |

---

## 📊 v17 신규 기능 상세

### ① 중학교 성적 5등급제 전환
| 항목 | 상세 |
|------|------|
| **등급 체계** | A(90↑) B(80~89) C(70~79) D(60~69) E(60미만) |
| **수정 파일** | `admin/grades.html`, `student/grades.html`, `parent/grades.html` |
| **CSS 추가** | `.rank-Dmid` (회색), `.rank-Emid` (빨강) 클래스 추가 |
| **calcAvgRank** | gradeMid 분기 A~E 5등급 카운팅으로 수정 |
| **updateSummary** | student/grades.html 내 중학교 집계 5등급 대응 |

### ② 학부모 대시보드 DB 연동 (`parent/dashboard.html`)
| 항목 | 상세 |
|------|------|
| **자녀 목록** | `parent_profiles` → `child_ids` 파싱 후 `student_profiles` 매칭 |
| **수행평가 현황** | `assessments` 테이블에서 자녀별 필터·긴급/D-day 자동 계산 |
| **출결 현황** | `attendance` 이번 달 데이터 출석률·결석·지각 집계 |
| **학습 플랜** | `planner_tasks` 이번 주 완료율 자동 계산 |
| **공지사항** | `notices` 최신 3건 표시 |

### ③ 관리자 성적 직접 입력 UI (`admin/grades.html`)
| 항목 | 상세 |
|------|------|
| **드로어 내신 탭** | 연도/학기 필터 셀렉트 추가 (전체·2023~2025, 1/2학기) |
| **내신 추가 폼** | 연도·학기·교과·과목·단위·원점수·평균·성취도율·등급 입력 |
| **내신 삭제** | 각 행에 🗑 삭제 버튼 → DELETE API 호출 후 캐시 갱신 |
| **모의고사 추가** | 시험구분·날짜·국/수/영/탐구 점수+백분위 입력 |
| **모의고사 삭제** | 카드 상단 삭제 버튼 → DELETE API 호출 |
| **토스트 알림** | 저장/삭제 완료 시 하단 우측에 초록 토스트 표시 |
| **성적 건수 표시** | 필터 기준 총 N개 과목 실시간 표시 |

### ④ 학부모 출결 현황 DB 연동 (`parent/attendance.html`)
| 항목 | 상세 |
|------|------|
| **자녀 탭** | `parent_profiles` → `child_ids` 기반 자녀 탭 동적 생성 |
| **출결 로드** | `attendance` 테이블에서 자녀별 데이터 필터 |
| **요약 4종** | 출석·결석·지각·조퇴 이번 달 집계 |
| **출석률 바** | 퍼센트 바 + 코멘트 자동 생성 |
| **월 캘린더** | 날짜별 상태 색상 표시 (초록/노랑/빨강/보라) |
| **상세 목록** | 날짜·상태 배지·메모·입퇴원 시간 목록 |

---

## 🗂 주요 URL

### 공통
| 경로 | 설명 |
|------|------|
| `/login.html` | 로그인 (admin/student/parent 통합) |
| `/index.html` | 서비스 소개 메인 |

### 관리자 (admin/)
| 경로 | 설명 |
|------|------|
| `admin/dashboard.html` | **관리자 대시보드 (DB 실시간 통계)** |
| `admin/students.html` | 학생 관리 |
| `admin/attendance.html` | 출결 관리 (DB 연동) |
| `admin/assessment.html` | 수행평가 관리 (DB 연동) |
| `admin/grades.html` | **성적 조회·직접 입력 (DB 연동, v17 강화)** |
| `admin/record.html` | 학생부 열람 |
| `admin/exam.html` | 시험 플래너 관리 |
| `admin/notice.html` | 공지/알림 관리 |
| `admin/consult.html` | 상담 관리 |
| `admin/parents.html` | 학부모 계정 관리 |

### 학생 (student/)
| 경로 | 설명 |
|------|------|
| `student/dashboard.html` | **학생 대시보드 (DB 실시간 통계)** |
| `student/attendance.html` | 출결 현황 (DB 연동) |
| `student/assessment.html` | 수행평가 목록·피드백 열람 (DB 연동) |
| `student/exam.html` | 시험 플래너 + 문제집명·페이지 입력 |
| `student/grades.html` | 성적 관리 (DB 연동, 5등급제 A~E) |
| `student/record.html` | 학생부 관리 |
| `student/notice.html` | 공지사항 |
| `student/consult.html` | 상담 신청 · 이력 열람 |

### 학부모 (parent/)
| 경로 | 설명 |
|------|------|
| `parent/dashboard.html` | **학부모 대시보드 (DB 연동, v17 신규)** |
| `parent/attendance.html` | **자녀 출결 현황 (DB 연동, v17 신규)** |
| `parent/exam.html` | 자녀 시험 플래너 열람 |
| `parent/assessment.html` | **자녀 수행평가 열람 (DB 연동)** |
| `parent/grades.html` | 자녀 성적 확인 (5등급제 A~E) |
| `parent/notice.html` | 공지사항 열람 |
| `parent/consult.html` | 상담 신청 · 이력 열람 |

---

## 🗃 데이터 모델

| 테이블 | 설명 |
|--------|------|
| `student_profiles` | 학생 기본 정보 (50명) |
| `parent_profiles` | 학부모 정보 + 자녀 연결 (50명) |
| `student_records` | 학생부 섹션별 기록 |
| `student_grades` | 학교 성적 |
| `grades_school` | 학교 시험 성적 (내신) — 연도·학기·등급 포함 |
| `grades_mock` | 모의고사 성적 — 국/수/영/탐구 점수+백분위 |
| `attendance` | 출결 기록 (날짜·상태·입퇴원시간·메모) |
| `assessments` | 수행평가 (과목·유형·마감일·피드백·상태·이력) |
| `exam_planners` | 시험 플래너 |
| `planner_tasks` | 플래너 일별 과제 (`student_memo`: `문제집명\|페이지`) |
| `exam_schedules` | 시험 일정 |
| `notices` | 공지사항 |
| `notice_reads` | 공지 읽음 기록 |
| `consultations` | 상담 이력 |
| `consult_requests` | 상담 신청 |

---

## 🔐 테스트 계정

| 역할 | ID | 비밀번호 |
|------|-----|---------|
| 관리자 | admin ~ admin5 | dvlAdmin! |
| 학생 | s001 ~ s050 | dvl2024! |
| 학부모 | parent-01 ~ parent-50 | dvlParent! |

---

## ⏳ 미구현 / 다음 단계

| 우선순위 | 항목 |
|---------|------|
| 🟡 중간 | 학부모 학습 플랜 열람 페이지 (`parent/learning.html`) DB 연동 |
| 🟡 중간 | 관리자 성적 수정 기능 (입력된 성적 인라인 편집) |
| 🟢 낮음 | 졸업생 아카이브 기능 |
| 🟢 낮음 | 실시간 알림 (푸시 알림) |
| 🟢 낮음 | 관리자 성적 추이 차트 실데이터 연동 (현재 샘플 데이터 사용) |

---

## 🚀 배포

Publish 탭 → 게시하기 버튼으로 배포.
