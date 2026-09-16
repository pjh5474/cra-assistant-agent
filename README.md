# CRA Assistant Agent

CRA(Clinical Research Associate)가 임상시험 관련 규정과 가이드라인의 변경사항을 지속적으로 확인하고, 실무에 필요한 내용을 빠르게 파악할 수 있도록 지원하는 AI Agent 프로젝트입니다.

현재 첫 번째 기능으로 **ICH-GCP / MFDS / KoNECT 등 임상시험 관련 기관의 규정·가이드라인 업데이트를 수집하고 CRA 관점에서 정리하는 Weekly Regulatory Briefing**을 구현하고 있습니다.

---

## 1. Project Background

CRA는 임상시험 수행 과정에서 ICH-GCP, 국내 임상시험 관련 법규 및 규제기관 가이드라인을 준수해야 합니다.

하지만 관련 정보는 ICH, 식품의약품안전처(MFDS), KoNECT 등 여러 기관에 분산되어 있으며, 새로운 공지나 가이드라인이 게시되었는지 확인하기 위해 각 사이트를 반복적으로 방문해야 합니다.

또한 모든 업데이트가 CRA 업무와 직접적인 관련이 있는 것은 아니기 때문에 다음과 같은 추가적인 작업이 필요합니다.

- 새롭게 게시된 공지 및 가이드라인 확인
- CRA 업무와 관련된 내용 선별
- 변경사항 및 핵심 내용 파악
- 실제 모니터링 업무에 미치는 영향 검토
- 면접 및 직무 학습에 필요한 내용 별도 정리

이 프로젝트는 이러한 반복적인 규제 정보 탐색 및 정리 과정을 자동화하는 것을 목표로 합니다.

---

## 2. Current Goal

### Weekly Regulatory Briefing

매주 임상시험 관련 공식 기관의 업데이트를 확인하고 CRA 업무와 관련된 변경사항을 정리한 Weekly Briefing을 생성합니다.

**실행 주기**

매주 금요일 저녁

**대상 Source**

- ICH
- MFDS (식품의약품안전처)
- KoNECT (국가임상시험지원재단)
- 기타 임상시험 관련 공식 기관 및 규제 정보 Source

향후 필요한 경우 규제기관 및 관련 기관을 추가할 예정입니다.

---

## 3. Workflow

Weekly Regulatory Briefing은 다음 과정을 통해 생성됩니다.

### Step 1. Regulatory Update Collection

ICH, MFDS, KoNECT 등 공식 Source에서 해당 주에 새롭게 게시되거나 변경된 정보를 수집합니다.

수집 대상 예시는 다음과 같습니다.

- Guideline
- Regulation
- Guidance
- Notice
- 교육 및 제도 변경 공지
- 임상시험 관련 행정 안내

---

### Step 2. CRA Relevance Filtering

수집된 정보 중 CRA 업무와 직접적인 관련성이 있는 내용을 선별합니다.

예를 들어 다음과 같은 내용이 주요 대상입니다.

- 임상시험 수행 및 관리 기준
- 시험대상자 보호
- IRB 관련 절차
- Safety Reporting
- Monitoring
- Essential Documents
- Investigational Medicinal Product 관리
- Protocol Compliance
- Clinical Trial Data Integrity

단순 행사 안내나 CRA 업무와 직접적인 관련성이 낮은 정보는 제외합니다.

---

### Step 3. CRA Domain Classification

선별된 내용을 CRA 업무 영역에 따라 분류합니다.

주요 Category:

- `IRB`
- `Safety`
- `Monitoring`
- `Essential Documents`
- `IMP`
- `Protocol / GCP Compliance`
- `Data Integrity`
- `Other`

하나의 업데이트가 여러 업무 영역과 관련된 경우 복수 Category로 분류할 수 있습니다.

---

### Step 4. Change & Impact Analysis

각 업데이트에 대해 단순한 내용 요약뿐만 아니라 CRA 관점에서 의미를 분석합니다.

각 Item은 다음과 같은 정보를 포함하도록 설계합니다.

```text
Title

Source
ICH / MFDS / KoNECT / etc.

Category
Monitoring / Safety / IRB / ...

Published Date

Summary
변경 또는 발표된 내용 요약

What Changed
기존 내용과 비교했을 때 중요한 변경점

CRA Impact
CRA 업무에 실제로 어떤 영향을 줄 수 있는지

Interview Point
CRA 면접 또는 직무 학습 과정에서 알아둘 내용

Priority
High / Medium / Low
```

---

## 4. Example Output

```markdown
## Weekly CRA Regulatory Briefing

Period: 2026-09-07 ~ 2026-09-13

### Monitoring

#### Example Guideline Update

Source: MFDS

Priority: High

Summary:
임상시험 모니터링 관련 가이드라인의 일부 내용이 개정되었습니다.

What Changed:
Risk-based monitoring과 관련된 고려사항이 구체화되었습니다.

CRA Impact:
CRA는 모든 데이터를 동일한 수준으로 확인하는 방식보다
시험의 주요 위험요소와 critical data를 중심으로 한 monitoring strategy를
이해할 필요가 있습니다.

Interview Point:
ICH E6(R3)의 risk-proportionate approach와 연결하여 설명할 수 있습니다.
```

---

## 5. Why This Project?

### 1. Reduce Repetitive Regulatory Monitoring

임상시험 관련 정보는 여러 기관에 분산되어 있기 때문에 새로운 공지나 변경사항이 있는지 확인하기 위해 반복적으로 각 사이트에 접속해야 합니다.

