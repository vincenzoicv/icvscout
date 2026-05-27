# ICV Scout - Pubblicazione

## 1. Supabase

Nel pannello Supabase apri SQL Editor ed esegui:

```text
supabase_schema.sql
```

Controlla che esistano queste tabelle:

- `sources`
- `news_drafts`
- `market_items`
- `match_reports`
- `social_drafts`
- `automation_runs`
- `site_settings`

Poi vai in Project Settings -> API e tieni pronti:

- Project URL -> `SUPABASE_URL`
- service_role key -> `SUPABASE_SERVICE_ROLE_KEY`

Non incollare la service role key nel sito pubblico.

## 2. Variabili Cloudflare Pages

Nel progetto Cloudflare Pages aggiungi queste variabili ambiente:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_TOKEN
IG_ACCESS_TOKEN
HOME_AUTO_INTERVAL_HOURS=6
```

`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN` e `IG_ACCESS_TOKEN` devono stare solo nelle variabili Cloudflare, mai in HTML o JavaScript pubblico.

Impostazione consigliata:

- `ADMIN_TOKEN`: password lunga scelta da te per entrare in `icv_admin.html`
- `HOME_AUTO_INTERVAL_HOURS`: `6`
- `IG_ACCESS_TOKEN`: token Instagram rigenerato e non condiviso in chat

Se Supabase non e' ancora configurato, la home resta visibile ma senza dati automatici reali.

## 3. Test dopo deploy

Apri il sito online e verifica:

- Home carica news, mercato, Radar e Instagram.
- La riga "Home aggiornata" appare nel focus.
- `icv_admin.html` richiede il token admin.
- Da admin: `Importa Instagram` aggiorna i post.
- Da admin: `Salva Radar` cambia il blocco Radar in home.
- Da admin: nascondere un post Instagram lo rimuove dalla home.
- Tema chiaro/scuro non mostra numeri strani.
- Mobile: home, Radar, news e admin restano leggibili.
