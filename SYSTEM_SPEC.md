# WUPCare — System Specification

**WUPCare: A Web-Based Student Health Records and Clinic Management System at Wesleyan University-Philippines**

Version: 2.2 · 2026-10-14 · v2.2 records the implementation as built (§16). v2.1 added student self-registration with clinic approval (FR-AUTH-8, §8.10) and the administrator report limits (FR-RPT-3a).
Primary source: `WUPCare.pdf` (research manuscript by Taguiam, Reyes, Baldovino, Quintana)

---

## 0. How to read this document

Every requirement has a source tag:

| Tag | Meaning |
|-----|---------|
| **[P]** | Stated in the research paper (text or diagrams). This is the source of truth. |
| **[D]** | Decision confirmed by the client during planning (2026-10-14). |
| **[C]** | Stated in the commission brief, not in the paper. |
| **[R]** | Implementation recommendation from the developer. Can be changed. |
| **[OPT]** | Optional. Build only if approved and time allows. Not part of the baseline. |
| **[?]** | Pending client confirmation. A working default applies until answered. See Section 15. |

Paper references: *(Paper §N)* for text, *(Fig. N)* for diagrams.

**Diagrams:** Figures 2–7 were rendered from the PDF and compared with this spec. Section 14 lists every match, deviation, and item that still needs verification. Figure 1 (Agile SDLC) describes the method only and does not affect the system design.

---

## 1. Project overview

### 1.1 Problem **[P]**
The WUP school clinic relies on manual or fragmented recordkeeping: logbooks, paper forms, and physical folders. Records are hard to organize, retrieve, update, and monitor. They may be incomplete, duplicated, misplaced, or hard to read, and reports take extra effort to prepare *(Paper §1, Statement of the Problem)*.

### 1.2 Solution **[P]**
WUPCare is a centralized web application. Authorized clinic personnel use it to manage student information, health records, clinic visits and consultations, appointments, medication inventory, health incidents, and reports. Access is controlled through authentication and role-based access control.

### 1.3 Objectives **[P]** *(Paper §1, Objectives 1–10)*
1. Centralized database for student health information.
2. Recording and retrieval of student health records by authorized clinic personnel.
3. Clinic visit module: consultations, symptoms, assessments, treatments, follow-up.
4. Appointment management for student clinic appointments.
5. Medication management: medicines issued to students and inventory monitoring.
6. Health incident recording: injuries, illnesses, and other clinic-related incidents.
7. Reports on clinic visits, health concerns, medication usage, and other clinic activities.
8. User authentication and role-based access control.
9. Better efficiency and accuracy by reducing manual processes.
10. A user-friendly web interface.

### 1.4 Design principle **[D]**
Keep it simple. The system is a mini-thesis build. It prioritizes simple CRUD workflows, connected records, and basic reports. Security, authorization, data integrity, and privacy safeguards stay in place. Anything beyond the paper is labeled [OPT].

### 1.5 Methodology alignment **[P]**
Agile SDLC with iterative, module-by-module development *(Paper §3.A)*. The phases in `PLAN.md` are the iterations. A development log records the technology stack, iteration dates, completed features, and testing tools *(Paper §3.D)*.

### 1.6 Technology stack **[C]**
- Next.js 16.4 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui
- Supabase: PostgreSQL, Auth, Row Level Security (RLS). **Existing project; the developer has access [D].**
- Vercel (deployment, later)

Next.js 16 notes **[R]**:
- Middleware is now called **Proxy** (`proxy.ts` in the project root).
- `cookies()`, `headers()`, `params`, and `searchParams` are async only.
- **Cache Components will be disabled [D].** Remove `cacheComponents: true` **and** `partialPrefetching: true` from `next.config.ts` in Phase 1. `partialPrefetching` requires `cacheComponents`, so the build fails if only one is removed. This is safe: the scaffold uses no `use cache` code. Every page in WUPCare reads the session, so it renders per request anyway. `experimental.agentFeedback` stays unchanged.

---

## 2. Scope and limitations

### 2.1 In scope **[P]**
- Authentication, role-based access, and logout
- Student information management (add, view, update, search)
- Student health records (medical history, allergies, existing conditions, immunizations, health notes, emergency information)
- Clinic visits and consultations (reason, symptoms, assessment, treatment, medication provided, follow-up, responsible personnel)
- Appointment management (requests, review, approval, rescheduling, cancellation, history)
- Medication management (name, quantity, unit, expiration, stock, issuance, transactions)
- Health incident management (illnesses, minor injuries, accidents, other incidents, actions taken)
- Reports and statistics (visits, common health concerns, medication usage, incidents, appointments, student clinic history)
- User management (accounts, roles, access)

### 2.2 Student coverage **[D] [?]**
**College students only, initially.** This is pending client confirmation (Q-S2). The fields college, program, and year level are plain text and a small number. If Basic Education or Senior High is added later, no schema change is needed.

### 2.3 Out of scope

| Item | Source |
|------|--------|
| Medical diagnosis, clinical decision support, prescribing | [P] §7 |
| Replacing professional medical judgment or emergency services | [P] §7 |
| Health insurance claim processing | [P] §7 |
| Parent/guardian portal (the paper marks it optional). Guardian contact details are stored as data only. | [P] optional, [R] excluded |
| Students viewing their own health records or visit history | [D] |
| Students entering or editing their own profile information. At self-registration a student enters only email, Student ID, and password (§8.10). | [D] |
| Mobile app, integration with other school systems, advanced analytics | [P] §8 future work |
| Email or SMS notifications | [R] |
| Multi-campus or multi-clinic support | [R] |
| Bulk import (CSV) of real student records | [R]. Real records are entered manually [C]. |

### 2.4 Disclaimer **[P]**
The login page and footer state: WUPCare is a records-management and documentation tool. It is not a diagnostic tool and does not replace licensed healthcare judgment or emergency services *(Paper §3.F, §7)*.

---

## 3. User roles and permissions

### 3.1 Roles

| Role | Responsibilities | Source |
|------|------------------|--------|
| **Administrator** | Manages user accounts, roles, and access. Views **aggregate** reports and statistics. **No access to individual clinical records by default.** | [P] §1, §5, Fig. 5–6; [D] |
| **Clinic Personnel** | Manages student profiles, health records, clinic visits, appointments, medicine inventory, and health incidents. Views all reports, including per-student clinic history. Maintains clinic hours. | [P] §1, §2; [D] |
| **Student** | Self-registers (email, Student ID, password). After clinic personnel approve the link to their student record, submits appointment requests and views the status of their own appointments. Nothing else. | [P] Fig. 5–7 (appointment request); [D] |

### 3.2 Permission matrix
C = create, R = read, U = update, — = no access. Nothing is hard-deleted (see Section 12).

| Resource | Administrator | Clinic Personnel | Student |
|----------|---------------|------------------|---------|
| User accounts and roles | C R U, deactivate | own password only | self-register (always `student`); own password only |
| Pending student registrations (approve link to a student record) | — | R, approve | — |
| Student identity for account linking (number + name only) | R, via a restricted function | — | — |
| Student profiles | — | C R U, archive | — |
| Health records | — | C R U | — |
| Clinic visits | — | C R U | — |
| Appointments | — | C R U (approve, decline, reschedule, cancel, complete) | C (request), R own, cancel own pending request |
| Medicines and inventory | — | C R U, deactivate | — |
| Medication transactions | — | C (issue, restock, adjust), R | — |
| Health incidents | — | C R U | — |
| Health concern categories | R | R ([OPT] manage) | — |
| Clinic hours settings | R | R U | R (to validate a request) |
| Aggregate reports and dashboard counts | R | R | — |
| Student clinic history report (per student) | — | R | — |