Agent를 통해 이러한 탐색 과정을 자동화하여 불필요한 반복 작업을 줄이고자 합니다.

### 2. Reduce the Risk of Missing Important Updates

CRA 업무에서는 최신 규정과 가이드라인을 지속적으로 확인하는 것이 중요합니다.

정기적으로 공식 Source를 확인하고 변경사항을 수집함으로써 중요한 업데이트를 놓칠 가능성을 줄이는 것을 목표로 합니다.

### 3. Continuous CRA Learning

단순히 규정 업데이트를 수집하는 것에서 끝나는 것이 아니라,

> "이 변경사항이 실제 CRA 업무에서 어떤 의미를 가지는가?"

를 중심으로 정보를 재구성합니다.

이를 통해 규제 정보 탐색과 직무 학습을 하나의 Workflow로 연결하고자 합니다.

---

## 6. Design Principles

### Official Source First

규정 및 가이드라인과 관련된 정보는 가능한 한 공식 Source를 기준으로 수집합니다.

AI가 생성한 설명은 원문을 대체하지 않으며, 사용자가 원문을 직접 확인할 수 있도록 Source 정보를 함께 제공합니다.

### CRA-oriented Analysis

일반적인 규정 요약이 아니라 CRA의 실제 업무 영역을 기준으로 정보를 분류하고 분석합니다.

### Traceability

각 요약 결과가 어떤 Source에서 생성되었는지 추적할 수 있도록 원본 문서 또는 공지 정보를 함께 관리하는 것을 목표로 합니다.

### Human-in-the-loop

AI가 Regulatory Interpretation의 최종 판단자가 되는 것을 목표로 하지 않습니다.

Agent는 정보 탐색과 초기 분석을 지원하며, 중요한 규정 적용 여부와 실제 임상시험 운영 판단은 원문 및 관련 SOP를 기반으로 사용자가 최종 확인하는 것을 전제로 합니다.

---

## 7. Future Roadmap

### Phase 1 — Weekly Regulatory Briefing

현재 구현 목표

- [ ] ICH 업데이트 수집
- [ ] MFDS 업데이트 수집
- [ ] KoNECT 업데이트 수집
- [ ] CRA 관련 정보 필터링
- [ ] CRA 업무 영역 자동 분류
- [ ] 변경사항 요약
- [ ] 실무 영향도 분석
- [ ] Interview Point 생성
- [ ] Weekly Briefing 생성
- [ ] Scheduled Workflow 구성

---

### Phase 2 — Regulatory Document Version Tracking

동일한 규정 또는 가이드라인의 이전 버전과 최신 버전을 비교하여 변경사항을 자동으로 분석합니다.

예:

```text
ICH E6(R2)
        ↓
ICH E6(R3)
```

분석 대상:

- 새롭게 추가된 내용
- 삭제된 내용
- 표현이 변경된 내용
- CRA 업무에 영향을 줄 가능성이 높은 변경사항

Output 예시:

```text
Previous Version
        ↓
Document Diff
        ↓
Changed Sections
        ↓
CRA Impact Analysis
        ↓
Important Points
```

---

### Phase 3 — User Document Comparison

사용자가 직접 규정 또는 가이드라인 문서를 업로드하면 서로 다른 버전을 비교합니다.

예:

```text
guideline_v1.pdf
guideline_v2.pdf
```

Agent는 다음 내용을 분석합니다.

- Added
- Removed
- Modified
- Terminology Change
- Responsibility Change
- Process Change

그리고 변경사항을 CRA 관점에서 다시 분류합니다.

```text
Change Detected

Category: Essential Documents
Risk: High

Previous:
...

Current:
...

CRA Impact:
...

What to Check:
...
```

---

### Phase 4 — CRA Regulatory Knowledge Base

수집된 규정 업데이트와 문서 변경 이력을 누적하여 검색 가능한 CRA Regulatory Knowledge Base로 확장할 예정입니다.

예:

```text
"What changed in monitoring requirements recently?"

"What are the major changes from ICH E6(R2) to E6(R3)?"

"Show recent MFDS updates related to informed consent."

"What regulatory changes should a CRA know this month?"
```

Agent가 저장된 Regulatory History와 공식 Source를 기반으로 답변할 수 있도록 확장하는 것이 최종 목표입니다.

---

## 8. Planned Architecture

```text
Official Regulatory Sources
        │
        ▼
Update Collector
        │
        ▼
CRA Relevance Filter
        │
        ▼
Domain Classifier
        │
        ├── IRB
        ├── Safety
        ├── Monitoring
        ├── Essential Documents
        ├── IMP
        └── GCP / Protocol
        │
        ▼
Change & Impact Analyzer
        │
        ▼
Weekly Regulatory Briefing
        │
        ▼
Regulatory Knowledge Base
```

향후 Document Version Tracking 기능이 추가되면 다음 Pipeline이 추가됩니다.

```text
Document V1 ─┐
             ├── Document Parser
Document V2 ─┘
                  │
                  ▼
              Diff Engine
                  │
                  ▼
          Regulatory Change
              Analyzer
                  │
                  ▼
           CRA Impact Report
```

---

## 9. Disclaimer

This project is intended for educational and workflow-assistance purposes.

Generated summaries and analyses do not constitute regulatory, legal, or medical advice.

For actual clinical trial activities, users should verify information against the latest official regulations, guidelines, approved protocol, applicable SOPs, and relevant regulatory authority requirements.
