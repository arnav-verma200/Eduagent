# PROJECT DOCUMENTATION — EDUAGENT PLATFORM

This document provides a comprehensive, professional-grade technical analysis of the **EduAgent** repository. It maps the overall architecture, directory structure, individual file responsibilities, schemas, APIs, execution pathways, security aspects, code quality status, and offers a developer onboarding guide.

---

## PHASE 1 — REPOSITORY DISCOVERY

The repository structure represents a complete full-stack web application consisting of a FastAPI Python backend and a React Vite frontend. The persistence layer interacts with a Supabase PostgreSQL instance.

### 1. Complete Folder Hierarchy
```
Eduagent/
├── .env
├── .env.example
├── .gitignore
├── README.md
├── problems.txt
├── requirements.txt
├── schema.sql
├── test_agents.py
├── backend/
│   ├── main.py
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── adversarial.py
│   │   ├── evaluator.py
│   │   ├── exam_designer.py
│   │   ├── integrity.py
│   │   └── socratic.py
│   ├── db/
│   │   ├── __init__.py
│   │   └── supabase_client.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── exams.py
│   │   ├── reports.py
│   │   └── students.py
│   └── utils/
│       ├── __init__.py
│       ├── gemini.py
│       └── pdf_parser.py
└── frontend/
    ├── .gitignore
    ├── .oxlintrc.json
    ├── README.md
    ├── index.html
    ├── package-lock.json
    ├── package.json
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── vite.config.js
    ├── public/
    │   ├── favicon.svg
    │   └── icons.svg
    └── src/
        ├── App.css
        ├── App.jsx
        ├── config.js
        ├── index.css
        ├── main.jsx
        ├── assets/
        │   ├── hero.png
        │   ├── react.svg
        │   └── vite.svg
        ├── components/
        │   ├── ConfidenceSlider.jsx
        │   ├── Modal.jsx
        │   └── Scratchpad.jsx
        └── pages/
            ├── ExamInterface.jsx
            ├── ReportCard.jsx
            ├── SocraticDebate.jsx
            └── TeacherDashboard.jsx
```

### 2. File Inventory By Role