Notes:
- **[D]** Administrators see only aggregate numbers: counts by period, category, type, status, and medicine. They never see names or clinical details through reports.
- **[R]** To link a student login account to a student profile, the administrator needs to pick the right student. A restricted database function returns only `student_number` and full name for students who have no account yet. It returns no health data.
- **[D]** If the client later wants administrators to read clinical records, only the RLS policies and the sidebar change. The schema does not change.

---

## 4. Functional requirements

IDs: `FR-<module>-<n>`. The source tag is at the end of each line. DFD process numbers refer to Fig. 6–7.

### 4.1 Authentication and Role-Based Access (AUTH) — DFD 1.0
- FR-AUTH-1 Users log in with **email and password** through Supabase Auth. **[D]** The paper says "username and password" *(Paper §5, Fig. 3)*. See Section 14.3.
- FR-AUTH-2 Invalid credentials show an error and return the user to the login page. **[P]** Fig. 3
- FR-AUTH-3 After login, the system identifies the user's role and shows the matching dashboard. **[P]** §5, Fig. 3
- FR-AUTH-4 Users can log out to end the session. **[P]** §5, Fig. 3
- FR-AUTH-5 Every page, server action, and database query enforces the role. **[P]** objective 8; **[R]** mechanism
- FR-AUTH-6 Deactivated users cannot log in or access data. **[R]**
- FR-AUTH-7 Users can change their own password. **[R]**
- FR-AUTH-8 Students self-register with email, Student ID, and password, using Supabase Auth's built-in email verification. Self-registration always creates a `student` account. There is no public registration for administrators or clinic personnel: the initial administrator is provisioned once (§10.1), and administrators create clinic personnel accounts. **[D]** (2026-10-14)
- FR-AUTH-9 A self-registered student account has no access until clinic personnel approve linking it to an existing student record (§8.10). A Student ID typed by the user never grants access on its own. **[D]**

### 4.2 Student Information Management (STU) — DFD 2.1, 2.2
- FR-STU-1 Clinic personnel can add, view, update, and search student information. **[P]** §5
- FR-STU-2 Student information is validated before it is saved: required fields, formats, unique student number. **[P]** Fig. 7 (2.2)
- FR-STU-3 Each student has exactly one profile. The health record, visits, appointments, incidents, and medication issuances all link to it. **[C]**, **[P]** Fig. 4
- FR-STU-4 Search by student number or name. Filter by college, year level, status, and record type (Demo / Real). **[P]** search; **[C]** demo filter
- FR-STU-5 A duplicate student number is rejected with a clear message. **[R]**
- FR-STU-6 Students are archived (status `inactive` or `graduated`), never deleted. **[R]**
- FR-STU-7 The student detail page shows the profile, health record, and the history of visits, appointments, incidents, and medications issued. **[C]**, **[P]** Fig. 7 (2.5)
- FR-STU-8 Demo records show a visible **DEMO** badge everywhere they appear. **[C]**

### 4.3 Student Health Records (HR) — DFD 2.3, 2.4, 2.5
- FR-HR-1 Store medical history, allergies, existing conditions, immunization information, health notes, and emergency contact information. **[P]** §6
- FR-HR-2 One health record per student. It is created automatically, empty, when the student is created. **[R]** See Section 14.1 about the ERD.
- FR-HR-3 Only clinic personnel can view or update health records. **[P]** §5; **[D]**
- FR-HR-4 Allergies and existing conditions are shown on the student header and on the new-visit form. **[R]**
- FR-HR-5 The record shows who last updated it and when. **[R]**

### 4.4 Clinic Visits and Consultations (VIS) — DFD 3.1–3.5
- FR-VIS-1 Record a visit with: student, date and time, reason, symptoms, assessment, treatment, medication provided, follow-up instructions, and the responsible clinic personnel. **[P]** §5, §6, Fig. 7
- FR-VIS-2 Each visit has one **health concern category** from a simple predefined list (Section 9.2). This feeds the "common health concerns" report. **[D]**
- FR-VIS-3 Medication provided during a visit is saved as an issuance that **reduces inventory**. The visit and its issuances save together or not at all. **[P]** Fig. 4 ("if dispensed during a visit"); **[C]**
- FR-VIS-4 Each student's visit history is listed newest first and always stays accessible. **[C]**, **[P]** Fig. 2 output
- FR-VIS-5 Visit log with date range, student search, and Demo/Real filter. **[R]**
- FR-VIS-6 Visits can be edited for corrections. The record shows who edited it and when. Visits cannot be deleted. **[R]**
- FR-VIS-7 A visit can be linked to a completed appointment. **[R]**
- FR-VIS-8 Vital signs (temperature, blood pressure, pulse) and disposition (back to class, sent home, referred). **[OPT]**

### 4.5 Appointment Management (APT) — DFD 4.1–4.5
- FR-APT-1 A student submits an appointment request with preferred date, preferred time, and reason. **[P]** Fig. 7 (4.1); **[D]**
- FR-APT-2 Clinic personnel can also create an appointment for a student, for example a phone booking. **[P]** §5
- FR-APT-3 Clinic personnel review each request. They approve it with a schedule, or decline it with a remark. **[P]** Fig. 7 (4.2, 4.3)
- FR-APT-4 Clinic personnel can reschedule an approved appointment (new date and time, with a remark) or cancel it. **[P]** Fig. 7 (4.4)
- FR-APT-5 Clinic personnel mark attended appointments as completed. They can then record a visit with the student already selected. **[R]**
- FR-APT-6 All appointments are kept as history per student. **[P]** Fig. 7 (4.5)
- FR-APT-7 Students see only their own appointments, with status, schedule, and staff remarks. They can cancel their own request while it is `pending`. **[D]**
- FR-APT-8 Requests must fall within the **configured clinic hours**: open days, opening time, closing time, and how many days ahead a request may be made. **[D]** Actual hours are pending confirmation (Q-F5). Clinic personnel edit the settings.
- FR-APT-9 Statuses: `pending`, `approved`, `declined`, `cancelled`, `completed`. A reschedule keeps the status `approved` and increases a reschedule counter. **[R]** (simplified)
- FR-APT-10 Time-slot limits and a calendar view. **[OPT]**

### 4.6 Medication Inventory and Issuance (MED) — DFD 5.1–5.6
- FR-MED-1 Maintain medicines with name, unit, stock quantity, reorder level, and expiration date. **[P]** §5, §6, Fig. 7 (5.1)
- FR-MED-2 Record each medicine issued to a student: student, medicine, quantity, date, issued by, and linked visit or incident. **[P]** Fig. 7 (5.3), Fig. 4
- FR-MED-3 Issuance decreases stock in the same database transaction. Stock can never go negative. **[C]**, **[P]** Fig. 7 (5.4)
- FR-MED-4 Restock and stock adjustment (with a required reason) are recorded as transactions. **[P]** Fig. 7 (5.2)
- FR-MED-5 Flags for low stock (below the reorder level) and for expired or soon-to-expire medicines (within 30 days). **[P]** Fig. 7 (5.5)
- FR-MED-6 Expired medicine cannot be issued. **[R]**
- FR-MED-7 Medicines are deactivated, never deleted. **[R]**
- FR-MED-8 Each medicine has its own transaction history. **[P]** Fig. 7 (5.6)
- FR-MED-9 One expiration date per medicine row. Stock with a different expiry is added as a separate row. Batch tracking is **[OPT]**. **[R]**

