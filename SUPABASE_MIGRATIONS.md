# Migrazioni Supabase

Le modifiche future al database vanno salvate in `supabase/migrations` e applicate con Supabase CLI. `supabase_schema.sql` resta lo schema base per una nuova installazione; non va piu usato per aggiornare un database gia attivo.

## Prima configurazione (una sola volta per ogni Mac)

Installa la CLI, se manca:

```bash
brew install supabase/tap/supabase
```

Dal repository esegui:

```bash
supabase login
supabase link --project-ref PROJECT_REF
```

`PROJECT_REF` e la parte iniziale dell'URL del progetto, per esempio `abcdefghijklm` in `https://abcdefghijklm.supabase.co`. Il comando puo chiedere la password del database. Il collegamento viene scritto in `supabase/.temp/`, ignorato da Git: credenziali e riferimenti locali non finiscono nel repository.

Se l'aggiunta di `news_id` e gia stata eseguita manualmente, non ripeterla nello SQL Editor: la prima migrazione rileva gli oggetti esistenti e adotta lo stato senza duplicarli.

Controlla e applica le migrazioni pendenti:

```bash
supabase migration list
supabase db push --dry-run
supabase db push
supabase migration list
```

`db push` registra la migrazione nella cronologia remota. Prima del comando reale, leggere sempre il risultato di `--dry-run` e avere un backup recente per modifiche distruttive.

## Creare una nuova migrazione

```bash
supabase migration new descrizione_breve
```

Modifica il file SQL generato in `supabase/migrations`, poi verifica localmente (Docker Desktop deve essere attivo):

```bash
supabase start
supabase db reset
supabase db lint
```

Infine controlla il diff, committa insieme codice e migrazione, e applicala al remoto con il flusso `migration list` / `db push --dry-run` / `db push`.

## Regole del progetto

- Una migrazione gia condivisa o applicata non si modifica: si aggiunge una nuova migrazione.
- Usare nomi descrittivi e SQL sicuro (`if exists`, `if not exists` o controlli sul catalogo PostgreSQL) quando possibile.
- Non inserire chiavi, password o project ref nei file versionati.
- Non usare `db reset` sul progetto remoto: ricrea il database ed e destinato esclusivamente all'ambiente locale.
- Per installazioni nuove, applicare prima `supabase_schema.sql`, poi marcare/applicare le migrazioni secondo la cronologia del progetto.
