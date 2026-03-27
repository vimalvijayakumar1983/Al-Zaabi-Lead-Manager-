# Frontend improvements — full session changelog

This document records **everything** shipped or decided during the latest frontend work on **Al Zaabi Lead Manager**, so teammates can pull the branch, read once, and test in Cursor or locally.

**Scope:** `frontend/` (Next.js 14, React 18, TanStack Query v5, Recharts).

---

## A. Home dashboard (`/dashboard`)

### Route and product fit

- **`/dashboard`** is a **first-class route** again. Sidebar, command palette, and post-login flow already pointed here; we ensured a real page exists (no dead link / redirect-only confusion).
- The **full** dashboard UI is the large client page built around **`GET /analytics/dashboard-full`** (KPIs, trends, sources pie, funnel, score distribution, team leaderboard, recent leads/tasks/activity, super-admin group overview, division table, quick actions footer, etc.).

### Data layer (TanStack Query)

- **Primary query:** `api.getDashboardFull(period, divisionId)` with cache key  
  **`queryKeys.analytics.dashboardFull(period, divisionKey)`**  
  where `divisionKey` is `'all'` or a specific division id for super-admins.
- **Super-admin divisions:** `useQuery` for **`api.getDivisions()`** (`queryKey: ['divisions','list']`), `staleTime` 5 minutes, `enabled` when user is super-admin.
- **Caching:** `staleTime` ~30s, `gcTime` 10m, **`placeholderData: keepPreviousData`** on the dashboard-full query so changing **period** or **division** does not wipe the UI with a full skeleton while the new request runs.
- **Custom status labels:** Still loaded once via **`api.getFieldConfig`** in `useEffect` (same behavior as before); labels feed KPI copy and status display.

### Realtime

- **`useRealtimeSync`** listens for `lead`, `contact`, `task`, `deal`, `campaign`.
- **Debounced invalidation (~500ms):** avoids hammering `dashboard-full` when many websocket events arrive in a burst. Uses **`queryClient.invalidateQueries({ queryKey: ['analytics', 'dashboard-full'] })`** (prefix match).
- **Cleanup:** debounce timer cleared on unmount.

### Refresh control

- **Refresh** uses **`dashboardQuery.refetch()`** wrapped for **`RefreshButton`**’s `Promise<void>` typing.

### Performance and React quality

- **Hooks order:** All **`useMemo`** / derived data that depends on loaded **`data`** runs **before** any early `return` (skeleton / error), so we do not violate the Rules of Hooks.
- **Memoization:** Group division totals, **`kpiCards`**, **`funnelStagesNonLost`**, **`funnelMaxCount`**, **`getStatusLabel`** (`useCallback`), **`trendData`**, **`sourceChartData`**.
- **Module-level constants:** **`KPI_COLOR_MAP`**, **`TASK_PRIORITY_DOT`** (avoid recreating objects every render).
- **`React.memo`:** `ChangeIndicator`, `ScoreRing`, `CustomTooltip`, `PieTooltip`.
- **Recharts:** **`isAnimationActive={false}`** on `Area`, `Pie`, and `Bar` series to cut animation cost on large datasets.

### Error and empty states

- **Skeleton** while the first dashboard-full request has no data yet.
- **Error row** with **Retry** calling **`refetch()`** (not only a full page reload).

### Files

| Area | Path |
|------|------|
| Page | `src/app/(dashboard)/dashboard/page.tsx` |
| Keys | `src/lib/query-keys.ts` (`analytics.dashboardFull`) |

---

## B. Leads list (`/leads`)

### B.1 TanStack Query v5 — “blank table” flash on first load

- **Cause:** `loading` used **`leadsQuery.isLoading && !leadsQuery.data`**. In v5, **`isLoading` = `isPending && isFetching`**, so there was a frame where the query was still pending but not yet “fetching,” **`isLoading` was false**, and the table rendered **no rows** (blank) before the spinner or data appeared.
- **Fix:**

  ```ts
  const loading =
    !meReady ||
    (!leadsQuery.data && (leadsQuery.isPending || leadsQuery.isFetching));
  ```

- **`meReady`:** List query stays **`enabled: false`** until **`useLeadsMeQuery`** succeeds or errors, so list params that depend on **`currentUser`** (e.g. “assigned to me”) are correct.
- **Kanban:** When **`viewMode === 'kanban'`**, the same **`loading`** gate wraps **`KanbanView`** so the board does not flash **empty columns** while the list request is in flight.

### B.2 Header subtitle vs “Total” KPI mismatch (e.g. 257 vs 259)