### 4.7 Health Incident Management (INC) — DFD 6.1–6.5
- FR-INC-1 Record incidents: student, date and time, type, location, description, and action taken. **[P]** §5, §6, Fig. 7 (6.1, 6.3, 6.4)
- FR-INC-2 Incident type: illness, injury, accident, or other. **[P]** Fig. 7 (6.2)
- FR-INC-3 Medication given for an incident is saved as an issuance linked to the incident. **[P]** Fig. 4
- FR-INC-4 Incident history per student, and an incident log filterable by type, date, and Demo/Real. **[P]** Fig. 7 (6.5)
- FR-INC-5 Incidents can be edited (with who and when recorded), never deleted. **[R]**
- FR-INC-6 Severity and referral notes. **[OPT]**

### 4.8 Reports and Basic Statistics (RPT) — DFD 7.1–7.4
- FR-RPT-1 **Aggregate reports**, for administrators and clinic personnel. Each takes a date range: **[P]** §6
  - clinic visits per day or month
  - common health concerns: visits per concern category
  - medication usage: quantity issued per medicine, plus current stock
  - health incidents per type
  - appointments per status
- FR-RPT-2 **Student clinic history report**: a printable summary for one student. Clinic personnel only. **[P]** §6; **[D]**
- FR-RPT-3 Every report has a scope filter: **Real only (default), Demo only, All**. **[C]**
- FR-RPT-3a **Administrator report limits [D]** (updated 2026-10-20): aggregate-only reports, with no individual student medical records. The admin UI selects one complete Asia/Manila month using Month/Year dropdowns and auto-updating Records scope. Monthly database restrictions and administrator RLS stay enforced. Exact aggregate counts are requested; migration `0011_exact_report_counts.sql` is **proposed, not applied**. Until approval/application, the existing database still returns null for admin counts 1–4 (shown as "<5"). Clinic personnel retain exact counts for arbitrary date ranges. See `docs/ADMIN_REPORTS.md` for the exact helper change and rollback.
- FR-RPT-4 Reports display on screen and can be printed or saved as PDF through a print-friendly layout. This covers "display or export" *(Fig. 7, 7.4)*. **[P]**; **[R]** mechanism
- FR-RPT-5 Dashboard counters, by role: **[R]**
  - clinic personnel: visits today, pending appointments, today's appointments, low stock, expiring soon, incidents this month
  - administrator: visits this month, incidents this month, appointments by status, active users by role
- FR-RPT-6 CSV export and bar charts. **[OPT]**

### 4.9 User Management (USR) — DFD 8.0
- FR-USR-1 Administrators create user accounts, assign roles, and control access. **[P]** §5, Fig. 6
- FR-USR-2 A student account is linked to at most one student record, and each student record to at most one account. Self-registered accounts are linked only by clinic personnel approval. Accounts that administrators create for students are linked at creation. **[R]**, **[D]**
- FR-USR-3 Administrators can deactivate and reactivate accounts, change roles, and set a temporary password. **[R]**
- FR-USR-4 An administrator cannot deactivate or demote their own account. **[R]**

---

## 5. Non-functional requirements

Mapped to the ISO/IEC 25010 characteristics the paper uses for evaluation *(Paper SOP Q4, Ref [5])*.

| ID | Characteristic | Requirement | Source |
|----|----------------|-------------|--------|
| NFR-1 | Functional suitability | Every [P] requirement works end to end and passes its test case. | [P] |
| NFR-2 | Usability | Consistent sidebar layout. Labeled forms with inline validation and clear errors. Recording a visit takes 3 clicks or fewer from the dashboard. | [P] obj 10, [R] |
| NFR-3 | Usability | Responsive from 360px up to desktop. Optimized for the clinic desktop. | [C] |
| NFR-4 | Accessibility | WCAG 2.1 AA contrast, keyboard navigation, visible focus. | [R] |
| NFR-5 | Reliability / Integrity | Inventory changes are atomic. Validation runs in the browser, on the server, and as database constraints. | [R] |
| NFR-6 | Reliability | Database backups. Use the Supabase plan's backups if available; otherwise a documented manual export. | [P] Rec 4, [?] Q-T3 |
| NFR-7 | Performance efficiency | Lists are paginated (10 rows) and searched through indexed columns. Pages respond in under 2 seconds on normal campus internet (target, not measured by the stabilization tests). | [R] |
| NFR-8 | Security | Login required for every page except the login page. RLS on every table. The service-role key stays on the server. | [P] obj 8, [R] |
| NFR-9 | Privacy | Data Privacy Act of 2012 (RA 10173) and university policy: least privilege, minimum data, no real data without authorization. | [P] §3.F |
| NFR-10 | Maintainability | TypeScript strict mode, generated database types, one folder per module, minimal dependencies. | [C] |
| NFR-11 | Portability | Current Chrome, Edge, and Firefox. Deploys to Vercel. | [C] |

---

## 6. Modules and pages

### 6.1 Route map **[R]**

```
app/
  (public)/login/                 Login (email + password)
  (public)/register/              Student self-registration (email, Student ID, password)
  auth/confirm/                   Email verification callback (route handler)
  (clinic)/                       Sidebar layout. Roles: admin, clinic_staff
    dashboard/                    Role-aware counters
    students/                     List, search, filters (clinic_staff)
    students/new/                 Add student (empty health record auto-created)
    students/[id]/                Profile + tabs: Health Record | Visits | Appointments | Incidents | Medications
    students/[id]/edit/
    students/[id]/health/edit/
    students/registrations/       Pending student registrations: approve link (clinic_staff)
    visits/  visits/new/  visits/[id]/
    appointments/  appointments/new/
    medications/  medications/new/  medications/[id]/
    incidents/  incidents/new/  incidents/[id]/
    reports/                      Aggregate reports (admin, clinic_staff)
    reports/student/[id]/         Student clinic history (clinic_staff)
    settings/clinic-hours/        Clinic hours (clinic_staff)
    admin/users/                  User management (admin)
    account/                      Change own password
  (portal)/                       Minimal layout. Role: student
    portal/                       My appointments
    portal/request/               Request an appointment
    portal/account/               Change password
proxy.ts                          Session refresh + redirect to /login
```

`/` redirects by role: administrators and clinic personnel to `/dashboard`, students to `/portal`, signed-out users to `/login`.

### 6.2 Sidebar by role **[R]**
- **Clinic personnel:** Dashboard · Students · Visits · Appointments (pending count) · Medications · Incidents · Reports · Clinic Hours · Account · Logout
- **Administrator:** Dashboard · Reports · Users · Account · Logout