| File Classification | Filenames / Relative Paths |
|---|---|
| **Entry Points** | Backend: [backend/main.py](file:///e:/Eduagent/backend/main.py) <br> Frontend: [frontend/src/main.jsx](file:///e:/Eduagent/frontend/src/main.jsx) |
| **Configuration Files** | [frontend/vite.config.js](file:///e:/Eduagent/frontend/vite.config.js), [frontend/tailwind.config.js](file:///e:/Eduagent/frontend/tailwind.config.js), [frontend/postcss.config.js](file:///e:/Eduagent/frontend/postcss.config.js), [frontend/.oxlintrc.json](file:///e:/Eduagent/frontend/.oxlintrc.json) |
| **Database Files** | [schema.sql](file:///e:/Eduagent/schema.sql) (PostgreSQL script for table creation and indices) |
| **Environment Files** | [.env.example](file:///e:/Eduagent/.env.example) (Backend template), [.env](file:///e:/Eduagent/.env) (Local runtime values) |
| **Build & Dependencies** | [requirements.txt](file:///e:/Eduagent/requirements.txt) (Python dependencies), [frontend/package.json](file:///e:/Eduagent/frontend/package.json) (Node dependencies) |
| **Test Verification** | [test_agents.py](file:///e:/Eduagent/test_agents.py) (Offline and online endpoint tests) |

---

## PHASE 2 — ARCHITECTURE RECONSTRUCTION

### 1. Project Purpose & Scope
EduAgent addresses the constraints of simple score-based grading by designing and executing tests that diagnose the *underlying cognitive state* of the student. Instead of simple pass/fail responses, it targets:
- Flawed mental models (*Conceptual Gaps*).
- Mechanical typos or slips (*Procedural Errors*).
- High confidence coupled with flawed reasoning (*Blind Spots*).
- Correct guessing with lack of surety (*Miscalibration*).

It achieves this through a structured multi-agent workflow coordinated by FastAPI, leveraging Google GenAI LLMs (Gemma/Gemini models) and Supabase storage.

### 2. Multi-Agent Pipeline Overview
The system relies on four primary agents and one interactive dialogue loop:
1. **Agent 1: Exam Designer**: Generates dynamic syllabus exams from uploaded PDFs, complying with specific difficulty and type constraints.
2. **Agent 2: Cognitive Evaluator**: Assesses text answers, matching them against expected solutions, checking student confidence, timing, and reasoning.
3. **Agent 3: Adversarial Probe**: Generates three targeted follow-up questions targeting identified gaps to check if they are shallow or deep.
4. **Agent 4: Integrity Analyzer**: Audits telemetry signals (tab-switches, copy-paste block triggers, instant correct submissions) for anomaly mapping.
5. **Interactive Socratic Examiner**: A specialized agent that conducts an interactive turn-limited Socratic debate with students who disagree with initial assessment marks.

### 3. Core Business Logic Data Flow
```mermaid
graph TD
    Teacher[Teacher Client] -->|Upload PDF + Topic| API_Gen[POST /api/exams/generate]
    API_Gen -->|Agent 1| DB_Exams[(Supabase: exams)]
    
    Student[Student Client] -->|Take Exam| API_Submit[POST /api/exams/{id}/submit]
    API_Submit -->|Agent 2: Eval| CogProfile[Cognitive Evaluation]
    
    CogProfile -->|Parallel execution| Agent3[Agent 3: Adversarial Probe]
    CogProfile -->|Parallel execution| Agent4[Agent 4: Integrity Analyzer]
    
    Agent3 -->|Probe Questions| DB_Results[(Supabase: results)]
    Agent4 -->|Integrity Flags + Score| DB_Results
    
    Student -->|Submit Probe Answers| API_Probe[POST /api/exams/{id}/probe/submit]
    API_Probe -->|Agent 2: Re-eval| DB_Results
    
    Student -->|Disagrees with Assessment| API_Debate[POST /api/debate/start]
    API_Debate -->|Socratic Loop| Student
    Student -->|Send Message| API_Debate_Resp[POST /api/debate/{id}/respond]
    API_Debate_Resp -->|Verify Understanding| DB_Results
```

---

## PHASE 3 — DIRECTORY DOCUMENTATION

### 1. Directory: [backend/](file:///e:/Eduagent/backend)
* **Purpose**: Coordinates all Python-based application operations.
* **Responsibilities**: Houses configuration, database adapters, LLM wrappers, routers, and agent logic.
* **Relationships**: Feeds endpoints to the React client; writes/reads data from Supabase.
* **Key Components**: [main.py](file:///e:/Eduagent/backend/main.py)

### 2. Directory: [backend/agents/](file:///e:/Eduagent/backend/agents)
* **Purpose**: Implements the core multi-agent cognitive architecture.
* **Responsibilities**: Contains prompts, schemas, fallback logic, and agent-specific evaluations.
* **Relationships**: Imported by routers to generate exams, grade answers, build probes, and manage Socratic dialogue.
* **Key Components**: [evaluator.py](file:///e:/Eduagent/backend/agents/evaluator.py), [socratic.py](file:///e:/Eduagent/backend/agents/socratic.py), [integrity.py](file:///e:/Eduagent/backend/agents/integrity.py)

### 3. Directory: [backend/db/](file:///e:/Eduagent/backend/db)
* **Purpose**: Encapsulates the persistence layer connector.
* **Responsibilities**: Reusable database client connections with failure recovery.
* **Relationships**: Used by routers to read exams, log results, and update Socratic debate sessions.
* **Key Components**: [supabase_client.py](file:///e:/Eduagent/backend/db/supabase_client.py)

### 4. Directory: [backend/models/](file:///e:/Eduagent/backend/models)
* **Purpose**: Declares request and response payload schemas.
* **Responsibilities**: Enforces type parameters, value bounds, and constraints using Pydantic models.
* **Relationships**: Imported by routers to validate incoming HTTP payloads.
* **Key Components**: [schemas.py](file:///e:/Eduagent/backend/models/schemas.py)

### 5. Directory: [backend/routers/](file:///e:/Eduagent/backend/routers)
* **Purpose**: Organizes application routers by logical domain.
* **Responsibilities**: Exposes API endpoints, implements payload parameters, coordinates database transactions, and manages concurrent tasks.
* **Relationships**: Exposes routes called by the React client; delegates logic to agent modules.
* **Key Components**: [exams.py](file:///e:/Eduagent/backend/routers/exams.py), [reports.py](file:///e:/Eduagent/backend/routers/reports.py), [students.py](file:///e:/Eduagent/backend/routers/students.py)

### 6. Directory: [backend/utils/](file:///e:/Eduagent/backend/utils)
* **Purpose**: General-purpose technical utilities.
* **Responsibilities**: Controls Gemini LLM connectivity (retries, fallback models, JSON sanitation) and parses PDF data.
* **Relationships**: Utilized by agents for content generation and endpoints for file processing.
* **Key Components**: [gemini.py](file:///e:/Eduagent/backend/utils/gemini.py), [pdf_parser.py](file:///e:/Eduagent/backend/utils/pdf_parser.py)

### 7. Directory: [frontend/src/components/](file:///e:/Eduagent/frontend/src/components)
* **Purpose**: Reusable React UI widgets.
* **Responsibilities**: Manages modal prompts, confidence sliders, and reasoning textareas.
* **Relationships**: Mounted inside pages to capture specific inputs.
* **Key Components**: [ConfidenceSlider.jsx](file:///e:/Eduagent/frontend/src/components/ConfidenceSlider.jsx), [Scratchpad.jsx](file:///e:/Eduagent/frontend/src/components/Scratchpad.jsx)

### 8. Directory: [frontend/src/pages/](file:///e:/Eduagent/frontend/src/pages)
* **Purpose**: Top-level page views.
* **Responsibilities**: Renders teacher dashboards, test-taking screens, student report cards, and debate arenas.
* **Relationships**: Mounted by [App.jsx](file:///e:/Eduagent/frontend/src/App.jsx) based on state-based routing.
* **Key Components**: [TeacherDashboard.jsx](file:///e:/Eduagent/frontend/src/pages/TeacherDashboard.jsx), [ReportCard.jsx](file:///e:/Eduagent/frontend/src/pages/ReportCard.jsx), [ExamInterface.jsx](file:///e:/Eduagent/frontend/src/pages/ExamInterface.jsx), [SocraticDebate.jsx](file:///e:/Eduagent/frontend/src/pages/SocraticDebate.jsx)

---

## PHASE 4 — FILE DOCUMENTATION

### 1. File: [backend/main.py](file:///e:/Eduagent/backend/main.py)
* **Purpose**: Application starter script and core FastAPI instance.
* **Responsibilities**: Configures logs, parses `.env`, sets up CORS policies, registers API routers, and boots uvicorn.
* **Imports**: `fastapi`, `uvicorn`, `dotenv`, `CORSMiddleware`.
* **Used By**: Executed directly by the runner in local development and production.
* **Uses**: Routers from [backend/routers](file:///e:/Eduagent/backend/routers).
* **Execution Role**: Core bootloader. Establishes the HTTP listener (default port 8000).

### 2. File: [backend/utils/gemini.py](file:///e:/Eduagent/backend/utils/gemini.py)
* **Purpose**: Client integration for Google GenAI LLM services.
* **Responsibilities**: Maintains a client singleton, implements model fallback execution, cleans text block formatting, and exposes sync/async API callers.
* **Imports**: `google.genai`, `google.genai.types`, `google.genai.errors.APIError`, `asyncio`, `re`, `json`.
* **Used By**: All files under `backend/agents/`.
* **Uses**: System variables `GEMINI_API_KEY`.
* **Execution Role**: Central gateway for AI model coordination.
* **Important Logic**: Shuffles models list (`MODELS_CHAIN`) on success to prioritize the fastest responsive model for subsequent calls. Runs blocking calls within an async executor (`asyncio.to_thread`) to avoid blocking the event loop.

### 3. File: [backend/utils/pdf_parser.py](file:///e:/Eduagent/backend/utils/pdf_parser.py)
* **Purpose**: Parses uploaded reference documents.
* **Responsibilities**: Extracts raw text blocks from PDF binaries using PyMuPDF (`fitz`). Implements safety page (30 pages) and character (50,000 chars) caps.
* **Imports**: `fitz` (PyMuPDF), `logging`.
* **Used By**: [backend/routers/exams.py](file:///e:/Eduagent/backend/routers/exams.py).
* **Execution Role**: Utility module for parsing uploaded syllabus files.

### 4. File: [backend/db/supabase_client.py](file:///e:/Eduagent/backend/db/supabase_client.py)
* **Purpose**: Establishes database adapters for Supabase (PostgreSQL).
* **Responsibilities**: Creates the Supabase client connection lazily. Incorporates error-tolerant connection retries.
* **Imports**: `supabase.create_client`, `supabase.Client`, `dotenv`.
* **Used By**: All router modules in `backend/routers/`.
* **Execution Role**: Singleton database adapter factory.

### 5. File: [backend/models/schemas.py](file:///e:/Eduagent/backend/models/schemas.py)
* **Purpose**: Explicit type validations for network payloads.
* **Responsibilities**: Defines student submissions, probe responses, and Socratic debate start/turn models.
* **Imports**: `pydantic.BaseModel`, `pydantic.Field`, `typing`.
* **Used By**: [backend/routers/exams.py](file:///e:/Eduagent/backend/routers/exams.py).
* **Execution Role**: Data declaration layer.

### 6. File: [backend/agents/exam_designer.py](file:///e:/Eduagent/backend/agents/exam_designer.py)
* **Purpose**: Implementation of Agent 1.
* **Responsibilities**: Formulates prompt structures to generate questions matching specific difficulty (40/40/20) and type (60/40) splits from reference text.
* **Imports**: `backend.utils.gemini.call_gemini_async`, `backend.utils.gemini.parse_json_response`.
* **Used By**: [backend/routers/exams.py](file:///e:/Eduagent/backend/routers/exams.py).
* **Execution Role**: Automated exam generator.

### 7. File: [backend/agents/evaluator.py](file:///e:/Eduagent/backend/agents/evaluator.py)
* **Purpose**: Implementation of Agent 2.
* **Responsibilities**: Validates answers, assesses scratchpad entries, gauges confidence correctness, and compiles class-wide/student-specific profiles.
* **Imports**: `backend.utils.gemini.call_gemini_async`, `backend.utils.gemini.parse_json_response`, `asyncio.Semaphore`.
* **Used By**: [backend/routers/exams.py](file:///e:/Eduagent/backend/routers/exams.py).
* **Execution Role**: Cognitive grader. Uses an `asyncio.Semaphore(3)` to cap concurrency when evaluating multi-question exams to prevent rate limits.

### 8. File: [backend/agents/adversarial.py](file:///e:/Eduagent/backend/agents/adversarial.py)
* **Purpose**: Implementation of Agent 3.
* **Responsibilities**: Creates targeted follow-up question sets (exactly three) focused on the student's concept deficits.
* **Imports**: `backend.utils.gemini.call_gemini_async`, `backend.utils.gemini.parse_json_response`.
* **Used By**: [backend/routers/exams.py](file:///e:/Eduagent/backend/routers/exams.py).
* **Execution Role**: Dynamic diagnostic generator.

### 9. File: [backend/agents/integrity.py](file:///e:/Eduagent/backend/agents/integrity.py)
* **Purpose**: Implementation of Agent 4.
* **Responsibilities**: Builds behavioral signals (timing checks, copy-paste count, tab change indicators, reasoning length) and scores exam integrity.
* **Imports**: `backend.utils.gemini.call_gemini_async`, `backend.utils.gemini.parse_json_response`.
* **Used By**: [backend/routers/exams.py](file:///e:/Eduagent/backend/routers/exams.py).
* **Execution Role**: Telemetry auditor.

### 10. File: [backend/agents/socratic.py](file:///e:/Eduagent/backend/agents/socratic.py)
* **Purpose**: Socratic examiner dialogue loop.
* **Responsibilities**: Formulates domain-specific Socratic questions to challenge student answers. Finalizes confirmed diagnoses when exchanges conclude (exchanges capped at five).
* **Imports**: `backend.utils.gemini.call_gemini_async`, `backend.utils.gemini.parse_json_response`.
* **Used By**: [backend/routers/exams.py](file:///e:/Eduagent/backend/routers/exams.py).
* **Execution Role**: Interactive dialogue evaluator.

### 11. File: [backend/routers/exams.py](file:///e:/Eduagent/backend/routers/exams.py)
* **Purpose**: Endpoints for exams, submissions, and Socratic sessions.
* **Responsibilities**: Handles files uploads, batch results aggregation, concurrent agent operations, and cache lookups.
* **Imports**: `fastapi.APIRouter`, `fastapi.HTTPException`, `uuid`, `asyncio`, `backend.db.supabase_client`.
* **Used By**: [backend/main.py](file:///e:/Eduagent/backend/main.py).
* **Execution Role**: Business operations controller. Saves debates to an in-memory fallback list (`IN_MEMORY_DEBATES`) if database insertions fail.

### 12. File: [backend/routers/reports.py](file:///e:/Eduagent/backend/routers/reports.py)
* **Purpose**: Class report endpoint.
* **Responsibilities**: Calculates average score distributions, ranks concept gaps, and lists class-wide anomalies.
* **Imports**: `fastapi.APIRouter`, `fastapi.HTTPException`, `backend.db.supabase_client`.
* **Used By**: [backend/main.py](file:///e:/Eduagent/backend/main.py).
* **Execution Role**: Class analytics reporter.

### 13. File: [backend/routers/students.py](file:///e:/Eduagent/backend/routers/students.py)
* **Purpose**: Student profile and history endpoints.
* **Responsibilities**: Retrieves student submissions, maps questions to results, and performs batch lookups.
* **Imports**: `fastapi.APIRouter`, `fastapi.HTTPException`, `backend.db.supabase_client`.
* **Used By**: [backend/main.py](file:///e:/Eduagent/backend/main.py).
* **Execution Role**: Student records provider.

### 14. File: [frontend/src/App.jsx](file:///e:/Eduagent/frontend/src/App.jsx)
* **Purpose**: Root application view component.
* **Responsibilities**: Handles view switching (Teacher Portal vs Student Test Desk), manages global dialog configurations, and queries exams list.
* **Imports**: `react`, pages and components.
* **Execution Role**: Global SPA layout and view router.

### 15. File: [frontend/src/pages/ExamInterface.jsx](file:///e:/Eduagent/frontend/src/pages/ExamInterface.jsx)
* **Purpose**: Exam student view.
* **Responsibilities**: Implements visibility API listeners for tab switches, intercepts copy-paste actions on textareas, tracks timing counters, and validates inputs before submissions.
* **Imports**: `react`, [Scratchpad.jsx](file:///e:/Eduagent/frontend/src/components/Scratchpad.jsx), [ConfidenceSlider.jsx](file:///e:/Eduagent/frontend/src/components/ConfidenceSlider.jsx), [Modal.jsx](file:///e:/Eduagent/frontend/src/components/Modal.jsx).
* **Execution Role**: Student testing environment with anti-cheat telemetry.

### 16. File: [frontend/src/pages/ReportCard.jsx](file:///e:/Eduagent/frontend/src/pages/ReportCard.jsx)
* **Purpose**: Diagnostic report viewer for students.
* **Responsibilities**: Renders performance summary cards, gathers follow-up probe inputs, and links to Socratic debates.
* **Imports**: `react`, components.
* **Execution Role**: Diagnostic feedback dashboard.

### 17. File: [frontend/src/pages/SocraticDebate.jsx](file:///e:/Eduagent/frontend/src/pages/SocraticDebate.jsx)
* **Purpose**: Socratic debate chat interface.
* **Responsibilities**: Renders message bubbles, triggers scrolling hooks, manages dialogue state, and displays verified findings when complete.
* **Imports**: `react`.
* **Execution Role**: Interactive debate chat.

### 18. File: [frontend/src/pages/TeacherDashboard.jsx](file:///e:/Eduagent/frontend/src/pages/TeacherDashboard.jsx)
* **Purpose**: Interactive control portal for teachers.
* **Responsibilities**: Manages PDF file uploads, plots charts using Recharts, coordinates diagnostics tabs, and lists interactive student logs.
* **Imports**: `react`, `recharts`, components.
* **Execution Role**: Teacher command dashboard.

---

## PHASE 5 — CLASS ANALYSIS

Since the backend is written procedurally with modular functions, the key class-like structures are the Pydantic data schemas, FastAPI routers, and client wrappers.

### 1. Class: `QuestionSubmission`
* **Purpose**: Validates individual question responses during exam submissions.
* **Inheritance**: `pydantic.BaseModel`
* **Attributes**:
  - `question_id` (`str`): Identifies the question from the exam.
  - `answer` (`str`): The student's answer text or selected option.
  - `scratchpad` (`Optional[str]`): Raw thinking steps from the scratchpad (defaults to `"No scratchpad provided"`).
  - `confidence` (`int`): Student confidence level (validated between 1 and 5).
  - `time_spent` (`int`): Time spent on the question in seconds.
  - `copy_paste_detected` (`Optional[bool]`): Flag indicating copy-paste actions (defaults to `False`).
  - `tab_change_detected` (`Optional[bool]`): Flag indicating tab switches (defaults to `False`).

### 2. Class: `ExamSubmissionRequest`
* **Purpose**: Validates full exam submission payloads.
* **Inheritance**: `pydantic.BaseModel`
* **Attributes**:
  - `student_id` (`str`): Unique student identifier.
  - `responses` (`List[QuestionSubmission]`): List of validated answer objects.

### 3. Class: `ProbeAnswerSubmission`
* **Purpose**: Validates individual probe question answers.
* **Inheritance**: `pydantic.BaseModel`
* **Attributes**:
  - `question_id` (`str`): Target probe question ID.
  - `answer` (`str`): Short-answer text input.

### 4. Class: `ProbeSubmissionRequest`
* **Purpose**: Validates probe submission payloads.
* **Inheritance**: `pydantic.BaseModel`
* **Attributes**:
  - `student_id` (`str`): Student identifier.
  - `responses` (`List[ProbeAnswerSubmission]`): Answers to the three probe questions.

### 5. Class: `DebateStartRequest`
* **Purpose**: Validates requests to initiate a Socratic debate.
* **Inheritance**: `pydantic.BaseModel`
* **Attributes**:
  - `exam_id` (`str`), `student_id` (`str`), `question_id` (`str`): Identifies the test question context.
  - `student_answer` (`str`): The answer the student is defending.
  - `original_error_type` (`str`), `original_feedback` (`str`): Evaluator data.

### 6. Class: `DebateResponseRequest`
* **Purpose**: Validates Socratic chat turns.
* **Inheritance**: `pydantic.BaseModel`
* **Attributes**:
  - `student_message` (`str`): The message sent by the student during the debate.

### 7. Class: `APIRouter` (from `fastapi`)
* **Purpose**: Organizes endpoints under specific path prefixes.
* **Instances**:
  - `router` in `backend/routers/exams.py` (`/api/exams`)
  - `debate_router` in `backend/routers/exams.py` (`/api/debate`)
  - `router` in `backend/routers/reports.py` (`/api/exams`)
  - `router` in `backend/routers/students.py` (root `/`)
* **Lifecycle**: Instantiated on module import; registered on the main FastAPI application in `backend/main.py`.

---

## PHASE 6 — FUNCTION ANALYSIS

### 1. Function: `generate_with_fallback_async` (in `backend/utils/gemini.py`)
* **Purpose**: Queries the Gemini API with automatic model fallbacks if transient errors occur.
* **Parameters**:
  - `prompt` (`str`): The user query.
  - `system_instruction` (`str`, optional): System instructions for the model.
  - `response_mime_type` (`str`, optional): Expected MIME type (e.g., `application/json`).
* **Returns**: `str` (the model's generated text response).
* **Workflow**:
  1. Retrieves the client singleton.
  2. Iterates through `MODELS_CHAIN` (starting with `gemma-4-26b`, then `gemma-4-31b`).
  3. Invokes the client call asynchronously via `asyncio.to_thread`.
  4. If successful: returns the output and moves the successful model to the front of `MODELS_CHAIN`.
  5. If an APIError (e.g., rate limit, overload) is caught: waits 1.5s (non-blocking) and falls back to the next model.
  6. If all models fail: raises the last recorded exception.
* **Side Effects**: Modifies global `MODELS_CHAIN` list.

### 2. Function: `parse_pdf_bytes` (in `backend/utils/pdf_parser.py`)
* **Purpose**: Extracts text contents from a PDF document.
* **Parameters**:
  - `pdf_bytes` (`bytes`): Raw uploaded file data.
* **Returns**: `str` (combined text content from the parsed pages).
* **Workflow**:
  1. Opens the PDF document from bytes stream using `fitz.open`.
  2. Calculates pages to parse (capping at `MAX_PAGES` = 30).
  3. Iterates over pages, extracting text and tracking characters.
  4. Breaks early if total extracted characters hit `MAX_CHARACTERS` (50,000 chars).
  5. Joins extracted text blocks and closes the document handler.
* **Potential Side Effects**: High CPU load during extraction (mitigated by running in a thread).

### 3. Function: `generate_exam` (in `backend/agents/exam_designer.py`)
* **Purpose**: Creates structured exam questions from reference text.
* **Parameters**:
  - `topic` (`str`): Name of the exam topic.
  - `content` (`str`): Contextual text from the parsed PDF.
  - `num_questions` (`int`, default=10): Total questions to generate.
* **Returns**: `dict` containing the exam details and questions list.
* **Workflow**:
  1. Prepares a system instruction defining difficulty constraints (40/40/20) and question types (60/40).
  2. Submits the prompt containing the reference text and topic to `call_gemini_async` requesting JSON output.
  3. Parses the response using `parse_json_response`.
  4. If parsing fails: runs a single retry with a correction prompt containing the error message.

### 4. Function: `evaluate_full_exam` (in `backend/agents/evaluator.py`)
* **Purpose**: Evaluates all responses in an exam submission in parallel.
* **Parameters**:
  - `questions` (`List[Dict]`): Exam question definitions.
  - `responses` (`List[Dict]`): Student answers and telemetry.
* **Returns**: `dict` containing the graded questions list andaggregated cognitive profile.
* **Workflow**:
  1. Maps exam questions by ID for quick lookups.
  2. Creates concurrent tasks calling `evaluate_response` for each answer, managed via an `asyncio.Semaphore(3)`.
  3. Resolves all tasks concurrently using `asyncio.gather`.
  4. Computes dominant error patterns, aggregates scores, and compiles blind spots and concept gaps.

### 5. Function: `analyze_integrity` (in `backend/agents/integrity.py`)
* **Purpose**: Assesses behavioral signals to evaluate submission integrity.
* **Parameters**:
  - `responses` (`List[Dict]`), `evaluations` (`List[Dict]`), `questions` (`List[Dict]`): Answer data and question configurations.
* **Returns**: `dict` containing the integrity score, flagged events list, and summary text.
* **Workflow**:
  1. Compiles behavioral signals (e.g., identifying fast submissions < 5s, active copy-paste flags, and tab switches).
  2. Submits the signals to `call_gemini_async` to analyze patterns.
  3. Deducts 15 to 20 points from the integrity score for each copy-paste or tab-change violation.
  4. Formulates flags objectively without explicit accusations of cheating.
  5. Returns a default high-integrity profile if the LLM call completely fails.

### 6. Function: `continue_debate` (in `backend/agents/socratic.py`)
* **Purpose**: Drives the Socratic dialogue and generates confirmed diagnoses when complete.
* **Parameters**:
  - `question` (`Dict`), `student_answer` (`str`), `original_error_type` (`str`): Target context.
  - `conversation_history` (`List[Dict]`): Current dialogue transcript.
* **Returns**: `dict` containing the examiner's response, completed flag, and final diagnosis (if complete).
* **Workflow**:
  1. Counts student responses. If count >= 5, forces `debate_complete = True`.
  2. Prepares the chat log and sends a prompt to Gemini.
  3. If complete: compiles a final verified diagnosis (`depth`, `confirmed_error_type`, `root_cause`, `teacher_note`).
  4. Implements fallbacks to preserve the original diagnosis if the LLM fails or the exchange limit is exceeded.

---

## PHASE 7 — DEPENDENCY GRAPH

```
                  +--------------------------------+
                  |         backend/main.py        |
                  +--------------------------------+
                    /             |              \
                   /              |               \
                  v               v                v
          routers/exams     routers/reports   routers/students
            /    |    \           |                |
           /     |     \          |                |
          /      |      \         |                |
         v       v       v        v                v
      agents/  agents/  agents/  db/              db/
      designer socratic evaluator supabase        supabase
         |       |       |        |                |
         v       v       v        v                v
       utils/  utils/  utils/    Client           Client
       gemini  gemini  gemini
         |
         v
       google-genai SDK
```

### Shared Utilities & Coupling
- **[backend/utils/gemini.py](file:///e:/Eduagent/backend/utils/gemini.py)** is highly coupled across all agents in the platform. Changes to client instantiation or model settings affect all agent steps.
- **[backend/db/supabase_client.py](file:///e:/Eduagent/backend/db/supabase_client.py)** is imported by all three routers to interact with the database.
- **No circular imports** exist because routers do not import from `main.py`, and utils/agents are fully self-contained.

---

## PHASE 8 — DATA FLOW ANALYSIS

This section outlines how data moves through the application when a student submits an exam.

```
[1] User Input
    Student submits answers, scratchpad notes, confidence sliders, and telemetry
    (time spent, copy-paste count, tab change flags) in the UI.
                      |
                      v
[2] Validation
    FastAPI interceptor processes the payload and validates it against the
    ExamSubmissionRequest schema. Returns a 400 Bad Request on failure.
                      |
                      v
[3] Processing Pipeline
    - Grader evaluates answers, reasoning quality, and confidence in parallel.
    - Evaluations are sent to the Integrity Analyzer (Agent 4) and Adversarial
      Probe (Agent 3) in parallel.
    - Gap depth probes and integrity ratings are generated.
                      |
                      v
[4] Storage
    The backend runs a delete-then-insert query to save results to the Supabase
    results table, preventing duplicate records for the same student+exam.
                      |
                      v
[5] Output
    The compiled evaluation, generated probes, and integrity reports are
    returned to the UI, allowing the student to view their report card.
```

---

## PHASE 9 — EXECUTION FLOW

### Application Startup Sequence
```
[1] Launcher Boots
    Developer runs: python -m backend.main
                   |
                   v
[2] Load Environment Configs
    dotenv searches for .env file and registers key configurations
    (GEMINI_API_KEY, SUPABASE_URL, SUPABASE_KEY, FRONTEND_URL).
                   |
                   v
[3] Initialize Logger
    Configures stream logging using the standard INFO formatter.
                   |
                   v
[4] Create FastAPI App
    Instantiates application, registers routes (exams, students, reports, debates),
    and sets CORS policies (using FRONTEND_URL if set, or wildcard).
                   |
                   v
[5] Lazy Setup Supabase Client
    Client settings are verified; connection is established on the first API request.
                   |
                   v
[6] Listen for Connections
    FastAPI starts listening for incoming client requests on port 8000.
```

---

## PHASE 10 — DATABASE ANALYSIS

### 1. Database Entity-Relationship Diagram

```
    +------------------+             +--------------------+
    |      exams       |             |      results       |
    +------------------+             +--------------------+
    | id (PK, UUID)    |<-----------o| id (PK, UUID)      |
    | topic (Text)     |             | exam_id (FK, UUID) |
    | questions (JSONB)|<-----+      | student_id (Text)  |
    | created_by (Text)|      |      | evaluation (JSONB) |
    | created_at (Time)|      |      | integrity (JSONB)  |
                              |      | probe_questions    |
                              |      | probe_evaluation   |
                              |      | gap_depth (Text)   |
                              |      | confirmed_diagnosis|
                              |      | created_at (Time)  |
                              |      +--------------------+
                              |
                     +--------+-----------+
                     |      debates       |
                     +--------------------+
                     | id (PK, UUID)      |
                     | exam_id (FK, UUID) |
                     | student_id (Text)  |
                     | question_id (Text) |
                     | student_answer     |
                     | original_error_type|
                     | original_feedback  |
                     | conversation_hist  |
                     | diagnosis (JSONB)  |
                     | debate_complete    |
                     | created_at (Time)  |
                     +--------------------+
```

### 2. Table Schemas & Queries

#### Table: `exams`
* **Primary Key**: `id` (automatically generated UUID)
* **Fields**:
  - `topic` (`text`, NOT NULL)
  - `questions` (`jsonb`)
  - `created_by` (`text`)
  - `created_at` (`timestamp`, defaults to `now()`)
* **Common Query**: Selects details and lists active exams.
  ```sql
  SELECT id, topic, created_by, created_at FROM exams ORDER BY created_at DESC;
  ```

#### Table: `results`
* **Primary Key**: `id` (automatically generated UUID)
* **Foreign Key**: `exam_id` references `exams(id)` (on delete cascade)
* **Unique Key**: `unique(exam_id, student_id)` (prevents duplicate submissions)
* **Fields**:
  - `student_id` (`text`, NOT NULL)
  - `evaluation` (`jsonb`), `integrity` (`jsonb`), `probe_questions` (`jsonb`), `probe_evaluation` (`jsonb`)
  - `gap_depth` (`text`)
  - `confirmed_diagnosis` (`jsonb`)
  - `created_at` (`timestamp`, defaults to `now()`)
* **Common Query**: Fetches class results with optimized indices.
  ```sql
  SELECT exam_id, evaluation FROM results;
  ```
* **Indices**:
  - `idx_results_exam_id` on `results(exam_id)`
  - `idx_results_student_id` on `results(student_id)`
  - `idx_results_exam_student` on `results(exam_id, student_id)`
  - `idx_results_created_at` on `results(created_at desc)`

#### Table: `debates`
* **Primary Key**: `id` (automatically generated UUID)
* **Foreign Key**: `exam_id` references `exams(id)` (on delete cascade)
* **Fields**:
  - `student_id` (`text`, NOT NULL), `question_id` (`text`, NOT NULL)
  - `student_answer` (`text`), `original_error_type` (`text`), `original_feedback` (`text`)
  - `conversation_history` (`jsonb`, defaults to `'[]'`)
  - `diagnosis` (`jsonb`)
  - `debate_complete` (`boolean`, defaults to `false`)
  - `created_at` (`timestamp`, defaults to `now()`)
* **Indices**:
  - `idx_debates_exam_student` on `debates(exam_id, student_id)`

---

## PHASE 11 — API ANALYSIS

This section outlines the backend endpoints exposed by the platform.

### 1. Exams Routing (`/api/exams`)
* **`POST /api/exams/generate`**: Creates an exam by parsing an uploaded PDF.
  - *Payload*: Multi-part form data containing `topic` (string), `num_questions` (integer), and `file` (PDF binary).
  - *Returns*: `{ exam_id, topic, questions: [...] }`
* **`GET /api/exams`**: Lists all generated exams.
  - *Returns*: List of exam details enriched with student attempt counts and average class scores.
* **`GET /api/exams/{exam_id}`**: Retrieves questions for a specific exam.
  - *Returns*: `{ id, topic, questions: [...] }`
* **`POST /api/exams/{exam_id}/submit`**: Submits exam answers.
  - *Payload*: `ExamSubmissionRequest` JSON.
  - *Returns*: Cognitive evaluation, integrity report, and follow-up probe questions.
* **`POST /api/exams/{exam_id}/probe/submit`**: Submits answers to probe questions.
  - *Payload*: `ProbeSubmissionRequest` JSON.
  - *Returns*: `{ gap_depth: "shallow" | "deep", probe_evaluation: { evaluations, score, max_score } }`

### 2. Students Routing (`/api/students` & `/api/exams/{exam_id}/student/{student_id}`)
* **`GET /api/exams/{exam_id}/student/{student_id}`**: Retrieves a student's enriched cognitive profile.
  - *Returns*: Student evaluation details and verified diagnoses.
* **`GET /api/students/{student_id}/submissions`**: Retrieves a student's submission history.
  - *Returns*: Evaluated scores and cognitive error categories.

### 3. Reports Routing (`/api/exams/{exam_id}/report`)
* **`GET /api/exams/{exam_id}/report`**: Aggregates exam metrics across all students.
  - *Returns*: Average scores, error distributions, top concept gaps, and compiled integrity flags.

### 4. Debates Routing (`/api/debate`)
* **`POST /api/debate/start`**: Initiates a Socratic debate.
  - *Payload*: `DebateStartRequest` JSON.
  - *Returns*: `{ debate_id, message, debate_complete: false }`
* **`POST /api/debate/{debate_id}/respond`**: Processes a student reply in the debate.
  - *Payload*: `DebateResponseRequest` JSON.
  - *Returns*: `{ message, debate_complete: bool, diagnosis: null | Object }`
* **`GET /api/debate/{debate_id}`**: Retrieves debate session logs.
  - *Returns*: Debate details decorated with the original question text.

---

## PHASE 12 — SECURITY REVIEW

An audit of the codebase highlights the following security aspects and best practices:
1. **API Keys & Secrets**: No hardcoded API keys are stored in source files. Values are loaded dynamically from environment variables (`GEMINI_API_KEY`, `SUPABASE_KEY`).
2. **Input File Validation**: Files are checked to ensure they are not empty and do not exceed the 10 MB size limit, preventing potential memory attacks.
3. **CORS Policies**: Uses `FRONTEND_URL` in production. Falls back to wildcard origins in development, ensuring credentials are only allowed when origins are explicitly specified.
4. **LLM Prompts**: Prompts use structured JSON mapping, reducing risks of prompt injection by separating user inputs from instructions.

---

## PHASE 13 — CODE QUALITY REVIEW

* **API Optimization**: The endpoint to list exams uses a single database query to fetch results, preventing N+1 queries.
* **Memory Management**: Active Socratic debates are stored in `IN_MEMORY_DEBATES` if database queries fail. Completed sessions are evicted periodically to prevent memory leaks.
* **Concurrency Capping**: Concurrent Gemini API evaluations are capped at three parallel tasks using a semaphore, preventing rate limits on the free tier.
* **Typing Quality**: Pydantic schemas enforce type checking on all incoming client payloads, reducing runtime errors.

---

## PHASE 14 — ONBOARDING GUIDE

### New Developer Guide

Welcome to the **EduAgent** codebase! This guide helps you get started developing and maintaining the platform.

#### 1. Quick Start Checklists
- **Backend Setup**:
  1. Set up a Supabase project and run the SQL scripts in `schema.sql`.
  2. Create a `.env` file at the root containing your API keys and project settings.
  3. Install dependencies: `pip install -r requirements.txt`.
  4. Run the backend: `python -m backend.main`.
- **Frontend Setup**:
  1. Navigate to the `frontend/` folder.
  2. Install node packages: `npm install`.
  3. Run the development server: `npm run dev`.

#### 2. Where to Start Reading Code
- **To understand the multi-agent pipeline**: Read [backend/routers/exams.py:submit_exam_endpoint](file:///e:/Eduagent/backend/routers/exams.py#L156-L227) to see how evaluations, integrity analyses, and probes are coordinated.
- **To understand the Socratic debate**: Read [backend/agents/socratic.py](file:///e:/Eduagent/backend/agents/socratic.py) and trace the turn-by-turn dialogue loops.
- **To understand the frontend view layout**: Start with [frontend/src/App.jsx](file:///e:/Eduagent/frontend/src/App.jsx) and check the state routes mapping pages and components.

#### 3. Common Workflows
- **Modifying or Adding an Agent**:
  1. Define the system instructions and JSON output schemas in the agent module.
  2. Implement a retry mechanism with correction prompts to handle formatting errors.
  3. Register the agent call in the router endpoints.
- **Adding Database Fields**:
  1. Update the schema definitions in `schema.sql`.
  2. Modify the Pydantic models in `backend/models/schemas.py`.
  3. Update read/write logic in the corresponding router modules.
