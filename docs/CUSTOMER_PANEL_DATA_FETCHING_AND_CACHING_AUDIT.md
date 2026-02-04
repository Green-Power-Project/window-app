# Customer Panel: Data Fetching & Where Caching Is Needed

Audit of how the customer panel (window-app) fetches data and where caching would help. **No code changes**—analysis only.

---

## 1. Real-time listeners (onSnapshot) — **caching not needed**

These subscribe to Firestore and get live updates. By design they refetch when data changes. Caching would conflict with real-time behavior.

| Location | What | Why no cache |
|----------|------|----------------|
| **DashboardContent.tsx** | `onSnapshot` on `projects` (query or single doc) | Projects list must stay in sync (new/disabled projects). |
| **Sidebar.tsx** | Same: `onSnapshot` on projects (query or single doc) | Sidebar project list must match dashboard. |
| **ProjectSidebar.tsx** | Same: `onSnapshot` on projects | Same as above. |
| **project/[id]/page.tsx** | `onSnapshot(doc(db, 'projects', projectId))` | Project detail (customFolders, etc.) must stay in sync. |
| **project/[id]/folder/[...path]/page.tsx** | `onSnapshot(filesQuery)` for current folder files | File list must update when files are added/removed. |
| **project/[id]/folder/[...path]/page.tsx** | `onSnapshot` on `customerMessages` (projectId + folderPath + customerId) | Messages must be live. |
| **project/[id]/folder/[...path]/page.tsx** | `onSnapshot` on project doc (for customFolders etc.) | Project metadata in folder view. |
| **galleryCategoryLabels.ts** | `onSnapshot(doc(db, 'config', 'gallery'))` | Category labels follow admin edits. |
| **contactSettings.ts** | `onSnapshot(doc(db, contactSettingsCollection, docId))` | Contact links follow admin config. |

---

## 2. One-off / repeated reads — **caching helps or is critical**

### 2.1 ProjectFolderTree.tsx — **already cached (in-memory, 2 min TTL)**

- **File counts:** `getCountFromServer(ref)` per folder path (~33+ aggregation queries per project).
- **Unread counts:** one `getDocs(fileReadStatus)` + one `getDocs(filesCollection)` per subfolder (~24+ getDocs).
- **Why it was called every time:** No cache; effects run on every mount and when `projectId` / `allPathsIncludingCustom` / `folders` / `currentUser` change (including reference changes from parent re-renders).
- **Status:** In-memory cache added (keyed by projectId + paths for file counts, projectId + userId for unread), 2 min TTL. Caching here is **critical** to avoid 429s.

---

### 2.2 PublicGallery.tsx + galleryClient.ts — **caching recommended**

- **Flow:** `PublicGallery` calls `getGalleryImages(db)` in `useEffect` on mount and again on `visibilitychange` (tab becomes visible).
- **galleryClient.getGalleryImages:** Single `getDocs(collection(db, 'gallery'))`, then filter/sort in memory. No project filter on s-gallery (standalone); projectId used only when PublicGallery is used with a project context elsewhere.
- **Why refetch:** Every mount and every time user switches back to the tab.
- **Where caching helps:** Short-lived cache (e.g. 1–2 min) keyed by `projectId ?? 'all'` would avoid refetching when navigating away and back to S Gallery or when multiple components use the gallery. Reduces reads and improves perceived performance.

---

### 2.3 project/[id]/folder/[...path]/page.tsx — **heavy N+1 pattern; caching / batching strongly recommended**

- **loadUnreadFiles:** Loads `fileReadStatus` once (one query), then for **each folder path** in the project does `getDocs(filesCollection)` and iterates docs. So many getDocs (one per folder), but only when “Unread” view is opened. No per-file read-status calls here.
- **mapDocToFileItem (used for every file in folder):** For **each file** it calls:
  - `isFileRead(projectId, customerId, cloudinaryPublicId)` → **one getDocs per file**
  - `getReportStatus(...)` → internally `isReportApproved(...)` → **another getDocs per file**
- **Where it’s used:** When the folder’s `onSnapshot` fires, all docs are mapped with `mapDocToFileItem` (e.g. `snapshot.docs.map(... mapDocToFileItem(...))`). So **2 getDocs per file, every time the snapshot updates**. 20 files ⇒ 40 getDocs per update.
- **Why it’s called every time:** No cache; every snapshot callback re-maps all files and re-queries read/approval for each.
- **Where caching is needed:**
  - **Option A (cache):** Cache `isFileRead(projectId, customerId, filePath)` and `isReportApproved(projectId, customerId, filePath)` results with a short TTL (e.g. 1–2 min) and key `projectId:customerId:filePath`. Same file in same session would not trigger repeated getDocs.
  - **Option B (batch, better):** Once per folder load (or per snapshot), run **one** query for all `fileReadStatus` for (projectId, customerId) and **one** query for all `reportApprovals` for (projectId, customerId). Build sets/maps in memory and use them inside `mapDocToFileItem` instead of per-file getDocs. Then caching is optional (e.g. for snapshot re-runs within a short window).

---

### 2.4 AuthContext.tsx — **optional cache**