### 6.3 UI conventions **[C]** + **[R]**
- shadcn/ui primitives: Button, Input, Textarea, Select, Table, Dialog, Sheet (mobile sidebar), Tabs, Badge, Card (compact), DropdownMenu, Sonner, Popover, Calendar.
- Dense tables, small stat tiles, 14px data text. No oversized cards, heavy gradients, or decorative animation.
- Fixed status colors everywhere: Pending amber, Approved blue, Completed green, Declined and Cancelled gray, Low stock amber, Expired red, DEMO outlined neutral.
- Every list has an empty state, a loading skeleton, and an error state.
- Impeccable skill: design tokens in Phase 1, polish and audit in Phase 8.

---

## 7. Data validation rules **[R]**
- Student number: required and unique. Format is free text until the WUP format is confirmed (Q-D2). Demo records use the prefix `DEMO-`.
- Names: required, 1–80 characters. Birth date in the past. Philippine mobile format for contact numbers (optional field).
- Appointment request: date within the configured open days and the allowed days ahead; time within opening and closing hours.
- Issue quantity: whole number of 1 or more, no more than the current stock.
- Medicine expiration date: required.
- Free-text clinical fields: 2,000 characters maximum.
- The same zod schemas validate both the form and the server action. Database constraints and triggers are the last line of defense.

---

## 8. Main workflows

### 8.1 Login and routing **[P]** Fig. 3
1. The user opens WUPCare. If signed out, the user is sent to `/login`.
2. The user enters email and password. Supabase Auth checks them.
3. Invalid: show an error and stay on the login page.
4. Valid: load the user's profile. If the profile is missing or inactive, sign the user out and show an error.
5. Identify the role and show the matching dashboard (`/dashboard` or `/portal`).
6. The user selects a module, enters or retrieves information, the system validates it, stores or retrieves it, and displays the result. The user continues or logs out *(Fig. 3 loop)*.
7. Logout ends the session.

### 8.2 Clinic visit **[P]** DFD 3.1–3.5
1. Clinic personnel find the student by number or name. If the student is not found, they add the student first (2.1, 2.2).
2. They open **New Visit** (3.1). The form shows the student's allergies and conditions.
3. They enter reason, symptoms, concern category, and assessment (3.2).
4. They enter treatment and, optionally, medication rows: medicine and quantity (3.3). The list shows only active, unexpired medicines that are in stock.
5. They enter follow-up instructions (3.4).
6. On save (3.5), one database call saves the visit and each issuance and decreases stock. If any step fails, nothing is saved.

### 8.3 Appointment **[P]** DFD 4.1–4.5
```
student or staff submits (4.1) ──> pending
pending ── staff reviews (4.2) ──> approved (schedule set, 4.3)
                              └──> declined (remark required)
pending ── student or staff cancels ──> cancelled
approved ── staff reschedules (4.4) ──> approved (new schedule, remark, reschedule_count + 1)
approved ── staff cancels (4.4) ──> cancelled
approved ── student attends ──> completed  (optional: "Record visit" with student preselected)
all appointments remain as history (4.5)
```

### 8.4 Student portal **[D]**
1. The student logs in and lands on `/portal`: a list of their own appointments with status, schedule, and staff remarks. If clinic personnel have not yet approved the account's link, the portal shows "Waiting for clinic approval" and nothing else.
2. **Request Appointment**: the student enters preferred date, preferred time, and reason. The form allows only times within the configured clinic hours.
3. The request is saved as `pending`.
4. The student can cancel it while it is still `pending`.
5. The student sees status changes when they reload the page. There are no notifications.

### 8.5 Medication inventory **[P]** DFD 5.1–5.6
- **Add (5.1):** name, unit, reorder level, expiration date, starting stock. The starting stock is saved as a restock transaction.
- **Restock or adjust (5.2):** quantity and notes. A reason is required for adjustments.
- **Issue (5.3, 5.4):** from a visit, from an incident, or standalone from the medicine page with a selected student. The database locks the medicine row, checks stock and expiry, decreases stock, and saves the transaction.
- **Monitor (5.5):** low-stock and expiry flags on the inventory list and the dashboard.
- **Records (5.6):** transaction history per medicine, and the medication usage report.

### 8.6 Health incident **[P]** DFD 6.1–6.5
1. Clinic personnel open **New Incident** and select the student (6.1).
2. They choose the incident type (6.2) and enter date and time, location, description, and action taken (6.3).
3. They optionally add medication given (same issuance function) and a link to a visit.
4. On save (6.4), the incident appears in the incident log and the student history (6.5).

### 8.7 Reports **[P]** DFD 7.1–7.4
The user picks a report, date range, and scope (Real / Demo / All). The database function checks the user's role, retrieves the records (7.1), aggregates them (7.2), and returns the result (7.3). The page displays the table and can be printed or saved as PDF (7.4). Administrators see aggregate reports only.

### 8.8 User management **[P]** DFD 8.0
1. The administrator opens **New User** and enters role, full name, email, and a temporary password.
2. For a student account, the administrator picks the student profile from a list showing only student number and name, and only students who have no account yet.
3. A server-only action creates the Supabase Auth user and the profile row.
4. The administrator can change roles, deactivate or reactivate accounts, and set a new temporary password.

### 8.10 Student self-registration **[D]**
1. The student opens `/register` and enters email, Student ID, and password. The app calls Supabase Auth `signUp`; the Student ID is sent as `user_metadata.student_number`.
2. Supabase Auth sends its built-in verification email. The student confirms through `/auth/confirm`.
3. When the email is confirmed, the database creates a `student` profile with no student link and stores the entered Student ID for review. Nothing the user submits can choose the role.
4. Clinic personnel open the pending registrations list (account email and entered Student ID). They verify the student's identity, for example from a school ID presented at the clinic, and approve the link to the matching existing student record. Only active, real student records without an account can be linked.
5. After approval, the account name is taken from the student record, and the student can request appointments for that record only.
6. Accounts that are never approved keep no access. Administrators can deactivate them.

Email delivery **[?] Q-A1**: Supabase's built-in email service is for development. It sends only to addresses on the Supabase organization's team, at a low hourly limit. Real students will not receive verification emails until this is resolved. Clinic approval (step 4) stays the access gate in every case.

### 8.9 Clinic hours **[D]**
Clinic personnel set open days, opening time, closing time, and the maximum number of days ahead a request can be made. The defaults are Monday to Friday, 08:00–17:00, 30 days ahead, until the real schedule is confirmed (Q-F5).

---

## 9. Database design

### 9.1 Entity relationships
Based on the ERD *(Fig. 4)*. Section 14.1 explains each difference.

```
auth.users 1──1 profiles
profiles 0..1──0..1 students               (student login link; not in ERD)
profiles 1──* students                     (created_by: "authorized clinic personnel")
students 1──1 health_records               (ERD shows 1──*; see 14.1)
students 1──* clinic_visits                *──1 profiles (attended_by)
students 1──* appointments                 *──0..1 profiles (handled_by)
students 1──* health_incidents             *──1 profiles (recorded_by)
medicines 1──* medication_transactions     *──1 profiles (performed_by)
students 0..1──* medication_transactions   (issuance rows; ERD "Medication STUDENT_ID")
clinic_visits 0..1──* medication_transactions ("if dispensed during a visit")
health_incidents 0..1──* medication_transactions
appointments 0..1──0..1 clinic_visits      (clinic_visits.appointment_id)
health_concern_categories 1──* clinic_visits
clinic_settings                            (single row)
```

