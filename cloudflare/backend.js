let ready = null;
function init(env) {
  if (!ready) {
    ready = env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS leases (path TEXT PRIMARY KEY, holder TEXT NOT NULL, expires INTEGER NOT NULL)")
    ]).catch((e) => { ready = null; throw e; });
  }
  return ready;
}
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const okPath = (p) => typeof p === "string" && /^[A-Za-z0-9_\-]+(\/[A-Za-z0-9_\-]+)*$/.test(p) && p.length < 200;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    if (!env.DB) return json({ error: "no_database", message: "Bind a D1 database named DB in project settings." }, 500);
    try {
      await init(env);
      if (request.method === "GET" && url.pathname === "/api/list") {
        const p = url.searchParams.get("path") || "";
        if (!okPath(p)) return json({ error: "bad_path" }, 400);
        const rows = await env.DB.prepare("SELECT path, data FROM docs WHERE path LIKE ?").bind(p + "/%").all();
        const docs = [];
        for (const r of rows.results) {
          const rest = r.path.slice(p.length + 1);
          if (rest.indexOf("/") === -1) docs.push({ id: rest, data: JSON.parse(r.data) });
        }
        return json({ docs });
      }
      if (request.method === "GET" && url.pathname === "/api/doc") {
        const p = url.searchParams.get("path") || "";
        if (!okPath(p)) return json({ error: "bad_path" }, 400);
        const r = await env.DB.prepare("SELECT data FROM docs WHERE path = ?").bind(p).first();
        return json({ exists: !!r, data: r ? JSON.parse(r.data) : null });
      }
      if (request.method === "POST" && url.pathname === "/api/write") {
        if (env.GROUP_CODE && request.headers.get("x-code") !== env.GROUP_CODE) return json({ error: "forbidden" }, 401);
        const b = await request.json();
        if (!okPath(b.path)) return json({ error: "bad_path" }, 400);
        const now = Date.now();
        if (b.op === "acquire") {
          const ttl = Math.min(Math.max(Number(b.ttlMs) || 4000, 500), 30000);
          const holder = String(b.holder || "").slice(0, 80);
          const r = await env.DB.prepare(
            "INSERT INTO leases(path, holder, expires) VALUES(?1, ?2, ?3) ON CONFLICT(path) DO UPDATE SET holder = excluded.holder, expires = excluded.expires WHERE leases.expires < ?4 OR leases.holder = excluded.holder"
          ).bind(b.path, holder, now + ttl, now).run();
          return json({ acquired: r.meta.changes === 1 });
        }
        if (b.op === "delete") {
          await env.DB.prepare("DELETE FROM docs WHERE path = ?").bind(b.path).run();
          return json({ ok: true });
        }
        if (b.op === "set" || b.op === "update") {
          const data = b.data;
          if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "bad_data" }, 400);
          const text = JSON.stringify(data);
          if (text.length > 8000) return json({ error: "too_big" }, 400);
          if (b.op === "set") {
            await env.DB.prepare("INSERT INTO docs(path, data, updated) VALUES(?1, ?2, ?3) ON CONFLICT(path) DO UPDATE SET data = excluded.data, updated = excluded.updated").bind(b.path, text, now).run();
            return json({ ok: true });
          }
          const cur = await env.DB.prepare("SELECT data FROM docs WHERE path = ?").bind(b.path).first();
          if (!cur) return json({ error: "not_found" }, 404);
          const merged = JSON.stringify(Object.assign(JSON.parse(cur.data), data));
          await env.DB.prepare("UPDATE docs SET data = ?, updated = ? WHERE path = ?").bind(merged, now, b.path).run();
          return json({ ok: true });
        }
        return json({ error: "bad_op" }, 400);
      }
      return json({ error: "not_found" }, 404);
    } catch (e) {
      return json({ error: "server", message: String(e && e.message || e) }, 500);
    }
  }
};
