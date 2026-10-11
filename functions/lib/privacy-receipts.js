export const PRIVACY_VERSION = 3;
export const PRIVACY_NOTICE = {
  version: PRIVACY_VERSION,
  policy: '/cookie-policy',
  privacy: '/privacy',
  categories: {
    technical: 'Accesso, sicurezza, preferenze e funzionamento del servizio.',
    analytics: 'Statistiche ICV: eventi di utilizzo e identificativo di sessione, senza IP o profili pubblicitari.',
    external_media: 'Player Instagram, TikTok e YouTube: dati di navigazione e possibili cookie dei fornitori.'
  },
  controls: ['Rifiuta tutti', 'Personalizza', 'Accetta tutti', 'Salva preferenze'],
  preference_days: 180,
  receipt_days: 365
};

export async function privacyReceipt(request, store) {
  const reply = (body, status) => new Response(JSON.stringify(body), {
    status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}
  });
  if (request.method !== 'POST') return reply({error: 'Metodo non consentito'}, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return reply({error: 'Origine non consentita'}, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({error: 'Formato non consentito'}, 415);
  if (Number(request.headers.get('Content-Length')) > 2048) return reply({error: 'Richiesta troppo grande'}, 413);
  // Bound the streamed body too: Content-Length is not trustworthy or always present.
  let size = 0, chunks = [];
  const reader = request.body?.getReader();
  if (!reader) return reply({error: 'Richiesta non valida'}, 400);
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) { await reader.cancel(); return reply({error: 'Richiesta troppo grande'}, 413); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(await new Blob(chunks).text()); } catch { return reply({error: 'Richiesta non valida'}, 400); }
  const age = Date.now() - Date.parse(body?.chosen_at);
  if (!body || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id || '') ||
      body.version !== PRIVACY_VERSION || typeof body.analytics !== 'boolean' || typeof body.external_media !== 'boolean' ||
      !['accept', 'reject', 'customize', 'media'].includes(body.action) || !Number.isFinite(age) || age < -300000 || age > 180 * 86400000 ||
      (body.action === 'reject' && (body.analytics || body.external_media)) ||
      (body.action === 'media' && !body.external_media)) return reply({error: 'Scelta non valida'}, 400);
  const receipt = {
    id: body.id, version: PRIVACY_VERSION, action: body.action,
    analytics: body.analytics, external_media: body.external_media,
    chosen_at: new Date(body.chosen_at).toISOString(), notice: PRIVACY_NOTICE
  };
  try {
    await store(receipt);
    return reply({accepted: true, id: receipt.id}, 201);
  } catch { return reply({accepted: false, error: 'Registro temporaneamente non disponibile'}, 503); }
}
