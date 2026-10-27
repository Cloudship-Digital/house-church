// ---- House Church Dinner API (small shared database on Netlify Blobs) ----
// Each collection (for example "slots", "mains", "sides/2026-10-15/items") is ONE blob holding {id: doc}.
// Writes use the blob's version tag (etag), so two people can never overwrite each other's claim.
var config = { path: "/api/*" };
var STORE_NAME = "house-church";
var json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s,
  headers: { "content-type": "application/json", "cache-control": "no-store" }
});
var okPath = (p) => typeof p === "string" && p.length < 200 && /^[A-Za-z0-9_\-]+(\/[A-Za-z0-9_\-]+)*$/.test(p);
var colKey = (p) => "c/" + p;
async function readCol(store, path) {
  const r = await store.getWithMetadata(colKey(path), { type: "json", consistency: "strong" });
  return r ? { docs: r.data || {}, etag: r.etag } : { docs: {}, etag: null };
}
// Read-modify-write with retry. fn(docs) returns the new docs object, or throws {conflict:true}.
async function mutate(store, path, fn) {
  for (let i = 0; i < 6; i++) {
    const { docs, etag } = await readCol(store, path);
    const next = fn(JSON.parse(JSON.stringify(docs)));
    if (Object.keys(next).length > 400) throw { tooBig: true };
    const res = etag
      ? await store.setJSON(colKey(path), next, { onlyIfMatch: etag })
      : await store.setJSON(colKey(path), next, { onlyIfNew: true });
    if (res && res.modified) return;
  }
  throw { busy: true };
}
var api_default = async (req) => {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  try {
    if (req.method === "GET" && route === "lists") {
      const paths = (url.searchParams.get("paths") || "").split(",").filter(Boolean).slice(0, 8);
      if (!paths.every(okPath)) return json({ error: "bad_path" }, 400);
      const lists = {};
      for (const p of paths) {
        const { docs } = await readCol(store, p);
        lists[p] = Object.keys(docs).map((id) => ({ id, data: docs[id] }));
      }
      return json({ lists });
    }
    if (req.method === "GET" && route === "doc") {
      const p = url.searchParams.get("path") || "";
      if (!okPath(p) || p.indexOf("/") === -1) return json({ error: "bad_path" }, 400);
      const i = p.lastIndexOf("/");
      const { docs } = await readCol(store, p.slice(0, i));
      const d = docs[p.slice(i + 1)];
      return json({ exists: !!d, data: d || null });
    }
    if (req.method === "POST" && route === "write") {
      const b = await req.json().catch(() => ({}));
      const p = b.path;
      if (!okPath(p) || p.indexOf("/") === -1) return json({ error: "bad_path" }, 400);
      const i = p.lastIndexOf("/");
      const col = p.slice(0, i), id = p.slice(i + 1);
      if (b.op === "acquire") return json({ acquired: true });
      if (b.op === "delete") {
        await mutate(store, col, (docs) => { delete docs[id]; return docs; });
        return json({ ok: true });
      }
      if (b.op === "set" || b.op === "update") {
        const data = b.data;
        if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "bad_data" }, 400);
        if (JSON.stringify(data).length > 4000) return json({ error: "too_big" }, 400);
        await mutate(store, col, (docs) => {
          const cur = docs[id];
          if (b.op === "update" && !cur) throw { notFound: true };
          const next = b.op === "update" ? Object.assign({}, cur, data) : data;
          // First claim wins: a name already on this spot cannot be replaced by a different person.
          if (cur && cur.name && next.name && cur.by !== next.by) throw { conflict: true };
          docs[id] = next;
          return docs;
        });
        return json({ ok: true });
      }
      return json({ error: "bad_op" }, 400);
    }
    return json({ error: "not_found" }, 404);
  } catch (e) {
    if (e && e.conflict) return json({ error: "conflict" }, 409);
    if (e && e.notFound) return json({ error: "not_found" }, 404);
    if (e && e.busy) return json({ error: "busy" }, 503);
    if (e && e.tooBig) return json({ error: "too_big" }, 400);
    return json({ error: "server", message: String((e && e.message) || e) }, 500);
  }
};
export {
  config,
  api_default as default
};