### 9.2 Enums and lookup data **[R]**
- `user_role`: `admin`, `clinic_staff`, `student`
- `student_status`: `active`, `inactive`, `graduated`
- `appointment_status`: `pending`, `approved`, `declined`, `cancelled`, `completed`
- `incident_type`: `illness`, `injury`, `accident`, `other`
- `med_txn_type`: `issuance`, `restock`, `adjustment`
- **Health concern categories [D]:** a small lookup table, seeded with 10 entries: Headache, Fever, Cough / Colds, Stomach Ache / Gastrointestinal, Dysmenorrhea, Dizziness, Wound / Minor Injury, Allergy / Skin, Toothache, Other. A table is used instead of an enum so the clinic can change the list later without a migration. A UI to manage the list is [OPT].

### 9.3 Tables
All tables have `id uuid primary key default gen_random_uuid()` and `created_at timestamptz not null default now()`. Editable clinical tables also have `updated_at` and `updated_by`.

**profiles**: application user, 1:1 with `auth.users`
| column | type | notes |
|---|---|---|
| id | uuid PK, FK → auth.users(id) on delete cascade | |
| full_name | text not null | |
| email | text not null | copy for display |
| role | user_role not null | |
| student_id | uuid null unique FK → students(id) | CHECK: null unless role = `student`. A student account with null `student_id` is waiting for approval (§8.10). |
| requested_student_number | text null | Student ID entered at self-registration. Shown to clinic personnel only; never used for access. |
| is_active | boolean not null default true | |

**students**
| column | type | notes |
|---|---|---|
| student_number | text not null unique | demo: `DEMO-0001` to `DEMO-0018` |
| first_name, middle_name, last_name | text | middle name optional |
| sex | text check in ('male','female') | |
| birth_date | date | |
| college | text | [?] Q-D1 official names |
| program | text | |
| year_level | smallint check between 1 and 6 | college; [?] Q-S2 |
| contact_number, email, address | text null | |
| guardian_name, guardian_relationship, guardian_contact | text null | stored only |
| status | student_status not null default 'active' | |
| **is_demo** | boolean not null default false | **[C]** |
| created_by | uuid FK → profiles | |

Indexes: unique `student_number`; `(last_name, first_name)`; `is_demo`.

**health_records** (1:1 with students)
| column | type | notes |
|---|---|---|
| student_id | uuid not null unique FK → students | |
| medical_history | text | [P] |
| allergies | text | [P] |
| existing_conditions | text | [P] |
| immunizations | text | [P] |
| health_notes | text | [P] |
| emergency_contact_name, emergency_contact_relationship, emergency_contact_number | text | [P] |
| updated_by, updated_at | | |

**health_concern_categories**
| column | type | notes |
|---|---|---|
| name | text not null unique | |
| sort_order | smallint | |
| is_active | boolean default true | |

**clinic_visits**
| column | type | notes |
|---|---|---|
| student_id | uuid not null FK → students | |
| visit_at | timestamptz not null default now() | |
| reason | text not null | [P] |
| symptoms | text | [P] |
| concern_category_id | uuid not null FK → health_concern_categories | [D] |
| assessment | text | [P] |
| treatment | text | [P] |
| follow_up_instructions | text | [P] |
| attended_by | uuid not null FK → profiles | [P] |
| appointment_id | uuid null unique FK → appointments | [R] |
| updated_by, updated_at | | |

Indexes: `(student_id, visit_at desc)`, `visit_at`, `concern_category_id`.

**appointments**
| column | type | notes |
|---|---|---|
| student_id | uuid not null FK → students | |
| requested_by | uuid not null FK → profiles | student or staff |
| reason | text not null | |
| preferred_date | date not null | |
| preferred_time | time not null | |
| scheduled_at | timestamptz null | set on approve or reschedule |
| status | appointment_status not null default 'pending' | |
| reschedule_count | smallint not null default 0 | |
| staff_remarks | text null | visible to the student |
| handled_by | uuid null FK → profiles | |
| updated_at | | |

Indexes: `(status, scheduled_at)`, `(student_id, created_at desc)`.

**clinic_settings** (exactly one row) **[D]**
| column | type | notes |
|---|---|---|
| id | smallint PK check (id = 1) | single row |
| open_days | smallint[] | ISO weekdays; default `{1,2,3,4,5}` |
| open_time | time | default 08:00 |
| close_time | time | default 17:00, CHECK close > open |
| max_days_ahead | smallint | default 30 |
| updated_by, updated_at | | |

**medicines**
| column | type | notes |
|---|---|---|
| name | text not null | e.g. "Paracetamol 500mg" |
| unit | text not null | tablet, capsule, bottle, sachet |
| stock_quantity | integer not null default 0, **CHECK ≥ 0** | [P] |
| reorder_level | integer not null default 10 | |
| expiration_date | date not null | [P] |
| is_active | boolean not null default true | |
| is_demo | boolean not null default false | [C] |

**medication_transactions** (append-only)
| column | type | notes |
|---|---|---|
| medicine_id | uuid not null FK → medicines | |
| type | med_txn_type not null | |
| quantity | integer not null, CHECK ≠ 0 | negative for issuance |
| student_id | uuid null FK → students | CHECK: required when type = `issuance` |
| clinic_visit_id | uuid null FK → clinic_visits | |
| incident_id | uuid null FK → health_incidents | |
| notes | text | CHECK: required when type = `adjustment` |
| performed_by | uuid not null FK → profiles | |

Indexes: `(medicine_id, created_at desc)`, `student_id`, `created_at`.

**health_incidents**
| column | type | notes |
|---|---|---|
| student_id | uuid not null FK → students | |
| occurred_at | timestamptz not null | |
| type | incident_type not null | [P] |
| location | text | [R] |
| description | text not null | [P] |
| action_taken | text not null | [P] |
| clinic_visit_id | uuid null FK → clinic_visits | [R] |
| recorded_by | uuid not null FK → profiles | [P] |
| updated_by, updated_at | | |

**[OPT] audit_log**: who changed which clinical record, written by triggers. Useful for the Data Privacy Act. Skip if time is short; `updated_by` and `updated_at` remain the baseline.

Total baseline: **10 tables** (`profiles`, `students`, `health_records`, `health_concern_categories`, `clinic_visits`, `appointments`, `clinic_settings`, `medicines`, `medication_transactions`, `health_incidents`).

### 9.4 Database functions and triggers **[R]**
- `current_user_role()` and `current_student_id()`: `security definer`, `stable`, `search_path` fixed. They return null for inactive or missing profiles. RLS policies use them.
- `issue_medication(...)`: locks the medicine row, checks active, unexpired, and enough stock, decreases stock, and inserts the transaction. Raises a readable error on failure.
- `restock_medication(...)`, `adjust_medication(...)`: same pattern.
- `create_visit_with_medications(visit jsonb, items jsonb)`: saves the visit and all issuances in one transaction.
- `report_*` functions (visits, concerns, medication usage, incidents, appointments): `security definer`. They check that the caller is `admin` or `clinic_staff`, take `p_from`, `p_to`, and `p_scope` (`real`, `demo`, `all`), and return **counts only**. This is how administrators see aggregates without table access.
- `students_without_account()`: `security definer`, admin only. Returns `id`, `student_number`, and full name.
- `approve_student_link(profile, student)`: `security definer`, clinic personnel only. Links a pending self-registered student account to an active, real student record that has no account, and copies the student's name to the profile.
- `on_auth_user_created` (trigger on `auth.users`): creates the profile. Admin-created accounts use `app_metadata.wupcare_role` (service role only). Self-registered accounts get a `student` profile only once the email is confirmed. It never changes an existing profile.
- Triggers:
  - create an empty health record when a student is inserted
  - set `updated_at` and `updated_by` on updates
  - validate a student's appointment request against `clinic_settings`, and allow students only the `pending → cancelled` change on their own rows

