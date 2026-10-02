# Performance e Match Center - 1 ottobre 2026

## Misure sul sito pubblico

Chrome DevTools, rete Fast 4G, CPU rallentata 4x. Libreria ufficiale
Google `web-vitals` caricata solo dal browser di verifica, non dal sito.
INP rilevato dopo un clic reale sul cambio tema.

| Campione | LCP | INP | CLS |
| --- | ---: | ---: | ---: |
| Mobile 390 x 844, navigazione con cache disponibile | 332 ms | 88 ms | 0 |
| Desktop 1365 x 900, ricarica ignorando la cache | 856 ms | 88 ms | 0.018 |

Una traccia mobile precedente ha rilevato LCP 517 ms, CLS 0,
TTFB 172 ms e 317 ms di ritardo di rendering. Il caricamento iniziale
non includeva interazioni: non era quindi una misura INP.

Questi sono campioni di laboratorio, non percentili dei visitatori.
CrUX non ha restituito dati sul campo sufficienti durante la verifica.
Non si puo dichiarare un miglioramento percentuale confrontando campioni
con condizioni di cache diverse, ne dichiarare superati i Core Web Vitals
di tutti gli utenti.

## Intervento mirato

La traccia ha individuato una lettura sincrona delle dimensioni della hero
in `resizeHeroCanvas` (circa 42 ms nella traccia rallentata). La versione
locale usa le dimensioni fornite da ResizeObserver e non ricrea il canvas
quando le dimensioni non cambiano. Restano rispettate le preferenze di
movimento ridotto e la sospensione quando la hero non e visibile.

I contenuti aggiuntivi della partita sono separati dal referto. I player
YouTube e Instagram si caricano solo dopo un'azione esplicita. Foto e
anteprime riutilizzano i componenti gia presenti, con immagini lazy.

## Verifica ripetibile

`node scripts/measure-web-vitals.mjs` esegue tre campioni per dispositivo,
cache disattivata, latenza 40 ms, download 1.6 MB/s, CPU 4x e due cambi tema.
Il risultato JSON viene scritto in `/tmp/icv-web-vitals.json`.
Per una versione locale usare `ICV_PERF_URL` e `ICV_PERF_OUTPUT`.
L'accesso diretto al dominio dal Chromium avviato da terminale ha subito
timeout in questo ambiente; le misure pubbliche sopra provengono dal
browser Chrome DevTools, che ha raggiunto regolarmente il sito.

Sei campioni successivi sulla home statica locale modificata, senza API
di produzione: mobile LCP 2604 / 352 / 368 ms, INP 64 / 56 / 56 ms,
CLS 0.023 / 0.036 / 0.037; desktop LCP 720 / 728 / 712 ms, INP
72 / 72 / 72 ms, CLS 0.016 / 0.016 / 0.016. Il primo campione mobile
supera di poco la soglia LCP buona di 2500 ms e va mantenuto nel rapporto,
non scartato. La versione statica non misura il caricamento dei dati reali.

## Contenuti della partita

Foto: stessa data italiana e nomi di entrambe le squadre.
Conferenze: entrambe le squadre e pubblicazione entro 48 ore dal calcio
d'inizio. Un match_id esplicito ha priorita.
Highlights: associazione esplicita o titolo dell'ultimo incontro concluso.
Alla selezione di un nuovo video, quelli associabili senza ambiguita
vengono conservati nell'archivio per partita (massimo 80).
I contenuti nascosti e le selezioni editoriali disattivate restano esclusi.

La discussione usa la chiave originale della Match Room, conservando i
messaggi esistenti. Il link apre la stanza di quello specifico incontro.
Nessuna conferenza o foto mancante viene ricostruita o inventata.
