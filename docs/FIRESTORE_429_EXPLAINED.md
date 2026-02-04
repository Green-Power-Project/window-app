# Why "Resource Exhausted" (429) Happens

## Root cause

The **ProjectFolderTree** component loads **file counts** and **unread counts** for every folder in the project tree. It does this by calling Firestore **once per folder**, which quickly hits Firestore’s quotas.

---

## 1. File counts: one aggregation per folder

**Where:** `ProjectFolderTree.tsx` – first `useEffect` (around line 416).

**What it does:**

- Builds a list of **all folder paths** (top-level + every child + custom folders).
- For **each path** it runs:

  ```ts
  const ref = getProjectFolderRef(projectId, segments);
  const snap = await getCountFromServer(ref);  // ← Firestore aggregation query
  ```

So for one project you get:

- **8 top-level folders** (01_Customer_Uploads, 02_Photos, 03_Reports, …)
- **~24 child folders** (Photos, Documents, Before, After, Daily_Reports, …)
- **10_Custom** + any custom subfolders  

→ **Roughly 33+ aggregation queries** (`getCountFromServer`) every time this effect runs.

Firestore treats each `getCountFromServer` as an **aggregation query**. There is a **limit on aggregation queries per minute**. Doing 33+ in parallel (or in quick succession when opening the dashboard or switching projects) can trigger **429 resource-exhausted**.

---

## 2. Unread counts: one `getDocs` per subfolder

**Where:** Same file – second `useEffect` (around line 443).

**What it does:**

- Loads read status once (one query).
- For **each subfolder** it runs `getDocs(filesCollection)` to load **all files** in that folder, then counts in memory how many are “unread”.

So you get **~24+ `getDocs` calls** (one per subfolder), and each call reads **every document** in that folder. Many folders × many docs = a lot of **document reads**, which can also contribute to quota limits (and cost).

---

## 3. When it gets worse

- **Effect re-runs:** The effects depend on `projectId` and `allPathsIncludingCustom` (and the second on `folders`). Re-mounting the component or changing these (e.g. navigating, opening dashboard, switching project) runs everything again.
- **Multiple projects:** Dashboard can show multiple projects; each project’s tree runs the same logic → **33+ aggregations × number of projects**.
- **Retries:** Failed requests may be retried, adding more load and pushing you over the limit faster.

---

## Summary

| Source              | What runs                    | Approx. per project load |
|---------------------|-----------------------------|---------------------------|
| File counts effect  | `getCountFromServer(ref)`   | **33+ aggregation queries** |
| Unread counts effect| `getDocs(filesCollection)`  | **24+ read queries** (+ doc reads) |

Firestore returns **429 resource-exhausted** when you exceed the allowed number of aggregation queries (and/or reads) in a short time. The current implementation does **dozens of aggregation queries and many document reads per project load**, so hitting the quota is expected under normal use.

---

## Possible fixes (for later implementation)

1. **Cache counts** – Store counts (e.g. in React state/context or a small backend cache) and reuse until data is known to have changed; avoid re-running all 33+ aggregations on every mount.
2. **Lazy counts** – Load file count only when a folder is expanded or when the user opens that project, not for every project on the dashboard at once.
3. **Backend aggregation** – Move counting to a backend (e.g. Cloud Function) that writes a single “count” (and optionally “unread”) field on a document; the app then does one read per folder instead of one aggregation per folder.
4. **Throttle / batch** – Don’t run all 33+ aggregations in parallel; space them out or batch so you stay under the aggregation quota per minute.
5. **Unread logic** – Avoid one `getDocs` per folder; e.g. use a single structure (or stored counts) and one or a few queries to derive unread counts instead of loading every file in every subfolder.

Implementing one or more of these will reduce aggregation and read usage and prevent the 429 errors.
