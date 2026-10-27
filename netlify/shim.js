/* Stand-in for the Claude artifact runtime: same db/user calls, saved through /api on this site. */
(function () {
  var POLL_MS = 10000;
  var subs = [];
  function fail(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  async function write(body) {
    var res = await fetch("/api/write", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    var out = await res.json().catch(function () { return {}; });
    if (res.status === 409) throw fail("conflict");
    if (res.status === 404) throw fail("not_found");
    if (!res.ok) throw fail("server", out.message || out.error);
    return out;
  }
  function snapDoc(id, data) { return { id: id, exists: data != null, data: function () { return data ? JSON.parse(JSON.stringify(data)) : undefined; } }; }
  var polling = false;
  async function pollAll() {
    if (polling || !subs.length) return;
    polling = true;
    var current = subs.slice();
    try {
      var paths = [];
      current.forEach(function (s) { if (paths.indexOf(s.path) === -1) paths.push(s.path); });
      var res = await fetch("/api/lists?paths=" + encodeURIComponent(paths.join(",")), { cache: "no-store" });
      if (!res.ok) throw new Error("list " + res.status);
      var out = await res.json();
      current.forEach(function (s) {
        var docs = out.lists[s.path] || [];
        var sig = JSON.stringify(docs);
        if (sig !== s.sig) {
          s.sig = sig;
          s.cb({ docs: docs.map(function (d) { return snapDoc(d.id, d.data); }), size: docs.length, empty: !docs.length });
        }
      });
    } catch (e) {
      current.forEach(function (s) { if (s.sig === null && s.err) { s.sig = "error"; s.err(e); } });
    } finally { polling = false; }
  }
  setInterval(function () { if (!document.hidden) pollAll(); }, POLL_MS);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) pollAll(); });
  function docRef(path) {
    return {
      id: path.split("/").pop(), path: path,
      get: async function () {
        var res = await fetch("/api/doc?path=" + encodeURIComponent(path), { cache: "no-store" });
        var out = await res.json();
        return snapDoc(path.split("/").pop(), out.exists ? out.data : null);
      },
      set: async function (d) { await write({ op: "set", path: path, data: d }); setTimeout(pollAll, 30); },
      update: async function (d) { await write({ op: "update", path: path, data: d }); setTimeout(pollAll, 30); },
      delete: async function () { await write({ op: "delete", path: path }); setTimeout(pollAll, 30); },
      acquire: function () { return Promise.resolve({ acquired: true }); }
    };
  }
  function colRef(path) {
    return {
      path: path,
      doc: function (id) { return docRef(path + "/" + (id || ("a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)))); },
      add: async function (d) { var r = this.doc(); await r.set(d); return r; },
      onSnapshot: function (cb, err) {
        var s = { path: path, cb: cb, err: err, sig: null };
        subs.push(s);
        setTimeout(pollAll, 0);
        return function () { subs = subs.filter(function (x) { return x !== s; }); };
      }
    };
  }
  var db = { doc: docRef, collection: colRef };
  var user = {
    can: function () { return Promise.resolve(true); },
    id: function () { return Promise.resolve(null); },
    isOwner: function () { return Promise.resolve(false); },
    canEdit: function () { return Promise.resolve(false); }
  };
  window.claude = { use: function (n) { return Promise.resolve(n === "db" ? db : n === "user" ? user : null); } };
})();
