# GlowIQ Admin Portal — Setup

## 1. Place in repo
Put this folder as `admin/` inside your existing `glowiq-consumer-beta` repo.

## 2. Supabase — run this SQL
```sql
-- Add read_at to feedback table (if not already there)
alter table feedback add column if not exists read_at timestamptz;
```

## 3. Vercel — create new project
- New Project → Import the same GitHub repo
- **Root Directory**: `admin`
- **Framework Preset**: Next.js

## 4. Vercel environment variables (add all four)
```
NEXT_PUBLIC_SUPABASE_URL        = (same as consumer app)
NEXT_PUBLIC_SUPABASE_ANON_KEY   = (same as consumer app)
SUPABASE_SERVICE_ROLE_KEY       = (from Supabase → Settings → API → service_role key)
ADMIN_EMAILS                    = gene@yourdomain.com,staff@yourdomain.com
```

## 5. Supabase — add redirect URL
Go to Supabase → Authentication → URL Configuration → Redirect URLs:
```
https://admin.skinroadmap.com/api/auth/callback
```

## 6. Custom domain
In Vercel → project Settings → Domains → add `admin.skinroadmap.com`
Then add the CNAME in GoDaddy pointing to `cname.vercel-dns.com`

## 7. Push and deploy
```
git add .
git commit -m "Add GlowIQ admin portal"
git push
```
