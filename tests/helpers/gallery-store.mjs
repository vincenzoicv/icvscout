export function galleryStore() {
  let value = null, bucket = null;
  const objects = new Map();
  return {
    get value() { return value; },
    get bucket() { return bucket; },
    objects,
    fetch: async function(input, options = {}) {
      const url = new URL(input), path = url.pathname;
      if (url.hostname !== 'gallery-db.test') throw new Error('Unexpected network request: ' + url.hostname);
      if (path === '/rest/v1/site_settings') {
        const method = options.method || 'GET';
        if (method === 'GET') return Response.json(value && url.searchParams.get('key') === 'eq.match_photo_gallery' ? [{ key: 'match_photo_gallery', value: structuredClone(value) }] : []);
        if (method === 'POST') {
          if (value) return Response.json({ error: 'duplicate' }, { status: 409 });
          value = JSON.parse(options.body)[0].value;
        } else if (method === 'PATCH') {
          if (url.searchParams.get('value->>revision') !== 'eq.' + value?.revision) return Response.json([]);
          value = JSON.parse(options.body).value;
        }
        return Response.json([{ key: 'match_photo_gallery', value: structuredClone(value) }]);
      }
      if (path === '/storage/v1/bucket/match-photos') return bucket ? Response.json(bucket) : Response.json({ statusCode: 404 }, {status:400});
      if (path === '/storage/v1/bucket') { bucket = JSON.parse(options.body); return Response.json(bucket); }
      if (path === '/storage/v1/object/match-photos' && options.method === 'DELETE') { for (const key of JSON.parse(options.body).prefixes) objects.delete(key); return Response.json({}); }
      if (path.startsWith('/storage/v1/object/authenticated/match-photos/')) {
        if (options.headers.Authorization !== 'Bearer test-service') return new Response(null,{status:401});
        const file = objects.get(decodeURIComponent(path.split('/').pop()));
        return file ? new Response(file.bytes,{headers:{'Content-Type':file.type}}) : new Response(null,{status:404});
      }
      if (path.startsWith('/storage/v1/object/match-photos/') && options.method === 'POST') {
        const key = path.split('/').pop();
        objects.set(key,{bytes:new Uint8Array(options.body),type:options.headers['Content-Type']});
        return Response.json({Key:key});
      }
      return Response.json([]);
    },
  };
}
