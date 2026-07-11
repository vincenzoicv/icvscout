# ICV Community - configurazione

La pagina e le API sono gia incluse nel progetto. Per attivare account, post e interazioni servono questi tre passaggi.

## 1. Tabelle Supabase

Apri Supabase > SQL Editor e, dal file `supabase_schema.sql`, esegui la sezione che comincia con:

```sql
-- ICV Community
```

La sezione crea profili, post, commenti, reazioni, salvataggi, follow, segnalazioni e relative regole di sicurezza.

## 2. Variabile pubblica Supabase

In Supabase > Project Settings > API copia la chiave `anon public`.

In Cloudflare Pages > icvscout-2026 > Impostazioni > Variabili aggiungi:

```text
SUPABASE_ANON_KEY
```

Il valore e la chiave `anon public`. Non usare la `service_role`: quella deve restare segreta e server-side.

## 3. Login Google ed email

In Supabase > Authentication:

- imposta `https://ilcalciodivince.com` come Site URL;
- aggiungi `https://ilcalciodivince.com/community` tra i Redirect URLs;
- lascia attivo il provider Email;
- abilita Google e inserisci Client ID e Client Secret creati su Google Cloud.

Per Google, l'Authorized redirect URI da inserire nella console Google e quello mostrato da Supabase nella configurazione del provider Google.

Dopo il deploy apri `/community`: le news ICV sono gia visibili. Login, pubblicazione e profili diventano attivi appena i tre passaggi sono completati.
