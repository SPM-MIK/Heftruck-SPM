/* Koppelstuk: laat de app draaien op Supabase in plaats van de Claude-database.
   Biedt dezelfde functies (claude.use('db') en claude.use('user')) plus inloggen. */
(function () {
  'use strict';
  const C = window.CONFIG || {};
  window.SM_WEB = true;   // website: documenten en PDF inlezen beschikbaar
  const NO_PW = C.WACHTWOORD === false;          // tijdelijk zonder wachtwoord: alleen naam vragen
  const NKEY = 'sm-naam';
  let sb = null, session = null, readyRes;
  const ready = new Promise(r => (readyRes = r));
  const el = (t, a, ...k) => { const e = document.createElement(t); Object.assign(e, a || {}); k.forEach(x => e.append(x)); return e; };

  const css = `.lg{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;overflow:auto;background-color:#08194F;background-size:cover;background-position:center}
  .lg .card{background:rgba(255,255,255,.97);color:#17264C;border-radius:18px;padding:30px 32px 26px;width:100%;max-width:400px;box-shadow:0 18px 50px rgba(5,22,63,.45);box-sizing:border-box}
  .lg .kop{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;margin-bottom:6px}
  .lg .kop img{width:72px;height:72px;border-radius:12px;box-shadow:0 4px 14px rgba(12,37,121,.35)}
  .lg h1{font:700 30px/1 "Barlow Condensed",sans-serif;margin:4px 0 0;color:#0C2579}
  .lg p{color:#596985;margin:0;font-size:15px}
  .lg form{display:grid;gap:14px;margin-top:16px}
  .lg label{display:flex;flex-direction:column;gap:5px;font:500 14px Barlow,sans-serif;color:#596985}
  .lg input:not([type=checkbox]){font:500 17px Barlow,sans-serif;border:1.5px solid #D9E1F0;border-radius:10px;padding:12px 14px;min-height:48px;box-sizing:border-box;color:#17264C;background:#fff;width:100%}
  .lg input:focus{outline:none;border-color:#0C2579;box-shadow:0 0 0 3px rgba(12,37,121,.15)}
  .lg .pw{position:relative}
  .lg .pw input{padding-right:64px}
  .lg .toon{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:none;color:#325BBC;font:600 14px Barlow,sans-serif;padding:8px;cursor:pointer}
  .lg label.chk{flex-direction:row;align-items:center;gap:10px;font-size:16px;color:#17264C;cursor:pointer}
  .lg label.chk input{width:20px;height:20px;accent-color:#0C2579;margin:0}
  .lg button[type=submit]{border:0;border-radius:10px;padding:14px;font:600 17px Barlow,sans-serif;background:#0C2579;color:#fff;min-height:50px;cursor:pointer}
  .lg button[type=submit]:hover{background:#193A96}
  .lg button[type=submit]:disabled{opacity:.7;cursor:wait}
  .lg .e{color:#B3261E;font-size:14px;min-height:1em;margin:0}
  .lg .klein{color:#8B9CC1;font-size:13px;text-align:center;margin-top:12px}
  .side .uit{margin:8px 10px 0;border:0;background:none;color:inherit;opacity:.6;text-decoration:underline;font:500 13px Barlow,sans-serif;padding:0;text-align:left;cursor:pointer}`;
  document.head.append(el('style', { textContent: css }));

  // achtergrond en logo van de website zelf gebruiken
  function fotoUrl() { for (const st of document.querySelectorAll('style')) { const m = st.textContent.match(/url\(["']?(data:image\/jpeg;base64,[^"')]+)["']?\)/); if (m) return m[1]; } return '/achtergrond.jpg'; }
  function logoUrl() { const l = document.querySelector('.logo'); return (l && l.getAttribute('src')) || '/icons/icon-192.png'; }
  // "Wachtwoord onthouden": aan = ingelogd blijven (localStorage), uit = uitloggen bij sluiten browser (sessionStorage)
  const RKEY = 'sm-onthoud', EKEY = 'sm-email';
  const onthoud = () => { try { return localStorage.getItem(RKEY) !== 'nee'; } catch (x) { return true; } };
  const sessieOpslag = {
    getItem: k => { try { return (onthoud() ? localStorage : sessionStorage).getItem(k); } catch (x) { return null; } },
    setItem: (k, v) => { try { if (onthoud()) { localStorage.setItem(k, v); sessionStorage.removeItem(k); } else { sessionStorage.setItem(k, v); localStorage.removeItem(k); } } catch (x) { } },
    removeItem: k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (x) { } }
  };
  function screen(title, text, form, extra) {
    document.querySelectorAll('.lg').forEach(x => x.remove());
    const kop = el('div', { className: 'kop' }, el('img', { src: logoUrl(), alt: 'Supermaritime' }), el('h1', { textContent: title }), el('p', { innerHTML: text }));
    const card = el('div', { className: 'card' }, kop);
    if (form) card.append(form);
    if (extra) card.append(extra);
    const lg = el('div', { className: 'lg' }, card);
    lg.style.backgroundImage = `linear-gradient(180deg,rgba(5,22,63,.35) 0%,rgba(5,22,63,.55) 50%,rgba(5,22,63,.72) 100%),url("${fotoUrl()}")`;
    document.body.append(lg);
  }
  function loginScreen(note) {
    const err = el('p', { className: 'e', textContent: note || '' });
    let bewaard = ''; try { bewaard = localStorage.getItem(EKEY) || ''; } catch (x) { }
    const email = el('input', { type: 'email', name: 'email', id: 'sm-email', autocomplete: 'username', required: true, value: bewaard });
    const pw = el('input', { type: 'password', name: 'password', id: 'sm-pw', autocomplete: 'current-password', required: true });
    const toon = el('button', { type: 'button', className: 'toon', textContent: 'Toon' });
    toon.setAttribute('aria-label', 'Wachtwoord tonen');
    toon.addEventListener('click', () => { const zie = pw.type === 'password'; pw.type = zie ? 'text' : 'password'; toon.textContent = zie ? 'Verberg' : 'Toon'; toon.setAttribute('aria-label', zie ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'); pw.focus(); });
    const onth = el('input', { type: 'checkbox', checked: onthoud() });
    const knop = el('button', { type: 'submit', textContent: 'Inloggen' });
    const f = el('form', { method: 'post', action: '#' },
      el('label', {}, 'E-mail', email), el('label', {}, 'Wachtwoord', el('div', { className: 'pw' }, pw, toon)),
      el('label', { className: 'chk' }, onth, 'Wachtwoord onthouden'), err, knop);
    f.addEventListener('submit', async e => {
      e.preventDefault(); err.textContent = ''; knop.disabled = true; knop.textContent = 'Bezig…';
      try { localStorage.setItem(RKEY, onth.checked ? 'ja' : 'nee'); if (onth.checked) localStorage.setItem(EKEY, email.value.trim()); else localStorage.removeItem(EKEY); } catch (x) { }
      const { data, error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
      if (error) { knop.disabled = false; knop.textContent = 'Inloggen'; err.textContent = 'Inloggen mislukt. Controleer e-mail en wachtwoord.'; return; }
      session = data.session; document.querySelector('.lg')?.remove(); readyRes(true);
    });
    screen('Supermaritime', 'Onderhoud &amp; equipment · log in om verder te gaan', f, el('p', { className: 'klein', textContent: 'Wachtwoord vergeten? Vraag de beheerder om een nieuw wachtwoord.' }));
    setTimeout(() => (bewaard ? pw : email).focus(), 50);
  }

  function nameScreen() {
    const err = el('p', { className: 'e' });
    const naam = el('input', { name: 'naam', autocomplete: 'name', required: true, placeholder: 'bv. Jan de Vries' });
    const f = el('form', {}, el('label', {}, 'Je naam', naam), err, el('button', { className: 'btn', type: 'submit', textContent: 'Verder' }));
    f.addEventListener('submit', e => {
      e.preventDefault(); const n = naam.value.trim().replace(/\s+/g, ' ');
      if (n.length < 2) { err.textContent = 'Vul je naam in.'; return; }
      try { localStorage.setItem(NKEY, n); } catch (x) { }
      startAs(n); document.querySelector('.lg')?.remove();
    });
    screen('Supermaritime onderhoud', 'Vul je naam in, zodat collega’s zien wie een melding heeft gedaan.', f);
    setTimeout(() => naam.focus(), 50);
  }
  function startAs(n) { session = { user: { id: 'naam:' + n, email: '', user_metadata: { name: n } } }; readyRes(true); }

  async function init() {
    if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY || /PLAK-HIER/.test(C.SUPABASE_URL + C.SUPABASE_ANON_KEY))
      return screen('Nog niet ingesteld', 'Vul in <b>config.js</b> de Supabase-URL en anon key in (zie LEESMIJ, stap 4). Staat het er al in? Controleer dan komma’s en aanhalingstekens.');
    if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(C.SUPABASE_URL.trim()))
      return screen('URL klopt niet', 'De SUPABASE_URL in config.js moet eruitzien als https://abcdefghijk.supabase.co (zonder iets erachter).');
    if (!window.supabase) return screen('Verbinding mislukt', 'De Supabase-bibliotheek kon niet worden geladen. Controleer je internet en herlaad de pagina.');
    sb = window.supabase.createClient(C.SUPABASE_URL.trim(), C.SUPABASE_ANON_KEY.trim(), { auth: { storage: sessieOpslag, persistSession: true, autoRefreshToken: true } });
    if (NO_PW) { let n = null; try { n = localStorage.getItem(NKEY); } catch (x) { } return n ? startAs(n) : nameScreen(); }
    const { data } = await sb.auth.getSession();
    if (data.session) { session = data.session; readyRes(true); } else loginScreen();
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.reload(); });
  }

  // ---------- database: zelfde vorm als de Claude-database ----------
  const cache = {}, loading = {}, listeners = {}, timers = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const mkSnap = c => { const docs = Object.keys(cache[c] || {}).sort().map(id => ({ id, exists: true, data: () => clone(cache[c][id]), metadata: { fromCache: false, hasPendingWrites: false } }));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; };
  const emit = c => { clearTimeout(timers[c]); timers[c] = setTimeout(() => (listeners[c] || []).forEach(f => { try { f(mkSnap(c)); } catch (e) { console.error(e); } }), 80); };
  const dbErr = (e, code) => Object.assign(new Error(e?.message || String(e)), { code: code || 'unavailable' });
  async function loadColl(c, force) {
    if (cache[c] && !force) return;
    if (loading[c]) return loading[c];
    loading[c] = (async () => {
      const out = {};
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('docs').select('id,data').eq('collection', c).order('id').range(from, from + 999);
        if (error) throw dbErr(error);
        data.forEach(r => out[r.id] = r.data); if (data.length < 1000) break;
      }
      cache[c] = out;
    })().finally(() => { delete loading[c]; });
    return loading[c];
  }
  let channel = null;
  function realtime() {
    if (channel) return;
    channel = sb.channel('docs-wijzigingen').on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, p => {
      const row = p.eventType === 'DELETE' ? p.old : p.new; const c = row && row.collection;
      if (!c || !cache[c]) return;
      if (p.eventType === 'DELETE') delete cache[c][row.id]; else cache[c][row.id] = row.data;
      emit(c);
    }).subscribe();
    // vangnet: elke minuut verversen
    setInterval(() => { if (document.visibilityState !== 'visible') return; Object.keys(listeners).forEach(c => { if (listeners[c].length) loadColl(c, true).then(() => emit(c)).catch(() => { }); }); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Object.keys(listeners).forEach(c => loadColl(c, true).then(() => emit(c)).catch(() => { })); });
  }
  function docRef(c, id) {
    return {
      id, path: c + '/' + id,
      async get() { const { data, error } = await sb.from('docs').select('data').eq('collection', c).eq('id', id); if (error) throw dbErr(error);
        const d = data[0]; return { id, exists: !!d, data: () => d ? clone(d.data) : undefined, metadata: {} }; },
      async set(v) { const { error } = await sb.from('docs').upsert({ collection: c, id, data: v, bijgewerkt_op: new Date().toISOString() }); if (error) throw dbErr(error);
        if (cache[c]) { cache[c][id] = clone(v); emit(c); } },
      async update(v) { const cur = await this.get(); if (!cur.exists) throw dbErr('Document bestaat niet', 'invalid_argument');
        const merged = Object.assign(cur.data(), clone(v));
        const { error } = await sb.from('docs').update({ data: merged, bijgewerkt_op: new Date().toISOString() }).eq('collection', c).eq('id', id); if (error) throw dbErr(error);
        if (cache[c]) { cache[c][id] = merged; emit(c); } },
      async delete() { const { error } = await sb.from('docs').delete().eq('collection', c).eq('id', id); if (error) throw dbErr(error);
        if (cache[c]) { delete cache[c][id]; emit(c); } }
    };
  }
  const db = {
    doc(path) { const [c, id] = path.split('/'); return docRef(c, id); },
    collection(c) {
      return {
        path: c, doc: id => docRef(c, id || Math.random().toString(36).slice(2, 12)),
        async get() { await loadColl(c); return mkSnap(c); },
        onSnapshot(next, error) {
          (listeners[c] = listeners[c] || []).push(next); realtime();
          loadColl(c).then(() => next(mkSnap(c))).catch(e => error && error(dbErr(e)));
          return () => { listeners[c] = (listeners[c] || []).filter(f => f !== next); };
        }
      };
    }
  };

  // ---------- gebruiker ----------
  const nameFromEmail = e => (e || '').split('@')[0].split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  const user = {
    async id() { return session.user.id; },
    async me() { const n = session.user.user_metadata?.name || nameFromEmail(session.user.email); return { id: session.user.id, name: n, email: session.user.email }; },
    async profiles(ids) { await loadColl('profielen').catch(() => { });
      const out = {}; [].concat(ids).forEach(i => out[i] = { id: i, name: (String(i).startsWith('naam:') ? String(i).slice(5) : cache.profielen?.[i]?.naam) || '', isMe: i === session.user.id }); return out; },
    isOwner: () => false, canEdit: () => true, can: () => true
  };

  // ---------- documenten (Supabase Storage, bucket 'documenten') ----------
  const BUCKET = 'documenten';
  const filesApi = {
    async upload(path, blob, type) { const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type || 'application/octet-stream', upsert: true }); if (error) throw dbErr(error, /bucket/i.test(error.message) ? 'not_found' : 'unavailable'); },
    async url(path) { const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600); if (error) throw dbErr(error); return data.signedUrl; },
    async remove(path) { const { error } = await sb.storage.from(BUCKET).remove([path]); if (error) throw dbErr(error); }
  };

  // inlogtoken voor de e-mailfunctie op Vercel
  window.SM_TOKEN = async () => { try { if (!sb || NO_PW) return null; const { data } = await sb.auth.getSession(); return (data.session && data.session.access_token) || null; } catch (e) { return null; } };

  window.claude = {
    async use(name) {
      await ready;
      if (name === 'db') return db;
      if (name === 'user') return user;
      if (name === 'files') return filesApi;
      return null;
    }
  };

  ready.then(async () => {
    // eigen naam vastleggen zodat collega's zien wie wat deed
    const me = await user.me();
    const side = document.querySelector('.side');
    if (NO_PW) {
      if (side) side.append(el('button', { className: 'uit', type: 'button', textContent: 'Andere naam', onclick: () => { try { localStorage.removeItem(NKEY); } catch (x) { } location.reload(); } }));
      return;
    }
    db.collection('profielen').doc(me.id).set({ naam: me.name, email: me.email }).catch(() => { });
    if (side) side.append(el('button', { className: 'uit', type: 'button', textContent: 'Uitloggen', onclick: () => sb.auth.signOut() }));
  });
  init().catch(e => screen('Er ging iets mis', String(e.message || e)));
})();