### 9.5 Demo / Real flag **[R]**
Only `students` and `medicines` carry `is_demo`. Visits, appointments, incidents, and transactions inherit it through their student or medicine. This prevents a demo visit from being attached to a real student. Filters and reports join on `students.is_demo` (or `medicines.is_demo` for inventory).

---

## 10. Authentication and authorization

### 10.1 Authentication **[D]** + **[R]**
- Supabase Auth, email and password. `@supabase/ssr` keeps the session in secure cookies.
- Email sign-ups are enabled for student self-registration only (§8.10), with "Confirm email" on. Clinic personnel accounts are created by administrators through a server action using the service-role key. The initial administrator is provisioned once, as documented in `docs/AUTH_PROVISIONING.md`.
- `proxy.ts` refreshes the session and sends signed-out users to `/login`. It is an early check only; Next.js docs say Proxy must not be the only authorization layer.
- `lib/auth/dal.ts` (server-only):
  - `getAuthState()` uses `supabase.auth.getClaims()`, which verifies the JWT signature (current Supabase guidance), then loads the profile. The role always comes from `profiles`, never from `user_metadata`.
  - `requireRole(...roles)` redirects when the user is signed out, inactive, or has the wrong role.
  - Every page, layout, and server action calls `requireRole` before touching data.
- `SUPABASE_SERVICE_ROLE_KEY` is used only in `lib/supabase/admin.ts`, marked `server-only`. It never has a `NEXT_PUBLIC_` prefix.

### 10.2 Three layers of authorization **[R]**
1. **UI:** the sidebar and buttons show only what the role can use. Convenience only.
2. **Server:** `requireRole` in every page and server action.
3. **Database:** RLS on every table. This is the real security boundary.

### 10.3 RLS policies **[R]**
`staff` = `current_user_role() = 'clinic_staff'`, `admin` = `current_user_role() = 'admin'`, `own` = `student_id = current_student_id()`.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | own row; admin all; staff all (names only shown) | admin | admin | none |
| students | staff | staff | staff | none |
| health_records | staff | trigger, staff | staff | none |
| health_concern_categories | staff, admin | none ([OPT] staff) | none ([OPT] staff) | none |
| clinic_visits | staff | staff (via function) | staff | none |
| appointments | staff; student own | staff; student own with status `pending` | staff; student own, `pending → cancelled` only | none |
| clinic_settings | any signed-in active user | none | staff | none |
| medicines | staff | staff | staff | none |
| medication_transactions | staff | via functions only | none | none |
| health_incidents | staff | staff | staff | none |

Administrators have **no** SELECT policy on clinical tables. They reach aggregate data only through the `report_*` functions, which apply the month-level and small-count limits in FR-RPT-3a. Inactive users get null from `current_user_role()`, so every policy denies them.

---

## 11. Demo data strategy **[C]** + **[D]**

- **18 fictional students** `DEMO-0001` to `DEMO-0018`, all `is_demo = true`, with obviously fictional names. Emails use the reserved `example.edu` domain. All are college students with fictional colleges and programs.
- Each demo student has a health record. Some have generic allergies or conditions, for example "seasonal allergic rhinitis". No real people and no real medical data.
- Related demo data:
  - about 40 visits spread over the last 3 months, across all concern categories
  - about 15 appointments in every status
  - about 8 incidents of all types
  - about 12 common over-the-counter medicines (`is_demo = true`), including some low-stock items and one expired item
- Issuances in the seed go through the inventory functions so the stock ledger stays consistent.
- **Demo accounts** (passwords in the README only; change or remove before real use):
  - `admin@wupcare.test`: Administrator
  - `nurse@wupcare.test`: Clinic Personnel
  - `student@wupcare.test`: Student, linked to `DEMO-0001`
- **Clear separation:**
  - DEMO badge on every demo row and detail header.
  - Real / Demo / All filter on students, visits, appointments, incidents, medicines, and every report.
  - Lists default to All (with badges). Reports default to Real only.
  - Records created through the UI are always real (`is_demo = false`). The UI cannot set the flag.
- **Seeding:** `supabase/seed.sql` (idempotent: removes demo rows, then re-inserts) and `scripts/seed-users.ts` for the demo accounts. Run only after approval.
- **Removal:** `supabase/remove-demo.sql` deletes only rows where `is_demo` is true and their linked rows. Real records are never touched. An admin button for this is [OPT].
- **Real records:** no real student data is entered until institutional authorization is obtained *(Paper §3.F)*.

---

## 12. Security, integrity, and privacy

Basis: RA 10173 (Data Privacy Act of 2012), university policy, and Paper §3.F **[P]**. Mechanisms are **[R]**.

1. **Least privilege:** clinic personnel are the only role that sees clinical records. Administrators see aggregates. Students see only their own appointments.
2. **No real data without authorization.** Demonstrations use fictional data only.
3. **Secrets:** the service-role key is server-only. `.env.local` is gitignored. Vercel environment variables are set per environment.
4. **Transport and cookies:** HTTPS (Vercel default). Secure, HttpOnly session cookies (Supabase SSR default).
5. **Passwords:** hashed by Supabase Auth. Minimum 8 characters. Forced change at first login is [OPT].
6. **No hard deletes** of students, health records, visits, appointments, incidents, medicines, or transactions. Corrections record who made them and when.
7. **Integrity:** foreign keys, unique and CHECK constraints, non-negative stock, atomic inventory functions.
8. **Input handling:** zod validation on the server. React escapes output. User content is never rendered as raw HTML.
9. **Errors:** generic login errors. No SQL errors or stack traces shown to users.
10. **Disclaimer** on the login page and footer.
11. **Retention and disposal** follow the university's approved procedures. Nothing is automated (Q-S4).
12. **Backups:** NFR-6.
13. **Supabase security advisor** runs after migrations are applied, and again before demo sign-off.

---

## 13. Acceptance criteria

**AUTH**
- [ ] Each demo account logs in with email and password and lands on the correct page. Wrong credentials show an error. Logout returns to `/login`.
- [ ] Opening any internal URL while signed out redirects to `/login`.
- [ ] A deactivated account cannot log in.

**Role isolation**
- [ ] The student account cannot open any clinic page. A direct Supabase query from the student session returns no rows from `students`, `health_records`, `clinic_visits`, or `health_incidents`, and only its own `appointments`.
- [ ] The administrator account sees Dashboard, Reports, and Users only. A direct Supabase query from the admin session returns no rows from `students`, `health_records`, `clinic_visits`, `health_incidents`, or `medication_transactions`.
- [ ] The administrator cannot open `/reports/student/[id]`.

**STU / HR**
- [ ] Clinic personnel add a student. An empty health record is created automatically. A duplicate student number is rejected.
- [ ] Search by part of a name or number works. The Real/Demo filter works. DEMO badges show.
- [ ] The student page shows the profile, health record, and history of visits, appointments, incidents, and medications.
- [ ] Health record edits save and show who updated them and when.

