# GlowIQ Consumer — Beta Setup Guide

Follow these steps in order. Each section tells you exactly where to go and what to paste.

---

## Step 1 — Supabase (database + auth)

1. Go to https://supabase.com → "Start your project" → sign up with GitHub
2. "New project" → name it `glowiq-beta` → choose a region close to you → "Create new project" (takes ~2 min)
3. Once ready: **Settings → API** — you'll need these two values later:
   - Project URL (looks like `https://xxxx.supabase.co`)
   - `anon` `public` key (long string starting with `eyJ`)

4. **SQL Editor → New query** → paste the entire contents of `supabase/schema.sql` → "Run"
   - You should see "Success. No rows returned"

5. **Authentication → Email Templates** → turn on "Magic Link" (should be on by default)
6. **Authentication → URL Configuration** → add `http://localhost:3000` to "Redirect URLs" for local dev
   - After Vercel deploy, add your `.vercel.app` URL here too

---

## Step 2 — Local setup

```bash
# Clone or unzip the project, then:
npm install

# Copy the env template
cp .env.local.example .env.local
```

Open `.env.local` and fill in:
```
ANTHROPIC_API_KEY=        ← from console.anthropic.com/settings/keys
NEXT_PUBLIC_SUPABASE_URL= ← from Supabase Settings → API (Project URL)
NEXT_PUBLIC_SUPABASE_ANON_KEY= ← from Supabase Settings → API (anon public key)
```

```bash
npm run dev
# Open http://localhost:3000 — you should see the GlowIQ login screen
```

---

## Step 3 — GitHub (needed for Vercel auto-deploy)

1. Create a new **private** repository at https://github.com/new
   - Name: `glowiq-consumer-beta`
   - Private ✓ → "Create repository"

2. In your project folder:
```bash
git init
git add .
git commit -m "Initial GlowIQ consumer beta"
git remote add origin https://github.com/YOUR_USERNAME/glowiq-consumer-beta.git
git push -u origin main
```

---

## Step 4 — Vercel (hosting)

1. Go to https://vercel.com → "Add New Project" → "Import Git Repository"
2. Select `glowiq-consumer-beta` → "Import"
3. **Environment Variables** — add these three (same values as .env.local):
   - `ANTHROPIC_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. "Deploy" → wait ~2 minutes → your app is live at `https://glowiq-consumer-beta.vercel.app`

5. Copy that URL, go back to **Supabase → Authentication → URL Configuration**
   → add it to "Redirect URLs"

---

## Step 5 — PWA icons

Generate icons at https://realfavicongenerator.net using the Iris logo SVG.
Drop the 192×192 and 512×512 PNGs into `public/icons/`.

---

## Sending the beta to friends

Share the Vercel URL. On iPhone: Safari → Share → "Add to Home Screen".
On Android: Chrome menu → "Add to Home Screen" / "Install app".

---

## Shipping updates

```bash
# Make changes, then:
git add .
git commit -m "describe your change"
git push
# Vercel auto-deploys in ~90 seconds. That's it.
```