- **What:** On auth state change, if there’s no `loggedInProjectId`, it runs one `getDocs(query(customers, where('uid', '==', user.uid)))` to read `canViewAllProjects` and stores it in sessionStorage.
- **When:** Once per login/session when using email/password (project-based login sets flags elsewhere).
- **Caching:** sessionStorage already avoids repeated Firestore reads for the same session. Optional: skip the query if sessionStorage already has `canViewAllProjects` set (e.g. after first load). Low priority.

---

### 2.5 LanguageContext.tsx — **optional cache**

- **What:** In a `useEffect` depending on `currentUser`, it loads language from Firestore: `getDoc(doc(db, 'customers', currentUser.uid))` and optionally from localStorage first.
- **When:** Once per user when they’re loaded (and when currentUser reference changes).
- **Caching:** Could cache “language for uid” in memory with long TTL (or until logout) to avoid refetch when provider re-mounts or context re-runs. Low impact (one getDoc per user).

---

### 2.6 ProfileContent.tsx — **optional cache**

- **What:** `loadProfile()` runs `getDocs(customerQuery)` (customers where uid == currentUser.uid) and sets name, mobile, customerNumber, enabled, language. Called from useEffect when `currentUser` or `language` change, and before save in `handleSaveProfile` to get doc id.
- **When:** On mount when opening profile, and when language changes (effect deps); also once per save to resolve doc reference.
- **Caching:** Short-lived cache (e.g. 1–2 min) keyed by `currentUser.uid` would avoid refetch when navigating away from profile and back, or when effect re-runs due to dependency churn. Medium benefit.

---

### 2.7 reportApproval.ts — **caching or batching recommended**

- **isReportApproved(projectId, customerId, filePath):** One `getDocs` per call (query by projectId, customerId, filePath, status).
- **getReportStatus:** Calls `isReportApproved` once per file.
- **approveReport:** Calls `isReportApproved` then up to two more getDocs (find doc, possibly allApprovalsQuery).
- **Used from:** Folder page for every file (via `mapDocToFileItem` and after approve/read actions). So many calls per folder view and per snapshot.
- **Where caching is needed:** Same as file read status: either cache per (projectId, customerId, filePath) with short TTL, or (preferable) batch: one query for all approvals for (projectId, customerId) and use in-memory lookup in `getReportStatus` / when mapping files.

---

### 2.8 fileReadTracking.ts — **caching or batching recommended**

- **isFileRead(projectId, customerId, filePath):** One `getDocs` per call.
- **markFileAsRead:** Calls `isFileRead` once then addDoc (write).
- **Used from:** Folder page for every file in `mapDocToFileItem`, and on mark-read actions. So N getDocs per folder view (N = number of files).
- **Where caching is needed:** Same as above: per-file cache with short TTL, or (better) one bulk query for all fileReadStatus for (projectId, customerId) and use a Set/Map when mapping files and when checking before markFileAsRead.

---

## 3. Writes and one-off actions — **caching not applicable**

- **Cloudinary upload/delete, auth login, notifications:** fetch to APIs or Firestore writes. No read cache needed.
- **Profile save, language save, report approve, mark file read:** Writes or read-then-write; cache invalidation may be needed (e.g. invalidate read-status cache for that file/project after mark read) if you add caches for read/approval.

---

## 4. Summary table

| Place | How they're doing it | Cache needed? | Notes |
|-------|----------------------|---------------|--------|
| **ProjectFolderTree** | getCountFromServer per folder, getDocs per subfolder for unread | ✅ **Yes (done)** | In-memory 2 min; avoids 429. |
| **PublicGallery / galleryClient** | getDocs(gallery) on mount + visibilitychange | **Recommended** | Short TTL by projectId or 'all'. |
| **Folder page: mapDocToFileItem** | isFileRead + getReportStatus per file → 2 getDocs per file | **Strongly recommended** | Batch (1 query read status + 1 approvals) or per-file cache. |
| **Folder page: loadUnreadFiles** | 1 fileReadStatus query + getDocs per folder | Optional | Could reuse same batch as above. |
| **AuthContext** | getDocs(customers) once, result in sessionStorage | Optional | sessionStorage already limits repeats. |
| **LanguageContext** | getDoc(customers/uid) for language | Optional | One getDoc per user. |
| **ProfileContent** | getDocs(customerQuery) on load and before save | Optional | Short cache by uid. |
| **reportApproval** | getDocs per isReportApproved / getReportStatus call | **Recommended** | Prefer batch query; else cache. |
| **fileReadTracking** | getDocs per isFileRead call | **Recommended** | Prefer batch query; else cache. |
| **Dashboard, Sidebar, Project doc, folder files, messages, config, contact** | onSnapshot | **No** | Real-time by design. |

---

## 5. Priority order for adding caching (if you implement later)

1. **Folder page read/approval:** Batch load fileReadStatus and reportApprovals for (projectId, customerId) once per folder view/snapshot and pass into mapping (or add per-file cache). Highest impact (2N getDocs → 2 getDocs per view).
2. **Gallery:** Cache `getGalleryImages` result by projectId (or 'all') with 1–2 min TTL.
3. **Profile:** Optional cache for loadProfile by uid.
4. **Language / Auth:** Optional; low impact.

This audit reflects the current customer panel behavior and where caching is needed without changing any code.
