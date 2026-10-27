/* Stand-in for the Claude artifact runtime: same db/user calls, backed by /api on this site. */
(function () {
  var POLL_MS = 4000;
  var subs = [];
  function code() { try { return localStorage.getItem("hcd-code") || ""; } catch (e) { return ""; } }
  function fail(code_, msg) { var e = new Error(msg || code_); e.code = code_; return e; }
  async function write(body, retried) {
    var res = await fetch("/api/write", { method: "POST", headers: { "content-type": "application/json", "x-code": code() }, body: JSON.stringify(body) });
    if (res.status === 401) {
      if (!retried) {
        var c = window.prompt("Enter the group passcode to sign up:");
        if (c) { try { localStorage.setItem("hcd-code", c.trim()); } catch (e) {} return write(body, true); }
      }
      try { localStorage.removeItem("hcd-code"); } catch (e) {}
      throw fail("invalid_argument", "passcode needed");
    }
    var out = await res.json().catch(function () { return {}; });
    if (res.status === 404) throw fail("not_found");
    if (!res.ok) throw fail("server", out.message);
    return out;
  }
  function snapDoc(id, data) { return { id: id, exists: data != null, data: function () { return data ? JSON.parse(JSON.stringify(data)) : undefined; } }; }
  async function pollOne(s) {
    try {
      var res = await fetch("/api/list?path=" + encodeURIComponent(s.path), { cache: "no-store" });
      if (!res.ok) throw new Error("list " + res.status);
      var out = await res.json();
      var sig = JSON.stringify(out.docs);
      if (sig !== s.sig) {
        s.sig = sig;
        s.cb({ docs: out.docs.map(function (d) { return snapDoc(d.id, d.data); }), size: out.docs.length, empty: !out.docs.length });
      }
    } catch (e) { if (!s.sig && s.err) { s.err(e); } }
  }
  function pollAll() { subs.forEach(pollOne); }
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
      set: async function (d) { await write({ op: "set", path: path, data: d }); setTimeout(pollAll, 50); },
      update: async function (d) { await write({ op: "update", path: path, data: d }); setTimeout(pollAll, 50); },
      delete: async function () { await write({ op: "delete", path: path }); setTimeout(pollAll, 50); },
      acquire: function (o) { return write({ op: "acquire", path: path, holder: o.holder, ttlMs: o.ttlMs }); }
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
        pollOne(s);
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