- **Cause:** Subtitle / pagination used **list** totals; the **Total** stat card used **`/analytics/dashboard`** overview (`stats.overview.totalLeads`) — different endpoints and scopes.
- **Fix:** **`alignedTotalLeads`** (`useMemo`): use **`pagination.total` from the list response** when available; else dashboard overview; else local **`pagination.total`**. **Header** and **Total** stat card both use **`alignedTotalLeads`** (header formatted with **`toLocaleString()`**).

### B.3 Pagination / filters — “old page” flashing

- **Cause:** **`useLeadsListQuery`** used **`placeholderData: keepPreviousData`**, so after **page** or **filter** changes TanStack Query kept showing the **previous** response until the new one arrived.
- **Fix:** **Removed** `placeholderData: keepPreviousData` from **`useLeadsListQuery`**. Users see the normal **loading** state for the new query instead of stale rows.

### Files

| Area | Path |
|------|------|
| Leads UI | `src/app/(dashboard)/leads/page.tsx` |
| List query | `src/features/leads/hooks/useLeadsQueries.ts` (`useLeadsListQuery`) |

---

## C. App-wide data layer — TanStack Query by module

This section documents the **shared** patterns and hooks across **inbox, analytics, leads (detail + lists), roles, import, and report builder** — not only the home dashboard and leads list changes above.

### C.1 Central query keys (`src/lib/query-keys.ts`)

| Namespace | Purpose |
|-----------|---------|
| **`queryKeys.inbox.*`** | Conversations, messages, notes, attachments, stats, canned responses, pipeline stages for inbox |
| **`queryKeys.leads.*`** | List, detail, assignment history, pipeline stages (all + scoped), dashboard (`/analytics/dashboard`), users, me, custom fields, sources, disposition, tags, field-config, call logs |
| **`queryKeys.roles.*`** | Roles list, module visibility matrix (`/api/users/permissions`) |
| **`queryKeys.import.*`** | Import history by page |
| **`queryKeys.analytics.*`** | **`bundle`** (analytics page parallel load), **`dashboardFull`** (home dashboard) |
| **`queryKeys.reports.*`** | Report builder catalog + definitions per dataset / division |

---

### C.2 Leads feature hooks (`src/features/leads/hooks/useLeadsQueries.ts`)

Beyond **`useLeadsListQuery`**, the leads module exposes:

| Hook | Role |
|------|------|
| **`useLeadDetailQuery`**, **`useLeadAssignmentHistoryQuery`**, **`useLeadCallLogsQuery`** | Lead detail / history / calls |
| **`useLeadsMeQuery`** | Current user; gates list until ready |
| **`useLeadsUsersQuery`**, **`useLeadsDashboardQuery`**, **`useLeadsCustomFieldsQuery`**, **`useLeadSourcesQuery`**, **`useDispositionStudioQuery`**, **`useLeadsTagsQuery`**, **`useLeadsPipelineStagesQuery`**, **`useLeadsFieldConfigQuery`** | Leads page data (filters, KPI strip, modals, table) |
| **`usePipelineStagesAllQuery`** | Global pipeline stages |
| **`useLeadsInvalidate`** | **`invalidateList`**, **`invalidateLeadDetail`**, **`invalidateListAndDashboard`** (list + **`['leads','dashboard']`** KPI cards), **`invalidateAllLeadsData`**, **`invalidateDashboard`** |
| **`useCallOutcomeOptions`** | Memoized disposition options from studio data |

**Invalidation** keeps the **list** and **dashboard KPI strip** aligned after edits that touch lead fields, stage, or assignment.

---

### C.3 Lead detail page (`src/app/(dashboard)/leads/[id]/page.tsx`)

- Uses **`useQueryClient`** + **`useLeadsInvalidate`** for **`invalidateListAndDashboard`** after realtime / debounced updates so **list + KPIs** stay in sync when returning to `/leads`.
- **`invalidateInboxSurfaces`:** invalidates **`queryKeys.inbox.conversationsRoot`** and **`['inbox','stats']`** when communication changes affect inbox.
- Targeted invalidation for **call logs** and **tags** when those actions occur on the detail screen.

---

### C.4 Inbox (`src/features/inbox/hooks/useInboxQueries.ts` + `src/app/(dashboard)/inbox/page.tsx`)

| Piece | Behavior |
|-------|----------|
| **`useInboxConversationsQuery`** | Paginated conversation list; **`placeholderData: keepPreviousData`** for smoother filter/pagination (different trade-off than leads list). |
| **`useInboxMessagesQuery`** | Per-lead thread; optional **`refetchInterval`**; **`staleTime`** / **`gcTime`** tuned for chat. |
| **`useInboxNotesQuery`**, **`useInboxAttachmentsQuery`** | Per-lead side data |
| **`useInboxStatsQuery`** | Inbox stats by division |
| **`useInboxBootstrapQuery`** | Canned responses + pipeline stages for compose / stage UI |
| **`useInboxRealtimeInvalidation`** | Maps websocket events to **invalidate conversations, stats, messages, notes, attachments** for the selected lead |
| **`useInboxMessageMutations`** | **Mutations** (send, edit, delete, notes, mark read) with **`onSuccess`** → **`refreshAllInbox`** (invalidates conversation root, stats, messages for selection) |

