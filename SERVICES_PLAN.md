# TalentScout Services Implementation Plan

## Current State

The game is **fully playable offline** with IndexedDB saves, local leaderboards, and complete game mechanics. The codebase already has **architectural stubs** for cloud services — a `CloudSaveProvider` interface, an `authStore` skeleton, and a local leaderboard system ready for cloud sync.

## What Needs to Be Built

### Tier 1: Cloud Persistence (Critical)

#### 1. Supabase Project Setup
- Create Supabase project with tables: `profiles`, `save_slots`, `leaderboard_entries`
- RLS policies: users can only read/write their own saves; leaderboard is globally readable
- Install `@supabase/supabase-js` + create `src/lib/supabase.ts` client

#### 2. Authentication
- Wire `authStore.ts` to Supabase Auth (email + Google/GitHub OAuth)
- Session persistence via Supabase's `onAuthStateChange` listener
- Auth modal component (login/register/logout)
- Gate cloud features behind auth — game remains fully playable without login

#### 3. Cloud Save Provider
- Implement `SupabaseCloudSaveProvider` conforming to existing `CloudSaveProvider` interface
- Conflict resolution: show dialog when cloud save is newer than local
- Sync indicator in UI (last synced timestamp)

### Tier 2: Social Features (High Value)

#### 4. Global Leaderboard
- Supabase `leaderboard_entries` table with server-side score validation
- Next.js API route `/api/leaderboard` for submit + fetch
- Update `LeaderboardScreen` with "Global" / "Local" tabs

#### 5. Analytics Dashboard (optional)
- Track anonymous play stats (games started, avg season length, most-picked specializations)
- Helps tune game balance

### Tier 3: Deployment & DevOps

#### 6. Vercel Deployment
- Add `vercel.json` with environment variable references
- GitHub Actions CI: lint → type-check → build → deploy
- Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Architecture

```
Browser (Next.js)
  ├─ IndexedDB (Dexie) ← always works offline
  ├─ Zustand stores ← game state + auth state
  └─ Supabase Client ← cloud sync when authenticated
       ├─ Auth (email/OAuth)
       ├─ Database (saves, leaderboard)
       └─ RLS (row-level security)
```

The key principle: **offline-first**. IndexedDB remains the primary store. Cloud sync is additive — the game works perfectly without an account, and login just adds cross-device persistence and global leaderboards.

## Existing Stubs

| Component | File | Status |
|-----------|------|--------|
| Cloud save interface | `src/lib/cloudSave.ts` | Abstract provider + types defined |
| Local cloud save impl | `src/lib/localCloudSave.ts` | Working IndexedDB fallback |
| Auth store | `src/stores/authStore.ts` | State shape ready, no auth logic |
| Local leaderboard | `src/lib/leaderboard.ts` | Fully functional, IndexedDB-backed |
| Leaderboard UI | `src/components/game/LeaderboardScreen.tsx` | Complete, local-only |
| Save/load system | `src/lib/db.ts` | Complete with migration support |
