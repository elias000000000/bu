/* app.js — Full mobile-optimized app
   Features:
   - Tabs via bottom nav + header
   - Themes (6), quote with theme-colored quotes
   - Transactions CRUD, categories management
   - Payday logic, saved per period
   - Exports: Word (HTML-in-DOC) with grouped subtotals, CSV, Chart PNG
   - Charts via Chart.js
   - LocalStorage persistence
*/

(() => {
  'use strict';

  // ---------- Helpers ----------
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const KEY = 'bp_mobile_v1';
  const fmtCHF = v => `CHF ${Number(v||0).toFixed(2)}`;
  const normalize = s => String(s||'').replace(/ß/g,'ss');

  // ---------- Default state ----------
  let state = {
    name: '',
    budget: 0,
    transactions: [], // {id, desc, amount, category, date}
    categories: [],
    theme: 'standard',
    payday: 1,
    savedRecords: []
  };

  const QUOTES = [
    "Kleine Schritte, grosse Wirkung.",
    "Spare heute, geniesse morgen.",
    "Kenne deine Ausgaben, meistere dein Leben.",
    "Jeder Franken zählt.",
    "Bewusst leben, bewusst sparen."
  ];

  // ---------- Persistence ----------
  function loadState(){
    try{
      const raw = localStorage.getItem(KEY);
      if(raw) state = Object.assign(state, JSON.parse(raw));
    }catch(e){ console.warn('load err', e); }
    if(!state.categories || !state.categories.length){
      state.categories = ['Handyabo','Fonds','Eltern','Verpflegung','Frisör','Sparen','Geschenke','Sonstiges'];
    }
  }
  function saveState(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){ console.warn('save err', e); } }

  // ---------- Charts ----------
  let categoryChart = null, percentageChart = null;
  function createCharts(){
    const cat = $('#categoryChart'), pct = $('#percentageChart');
    if(!cat || !pct) return;
    if(categoryChart) categoryChart.destroy();
    if(percentageChart) percentageChart.destroy();

    categoryChart = new Chart(cat.getContext('2d'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label:'Betrag', data: [], backgroundColor: [] }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
    });

    percentageChart = new Chart(pct.getContext('2d'), {
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} }
    });
  }

  function updateCharts(){
    if(!categoryChart || !percentageChart) return;
    const sums = {};
    state.transactions.forEach(t => { sums[t.category] = (sums[t.category]||0) + Number(t.amount||0); });
    const labels = Object.keys(sums);
    const data = labels.map(l => sums[l]);
    const colors = labels.map((_,i)=>`hsl(${(i*55)%360} 78% 55%)`);
    categoryChart.data.labels = labels; categoryChart.data.datasets[0].data = data; categoryChart.data.datasets[0].backgroundColor = colors; categoryChart.update();
    percentageChart.data.labels = labels; percentageChart.data.datasets[0].data = data; percentageChart.data.datasets[0].backgroundColor = colors; percentageChart.update();
  }

  // ---------- UI rendering ----------
  function updateHeaderAndQuote(){
    const now = new Date();
    const month = now.toLocaleString('de-DE',{month:'long'});
    $('#greeting') && ($('#greeting').textContent = state.name ? `Hallo ${normalize(state.name)}` : 'Hallo');
    $('#monthRange') && ($('#monthRange').innerHTML = `<span id="budgetWord">Budget</span> <span id="monthLabel">für ${month} ${now.getFullYear()}</span>`);
    $('#currentDate') && ($('#currentDate').textContent = now.toLocaleString('de-DE',{weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}));
    const q = QUOTES[now.getDate() % QUOTES.length];
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-gradient') || '';
    // Put colored quote marks using CSS gradient via inline style
    $('#dailyQuote') && ($('#dailyQuote').innerHTML = `<span style="background:${accent};-webkit-background-clip:text;color:transparent;font-weight:800">“</span> ${q} <span style="background:${accent};-webkit-background-clip:text;color:transparent;font-weight:800">”</span>`);
  }

  function updateSummary(){
    const spent = state.transactions.reduce((s,t)=> s + Number(t.amount||0), 0);
    const remaining = (Number(state.budget||0) - spent);
    $('#spent') && ($('#spent').textContent = fmtCHF(spent));
    const rem = $('#remaining');
    if(rem){
      rem.textContent = fmtCHF(remaining);
      if(remaining < 200) rem.classList.add('red-alert'); else rem.classList.remove('red-alert');
    }
  }

  function renderHistory(){
    const container = $('#historyList'); if(!container) return;
    container.innerHTML = '';
    if(!state.transactions.length){ container.innerHTML = '<div class="muted">Keine Einträge.</div>'; return; }
    state.transactions.slice().reverse().forEach(tx=>{
      const item = document.createElement('div'); item.className = 'panel';
      item.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div><div style="font-weight:800">${escapeHtml(tx.desc)}</div><div style="font-size:12px;color:rgba(6,22,36,0.45)">${new Date(tx.date).toLocaleString()}</div></div>
        <div style="text-align:right"><div style="font-weight:900">${fmtCHF(tx.amount)}</div><div style="margin-top:8px"><button class="btn btn-ghost" data-delete="${tx.id}">Löschen</button></div></div>
      </div>`;
      container.appendChild(item);
    });
  }

  function renderAllList(filterText='', filterCategory=''){
    const all = $('#allList'); if(!all) return; all.innerHTML='';
    const filtered = state.transactions.filter(t=>{
      const byCat = !filterCategory || t.category===filterCategory;
      const q = (filterText||'').toLowerCase();
      const byText = !q || (t.desc||'').toLowerCase().includes(q) || (t.category||'').toLowerCase().includes(q);
      return byCat && byText;
    });
    if(!filtered.length){ all.innerHTML = '<div class="muted">Keine Einträge.</div>'; return; }
    filtered.slice().reverse().forEach(t=>{
      const el = document.createElement('div'); el.className='panel';
      el.innerHTML = `<div style="display:flex;justify-content:space-between"><div>${escapeHtml(t.category)} — ${escapeHtml(t.desc)}</div><div style="font-weight:900">${fmtCHF(t.amount)}</div></div>`;
      all.appendChild(el);
    });
  }

  function renderCategories(){
    const el = $('#categoriesList'); if(!el) return; el.innerHTML='';
    state.categories.forEach(cat=>{
      const row = document.createElement('div'); row.className='panel';
      row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:800">${escapeHtml(cat)}</div>
        <div style="display:flex;gap:8px"><button class="btn btn-primary" data-edit-cat="${escapeHtml(cat)}">Bearbeiten</button><button class="btn btn-danger" data-del-cat="${escapeHtml(cat)}">Löschen</button></div></div>`;
      el.appendChild(row);
    });
  }

  function refreshCategorySelect(){
    const sel = $('#txCategory'); if(!sel) return;
    sel.innerHTML = '';
    state.categories.slice().sort().forEach(c=>{
      const o = document.createElement('option'); o.value = o.textContent = c; sel.appendChild(o);
    });
    const filter = $('#filterCategory'); if(filter){
      filter.innerHTML = '<option value="">Alle Kategorien</option>';
      state.categories.slice().sort().forEach(c=>{ const o=document.createElement('option'); o.value=o.textContent=c; filter.appendChild(o); });
    }
  }

  function renderSavedList(){
    const out = $('#savedList'); if(!out) return; out.innerHTML='';
    // compute saved for last period (based on payday)
    const p = computeSavedRecords();
    if(!p.length){ out.innerHTML = '<div class="muted">Keine Daten.</div>'; return; }
    const last = p[p.length-1];
    out.innerHTML = `<div class="panel"><div style="display:flex;justify-content:space-between"><div style="font-weight:800">${escapeHtml(last.label)}</div><div style="font-weight:900">${fmtCHF(last.saved)}</div></div></div>`;
  }

  // ---------- CRUD ----------
  function addTransaction(desc, amount, category){
    const tx = { id: uid('t_'), desc: desc || '—', amount: Number(amount), category: category || 'Sonstiges', date: new Date().toISOString() };
    state.transactions.push(tx); saveState(); updateAfterChange();
  }

  function deleteTransaction(id){
    state.transactions = state.transactions.filter(t=>t.id !== id); saveState(); updateAfterChange();
  }

  // ---------- Exports ----------
  function exportCSV(){
    if(!state.transactions.length){ alert('Keine Daten'); return; }
    const rows = [['Kategorie','Beschreibung','Betrag','Datum']];
    state.transactions.forEach(t=> rows.push([t.category,t.desc,Number(t.amount).toFixed(2),t.date]));
    const csv = rows.map(r => r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`verlauf_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function exportWord(){
    if(!state.transactions.length){ alert('Keine Daten'); return; }
    const groups = {};
    state.transactions.forEach(t => { if(!groups[t.category]) groups[t.category]=[]; groups[t.category].push(t); });
    let html = `<html><head><meta charset="utf-8"><title>Verlauf</title></head><body style="font-family:Nunito, sans-serif"><h2>Verlauf</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Kategorie</th><th>Beschreibung</th><th style="text-align:right">Betrag</th></tr></thead><tbody>`;
    let grand = 0;
    Object.keys(groups).sort().forEach(cat => {
      let subtotal = 0;
      groups[cat].forEach(it => { subtotal += Number(it.amount); html += `<tr><td>${escapeHtml(cat)}</td><td>${escapeHtml(it.desc)}</td><td style="text-align:right">${Number(it.amount).toFixed(2)}</td></tr>`; });
      html += `<tr style="font-weight:700;background:#f5f5f5"><td colspan="2">Total ${escapeHtml(cat)}</td><td style="text-align:right">${subtotal.toFixed(2)}</td></tr>`;
      grand += subtotal;
    });
    html += `<tr style="font-weight:900;background:#e9f7ef"><td colspan="2">Gesamt</td><td style="text-align:right">${grand.toFixed(2)}</td></tr>`;
    html += `</tbody></table></body></html>`;
    const blob = new Blob([`\ufeff${html}`], { type: 'application/msword' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download = `verlauf_${new Date().toISOString().slice(0,10)}.doc`; a.click(); URL.revokeObjectURL(url);
  }

  function exportChartPNG(){
    try{
      if(!categoryChart){ alert('Kein Diagramm'); return; }
      const url = categoryChart.toBase64Image();
      const a = document.createElement('a'); a.href = url; a.download = `diagramm_${new Date().toISOString().slice(0,10)}.png`; a.click();
    }catch(e){ console.warn(e); alert('Export fehlgeschlagen'); }
  }

  // ---------- Payday / Saved records ----------
  function computeSavedRecords(){
    const payday = Number(state.payday) || 1;
    if(!state.transactions.length) return [];
    // Determine period starts from earliest tx to now
    const txs = state.transactions.slice().sort((a,b)=> new Date(a.date) - new Date(b.date));
    let start = periodStartForDate(new Date(txs[0].date), payday);
    const now = new Date();
    const periods = [];
    while(start < now){
      const end = new Date(start); end.setMonth(end.getMonth()+1); end.setDate(payday); end.setHours(0,0,0,0); end.setDate(end.getDate()-1);
      const label = `${start.toLocaleString('de-DE',{month:'short',year:'numeric'})}`;
      periods.push({ start: new Date(start), end: new Date(end), label });
      start.setMonth(start.getMonth()+1);
    }
    const records = periods.map(p => {
      const spent = state.transactions.filter(t => new Date(t.date) >= p.start && new Date(t.date) <= p.end).reduce((s,t)=> s + Number(t.amount||0), 0);
      const saved = (Number(state.budget||0) - spent);
      return { label: p.label, start: p.start.toISOString(), end: p.end.toISOString(), saved };
    });
    state.savedRecords = records; saveState(); return records;
  }

  function periodStartForDate(d, payday){
    const day = Number(payday) || 1;
    const cand = new Date(d.getFullYear(), d.getMonth(), day, 0,0,0,0);
    if(d >= cand) return new Date(cand);
    const prev = new Date(cand); prev.setMonth(prev.getMonth()-1); return prev;
  }

  // ---------- Helpers ----------
  function uid(prefix='') { return prefix + Math.random().toString(36).slice(2,9); }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;'}[m])); }

  // ---------- UI wiring ----------
  function wireUI(){
    // Bottom nav & top nav (both call same handler)
    const navButtons = [...$$('.bottom-btn'), ...$$('.nav-btn')];
    navButtons.forEach(btn => {
      btn.addEventListener('click', ()=> {
        const tab = btn.dataset.tab || btn.getAttribute('data-tab');
        if(!tab) return;
        // deactivate all
        $$('.bottom-btn').forEach(b=>b.classList.remove('active'));
        $$('.nav-btn').forEach(b=>b.classList.remove('active'));
        // activate matching
        navButtons.forEach(b=>{ if((b.dataset.tab||b.getAttribute('data-tab')) === tab) b.classList.add('active'); });
        // show tab
        $$('.tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-hidden','true'); t.style.display = 'none'; });
        const target = $(`#tab-${tab}`);
        if(target){ target.classList.add('active'); target.setAttribute('aria-hidden','false'); target.style.display = 'block'; }
        // special updates
        if(tab === 'saved') { computeSavedRecords(); renderSavedList(); renderSavedList(); }
        if(tab === 'categories') { renderCategories(); }
      });
    });

    // save budget
    $('#saveBudget') && $('#saveBudget').addEventListener('click', ()=>{
      const v = Number($('#totalBudget').value) || 0; state.budget = v; saveState(); updateSummary(); computeSavedRecords();
    });

    // add tx
    $('#addTx') && $('#addTx').addEventListener('click', ()=>{
      const desc = $('#txDesc').value.trim() || '—';
      const amount = parseFloat($('#txAmount').value);
      const category = $('#txCategory').value || 'Sonstiges';
      if(!amount || isNaN(amount)){ alert('Bitte gültigen Betrag eingeben'); return; }
      addTransaction(desc, amount, category);
      $('#txDesc').value=''; $('#txAmount').value=''; $('#txCategory').selectedIndex = 0;
    });

    // transaction delete (delegation)
    $('#historyList') && $('#historyList').addEventListener('click', (e)=>{
      const d = e.target.closest('[data-delete]');
      if(d){ const id = d.getAttribute('data-delete'); if(confirm('Eintrag wirklich löschen?')) deleteTransaction(id); }
    });

    // export buttons
    $('#exportCSV') && $('#exportCSV').addEventListener('click', exportCSV);
    $('#exportWord') && $('#exportWord').addEventListener('click', exportWord);
    $('#exportChart') && $('#exportChart').addEventListener('click', exportChartPNG);
    $('#settingsExportWord') && $('#settingsExportWord').addEventListener('click', exportWord);
    $('#settingsExportChart') && $('#settingsExportChart').addEventListener('click', exportChartPNG);

    // reset
    $('#resetHistory') && $('#resetHistory').addEventListener('click', ()=> {
      if(!confirm('Verlauf wirklich löschen?')) return;
      state.transactions = []; saveState(); updateAfterChange();
    });

    // name save -> show info modal
    $('#saveName') && $('#saveName').addEventListener('click', ()=> {
      const v = normalize($('#userName').value || '').trim();
      if(!v){ alert('Bitte Namen eingeben'); return; }
      state.name = v; saveState(); updateHeaderAndQuote();
      $('#infoModal').setAttribute('aria-hidden','false');
    });

    $('#infoClose') && $('#infoClose').addEventListener('click', ()=> { $('#infoModal').setAttribute('aria-hidden','true'); });

    // welcome modal flow
    $('#welcomeSave') && $('#welcomeSave').addEventListener('click', ()=> {
      const name = normalize($('#welcomeName').value || '').trim();
      const pd = Number($('#welcomePayday').value) || 1;
      if(!name){ alert('Bitte Namen eingeben'); return; }
      if(pd < 1 || pd > 28){ alert('Zahltag 1–28 wählen'); return; }
      state.name = name; state.payday = pd; saveState();
      $('#welcomeModal').setAttribute('aria-hidden','true');
      updateHeaderAndQuote(); computeSavedRecords(); renderSavedList();
    });

    // theme buttons
    $$('[data-theme-select]').forEach(b=>{
      b.addEventListener('click', ()=> { const t = b.dataset.themeSelect; applyTheme(t); });
    });

    // categories add/edit/delete
    $('#addCategory') && $('#addCategory').addEventListener('click', ()=>{
      const name = ($('#newCategoryName').value || '').trim();
      if(!name){ alert('Bitte Namen eingeben'); return; }
      if(state.categories.includes(name)){ alert('Kategorie existiert bereits'); return; }
      state.categories.push(name); saveState(); refreshCategorySelect(); renderCategories();
      $('#newCategoryName').value='';
    });
    $('#categoriesList') && $('#categoriesList').addEventListener('click', (e)=>{
      const ed = e.target.closest('[data-edit-cat]');
      const del = e.target.closest('[data-del-cat]');
      if(ed){ const old = ed.getAttribute('data-edit-cat'); const neu = prompt('Neuer Name', old); if(neu && neu.trim()){ const i = state.categories.indexOf(old); if(i>-1) state.categories[i]=neu.trim(); saveState(); refreshCategorySelect(); renderCategories(); } }
      if(del){ const name = del.getAttribute('data-del-cat'); if(confirm(`Kategorie "${name}" löschen?`)){ state.categories = state.categories.filter(c=>c!==name); saveState(); refreshCategorySelect(); renderCategories(); } }
    });

    // search & filter
    $('#searchHistory') && $('#searchHistory').addEventListener('input', ()=> renderAllList($('#searchHistory').value||'', $('#filterCategory').value||''));
    $('#filterCategory') && $('#filterCategory').addEventListener('change', ()=> renderAllList($('#searchHistory').value||'', $('#filterCategory').value||''));

    // save payday
    $('#savePayday') && $('#savePayday').addEventListener('click', ()=> {
      const pd = Number($('#paydayInput').value);
      if(!pd || pd < 1 || pd > 28){ alert('Zahltag 1–28'); return; }
      state.payday = pd; saveState(); computeSavedRecords(); renderSavedList(); alert('Zahltag gespeichert');
    });

    // history list deletion (delegation)
    $('#allList') && $('#allList').addEventListener('click', (e)=> {
      const d = e.target.closest('[data-delete]');
      if(d){ const id = d.getAttribute('data-delete'); if(confirm('Eintrag löschen?')) deleteTransaction(id); }
    });

    // keyboard shortcuts: enter to add
    ['txAmount','txDesc','totalBudget','userName'].forEach(id=>{
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener('keydown', (ev)=> { if(ev.key === 'Enter') { ev.preventDefault(); if(id === 'totalBudget') $('#saveBudget').click(); else if(id === 'userName') $('#saveName').click(); else $('#addTx').click(); } });
    });

    // resize charts on orientation
    window.addEventListener('orientationchange', ()=> { categoryChart?.resize(); percentageChart?.resize(); }, { passive:true });
  }

  // ---------- Theme apply ----------
  function applyTheme(theme){
    state.theme = theme || 'standard'; saveState();
    document.documentElement.setAttribute('data-theme', state.theme);
    updateHeaderAndQuote();
  }

  // ---------- Common update after changes ----------
  function updateAfterChange(){
    refreshCategorySelect();
    updateSummary();
    renderHistory();
    renderAllList();
    updateCharts();
    computeSavedRecords();
    renderSavedList();
  }

  // ---------- Compute saved records (helper) ----------
  function computeSavedRecords(){
    if(!state.transactions.length) return [];
    const payday = Number(state.payday) || 1;
    const txs = state.transactions.slice().sort((a,b)=> new Date(a.date) - new Date(b.date));
    let start = periodStartForDate(new Date(txs[0].date), payday);
    const now = new Date();
    const periods = [];
    while(start < now){
      const nextStart = new Date(start); nextStart.setMonth(nextStart.getMonth()+1);
      const end = new Date(nextStart); end.setDate(end.getDate()-1);
      const label = `${start.toLocaleString('de-DE',{month:'short',year:'numeric'})}`;
      periods.push({ start: new Date(start), end: end, label });
      start = nextStart;
    }
    const records = periods.map(p=>{
      const spent = state.transactions.filter(t => new Date(t.date) >= p.start && new Date(t.date) <= p.end).reduce((s,t)=> s + Number(t.amount||0), 0);
      return { label: p.label, start:p.start, end:p.end, saved: Number(state.budget||0) - spent };
    });
    state.savedRecords = records; saveState(); return records;
  }

  function periodStartForDate(d, payday){
    const day = Number(payday) || 1;
    const cand = new Date(d.getFullYear(), d.getMonth(), day,0,0,0,0);
    if(d >= cand) return new Date(cand);
    const prev = new Date(cand); prev.setMonth(prev.getMonth()-1); return prev;
  }

  // ---------- Utilities ----------
  function uid(pre='') { return pre + Math.random().toString(36).slice(2,9); }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }

  // ---------- Init sequence ----------
  function initApp(){
    loadState();
    // ensure fallback values
    state = Object.assign({ name:'', budget:0, transactions:[], categories:['Handyabo','Fonds','Eltern','Verpflegung','Frisör','Sparen','Geschenke','Sonstiges'], theme:'standard', payday:1, savedRecords:[] }, state);

    // populate UI initial
    $('#totalBudget') && ($('#totalBudget').value = state.budget || '');
    $('#userName') && ($('#userName').value = state.name || '');
    $('#paydayInput') && ($('#paydayInput').value = state.payday || 1);

    createCharts();
    wireUI();
    applyTheme(state.theme);
    updateHeaderAndQuote();
    refreshCategorySelect();
    renderHistory();
    renderAllList();
    renderCategories();
    updateSummary();
    updateCharts();
    computeSavedRecords();
    renderSavedList();

    // If no name, show welcome
    if(!state.name){ $('#welcomeModal') && $('#welcomeModal').setAttribute('aria-hidden','false'); }
    // periodic header update (time)
    setInterval(updateHeaderAndQuote, 60_000);
  }

  // ---------- render saved list (UI) ----------
  function renderSavedList(){
    const out = $('#savedList'); if(!out) return; out.innerHTML='';
    if(!state.savedRecords || !state.savedRecords.length){ out.innerHTML = '<div class="muted">Keine Daten.</div>'; return; }
    state.savedRecords.slice().reverse().forEach(r=>{
      const card = document.createElement('div'); card.className='panel';
      card.innerHTML = `<div style="display:flex;justify-content:space-between"><div style="font-weight:800">${escapeHtml(r.label)}</div><div style="font-weight:900">${fmtCHF(r.saved)}</div></div>`;
      out.appendChild(card);
    });
  }

  // ---------- Startup ----------
  initApp();

  // expose for debugging
  window.__bp_mobile = { state, addTransaction, deleteTransaction, exportWord, exportCSV, exportChartPNG: exportChartPNG };
})();