**VIS**
- [ ] A visit with all [P] fields, a concern category, and 2 medications saves. Both stocks drop by the issued amount. Both transactions appear.
- [ ] Issuing more than available stock fails, and neither the visit nor any issuance is saved.
- [ ] Older visits stay visible in the student history. No delete action exists.

**APT**
- [ ] A student requests an appointment. Clinic personnel see it as pending, approve it with a schedule, and the student sees Approved with the schedule.
- [ ] Decline (with remark), reschedule, cancel, and complete all work and are visible to the student.
- [ ] A request outside the configured clinic hours is rejected, both in the form and by the database.
- [ ] Changing clinic hours in Settings changes what the request form accepts.
- [ ] A student can cancel only their own pending request.

**MED**
- [ ] Add, restock, and adjust work and are logged. Stock never goes negative.
- [ ] Low-stock, expiring, and expired flags show correctly. Expired medicine cannot be issued.

**INC**
- [ ] Each incident type can be recorded, with optional medication. Incidents appear in the log and the student history.

**RPT**
- [ ] All 5 aggregate reports render for a date range, with the scope filter, for both administrator and clinic personnel, and print cleanly.
- [ ] The student clinic history report prints for clinic personnel.
- [ ] Report totals match manual SQL counts for one test date range.
- [ ] Dashboard counters match the data.

**REG**
- [ ] A student self-registers with email, Student ID, and password, and confirms the email. The account has the `student` role and sees "Waiting for clinic approval".
- [ ] Before approval, the account reads no appointments, students, or health records, and cannot request an appointment, even with a guessed student id.
- [ ] Clinic personnel see the pending registration and approve the link. The student can then request appointments for that record only.
- [ ] Registration data cannot produce an administrator or clinic personnel account.

**USR**
- [ ] The administrator creates a clinic personnel account and a student account linked to a student, changes a role, deactivates and reactivates an account, and sets a new temporary password.
- [ ] Clinic personnel cannot open `/admin/users`.

**NFR**
- [ ] Layouts work at 360px, 768px, and 1280px with no horizontal page scroll.
- [ ] `npm run build` and `npm run lint` pass. No TypeScript errors.
- [ ] The Supabase security advisor shows no critical warnings.
- [ ] The test case document (case, expected, actual, pass/fail) is complete *(Paper §3.E)*.

---

## 14. Diagram comparison (Figures 2–7)

Figures were rendered from the PDF and compared with this spec on 2026-10-14.

### 14.1 ERD (Fig. 4)

| ERD element | WUPCare design | Status |
|---|---|---|
| User | `profiles` (+ `auth.users`) | Match |
| Student | `students` | Match |
| Health Record | `health_records` | Match |
| Clinic Visit | `clinic_visits` | Match |
| Appointment | `appointments` | Match |
| Health Incident | `health_incidents` | Match |
| Medication | `medicines` | Match |
| Medication Transaction | `medication_transactions` | Match |
| Second "Medication (STUDENT_ID FOREIGN_KEY)" box | Merged into `medication_transactions`: issuance rows carry `student_id` | **Deviation, simplification** |
| User → Student ("authorized clinic personnel") | `students.created_by` | Match |
| User → Clinic Visit ("authorized clinic personnel") | `clinic_visits.attended_by` | Match |
| User → incidents ("to record incidents") | `health_incidents.recorded_by` | Match. In the figure, the line ends at the second Medication box, which looks like a drawing error. |
| Student 1 ── * Clinic Visit, Appointment, Health Incident | Same | Match |
| Clinic Visit 1 ── * Medication Transaction ("if dispensed during a visit") | `medication_transactions.clinic_visit_id` (nullable) | Match |
| Medication 1 ── * Medication Transaction | `medication_transactions.medicine_id` | Match |
| Health Incident ── Medication (student) | `medication_transactions.incident_id` | Match |
| Student ── Health Record drawn with crow's feet (many) | **1:1**. Each student has one current health record, as the brief requires. | **Deviation** |
| Appointment ── Medication Transaction line | Not implemented. Medicine is given during a visit, and a completed appointment links to that visit. | **Deviation** |
| Not in ERD | `profiles.student_id` (student login), `clinic_visits.appointment_id`, `health_concern_categories`, `clinic_settings` | **Addition** |

### 14.2 DFDs (Fig. 5–7) and conceptual framework (Fig. 2)

| Diagram element | WUPCare design | Status |
|---|---|---|
| Fig. 2 inputs, processes (including data validation), outputs | All covered | Match |
| Level 1 processes 1.0–8.0 | Modules 4.1–4.9 | Match |
| 2.1 Add, 2.2 Validate, 2.3 Create/Update, 2.4 Retrieve Health Record | FR-STU, FR-HR | Match |
| 3.1–3.5 Visit record, symptoms, treatment and medication, follow-up, save | FR-VIS | Match |
| 4.1–4.5 Submit, review, approve or update, reschedule or cancel, history | FR-APT | Match |
| 5.1–5.6 Add, update stock, issuance, update inventory, monitor expiry, records | FR-MED | Match |
| 6.1–6.5 Record, identify type, action taken, save, retrieve history | FR-INC | Match |
| 7.1–7.4 Retrieve, process, generate, display or export | FR-RPT. Export = print / save as PDF. | Match |
| Administrator: system accounts, access management, authorized reports | FR-USR, aggregate reports | Match |
| Student → "appointment request" / "service request" | Student portal | Match |
| Student → 2.1 Add Student Information (Fig. 7) | Clinic personnel enter student information. Students do not. | **Deviation [D]** |
| 2.5 Display Student Health Info / "record view" → Student (Fig. 5–7) | Students see appointment records only | **Deviation [D]** |
| Parent/Guardian (optional) | Excluded | **Deviation, allowed by the paper** |
| 1.0 and 8.0 have no Level 2 breakdown | Defined in workflows 8.1 and 8.8 | Gap in the diagrams |
| Fig. 3 flowchart: login → validate → identify role → dashboard → module → validate → store/retrieve → result → continue or logout; reports on request | Workflow 8.1 | Match |
| Fig. 3 "Enter Username & Password" | Email and password | **Deviation [D]** |

### 14.3 Manuscript updates the researchers should make
These keep the paper consistent with the agreed system. They are recommendations, not code changes.
1. Change "username and password" to "email and password" in §5 (User Login) and Fig. 3.
2. Fig. 4: draw Student ── Health Record as one-to-one, merge the second Medication box into Medication Transaction, and remove the Appointment ── Medication Transaction line (or justify it).
3. Fig. 5–7: relabel the student's "record view" as "appointment status", and remove the Student → 2.1 flow, or explain that students only request appointments.
4. State in §1 / §3.D that administrators see aggregate reports only, in line with the Data Privacy Act.
5. Mark Parent/Guardian as excluded from the current scope in Fig. 5–7.
6. Optionally add Level 2 breakdowns for 1.0 (authentication) and 8.0 (user management).

### 14.4 Still requires verification
- The ERD crow's-foot notation is ambiguous in several places (for example the Student end of the Student ── Health Record line, and the "to record incidents" line). The researchers must confirm the intended cardinalities.
- Fig. 1 (Agile SDLC) was not compared because it does not define system behavior.
- The paper defines no fields for most entities. Field lists in Section 9.3 come from Paper §5–§6 text plus recommendations. The clinic should review them against its existing paper forms (Q-F7).