---

### C.5 Analytics page (`src/features/analytics/hooks/useAnalyticsQueries.ts` + `src/app/(dashboard)/analytics/page.tsx`)

| Piece | Behavior |
|-------|----------|
| **`useAnalyticsBundleQuery`** | Single query key **`queryKeys.analytics.bundle(period, divisionKey, callDrillMode)`** |
| **`fetchAnalyticsBundle`** | **`Promise.allSettled`** across many analytics endpoints (overview, funnel, trends, team, sources, campaigns, activities, score distribution, task SLA, call disposition, forecast, phase1) so **one slow endpoint does not block the rest** |
| **Patches after fetch** | If call-disposition fails, **legacy fallback** can patch bundle from **`getDashboardFull`** via **`queryClient.setQueryData`**. Super-admin **division comparison** can patch **`divisionComp`** asynchronously |
| **`staleTime` / `gcTime`** | Tuned for the analytics dashboard bundle |

This is **separate** from the **home** **`dashboard-full`** query (`queryKeys.analytics.dashboardFull`) — two different “dashboard” experiences: **Analytics** tab vs **Dashboard** home.

---

### C.6 Roles (`src/features/roles/hooks/useRolesQueries.ts` + `src/app/(dashboard)/roles/page.tsx`)

| Hook | Role |
|------|------|
| **`useRolesListQuery`** | **`queryKeys.roles.list`** — `GET /api/roles` via fetch |
| **`useModuleVisibilityMatrixQuery`** | **`queryKeys.roles.moduleVisibility`** — module visibility matrix for the roles UI |

---

### C.7 Import center (`src/features/import/hooks/useImportQueries.ts` + `src/app/(dashboard)/import/page.tsx`)

| Hook | Role |
|------|------|
| **`useImportHistoryQuery(page)`** | **`queryKeys.import.history(page)`** — paginated import history |

---

### C.8 Report builder (`src/features/reports/hooks/useReportBuilderQueries.ts` + `src/app/(dashboard)/report-builder/page.tsx`)

| Hook | Role |
|------|------|
| **`useReportCatalogQuery`** | **`queryKeys.reports.catalog(dataset, divisionId)`** |
| **`useReportDefinitionsQuery`** | **`queryKeys.reports.definitions(dataset, divisionId)`** |

---

## D. Explored and reverted (not in final code)

| Item | What we tried | Final state |
|------|----------------|-------------|
| **`/dashboard` redirect only** | Single file redirecting to `/leads` | **Replaced** by the full dashboard page again. |
| **Allocation stats + React Query** | `allocationStats` query key, **`useAllocationStatsQuery`**, extra invalidations | **Removed**; **`WorkloadDashboard`** still uses **`useEffect` + `api.getAllocationStats()`**. |

---

## E. Team workload (unchanged pattern)

- **`WorkloadDashboard`** continues to load **`GET /leads/allocation/stats`** in **`useEffect`** when the panel opens. Moving this to TanStack Query remains an **optional follow-up**.

---

## F. Documentation

- This file: **`docs/FRONTEND_IMPROVEMENTS.md`** — handoff for other developers and Cursor.

---

## G. How teammates should pull and verify

1. **Fetch / merge** the branch that contains these commits.
2. **Install and run:**

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Typecheck:**

   ```bash
   npx tsc --noEmit
   ```

4. **Smoke test (suggested)**

   - **Login → Dashboard** — period, division (super-admin), refresh, realtime.
   - **Leads** — first load, pagination, filters, table vs kanban, Total vs subtitle, team workload panel.
   - **Lead detail** — edit field/stage; return to list and confirm KPIs/list refresh.
   - **Inbox** — open thread, send message, check lists/stats update.
   - **Analytics** — change period/division; charts load without full-page hang.
   - **Roles / Import / Report builder** — pages load without console errors.

---

## H. Optional follow-ups (not done)

- React Query for **allocation stats** + invalidation on assignment changes.
- Align **other** Leads KPI cards (New, Qualified, …) with **list filters** — likely needs **API** or aggregated endpoint support.
- **Prefetch** `me` + list in parallel — only if product accepts edge cases for **`__current_user__`** saved views.
- Revisit **`placeholderData: keepPreviousData`** on **inbox conversations** if product wants “no stale rows” there too (same trade-off as leads).

---

*Last updated for team handoff. Amend this file when you merge related follow-up work.*
