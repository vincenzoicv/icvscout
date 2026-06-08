# ICV Scout Automation Setup

Questa versione sposta le chiavi fuori dal browser e usa le Pages Functions come backend.

## 1. Supabase

Nel pannello Supabase esegui il contenuto di:

```text
supabase_schema.sql
```

Lo schema aggiunge:

- `sources`: fonti RSS con affidabilita.
- `news_drafts`: bozze automatiche da approvare.
- `market_items`: segnali mercato deduplicati.
- `match_reports`: bozze pre/post partita.
- `social_drafts`: caption e testi card.
- `automation_runs`: log delle automazioni.
- `site_settings`: impostazioni modificabili dall'admin, incluso il Radar della home.

## 2. Variabili Ambiente Cloudflare

Configura queste variabili nel progetto Cloudflare Pages:

```text
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_TOKEN=...
FOOTBALL_DATA_KEY=...
APISPORTS_KEY=...
IG_ACCESS_TOKEN=...
HOME_AUTO_INTERVAL_HOURS=6
```

`ADMIN_TOKEN` e `SUPABASE_SERVICE_ROLE_KEY` non devono mai stare in `index.html` o `icv_admin.html`.

La cartella include anche `wrangler.toml` per Cloudflare Pages. Il nome progetto predefinito e `icv-scout`; puoi rinominarlo nel file se su Cloudflare scegli un altro nome.

## 3. Admin

Apri:

```text
icv_admin.html
```

Inserisci `ADMIN_TOKEN`. Da li puoi:

- fetchare news da fonti affidabili;
- approvare o scartare bozze;
- pubblicare news manuali;
- generare bozze mercato;
- creare match center;
- generare caption social.
- importare post e Reel Instagram con Meta API.

## 4. Cron Consigliati

La home ha gia un autopilot leggero: quando `/api/public/home` viene aperto, il backend controlla se sono passate almeno `HOME_AUTO_INTERVAL_HOURS` ore dall'ultimo aggiornamento. Se si, aggiorna Instagram e prova ad aggiornare mercato e Match Center con le chiavi disponibili.

Questo mantiene la home fresca anche senza aprire l'admin. I cron restano utili se vuoi aggiornamenti a orari fissi anche quando nessuno visita il sito.

Puoi schedulare chiamate POST a `/api/admin/automate` con header `X-ICV-Admin-Token`.

Payload news:

```json
{"action":"fetch_news"}
```

Payload mercato:

```json
{"action":"market"}
```

Payload match:

```json
{"action":"match_center"}
```

Payload social:

```json
{"action":"social"}
```

Payload Instagram:

```json
{"action":"instagram_import"}
```

Frequenza consigliata:

- News: ogni ora.
- Mercato: ogni 3 ore.
- Match center: ogni giorno, e ogni 6 ore nel giorno partita.
- Social: dopo fetch news o manualmente dall'admin.
- Instagram: ogni 6 ore, oppure manualmente dall'admin dopo la pubblicazione di un Reel.

## 5. Instagram Creator e Meta Developer

Per automatizzare Instagram serve un token ufficiale Meta salvato come `IG_ACCESS_TOKEN`.

Flusso consigliato:

1. Account Instagram in modalita Creator.
2. App su Meta for Developers.
3. Prodotto Instagram API con Instagram Login.
4. Autorizzazione del tuo account Creator.
5. Token long-lived salvato in Cloudflare Pages come `IG_ACCESS_TOKEN`.
6. Pulsante admin `Importa Instagram`, oppure cron con `{"action":"instagram_import"}`.

Il token non va mai copiato in `index.html` o `icv_admin.html`.

## 6. Regola Editoriale

- `official`: fonti ufficiali o domini Juventus, Lega Serie A, UEFA/FIFA. Vanno in bozza `ready` e vengono pubblicate subito dal flusso automatico.
- `trusted`: Sky, Di Marzio, Agresti, Gazzetta e fonti editoriali solide. Restano in bozza, ma passano a `ready` quando una seconda fonte affidabile/ufficiale conferma la stessa notizia.
- `trusted autopublish`: Fabrizio Romano e gli altri trusted esplicitamente autorizzati. Vanno in bozza `ready` e vengono pubblicati subito.
- `rumor`: notizie non confermate ma tracciabili. Solo bozza admin.
- `aggregator`: aggregatori o Google News generico. Solo bozza admin e sempre da verificare.
- `blacklist`: fonti da ignorare. Non creano bozze e non pubblicano nulla.

Puoi impostare `blacklist` dal pannello admin quando aggiungi una fonte. In alternativa puoi bloccare pattern di dominio o nome fonte con una variabile Cloudflare:

```env
NEWS_BLACKLIST=tuttomercatoweb.com,fonte-da-ignorare
```

Fabrizio Romano e gia autorizzato nel codice come `trusted autopublish` e viene letto dal canale Telegram pubblico diretto `https://t.me/s/fabrizioromanotg`, non da Google News. Il backend filtra comunque solo i post rilevanti per Juventus/mercato.

Per aggiungere altri trusted automatici senza cambiare codice:

```env
NEWS_TRUSTED_AUTOPUBLISH=fabrizio romano,altra-fonte
```

Ogni news riceve anche una priorita editoriale nel campo `urgency`:

- `breaking`: ufficialita, comunicati, allenatore, infortuni, operazioni, acquisti o cessioni ufficiali.
- `important`: convocati, calendario, conferenze, rinnovi, ritiri, sorteggi, competizioni e arbitri.
- `normal`: aggiornamenti ordinari.
- `low`: sponsor, store, academy, ticketing, partnership ed eventi minori.
- `rumor`: voci non ufficiali da fonti non ufficiali.

La home e `/api/public/news` ordinano le news combinando priorita, affidabilita e freschezza, quindi una notizia importante puo restare sopra una news piu recente ma secondaria.

Il sito pubblico mostra solo record pubblicati in `news` con `visible = true`.