---

## 15. Decisions and open items

### 15.1 Decisions applied (2026-10-14) **[D]**
| # | Decision |
|---|---|
| 1 | Email and password through Supabase Auth. |
| 2 | Disable `cacheComponents` (and `partialPrefetching`, which depends on it). |
| 3 | Administrator: user management and aggregate reports only. No individual clinical record access by default. |
| 4 | Clinic personnel: manage student profiles, health records, visits, appointments, inventory, and incidents. |
| 5 | Student: appointment requests and appointment status only. |
| 6 | Use the existing Supabase project. The developer has access. |
| 7 | College students initially, pending client confirmation. |
| 8 | Simple predefined health concern categories. |
| 9 | Clinic hours are configurable. The actual schedule is pending confirmation. |
| 10 | 18 fictional demo students with clear Demo/Real separation. |
| 11 | Student self-registration (email, Student ID, password) with Supabase Auth's built-in email verification. Clinic personnel approve the link to the student record. Administrators create clinic personnel. No third-party email service. |
| 12 | Administrator reports: whole months only, counts below 5 hidden (FR-RPT-3a). |

### 15.2 Simplifications applied **[R]**
- Appointment `rescheduled` status removed. A reschedule keeps `approved` and increments `reschedule_count`.
- Severity, referral, vital signs, disposition, batch tracking, audit log, CSV export, charts, and calendar view are all [OPT].
- Optional health record fields (blood type, height, weight) and medicine fields (generic name, dosage form) removed from the baseline.

### 15.3 Pending client confirmation
Each item has a working default, so none blocks Phase 1.

| ID | Question | Working default | Needed by |
|---|---|---|---|
| Q-S1 | Which WUP campus and clinic? | One clinic, unnamed | Phase 8 |
| Q-S2 | Confirm college students only, or include Basic Ed / Senior High? | College only | Phase 3 |
| Q-S4 | Any university data-retention or disposal rule? | Archive statuses only, no auto-deletion | Phase 8 |
| Q-F2 | Does the clinic have its own concern category list? | The 10 categories in 9.2 | Phase 4 |
| Q-F5 | Actual clinic days and hours, and how far ahead students may book? | Mon–Fri, 08:00–17:00, 30 days | Phase 5 |
| Q-F7 | Must reports or forms match existing paper templates? | Generic print layout | Phase 7 |
| Q-D1 | Official college and program names? | Free text | Phase 3 |
| Q-D2 | WUP student number format? | Free text, unique | Phase 3 |
| Q-T3 | Supabase plan and backup method? | Plan backups, or a documented manual export | Phase 8 |
| Q-ERD | Researchers confirm the ERD deviations in 14.1. | Proceed with this spec | Phase 2 |
| Q-A1 | How will real students receive verification emails? Supabase's built-in email service delivers only to the organization's team members. Options: an institutional SMTP server, or turning off "Confirm email" and relying on clinic approval alone. | Development: team member addresses only | Before real use |

---

## 16. Implementation status (2026-10-14)

All modules in §4 are implemented and tested (see `docs/TEST_CASES.md`). How the build differs from, or adds to, the sections above:

| Area | As built |
|---|---|
| Student self-registration (§8.10) | `/register`, `/auth/confirm`, and `/students/registrations` are built behind the server setting `STUDENT_REGISTRATION=enabled` (off by default). Migration 0010 is applied (live version `20261020032859`, verified 2026-10-20); the pending-registration schema and approval function exist. Registration remains controlled by `STUDENT_REGISTRATION`. Auth/email delivery settings and a complete live registration flow were not reverified in the stabilization run, so production readiness is unconfirmed. |
| First administrator (§10.1) | `scripts/create-admin.mjs`, one-time; refuses if an administrator exists. No credentials in code. |
| Clinic hours | Edited on `/settings/clinic-hours`; defaults Mon–Fri 08:00–17:00, 30 days ahead (Q-F5 open). |
| Staff appointment booking | Saved directly as approved at the chosen time; clinic-hours limits apply to student requests only. |
| Sensitive actions | Shared Radix confirmation dialogs guard account access/role changes, temporary passwords, archiving, appointment decline/reschedule/cancel, medicine deactivation/stock adjustment, pending-request cancellation and registration approval. Ordinary edits stay direct. Server authorization and retention rules are unchanged; see docs/CONFIRMATIONS.md. |
| Medicines | Starting stock is a restock transaction. The same name with the same expiry is blocked (restock instead). A different expiry is a separate row (FR-MED-9). |
| Visits and incidents | Saved together with their medication in one database transaction. Issued medicines are corrected only by a stock adjustment. |
| Reports | Five aggregate reports plus the student history report. Printing hides the app shell. Administrator limits per FR-RPT-3a. |
| States | Every route group has a loading skeleton and an error panel, and there is a 404 page. Lists are paged at 10 rows; a page number past the end returns to page 1 with filters retained. |
| Accessibility | WCAG 2.1 AA checks pass (axe, keyboard, 200% zoom, 320px reflow, forced colors). Skip link, visible focus, linked field errors. |
| Demo data | `supabase/seed.sql` (18 students, 12 medicines, ~40 visits, 15 appointments, 8 incidents) has been applied to the project. `supabase/remove-demo.sql` removes demo data only. |
| Development accounts | `dev-admin@`, `dev-nurse@`, `dev-student@wupcare.test` exist for development and must be removed before real use (`docs/DEPLOYMENT.md`). |

Remaining limitations:
- Email delivery for real students (Q-A1).
- Leaked-password protection is off (Auth setting).
- The service-role key must be rotated before deployment.
- [OPT] items (CSV export, charts, calendar, audit log, vital signs) were not built.

### 16.1 Stabilization contract - 2026-10-20

- Display-name saves use 2-120 normalized characters; controls, invisible format characters, line/paragraph separators, and `< > { }` are rejected before whitespace normalization. Ordinary spaces are collapsed and trimmed; Filipino names and lowercase `s` are preserved. Central role fallbacks apply only to missing/blank names: admin: Administrator, clinic_staff: Nurse, student: Student. No stored-name repair runs automatically.
- Default record-list page size is 10. Queries retain existing role guards/RLS and append an ID tie-breaker. URL navigation retains search/filters/dates; filter submission drops page. Invalid numeric syntax starts at page one; pages past the result set redirect to page one with filters. Empty lists show 0-0 of 0, with both controls disabled.
- Coverage: personnel accounts, student accounts, clinic student records, visit log, appointment list, medicine inventory, per-medicine transaction history, incident log, and own appointment history. Existing per-student detail summaries are outside these list routes.
- Low stock uses an ID-ordered server scan of stock metadata followed by a ten-row full-record fetch. It preserves the existing `stock_quantity <= reorder_level` rule without a database change. Other medicine flags are database filters before pagination.
- Reports paginate aggregate groups for screen display only. Database aggregation, administrator suppression, whole-month limits, complete totals, and full authorized print/PDF output are preserved. Aggregate/ledger/account-number reads traverse API caps in bounded requests.
- `npm test` is an offline Node runner with existing TypeScript transpilation and isolated fictional fixtures; no live writes or credentials. Catalog security review and its limits: `docs/SECURITY_REVIEW.md`. No deployment or production-registration readiness is inferred.
