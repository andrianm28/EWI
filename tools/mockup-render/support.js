// Renderer minimal untuk file mockup *.dc.html (x-dc): {{ }}, sc-if, sc-for, onX.
(function(){
  class DCLogic { constructor(props){ this.props = props||{}; this.state = {}; }
    setState(u){ const p = typeof u==='function'? u(this.state): u; if(!p) return; this.state = Object.assign({}, this.state, p); window.__dcRender && window.__dcRender(); } }
  window.DCLogic = DCLogic;
  const cache = {};
  function ev(expr, scope){ expr = expr.trim(); let f = cache[expr];
    if(!f){ f = cache[expr] = new Function('s','with(s){try{return ('+expr+')}catch(e){return undefined}}'); }
    return f(scope); }
  const ONE = /^\s*\{\{([^}]*)\}\}\s*$/;
  function interp(str, scope){ return str.replace(/\{\{([^}]*)\}\}/g, (_,e)=>{ const v = ev(e, scope); return v==null||v===false?'':String(v); }); }
  function build(node, scope, out){
    if(node.nodeType===3){ out.appendChild(document.createTextNode(interp(node.nodeValue, scope))); return; }
    if(node.nodeType!==1) return;
    const tag = node.tagName.toLowerCase();
    if(tag==='sc-if'){ const m = ONE.exec(node.getAttribute('value')||''); if(m && ev(m[1],scope)) node.childNodes.forEach(c=>build(c,scope,out)); return; }
    if(tag==='sc-for'){ const m = ONE.exec(node.getAttribute('list')||''); const list = (m && ev(m[1],scope))||[]; const as = node.getAttribute('as')||'item';
      list.forEach((it,i)=>{ const s2 = Object.create(scope); s2[as]=it; s2.$index=i; node.childNodes.forEach(c=>build(c,s2,out)); }); return; }
    const el = document.createElementNS(node.namespaceURI, node.localName);
    for(const a of node.attributes){ const n = a.name; if(n.startsWith('hint-')) continue;
      const m = ONE.exec(a.value);
      if(/^on/i.test(n) && m){ const fn = ev(m[1],scope); if(typeof fn==='function') el.addEventListener(n.slice(2).toLowerCase(), fn); continue; }
      if(m && (n==='checked'||n==='disabled')){ if(ev(m[1],scope)) el.setAttribute(n,''); if(n==='checked') el.checked=!!ev(m[1],scope); continue; }
      if(n==='value' && m){ const v = ev(m[1],scope); el.setAttribute('value', v==null?'':v); el.value = v==null?'':v; continue; }
      el.setAttribute(n, interp(a.value, scope)); }
    node.childNodes.forEach(c=>build(c,scope,el));
    if(tag==='textarea'){ /* value handled above */ }
    out.appendChild(el);
  }
  window.addEventListener('DOMContentLoaded', ()=>{
    const root = document.querySelector('x-dc'); const tpl = document.createElement('template');
    const helmet = root.querySelector('helmet'); if(helmet){ document.head.insertAdjacentHTML('beforeend', helmet.innerHTML); helmet.remove(); }
    tpl.innerHTML = root.innerHTML; root.innerHTML = '';
    const src = document.querySelector('script[type="text/x-dc"]').textContent;
    const Comp = new Function('DCLogic', src + '\nreturn Component;')(DCLogic);
    const c = window.__dc = new Comp({});
    window.__dcRender = ()=>{ const ae = document.activeElement; const key = ae && ae.getAttribute && (ae.getAttribute('aria-label')||ae.getAttribute('placeholder')); const pos = ae && ae.selectionStart;
      const frag = document.createDocumentFragment(); const vals = c.renderVals(); tpl.content.childNodes.forEach(n=>build(n, vals, frag)); root.replaceChildren(frag);
      if(key){ const n = root.querySelector('[aria-label="'+key+'"],[placeholder="'+key+'"]'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos);}catch(e){} } } };
    window.__dcRender(); window.__dcReady = true;
  });
})();
