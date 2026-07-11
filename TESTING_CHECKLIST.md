# HVACFlow — Complete Testing Checklist

Version 1.0 — Generated after implementation review

---

## 1. Authentication & RBAC

- [ ] POST /auth/login with valid credentials returns accessToken + refreshToken + user profile
- [ ] POST /auth/login with wrong password returns 401
- [ ] POST /auth/login with inactive user returns 401
- [ ] GET /auth/me with valid JWT returns user with permissions[] and departmentIds[]
- [ ] POST /auth/refresh with valid refresh token returns new accessToken
- [ ] POST /auth/refresh with expired refresh token returns 401
- [ ] Any protected endpoint without Authorization header returns 401
- [ ] Any protected endpoint with expired JWT returns 401
- [ ] Operator role cannot access config:manage endpoints (returns 403)
- [ ] Admin role can access all endpoints
- [ ] Supervisor cannot delete system roles
- [ ] JWT payload contains flat permissions array used by PermissionsGuard
- [ ] Adding a new permission to the database makes it immediately available in role editor UI

---

## 2. Configuration — Departments

- [ ] GET /departments returns all departments ordered by sortOrder
- [ ] POST /departments creates department with name, code, color
- [ ] PATCH /departments/reorder updates sortOrder — Mission Control Kanban reflects new column order immediately
- [ ] PATCH /departments/:id with isActive: false deactivates department
- [ ] DELETE /departments/:id blocked if process definitions reference it (409)
- [ ] Department color appears correctly on Kanban column header
- [ ] Drag-reorder in UI persists and board updates

---

## 3. Configuration — Priority Levels

- [ ] GET /priority-levels returns levels ordered by sortOrder
- [ ] POST /priority-levels creates new level with name + color
- [ ] Setting isDefault:true clears isDefault from all other levels (only one default)
- [ ] New priority level appears immediately in all task/order priority dropdowns
- [ ] DELETE /priority-levels/:id blocked if any Order or ProductionTask references it (409)
- [ ] Drag-reorder works and persists

---

## 4. Configuration — Process Definitions

- [ ] GET /process-definitions returns all processes grouped by department
- [ ] POST /process-definitions creates process — NO department/process names hardcoded
- [ ] appliesTo: PART generates tasks on parts; appliesTo: UNIT generates tasks on units
- [ ] requiresVerification:true adds PendingVerification gate in task engine
- [ ] requiresChecklist:true requires all mandatory checklist items checked before complete
- [ ] weight field affects progress calculation proportionally
- [ ] New process immediately available for selection in Process Routes

---

## 5. Configuration — Process Routes

- [ ] GET /process-routes?partTypeId= returns ordered route for that part type
- [ ] GET /process-routes?unitTypeId= returns ordered route for that unit type
- [ ] POST /process-routes adds step at correct sequenceOrder
- [ ] Drag-reorder persists new sequenceOrder
- [ ] DELETE /process-routes/:id removes step — warning shown that existing tasks are unaffected
- [ ] After adding route step, new parts of that type get the new task generated

---

## 6. Configuration — Unit Types & Part Types

- [ ] Create UnitType (e.g. "Split System") — appears in unit creation dropdown
- [ ] Create PartType (e.g. "Condenser Coil") — appears in part type dropdowns
- [ ] Deactivate UnitType — no longer selectable for new units
- [ ] DELETE blocked if units/parts of that type exist

---

## 7. Configuration — Unit Composition

- [ ] Add required PartType to UnitType — when unit created, part auto-generated
- [ ] Add optional PartType to UnitType — when unit created, optional part offered for confirmation
- [ ] defaultQuantity:3 on a PartType — unit creation generates 3 parts of that type
- [ ] Removing composition entry — future units don't include that part; existing units unaffected
- [ ] Sort order drag-reorder persists correctly

---

## 8. Configuration — Checklists

- [ ] Create ChecklistTemplate attached to a ProcessDefinition with requiresChecklist:true
- [ ] Add required and optional items to template
- [ ] When a task starts, ChecklistResponse rows are instantiated from the template
- [ ] Checking required items one by one updates completionSummary
- [ ] Complete task blocked (422) until all isRequired items are checked
- [ ] Complete task allowed if all required items checked, optional unchecked
- [ ] Checklist response history preserved even after template item deleted

---

## 9. Configuration — Machines

- [ ] Create machine scoped to a department
- [ ] Machine only appears in task assignment dropdown for its department
- [ ] DELETE blocked if task references machine; deactivate instead
- [ ] Machine name appears on task detail and Kanban card

---

## 10. Configuration — Roles & Permissions

- [ ] All permission codes from Permission table appear in role editor matrix
- [ ] Adding a new permission row to DB makes it show in UI immediately (no deploy)
- [ ] Checking permissions in matrix instantly saves via PATCH /roles/:id/permissions
- [ ] System roles (Admin, Supervisor, Operator) cannot be deleted
- [ ] Non-system roles can be created, edited, deleted (if not assigned to users)
- [ ] Operator with task:view-all sees cross-department tasks; without it, department-scoped only

