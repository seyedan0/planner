# Dayflow — 24-Hour Productivity Planner

**Next.js App Router + React + TypeScript** productivity application.

## Current features

- **24-hour timeline** with 5-minute snapping (including 12:45), editable/drag-and-resize activity blocks, and a day navigator.
- Four planned activity categories: deep focus, work/meetings, breaks, and personal.
- **Separate Planned and Actual timelines**. Actual time comes from a live focus stopwatch, not the schedule.
- Start/stop focus sessions; stop saves exact start/end timestamps, and a timer can be resumed after reloading the browser.
- Smart interruption handling: gaps **under 10 min count as credited focus time**; gaps **10–19 minutes render as dotted breaks** inside the focus sequence but **are not credited**; gaps **20 minutes or more remain unmerged**.
- Live time distribution, focus intensity by hour, focus ratio, overlap warnings, daily plan-versus-actual comparison, and a **7-day weekly report**.
- JSON backup/import, daily CSV export, responsive desktop/mobile interface, dark/light mode.
- Browser persistence via localStorage and cross-tab refresh.

## Run locally

Requires Node.js 20.9 or newer and npm.

```bash
git clone https://github.com/seyedan0/planner.git
cd planner
npm install
npm run dev
```

Open **http://localhost:3000**.

```bash
npm run typecheck
npm run lint
npm run build
```

## How tracking works

The scheduler is a plan. Press **Start focus session** when you begin working and **Stop & save session** when you finish. The Actual timeline and reports aggregate completed sessions (and the running timer).

An interruption of 5 minutes between recorded sessions is credited to focus, though the report distinguishes *raw tracked minutes* from *credited minutes*. An interruption of 15 minutes is shown as a dotted gap and contributes to neither raw nor credited focus. A gap of 20 minutes or longer breaks the visual sequence.

Planned activities can overlap, but free time uses the **union** of intervals, so overlapping blocks do not double-count occupied time. Sessions crossing midnight are split correctly by calendar day in daily reports.

## Data & privacy

**Version 1 stores data only in localStorage in your current browser.** There are no accounts or cloud storage, and it will not automatically sync across devices. Export a JSON backup regularly, particularly before clearing browser data. Browser-local data persists across page reloads but may be cleared by private browsing or browser settings. The running timer is timestamp-based, so elapsed time survives a page reload and continues based on your device clock.

## Limitations and next steps

This is a single-user browser-local MVP. Cloud persistence, user authentication, team accounts, installable offline PWA, calendar syncing, notifications, CI, and a server database are possible future milestones. Time tracking measures time between user-initiated start and stop actions, not verified computer activity.
