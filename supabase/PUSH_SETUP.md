# Push notifications setup (one time)

Push needs a small server piece, so a few steps happen in your Supabase project. The app works without any of this;
the Notifications section in Settings just stays hidden until the public key below is set.

On iPhone, push only works after the app is added to the Home Screen (Share > Add to Home Screen) and needs iOS 16.4 or later.

## 1. Database
Run the whole of `supabase/schema.sql` in the SQL editor (the push block at the bottom creates `push_subscriptions`).

## 2. VAPID keys
```sh
npx web-push generate-vapid-keys
```
Keep the private key secret. The public key is safe to ship.

## 3. Edge Function secrets
```sh
supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=<any long random string>
```

## 4. Deploy the functions
```sh
supabase functions deploy push-api --no-verify-jwt
supabase functions deploy send-reminders --no-verify-jwt
```
`--no-verify-jwt` is intentional: like the sync functions, the secret pairing code is the credential, and
`send-reminders` checks the `x-cron-secret` header instead.

## 5. Schedule the reminders
Enable the `pg_cron` and `pg_net` extensions (Database > Extensions), then in the SQL editor:
```sql
select cron.schedule(
  'send-reminders',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://YOUR-PROJECT.supabase.co/functions/v1/send-reminders',
       headers := jsonb_build_object('x-cron-secret', 'THE-CRON-SECRET-FROM-STEP-3', 'Content-Type', 'application/json'),
       body := '{}'::jsonb
     ) $$
);
```

## 6. App build
Add a repository variable `VITE_VAPID_PUBLIC_KEY` (same place as `VITE_SUPABASE_URL`) with the public key, and redeploy.
For local dev, put it in `.env`.

## What gets sent
- Partner trained, PR and badge shout-outs, and taunts: sent by `push-api` when a workout is finished or a taunt is sent.
- Workout reminder (at your chosen time on training days), streak at risk (6 pm), and a warm nudge (noon after 2+ days off):
  sent by `send-reminders`, at most one per phone per day, never before 7 am or after 10 pm local time.

## Testing
Call the scheduler by hand (it prints how many phones it checked and notified):
```sh
curl -X POST https://YOUR-PROJECT.supabase.co/functions/v1/send-reminders -H "x-cron-secret: THE-CRON-SECRET"
```
