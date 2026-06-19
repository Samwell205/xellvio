## Plan: Grant admin role to durosinmisamuel94@gmail.com

Insert an `admin` row into `public.user_roles` for the auth user whose email is `durosinmisamuel94@gmail.com`.

### SQL
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'durosinmisamuel94@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

### After running
- Sign out and back in at `/auth`.
- You will be redirected automatically to `/admin`.

No code changes — data-only update.