---

## 11. Users

- [ ] Create user with email + password + roles + departments
- [ ] User can be assigned to multiple departments with one marked as primary
- [ ] Deactivating a user prevents login immediately
- [ ] User's permissions in JWT reflect their assigned roles' permissions
- [ ] Changing a user's roles takes effect on next login (new JWT)
- [ ] Reset password via admin UI works

---

## 12. Customers → Projects → Orders (Hierarchy)

- [ ] Create Customer → Project → Order following hierarchy
- [ ] Order requires priorityLevelId (uuid FK) — no hardcoded "Normal" string
- [ ] Confirm order: Draft → Confirmed
- [ ] Cancel order: blocks if any tasks InProgress
- [ ] Delete order: only allowed on Draft status
- [ ] Order breadcrumb shows correct Customer → Project path

---

## 13. Units — Creation & Task Generation

- [ ] Create unit under an order — selects UnitType
- [ ] Required parts auto-created from UnitTypeComposition
- [ ] Optional parts displayed for operator to confirm
- [ ] Each part gets ProductionTask rows generated from its ProcessRoute
- [ ] Unit-level tasks (Testing, Dispatch) generated from UnitType ProcessRoute
- [ ] First task in each chain set to Ready; subsequent tasks Pending
- [ ] parentTaskId and nextTaskId linked correctly
- [ ] WebSocket task.created events emitted for all generated tasks
- [ ] Mission Control immediately shows new tasks after unit creation

---

## 14. Production Task Engine — Core Lifecycle

- [ ] Ready → InProgress (POST /production-tasks/:id/start)
  - startedAt set to now
  - assignedUserId set to caller if not already assigned
  - ChecklistResponse rows instantiated if requiresChecklist
  - WebSocket task.statusChanged emitted
  - Mission Control card updates live

- [ ] InProgress → PendingVerification (when requiresVerification:true)
  - completedAt set
  - actualDurationMinutes calculated
  - nextTask NOT activated yet
  - WebSocket event emitted

- [ ] PendingVerification → Completed (POST /production-tasks/:id/verify)
  - verifiedAt set, verifiedByUserId set to caller
  - nextTask activated to Ready
  - Part/Unit progress recomputed
  - WebSocket part.progressChanged + unit.progressChanged emitted

- [ ] InProgress → Completed (when requiresVerification:false)
  - completedAt + actualDurationMinutes set
  - nextTask immediately activated to Ready
  - Part/Unit progress recomputed
  - WebSocket events emitted

- [ ] OnHold flow: InProgress → OnHold → InProgress (resume restores previous state)
- [ ] OnHold flow: Ready → OnHold → Ready (resume restores Ready)
- [ ] Hold requires note; reject requires note — both return 400 without note
- [ ] Reject does NOT activate nextTask
- [ ] Reject recomputes progress (rejected task reduces progress)
- [ ] Cannot start a Pending task (not Ready) — returns 409
- [ ] Cannot complete a Ready task — returns 409

---

## 15. Progress Calculation

- [ ] Part progress = weighted completion (completedTasks.weight / allTasks.weight × 100)
- [ ] Higher-weight processes contribute more to progress (e.g. weight:2 Assembly vs weight:1 Cutting)
- [ ] PendingVerification tasks do NOT count as complete for progress
- [ ] OnHold tasks count as in-progress (not complete)
- [ ] Rejected tasks reduce progress (not counted as complete)
- [ ] Unit progress derived from part progress — never set directly
- [ ] Unit progress updates live on Mission Control via WebSocket
- [ ] Part progress bar accurate on Unit Detail page

---

## 16. Mission Control — Kanban Board

- [ ] Board shows correct department columns in sortOrder sequence
- [ ] Columns use department colors from database
- [ ] Task cards show: process name, unit serial, part identifier, priority dot, assignee, elapsed time
- [ ] Priority dot color comes from PriorityLevel.color (configurable)
- [ ] "My Tasks" filter shows only tasks assigned to current user
- [ ] Department filter scopes to single department
- [ ] Priority filter scopes to one priority level
- [ ] Operators only see their departments by default
- [ ] Supervisors/Admins see all departments
- [ ] Real-time: completing a task moves card immediately without page refresh
- [ ] Real-time: new unit creation populates Kanban columns instantly
- [ ] Real-time: progress bars on unit/part detail update live
- [ ] Kanban → List toggle persists view preference
- [ ] List view shows same data as Kanban in table form
- [ ] In-progress tasks show elapsed time ticking

---

## 17. Task Detail Drawer

- [ ] Opens from Kanban card, list row, Part detail, Unit detail
- [ ] Shows all task metadata: process, unit/part, department, status, priority, assignee, machine, times
- [ ] Checklist section appears only when requiresChecklist:true on the process
- [ ] Checking a required item updates completion count in real time
- [ ] Complete button disabled until all required checklist items checked
- [ ] Start → Complete → Verify buttons appear based on status + user permissions
- [ ] Hold/Reject buttons appear for active statuses
- [ ] Note textarea appears when Hold or Reject selected
- [ ] Status history shows all transitions with timestamps and users
- [ ] Notes auto-save on blur
- [ ] Drawer updates live if another user changes the task (WebSocket)

---

## 18. WebSocket Real-time Events

- [ ] Connect to /realtime namespace with valid JWT
- [ ] Invalid/missing JWT disconnects client immediately
- [ ] User auto-joins their department rooms on connect
- [ ] subscribe:unit room receives unit.progressChanged events
- [ ] subscribe:task room receives task.statusChanged events for that task
- [ ] task.created event adds card to correct Kanban column
- [ ] task.statusChanged event moves/updates card in real time
- [ ] part.progressChanged event updates progress bar on unit detail
- [ ] checklist.updated event updates checklist state in open task drawer
- [ ] Reconnection works after disconnect (WebSocket reconnect logic)

---

## 19. Audit Trail

- [ ] GET /units/:id/audit-trail returns all status transitions for all tasks on the unit
- [ ] GET /parts/:id/audit-trail scoped to that part's tasks
- [ ] GET /production-tasks/:id/history full chronological history for one task
- [ ] History includes: fromStatus, toStatus, changedBy name, timestamp, note
- [ ] Hold and reject notes appear in history
- [ ] Audit data preserved even after process definition is deactivated

---

## 20. Responsive Design & Mobile

- [ ] Login page works on mobile (375px width)
- [ ] Mission Control Kanban: single column swipeable on mobile
- [ ] Department pills row visible on mobile for column switching
- [ ] Task cards are full-width on mobile, tap targets ≥44px
- [ ] Task drawer becomes full-screen sheet on mobile
- [ ] Checklist items are large touch rows (≥48px height) on mobile
- [ ] Complete/Verify button is bottom-anchored on mobile drawer
- [ ] Navigation: bottom tab bar on mobile, sidebar on desktop
- [ ] Config screens usable on tablet (768px)
- [ ] All form modals scroll properly on small screens

---

## 21. End-to-End Workflow Test

Full smoke test from zero:

1. [ ] Login as Admin
2. [ ] Go to Configuration → Departments → create "Welding" with a color
3. [ ] Go to Configuration → Processes → create "Welding" process for Welding dept, PART, weight 1.5
4. [ ] Go to Configuration → Part Types → create "Steel Frame" part type
5. [ ] Go to Configuration → Process Routes → add Welding step to Steel Frame route
6. [ ] Go to Customers → create "Test Customer"
7. [ ] Create Project under Test Customer
8. [ ] Create Order under Project with High priority
9. [ ] Confirm the Order
10. [ ] Create Unit (any type) under Order
11. [ ] Verify Steel Frame part auto-generated with Welding task in Ready state
12. [ ] Verify Mission Control shows Welding task in Welding column
13. [ ] Log in as Operator assigned to Welding department
14. [ ] Start the Welding task
15. [ ] Verify task moves to InProgress on Mission Control in real time
16. [ ] Complete the task
17. [ ] Verify part progress updated
18. [ ] Verify unit progress updated
19. [ ] Log back in as Admin and view audit trail for the unit
20. [ ] Verify complete history of task transitions recorded

All 20 steps passing = full workflow confirmed working end-to-end.

---

## 22. Business Rules Verification

- [ ] Completing one task automatically makes the next task Ready
- [ ] Departments only see tasks relevant to them (department scope enforced)
- [ ] Unit progress always calculated from part progress (never set directly)
- [ ] Workflow configurable — new processes added without code changes
- [ ] Dashboard centers on live production tasks (not static unit lists)
- [ ] All priority levels come from PriorityLevel table (no hardcoded strings)
- [ ] All process names come from ProcessDefinition table (no hardcoded strings)
- [ ] All departments come from Department table (no hardcoded strings)
- [ ] All permissions come from Permission table (no hardcoded permission codes in guards)
- [ ] Checklist templates configurable per process without code changes
- [ ] Unit composition configurable per unit type without code changes
- [ ] Process routes configurable per part/unit type without code changes

---

## 23. Security Checklist

- [ ] JWT secrets are different for access and refresh tokens
- [ ] Passwords hashed with bcrypt (cost factor 12)
- [ ] No password returned in any API response
- [ ] CORS configured to production domain only in production
- [ ] SQL injection impossible (Prisma parameterized queries throughout)
- [ ] All DTOs use class-validator whitelist:true (unknown properties stripped)
- [ ] Permission codes checked from JWT payload, not re-queried per request (performance + security)
- [ ] System roles cannot be deleted via API (isSystem guard)
- [ ] Soft-deleted records excluded from all queries (deletedAt: null filter)

---

## 24. Performance Smoke Test

- [ ] Mission Control board loads in < 1s for 50 active tasks
- [ ] Task start/complete action returns in < 200ms
- [ ] Unit creation with 6 parts and 20 tasks completes in < 2s
- [ ] WebSocket event received < 100ms after task state change
- [ ] Priority levels, departments lists cached (staleTime: Infinity) — no repeated fetches
- [ ] Database indexes cover the primary Kanban query: (departmentId, status)
