"use strict";(()=>{var y={yellow:"#fef08a",blue:"#93c5fd",green:"#86efac",red:"#fca5a5"};var I="data-zr-highlight-id",Oe="zr-highlight";function ae(e="yellow"){let t=window.getSelection();if(!t||t.isCollapsed||!t.rangeCount)return null;let n=t.getRangeAt(0),o=t.toString().trim();if(!o)return null;let r=n.startContainer.parentElement,i=ht(r),a=n.startOffset,s=n.endOffset,l=ut(),c=Be(l,e);try{n.surroundContents(c)}catch{let d=n.extractContents();c.appendChild(d),n.insertNode(c)}return t.removeAllRanges(),Ae(c),{text:o,startOffset:a,endOffset:s,paragraphIndex:i,updateId:d=>{c.setAttribute(I,d)}}}function se(e,t,n,o){let r=document.body;if(o?.paragraphIndex!==void 0){let s=document.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, pre");o.paragraphIndex<s.length&&(r=s[o.paragraphIndex])}let i=document.createTreeWalker(r,NodeFilter.SHOW_TEXT),a;for(;a=i.nextNode();){let s=a,c=(s.textContent??"").indexOf(t);if(c===-1||s.parentElement?.classList.contains(Oe))continue;let d=document.createRange();d.setStart(s,c),d.setEnd(s,c+t.length);let h=Be(e,n);try{d.surroundContents(h)}catch{let p=d.extractContents();h.appendChild(p),d.insertNode(h)}return o?.note&&h.setAttribute("data-note",o.note),h.setAttribute("data-zr-color",n),Ae(h),!0}return r!==document.body?se(e,t,n):!1}function Pe(e){document.querySelectorAll(`[${I}="${e}"]`).forEach(n=>{let o=n.parentNode;if(o){for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n),o.normalize()}})}function le(e,t){document.querySelectorAll(`[${I}="${e}"]`).forEach(o=>{t?o.setAttribute("data-note",t):o.removeAttribute("data-note")})}function Re(e,t){document.querySelectorAll(`[${I}="${e}"]`).forEach(o=>{o.style.backgroundColor=y[t],o.setAttribute("data-zr-color",t)})}function Be(e,t){let n=document.createElement("mark");return n.className=Oe,n.setAttribute(I,e),n.setAttribute("data-zr-color",t),n.style.backgroundColor=y[t],n.style.borderRadius="2px",n.style.padding="0 1px",n.style.cursor="pointer",n}function Ae(e){e.addEventListener("click",()=>{let t=e.getAttribute(I),n=e.textContent,o=e.getAttribute("data-note"),r=e.getAttribute("data-zr-color");document.dispatchEvent(new CustomEvent("zr-highlight-click",{detail:{id:t,text:n,note:o,color:r,element:e}}))})}function ht(e){if(!e)return 0;let t=e.closest("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, pre");if(!t)return 0;let n=document.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, pre");for(let o=0;o<n.length;o++)if(n[o]===t)return o;return 0}function ut(){return`zr_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}var ce="zr-highlight-toolbar",D=null;function Me(e,t,n){j(),D=n;let o=document.createElement("div");o.id=ce,["yellow","blue","green","red"].forEach(l=>{let c=document.createElement("button");c.className="zr-toolbar-btn zr-color-btn",c.style.backgroundColor=y[l],c.title=`${l} \u9AD8\u4EAE`,c.addEventListener("click",d=>{d.stopPropagation(),D?.({type:"highlight",color:l}),j()}),o.appendChild(c)});let i=document.createElement("span");i.className="zr-toolbar-divider",o.appendChild(i);let a=document.createElement("button");a.className="zr-toolbar-btn zr-action-btn",a.textContent="\u{1F4DD}",a.title="\u6DFB\u52A0\u7B14\u8BB0",a.addEventListener("click",l=>{l.stopPropagation(),D?.({type:"note"}),j()}),o.appendChild(a);let s=document.createElement("button");s.className="zr-toolbar-btn zr-action-btn",s.textContent="\u{1F4BE}",s.title="\u4FDD\u5B58\u5230 Z-Reader",s.addEventListener("click",l=>{l.stopPropagation(),D?.({type:"save"}),j()}),o.appendChild(s),o.style.left=`${e}px`,o.style.top=`${t-50}px`,document.body.appendChild(o),requestAnimationFrame(()=>{let l=o.getBoundingClientRect();l.right>window.innerWidth&&(o.style.left=`${window.innerWidth-l.width-8}px`),l.left<0&&(o.style.left="8px"),l.top<0&&(o.style.top=`${t+20}px`)})}function j(){let e=document.getElementById(ce);e&&e.remove(),D=null}document.addEventListener("mousedown",e=>{let t=document.getElementById(ce);t&&!t.contains(e.target)&&j()});var mt="http://127.0.0.1:21897/api";async function C(e,t){let n=`${mt}${e}`,o=await fetch(n,{headers:{"Content-Type":"application/json"},...t});if(!o.ok){let r=await o.text().catch(()=>"\u672A\u77E5\u9519\u8BEF");throw new Error(`API \u8BF7\u6C42\u5931\u8D25 [${o.status}]: ${r}`)}return o.json()}async function De(e){return C("/articles",{method:"POST",body:JSON.stringify(e)})}async function je(e){return C(`/highlights?url=${encodeURIComponent(e)}`)}async function de(e){return C("/highlights",{method:"POST",body:JSON.stringify(e)})}async function qe(e){await C(`/highlights/${e}`,{method:"DELETE"})}async function pe(e,t){return C(`/highlights/${e}`,{method:"PUT",body:JSON.stringify(t)})}async function _e(){return C("/tags")}async function Fe(e){return C("/tags",{method:"POST",body:JSON.stringify({name:e})})}async function ge(e){return C(`/highlights/${e}/tags`)}async function he(e,t){await C(`/highlights/${e}/tags`,{method:"POST",body:JSON.stringify({tagId:t})})}async function Ge(e,t){await C(`/highlights/${e}/tags/${t}`,{method:"DELETE"})}var We="zr-note-editor-container",V={close:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',check:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',plus:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',tag:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>'},ft=`
  :host {
    all: initial;
    --zr-bg-base: #141414;
    --zr-bg-card: #1a1a1a;
    --zr-bg-hover: rgba(255, 255, 255, 0.08);
    --zr-border: rgba(255, 255, 255, 0.1);
    --zr-text-primary: #ffffff;
    --zr-text-secondary: #9ca3af;
    --zr-text-muted: #6b7280;
    --zr-blue: #3b82f6;
    --zr-blue-hover: #2563eb;
    --zr-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
    --zr-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
  }

  .zr-editor-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    z-index: 999998;
    animation: zr-fade-in 0.2s ease;
  }

  .zr-note-editor {
    position: fixed;
    top: 20px;
    right: 20px;
    bottom: 20px;
    width: 380px;
    max-width: calc(100vw - 40px);
    background: var(--zr-bg-base);
    border: 1px solid var(--zr-border);
    border-radius: var(--zr-radius);
    box-shadow: var(--zr-shadow);
    z-index: 999999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: zr-slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    color: var(--zr-text-primary);
  }

  @keyframes zr-slide-in-right {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  @keyframes zr-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .zr-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--zr-border);
  }

  .zr-editor-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: white;
  }

  .zr-editor-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--zr-text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .zr-editor-close:hover {
    background: var(--zr-bg-hover);
    color: var(--zr-text-primary);
  }

  .zr-editor-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .zr-editor-quote-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .zr-editor-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--zr-text-muted);
  }

  .zr-editor-quote {
    padding: 12px 16px;
    background: var(--zr-bg-card);
    border-left: 3px solid var(--zr-blue);
    border-radius: 4px;
    color: var(--zr-text-secondary);
    font-size: 13px;
    line-height: 1.6;
    font-style: italic;
    max-height: 120px;
    overflow-y: auto;
  }

  .zr-editor-colors {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .zr-color-option {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #000;
  }

  .zr-color-option:hover { transform: scale(1.1); }
  .zr-color-option.active {
    border-color: white;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
  }

  .zr-editor-tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .zr-tag-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--zr-bg-card);
    border: 1px solid var(--zr-border);
    border-radius: 100px;
    color: var(--zr-text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .zr-tag-item:hover {
    background: var(--zr-bg-hover);
    border-color: var(--zr-text-muted);
    color: var(--zr-text-primary);
  }

  .zr-tag-item.active {
    background: rgba(59, 130, 246, 0.15);
    border-color: var(--zr-blue);
    color: var(--zr-blue);
  }

  .zr-tag-add {
    color: var(--zr-blue);
    border-style: dashed;
  }

  .zr-editor-textarea-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }

  .zr-editor-textarea {
    width: 100%;
    flex: 1;
    background: transparent;
    border: none;
    color: var(--zr-text-primary);
    font-size: 14px;
    line-height: 1.6;
    resize: none;
    outline: none;
    padding: 0;
    min-height: 150px;
    box-sizing: border-box;
  }

  .zr-editor-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--zr-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--zr-bg-card);
  }

  .zr-editor-hint {
    font-size: 11px;
    color: var(--zr-text-muted);
  }

  .zr-editor-actions {
    display: flex;
    gap: 8px;
  }

  .zr-btn {
    height: 32px;
    padding: 0 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    box-sizing: border-box;
  }

  .zr-btn-secondary {
    background: transparent;
    color: var(--zr-text-secondary);
    border: 1px solid var(--zr-border);
  }

  .zr-btn-primary {
    background: var(--zr-blue);
    color: white;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  }

  .zr-editor-body::-webkit-scrollbar { width: 6px; }
  .zr-editor-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }
`;async function ue(e){L();let t=e.initialColor||"yellow",n=new Set(e.initialTags?.map(m=>m.id)||[]),o=[];try{o=await _e()}catch(m){console.error("Failed to fetch tags:",m)}let r=document.createElement("div");r.id=We;let i=r.attachShadow({mode:"open"}),a=document.createElement("style");a.textContent=ft,i.appendChild(a);let s=document.createElement("div");s.className="zr-editor-backdrop",i.appendChild(s);let l=document.createElement("div");l.className="zr-note-editor";let c=document.createElement("div");c.className="zr-editor-header",c.innerHTML=`<h3>${e.initialNote?"\u7F16\u8F91\u7B14\u8BB0":"\u6DFB\u52A0\u7B14\u8BB0"}</h3>`;let d=document.createElement("button");d.className="zr-editor-close",d.innerHTML=V.close,d.onclick=()=>{e.onCancel(),L()},c.appendChild(d),l.appendChild(c);let h=document.createElement("div");if(h.className="zr-editor-body",e.selectedText){let m=document.createElement("div");m.className="zr-editor-quote-container",m.innerHTML=`
      <div class="zr-editor-label">\u5F15\u7528\u539F\u6587</div>
      <div class="zr-editor-quote">${e.selectedText}</div>
    `,h.appendChild(m)}let p=document.createElement("div");p.className="zr-editor-quote-container",p.innerHTML='<div class="zr-editor-label">\u9AD8\u4EAE\u989C\u8272</div>';let f=document.createElement("div");f.className="zr-editor-colors";let w=["yellow","blue","green","red"],b=()=>{f.innerHTML="",w.forEach(m=>{let z=document.createElement("button");z.className=`zr-color-option ${m===t?"active":""}`,z.style.backgroundColor=y[m],z.innerHTML=m===t?V.check:"",z.onclick=()=>{t=m,b();let T=h.querySelector(".zr-editor-quote");T&&(T.style.borderLeftColor=y[t])},f.appendChild(z)})};b(),p.appendChild(f),h.appendChild(p);let v=document.createElement("div");v.className="zr-editor-quote-container",v.innerHTML='<div class="zr-editor-label">\u6807\u7B7E</div>';let x=document.createElement("div");x.className="zr-editor-tags-list";let re=()=>{x.innerHTML="",o.forEach(z=>{let T=n.has(z.id),J=document.createElement("button");J.className=`zr-tag-item ${T?"active":""}`,J.innerHTML=`${V.tag} <span>${z.name}</span>`,J.onclick=()=>{T?n.delete(z.id):n.add(z.id),re()},x.appendChild(J)});let m=document.createElement("button");m.className="zr-tag-item zr-tag-add",m.innerHTML=`${V.plus} <span>\u65B0\u5EFA\u6807\u7B7E</span>`,m.onclick=async()=>{let z=prompt("\u8F93\u5165\u65B0\u6807\u7B7E\u540D\u79F0:");if(z?.trim()){let T=await Fe(z.trim());o.push(T),n.add(T.id),re()}},x.appendChild(m)};re(),v.appendChild(x),h.appendChild(v);let G=document.createElement("div");G.className="zr-editor-textarea-container",G.innerHTML='<div class="zr-editor-label">\u7B14\u8BB0\u5185\u5BB9</div>';let k=document.createElement("textarea");k.className="zr-editor-textarea",k.placeholder="\u5728\u6B64\u8F93\u5165\u60A8\u7684\u60F3\u6CD5...",k.value=e.initialNote||"",G.appendChild(k),h.appendChild(G),l.appendChild(h);let W=document.createElement("div");W.className="zr-editor-footer",W.innerHTML='<span class="zr-editor-hint">Ctrl+Enter \u4FDD\u5B58</span>';let ie=document.createElement("div");ie.className="zr-editor-actions";let U=document.createElement("button");U.className="zr-btn zr-btn-secondary",U.textContent="\u53D6\u6D88",U.onclick=()=>{e.onCancel(),L()};let Z=document.createElement("button");Z.className="zr-btn zr-btn-primary",Z.textContent="\u4FDD\u5B58\u7B14\u8BB0",Z.onclick=()=>{e.onSave(k.value.trim(),t,Array.from(n)),L()},ie.append(U,Z),W.appendChild(ie),l.appendChild(W),i.appendChild(l),document.body.appendChild(r),k.focus(),k.onkeydown=m=>{(m.ctrlKey||m.metaKey)&&m.key==="Enter"&&(m.preventDefault(),e.onSave(k.value.trim(),t,Array.from(n)),L()),m.key==="Escape"&&(m.preventDefault(),e.onCancel(),L())},s.onclick=()=>{e.onCancel(),L()}}function L(){let e=document.getElementById(We);if(!e)return;let t=e.shadowRoot?.querySelector(".zr-note-editor"),n=e.shadowRoot?.querySelector(".zr-editor-backdrop");t&&(t.style.transform="translateX(100%)",t.style.opacity="0",t.style.transition="all 0.2s ease-in"),n&&(n.style.opacity="0",n.style.transition="opacity 0.2s"),setTimeout(()=>e.remove(),200)}var me="zr-highlight-menu";function Ue(e){K();let t=document.createElement("div");t.id=me,t.className="zr-highlight-menu",[{icon:"\u{1F4DD}",text:e.note?"\u7F16\u8F91\u7B14\u8BB0":"\u6DFB\u52A0\u7B14\u8BB0",onClick:e.onEditNote},{icon:"\u{1F3A8}",text:"\u66F4\u6539\u989C\u8272",submenu:[{color:"yellow",label:"\u9EC4\u8272"},{color:"blue",label:"\u84DD\u8272"},{color:"green",label:"\u7EFF\u8272"},{color:"red",label:"\u7EA2\u8272"}]},{icon:"\u{1F4CB}",text:"\u590D\u5236\u6587\u672C",onClick:e.onCopy},{type:"divider"},{icon:"\u{1F5D1}\uFE0F",text:"\u5220\u9664\u9AD8\u4EAE",onClick:e.onDelete,danger:!0}].forEach(o=>{if(o.type==="divider"){let r=document.createElement("div");r.className="zr-menu-divider",t.appendChild(r)}else if(o.submenu){let r=xt(o,e.onChangeColor);t.appendChild(r)}else{let r=bt(o);t.appendChild(r)}}),t.style.left=`${e.x}px`,t.style.top=`${e.y}px`,document.body.appendChild(t),requestAnimationFrame(()=>{let o=t.getBoundingClientRect();o.right>window.innerWidth&&(t.style.left=`${e.x-o.width}px`),o.bottom>window.innerHeight&&(t.style.top=`${e.y-o.height}px`),o.left<0&&(t.style.left="8px"),o.top<0&&(t.style.top="8px")}),setTimeout(()=>{document.addEventListener("click",Ze)},0)}function bt(e){let t=document.createElement("div");t.className=`zr-menu-item ${e.danger?"zr-menu-item-danger":""}`;let n=document.createElement("span");n.className="zr-menu-icon",n.textContent=e.icon,t.appendChild(n);let o=document.createElement("span");return o.className="zr-menu-text",o.textContent=e.text,t.appendChild(o),t.addEventListener("click",r=>{r.stopPropagation(),e.onClick(),K()}),t}function xt(e,t){let n=document.createElement("div");n.className="zr-menu-submenu-container";let o=document.createElement("div");o.className="zr-menu-item";let r=document.createElement("span");r.className="zr-menu-icon",r.textContent=e.icon,o.appendChild(r);let i=document.createElement("span");i.className="zr-menu-text",i.textContent=e.text,o.appendChild(i);let a=document.createElement("span");a.className="zr-menu-arrow",a.textContent="\u203A",o.appendChild(a),n.appendChild(o);let s=document.createElement("div");s.className="zr-menu-submenu",e.submenu.forEach(c=>{let d=document.createElement("div");d.className="zr-menu-item";let h=document.createElement("span");h.className="zr-menu-color-dot",h.style.backgroundColor=yt(c.color),d.appendChild(h);let p=document.createElement("span");p.className="zr-menu-text",p.textContent=c.label,d.appendChild(p),d.addEventListener("click",f=>{f.stopPropagation(),t(c.color),K()}),s.appendChild(d)}),n.appendChild(s);let l;return n.addEventListener("mouseenter",()=>{clearTimeout(l),s.classList.add("zr-submenu-show")}),n.addEventListener("mouseleave",()=>{l=window.setTimeout(()=>{s.classList.remove("zr-submenu-show")},300)}),n}function yt(e){return{yellow:"#fbbf24",blue:"#60a5fa",green:"#34d399",red:"#f87171"}[e]||"#fbbf24"}function K(){let e=document.getElementById(me);e&&e.remove(),document.removeEventListener("click",Ze)}function Ze(e){let t=document.getElementById(me);t&&!t.contains(e.target)&&K()}var be="zr-toast-container";function Y(e){let{message:t,type:n="info",duration:o=3e3,action:r}=e,i=document.getElementById(be);i||(i=document.createElement("div"),i.id=be,i.className="zr-toast-container",document.body.appendChild(i));let a=document.createElement("div");a.className=`zr-toast zr-toast-${n}`;let s=document.createElement("span");s.className="zr-toast-icon",s.textContent=vt(n),a.appendChild(s);let l=document.createElement("span");if(l.className="zr-toast-message",l.textContent=t,a.appendChild(l),r){let d=document.createElement("button");d.className="zr-toast-action",d.textContent=r.text,d.addEventListener("click",()=>{r.onClick(),fe(a)}),a.appendChild(d)}let c=document.createElement("button");c.className="zr-toast-close",c.innerHTML="\u2715",c.addEventListener("click",()=>{fe(a)}),a.appendChild(c),i.appendChild(a),requestAnimationFrame(()=>{a.classList.add("zr-toast-show")}),o>0&&setTimeout(()=>{fe(a)},o)}function fe(e){e.classList.remove("zr-toast-show"),e.classList.add("zr-toast-hide"),setTimeout(()=>{e.remove();let t=document.getElementById(be);t&&t.children.length===0&&t.remove()},300)}function vt(e){return{success:"\u2713",error:"\u2715",info:"\u2139",warning:"\u26A0"}[e]}var g={success:(e,t)=>{Y({message:e,type:"success",duration:t})},error:(e,t)=>{Y({message:e,type:"error",duration:t})},info:(e,t)=>{Y({message:e,type:"info",duration:t})},warning:(e,t)=>{Y({message:e,type:"warning",duration:t})}};var Je="zr-shortcuts-help",ve=[],ye=!1;function E(e){ve.push(e)}function Ve(){document.addEventListener("keydown",wt),console.log("[Z-Reader] \u5FEB\u6377\u952E\u7CFB\u7EDF\u5DF2\u521D\u59CB\u5316")}function wt(e){let t=e.target;if((t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.contentEditable==="true")&&e.key!=="Escape"&&!(e.altKey&&e.key==="?"))return;let n=ve.find(o=>o.key.toLowerCase()===e.key.toLowerCase()&&!!o.ctrl===e.ctrlKey&&!!o.alt===e.altKey&&!!o.shift===e.shiftKey&&!!o.meta===e.metaKey);n&&(e.preventDefault(),e.stopPropagation(),n.action())}function Ke(){if(ye){xe();return}let e=document.createElement("div");e.className="zr-shortcuts-backdrop",e.addEventListener("click",xe);let t=document.createElement("div");t.id=Je,t.className="zr-shortcuts-help";let n=document.createElement("div");n.className="zr-shortcuts-header";let o=document.createElement("h2");o.textContent="\u2328\uFE0F \u952E\u76D8\u5FEB\u6377\u952E",n.appendChild(o);let r=document.createElement("button");r.className="zr-shortcuts-close",r.innerHTML="\u2715",r.addEventListener("click",xe),n.appendChild(r),t.appendChild(n);let i=zt(ve),a=document.createElement("div");a.className="zr-shortcuts-content",Object.entries(i).forEach(([s,l])=>{let c=document.createElement("div");c.className="zr-shortcuts-section";let d=document.createElement("h3");d.className="zr-shortcuts-category",d.textContent=s,c.appendChild(d);let h=document.createElement("div");h.className="zr-shortcuts-list",l.forEach(p=>{let f=document.createElement("div");f.className="zr-shortcut-item";let w=document.createElement("span");w.className="zr-shortcut-desc",w.textContent=p.description,f.appendChild(w);let b=document.createElement("div");b.className="zr-shortcut-keys",b.innerHTML=Ct(p),f.appendChild(b),h.appendChild(f)}),c.appendChild(h),a.appendChild(c)}),t.appendChild(a),document.body.appendChild(e),document.body.appendChild(t),ye=!0}function xe(){let e=document.getElementById(Je),t=document.querySelector(".zr-shortcuts-backdrop");e&&e.remove(),t&&t.remove(),ye=!1}function zt(e){let t={};return e.forEach(n=>{t[n.category]||(t[n.category]=[]),t[n.category].push(n)}),t}function Ct(e){let t=[];return e.ctrl&&t.push("<kbd>Ctrl</kbd>"),e.alt&&t.push("<kbd>Alt</kbd>"),e.shift&&t.push("<kbd>Shift</kbd>"),e.meta&&t.push("<kbd>\u2318</kbd>"),t.push(`<kbd>${e.key.toUpperCase()}</kbd>`),t.join(" + ")}async function ee(e){let t=Xe();if(t.length===0){g.warning("\u5F53\u524D\u9875\u9762\u6CA1\u6709\u9AD8\u4EAE\u53EF\u5BFC\u51FA");return}let n,o,r;switch(e.format){case"markdown":n=Et(t,e),o=`highlights-${Q()}.md`,r="text/markdown";break;case"text":n=Qe(t,e),o=`highlights-${Q()}.txt`,r="text/plain";break;case"html":n=et(t,e),o=`highlights-${Q()}.html`,r="text/html";break;case"json":n=kt(t,e),o=`highlights-${Q()}.json`,r="application/json";break;default:g.error("\u4E0D\u652F\u6301\u7684\u5BFC\u51FA\u683C\u5F0F");return}Tt(n,o,r),g.success(`\u5DF2\u5BFC\u51FA ${t.length} \u6761\u9AD8\u4EAE\u4E3A ${e.format.toUpperCase()}`)}async function Ye(){let e=Xe();if(e.length===0){g.warning("\u5F53\u524D\u9875\u9762\u6CA1\u6709\u9AD8\u4EAE\u53EF\u590D\u5236");return}let t=et(e,{format:"html",includeNotes:!0,groupByColor:!0}),n=Qe(e,{format:"text",includeNotes:!0,groupByColor:!0});try{let o=new ClipboardItem({"text/html":new Blob([t],{type:"text/html"}),"text/plain":new Blob([n],{type:"text/plain"})});await navigator.clipboard.write([o]),g.success(`\u5DF2\u590D\u5236 ${e.length} \u6761\u9AD8\u4EAE\u5230\u526A\u8D34\u677F`)}catch{try{await navigator.clipboard.writeText(n),g.success(`\u5DF2\u590D\u5236 ${e.length} \u6761\u9AD8\u4EAE\u5230\u526A\u8D34\u677F\uFF08\u7EAF\u6587\u672C\uFF09`)}catch{g.error("\u590D\u5236\u5931\u8D25")}}}function Xe(){return Array.from(document.querySelectorAll("[data-zr-highlight-id]")).map(t=>({id:t.dataset.zrHighlightId||"",text:t.textContent||"",note:t.dataset.note,color:St(t.style.backgroundColor),element:t}))}function Et(e,t){let n=`# ${document.title}

`;if(n+=`**\u6765\u6E90**: ${window.location.href}
`,n+=`**\u5BFC\u51FA\u65F6\u95F4**: ${new Date().toLocaleString("zh-CN")}
`,n+=`**\u9AD8\u4EAE\u6570\u91CF**: ${e.length}

`,n+=`---

`,t.groupByColor){let o=ze(e);Object.entries(o).forEach(([r,i])=>{i.length!==0&&(n+=`## ${we(r)} ${O(r)} (${i.length})

`,i.forEach((a,s)=>{n+=`### ${s+1}. ${a.text.slice(0,50)}...

`,n+=`> ${a.text}

`,t.includeNotes&&a.note&&(n+=`**\u{1F4DD} \u7B14\u8BB0**: ${a.note}

`),n+=`---

`}))})}else e.forEach((o,r)=>{n+=`## ${r+1}. ${we(o.color)} ${o.text.slice(0,50)}...

`,n+=`> ${o.text}

`,t.includeNotes&&o.note&&(n+=`**\u{1F4DD} \u7B14\u8BB0**: ${o.note}

`),n+=`---

`});return n}function Qe(e,t){let n=`${document.title}
`;if(n+=`${"=".repeat(document.title.length)}

`,n+=`\u6765\u6E90: ${window.location.href}
`,n+=`\u5BFC\u51FA\u65F6\u95F4: ${new Date().toLocaleString("zh-CN")}
`,n+=`\u9AD8\u4EAE\u6570\u91CF: ${e.length}

`,n+=`${"-".repeat(80)}

`,t.groupByColor){let o=ze(e);Object.entries(o).forEach(([r,i])=>{i.length!==0&&(n+=`\u3010${O(r)}\u3011(${i.length} \u6761)

`,i.forEach((a,s)=>{n+=`${s+1}. ${a.text}
`,t.includeNotes&&a.note&&(n+=`   \u{1F4DD} ${a.note}
`),n+=`
`}),n+=`${"-".repeat(80)}

`)})}else e.forEach((o,r)=>{n+=`${r+1}. [${O(o.color)}] ${o.text}
`,t.includeNotes&&o.note&&(n+=`   \u{1F4DD} ${o.note}
`),n+=`
`});return n}function et(e,t){let n=`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${document.title} - \u9AD8\u4EAE\u5BFC\u51FA</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }
    h1 { color: #111; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
    .highlight { margin-bottom: 30px; padding: 20px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #3b82f6; }
    .highlight-text { font-size: 16px; margin-bottom: 10px; }
    .highlight-note { background: #fff; padding: 12px; border-radius: 4px; margin-top: 10px; font-style: italic; color: #555; }
    .color-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-right: 8px; }
    .color-yellow { background: #fef3c7; color: #92400e; }
    .color-blue { background: #dbeafe; color: #1e40af; }
    .color-green { background: #d1fae5; color: #065f46; }
    .color-red { background: #fee2e2; color: #991b1b; }
    .section-title { font-size: 24px; margin-top: 40px; margin-bottom: 20px; color: #111; }
  </style>
</head>
<body>
  <h1>\u{1F4D6} ${document.title}</h1>
  <div class="meta">
    <p><strong>\u6765\u6E90</strong>: <a href="${window.location.href}">${window.location.href}</a></p>
    <p><strong>\u5BFC\u51FA\u65F6\u95F4</strong>: ${new Date().toLocaleString("zh-CN")}</p>
    <p><strong>\u9AD8\u4EAE\u6570\u91CF</strong>: ${e.length}</p>
  </div>
`;if(t.groupByColor){let o=ze(e);Object.entries(o).forEach(([r,i])=>{i.length!==0&&(n+=`<h2 class="section-title">${we(r)} ${O(r)} (${i.length})</h2>
`,i.forEach(a=>{n+=`<div class="highlight">
          <span class="color-badge color-${r}">${O(r)}</span>
          <div class="highlight-text">${X(a.text)}</div>`,t.includeNotes&&a.note&&(n+=`<div class="highlight-note">\u{1F4DD} ${X(a.note)}</div>`),n+=`</div>
`}))})}else e.forEach(o=>{n+=`<div class="highlight">
        <span class="color-badge color-${o.color}">${O(o.color)}</span>
        <div class="highlight-text">${X(o.text)}</div>`,t.includeNotes&&o.note&&(n+=`<div class="highlight-note">\u{1F4DD} ${X(o.note)}</div>`),n+=`</div>
`});return n+=`
</body>
</html>`,n}function kt(e,t){let n={title:document.title,url:window.location.href,exportTime:new Date().toISOString(),count:e.length,highlights:e.map(o=>({id:o.id,text:o.text,note:t.includeNotes?o.note:void 0,color:o.color}))};return JSON.stringify(n,null,2)}function ze(e){let t={yellow:[],blue:[],green:[],red:[]};return e.forEach(n=>{t[n.color]&&t[n.color].push(n)}),t}function Tt(e,t,n){let o=new Blob([e],{type:`${n};charset=utf-8`}),r=URL.createObjectURL(o),i=document.createElement("a");i.href=r,i.download=t,i.click(),URL.revokeObjectURL(r)}function Ht(e){let t=parseInt(e.slice(1,3),16),n=parseInt(e.slice(3,5),16),o=parseInt(e.slice(5,7),16);return`${t}, ${n}, ${o}`}function St(e){for(let[t,n]of Object.entries(y))if(e===n||e.includes(Ht(n)))return t;return"yellow"}function O(e){return{yellow:"\u9EC4\u8272",blue:"\u84DD\u8272",green:"\u7EFF\u8272",red:"\u7EA2\u8272"}[e]||"\u672A\u77E5"}function we(e){return{yellow:"\u{1F7E1}",blue:"\u{1F535}",green:"\u{1F7E2}",red:"\u{1F534}"}[e]||"\u26AA"}function X(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}function Q(){let e=new Date;return`${e.getFullYear()}${String(e.getMonth()+1).padStart(2,"0")}${String(e.getDate()).padStart(2,"0")}_${String(e.getHours()).padStart(2,"0")}${String(e.getMinutes()).padStart(2,"0")}`}var q="zr-stats-panel-container",P=!1,R=[],tt=[{key:"yellow",label:"\u9EC4\u8272",color:"#fbbf24"},{key:"blue",label:"\u84DD\u8272",color:"#60a5fa"},{key:"green",label:"\u7EFF\u8272",color:"#34d399"},{key:"red",label:"\u7EA2\u8272",color:"#f87171"}],Nt=`
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif;
  }

  /* \u2500\u2500 Toggle Button \u2500\u2500 */
  .zr-stats-toggle {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: 44px;
    height: 44px;
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    z-index: 2147483646;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .zr-stats-toggle:hover {
    background: #3b82f6;
    color: #fff;
    border-color: #3b82f6;
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
  }
  .zr-stats-toggle:active { transform: scale(0.95); }

  .zr-stats-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 18px;
    height: 18px;
    background: #ef4444;
    border: 2px solid #141414;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    padding: 0 4px;
    color: white;
  }

  /* \u2500\u2500 Main Panel \u2500\u2500 */
  .zr-stats-panel {
    position: fixed;
    right: 24px;
    bottom: 80px;
    width: 340px;
    max-height: calc(100vh - 120px);
    background: #141414;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: zr-panel-slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.5;
  }

  @keyframes zr-panel-slide-up {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .zr-panel-fade-out {
    animation: zr-panel-fade-out 0.2s ease forwards !important;
  }
  @keyframes zr-panel-fade-out {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(8px); opacity: 0; }
  }

  /* \u2500\u2500 Header \u2500\u2500 */
  .zr-stats-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .zr-stats-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fff;
    letter-spacing: -0.01em;
  }
  .zr-header-actions { display: flex; gap: 2px; }

  .zr-icon-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }
  .zr-icon-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
  }

  /* \u2500\u2500 Stats Overview \u2500\u2500 */
  .zr-stats-overview {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .zr-stats-summary { display: flex; align-items: baseline; gap: 20px; }
  .zr-stats-metric { display: flex; align-items: baseline; gap: 6px; }
  .zr-stats-metric-value {
    font-size: 26px;
    font-weight: 700;
    color: #fff;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .zr-stats-metric-label { font-size: 12px; color: #6b7280; font-weight: 500; }
  .zr-stats-metric-divider { width: 1px; height: 20px; background: rgba(255,255,255,0.1); }

  /* \u2500\u2500 Color Bar \u2500\u2500 */
  .zr-stats-bar-wrap { display: flex; flex-direction: column; gap: 10px; }
  .zr-stats-bar {
    display: flex;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    background: rgba(255,255,255,0.04);
    gap: 2px;
  }
  .zr-stats-bar-segment { border-radius: 3px; transition: flex 0.3s ease; min-width: 4px; }

  /* \u2500\u2500 Color Legend \u2500\u2500 */
  .zr-stats-legend { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
  .zr-stats-legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
    color: #9ca3af;
  }
  .zr-stats-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .zr-stats-legend-label { flex: 1; }
  .zr-stats-legend-count { font-weight: 600; font-variant-numeric: tabular-nums; color: #fff; }

  /* \u2500\u2500 List Section \u2500\u2500 */
  .zr-stats-list-container { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .zr-stats-list-header {
    padding: 12px 16px 8px;
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .zr-stats-list { flex: 1; overflow-y: auto; padding: 0 8px 12px; }

  .zr-stats-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px;
    border-radius: 8px;
    margin-bottom: 2px;
    transition: all 0.15s;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .zr-stats-item:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255,255,255,0.08);
  }
  .zr-stats-indicator {
    flex-shrink: 0;
    width: 3px;
    height: 100%;
    min-height: 16px;
    border-radius: 2px;
    margin-top: 2px;
  }
  .zr-stats-item-content { flex: 1; min-width: 0; }
  .zr-stats-item-text {
    font-size: 13px;
    color: #9ca3af;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .zr-stats-item:hover .zr-stats-item-text { color: #fff; }
  .zr-stats-item-note {
    font-size: 12px;
    color: #3b82f6;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0.75;
  }
  .zr-stats-jump {
    opacity: 0;
    color: #6b7280;
    transition: all 0.15s;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .zr-stats-item:hover .zr-stats-jump { opacity: 1; }
  .zr-stats-jump:hover { color: #3b82f6; }

  /* \u2500\u2500 Empty State \u2500\u2500 */
  .zr-stats-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 20px;
    text-align: center;
  }
  .zr-stats-empty-icon { color: #6b7280; opacity: 0.4; }
  .zr-stats-empty-text { font-size: 13px; color: #6b7280; }
  .zr-stats-empty-hint { font-size: 12px; color: #6b7280; opacity: 0.6; }

  /* \u2500\u2500 Export Menu \u2500\u2500 */
  .zr-export-menu {
    position: fixed;
    min-width: 160px;
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4);
    padding: 4px;
    z-index: 2147483647;
    animation: zr-fade-in 0.12s ease;
  }
  .zr-export-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: #9ca3af;
    transition: all 0.12s;
  }
  .zr-export-item:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
  .zr-export-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 8px; }

  @keyframes zr-fade-in {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }

  /* \u2500\u2500 Scrollbar \u2500\u2500 */
  .zr-stats-list::-webkit-scrollbar { width: 5px; }
  .zr-stats-list::-webkit-scrollbar-track { background: transparent; }
  .zr-stats-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 3px; }
  .zr-stats-list::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.15); }
`,$={stats:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',export:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',close:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',jump:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>',note:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',toggle:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>',empty:'<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>'};function nt(){Ee(),B()}function Ee(){let e=document.getElementById(q);if(!e){e=document.createElement("div"),e.id=q;let t=e.attachShadow({mode:"open"}),n=document.createElement("style");n.textContent=Nt,t.appendChild(n),document.body.appendChild(e)}return e}function Lt(e){let n=Ee().shadowRoot,o=n.querySelector(".zr-stats-toggle");o||(o=document.createElement("button"),o.className="zr-stats-toggle",o.onclick=ke,n.appendChild(o)),o.innerHTML=`
    ${$.toggle}
    <span class="zr-stats-badge" style="display: ${e>0?"flex":"none"}">${e}</span>
  `}function ke(){P?Ce():ot()}function ot(){if(P)return;let t=Ee().shadowRoot,n=document.createElement("div");n.className="zr-stats-panel";let o=document.createElement("div");o.className="zr-stats-header",o.innerHTML=`<h3>${$.stats} \u9AD8\u4EAE\u7EDF\u8BA1</h3>`;let r=document.createElement("div");r.className="zr-header-actions";let i=document.createElement("button");i.className="zr-icon-btn",i.innerHTML=$.export,i.title="\u5BFC\u51FA\u9AD8\u4EAE",i.onclick=p=>{p.stopPropagation(),It(i)};let a=document.createElement("button");a.className="zr-icon-btn",a.innerHTML=$.close,a.onclick=Ce,r.append(i,a),o.appendChild(r),n.appendChild(o);let s=$t(),l=document.createElement("div");l.className="zr-stats-overview";let c=document.createElement("div");if(c.className="zr-stats-summary",c.innerHTML=`
    <div class="zr-stats-metric">
      <span class="zr-stats-metric-value">${s.total}</span>
      <span class="zr-stats-metric-label">\u6761\u9AD8\u4EAE</span>
    </div>
    <div class="zr-stats-metric-divider"></div>
    <div class="zr-stats-metric">
      <span class="zr-stats-metric-value">${s.withNotes}</span>
      <span class="zr-stats-metric-label">\u6761\u7B14\u8BB0</span>
    </div>
  `,l.appendChild(c),s.total>0){let p=document.createElement("div");p.className="zr-stats-bar-wrap";let f=document.createElement("div");f.className="zr-stats-bar",tt.forEach(b=>{let v=s.byColor[b.key];if(v>0){let x=document.createElement("div");x.className="zr-stats-bar-segment",x.style.backgroundColor=b.color,x.style.flex=`${v}`,x.title=`${b.label}: ${v}`,f.appendChild(x)}}),p.appendChild(f);let w=document.createElement("div");w.className="zr-stats-legend",tt.forEach(b=>{let v=s.byColor[b.key],x=document.createElement("div");x.className="zr-stats-legend-item",x.innerHTML=`
        <span class="zr-stats-legend-dot" style="background:${b.color}"></span>
        <span class="zr-stats-legend-label">${b.label}</span>
        <span class="zr-stats-legend-count">${v}</span>
      `,w.appendChild(x)}),p.appendChild(w),l.appendChild(p)}n.appendChild(l);let d=document.createElement("div");d.className="zr-stats-list-container",d.innerHTML='<div class="zr-stats-list-header">\u9AD8\u4EAE\u5217\u8868</div>';let h=document.createElement("div");h.className="zr-stats-list",R.length===0?h.innerHTML=`
      <div class="zr-stats-empty">
        <div class="zr-stats-empty-icon">${$.empty}</div>
        <div class="zr-stats-empty-text">\u5F53\u524D\u9875\u9762\u6CA1\u6709\u9AD8\u4EAE\u5185\u5BB9</div>
        <div class="zr-stats-empty-hint">\u9009\u4E2D\u6587\u5B57\u5373\u53EF\u521B\u5EFA\u9AD8\u4EAE</div>
      </div>
    `:R.forEach(p=>{let f=document.createElement("div");f.className="zr-stats-item";let w=document.createElement("div");w.className="zr-stats-indicator",w.style.backgroundColor=p.style.backgroundColor;let b=document.createElement("div");if(b.className="zr-stats-item-content",b.innerHTML=`<div class="zr-stats-item-text">${p.textContent||""}</div>`,p.dataset.note){let x=document.createElement("div");x.className="zr-stats-item-note",x.innerHTML=`${$.note} <span>${p.dataset.note}</span>`,b.appendChild(x)}let v=document.createElement("div");v.className="zr-stats-jump",v.innerHTML=$.jump,f.append(w,b,v),f.onclick=()=>{p.scrollIntoView({behavior:"smooth",block:"center"}),p.style.outline="2px solid var(--zr-blue, #3b82f6)",p.style.outlineOffset="2px",setTimeout(()=>{p.style.outline="none"},2e3),Ce()},h.appendChild(f)}),d.appendChild(h),n.appendChild(d),t.appendChild(n),P=!0}function Ce(){let e=document.getElementById(q);if(!e)return;let t=e.shadowRoot?.querySelector(".zr-stats-panel");t&&(t.classList.add("zr-panel-fade-out"),setTimeout(()=>{t.remove(),P=!1},200))}function B(){if(R=Array.from(document.querySelectorAll("[data-zr-highlight-id]")),Lt(R.length),P){let t=document.getElementById(q)?.shadowRoot?.querySelector(".zr-stats-panel");t&&(t.remove(),P=!1,ot())}}function $t(){let e={total:R.length,byColor:{yellow:0,blue:0,green:0,red:0},withNotes:0};return R.forEach(t=>{let n=t.getAttribute("data-zr-color")||"yellow";e.byColor[n]!==void 0&&e.byColor[n]++,t.dataset.note&&e.withNotes++}),e}function It(e){let n=document.getElementById(q)?.shadowRoot;if(!n)return;let o=document.createElement("div");o.className="zr-export-menu",[{icon:"\u{1F4DD}",text:"Markdown",action:()=>ee({format:"markdown",includeNotes:!0,groupByColor:!0})},{icon:"\u{1F4C4}",text:"\u7EAF\u6587\u672C",action:()=>ee({format:"text",includeNotes:!0,groupByColor:!0})},{icon:"\u{1F310}",text:"HTML",action:()=>ee({format:"html",includeNotes:!0,groupByColor:!0})},{type:"divider"},{icon:"\u{1F4CB}",text:"\u590D\u5236\u5BCC\u6587\u672C",action:Ye}].forEach(s=>{if(s.type==="divider"){let l=document.createElement("div");l.className="zr-export-divider",o.appendChild(l)}else{let l=document.createElement("div");l.className="zr-export-item",l.innerHTML=`<span>${s.icon}</span> <span>${s.text}</span>`,l.onclick=()=>{s.action(),o.remove()},o.appendChild(l)}});let i=e.getBoundingClientRect();o.style.top=`${i.bottom+8}px`,o.style.right=`${window.innerWidth-i.right}px`,n.appendChild(o);let a=s=>{o.contains(s.target)||(o.remove(),document.removeEventListener("mousedown",a))};setTimeout(()=>document.addEventListener("mousedown",a),0)}var it="zr-settings-panel",at="zr-user-preferences",He={highlightOpacity:60,highlightBorderStyle:"none",highlightBorderWidth:0,customColors:{yellow:y.yellow,blue:y.blue,green:y.green,red:y.red},highlightFontWeight:"normal",highlightFontStyle:"normal",highlightTextDecoration:"none",enableAnimations:!0,enableSounds:!1,shortcutsEnabled:!0,autoSave:!0},u={...He},Te=!1;function st(){Mt(),Ne(),console.log("[Z-Reader] \u8BBE\u7F6E\u7CFB\u7EDF\u5DF2\u521D\u59CB\u5316")}function Se(){if(Te)return;let e=document.createElement("div");e.className="zr-settings-backdrop",e.addEventListener("click",te);let t=document.createElement("div");t.id=it,t.className="zr-settings-panel";let n=document.createElement("div");n.className="zr-settings-header";let o=document.createElement("h2");o.textContent="\u2699\uFE0F \u8BBE\u7F6E",n.appendChild(o);let r=document.createElement("button");r.className="zr-settings-close",r.innerHTML="\u2715",r.addEventListener("click",te),n.appendChild(r),t.appendChild(n);let i=document.createElement("div");i.className="zr-settings-content",i.appendChild(Ot()),i.appendChild(Pt()),i.appendChild(Rt()),i.appendChild(Bt()),t.appendChild(i);let a=document.createElement("div");a.className="zr-settings-footer";let s=document.createElement("button");s.className="zr-settings-btn zr-settings-btn-secondary",s.textContent="\u6062\u590D\u9ED8\u8BA4",s.addEventListener("click",Dt),a.appendChild(s);let l=document.createElement("button");l.className="zr-settings-btn zr-settings-btn-primary",l.textContent="\u4FDD\u5B58\u8BBE\u7F6E",l.addEventListener("click",()=>{lt(),Ne(),te(),g.success("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58")}),a.appendChild(l),t.appendChild(a),document.body.appendChild(e),document.body.appendChild(t),requestAnimationFrame(()=>{t.classList.add("zr-settings-panel-show")}),Te=!0}function te(){let e=document.getElementById(it),t=document.querySelector(".zr-settings-backdrop");e&&(e.classList.remove("zr-settings-panel-show"),setTimeout(()=>e.remove(),300)),t&&t.remove(),Te=!1}function Ot(){let e=document.createElement("div");e.className="zr-settings-section";let t=document.createElement("h3");t.className="zr-settings-section-title",t.textContent="\u{1F3A8} \u9AD8\u4EAE\u6837\u5F0F",e.appendChild(t);let n=rt("\u900F\u660E\u5EA6","highlightOpacity",0,100,u.highlightOpacity,l=>{u.highlightOpacity=l,H()});e.appendChild(n);let o=ne("\u8FB9\u6846\u6837\u5F0F","highlightBorderStyle",[{value:"none",label:"\u65E0\u8FB9\u6846"},{value:"solid",label:"\u5B9E\u7EBF"},{value:"dashed",label:"\u865A\u7EBF"},{value:"dotted",label:"\u70B9\u7EBF"}],u.highlightBorderStyle,l=>{u.highlightBorderStyle=l,H()});if(e.appendChild(o),u.highlightBorderStyle!=="none"){let l=rt("\u8FB9\u6846\u7C97\u7EC6","highlightBorderWidth",0,3,u.highlightBorderWidth,c=>{u.highlightBorderWidth=c,H()});e.appendChild(l)}let r=document.createElement("div");r.className="zr-settings-group";let i=document.createElement("label");i.className="zr-settings-label",i.textContent="\u81EA\u5B9A\u4E49\u989C\u8272",r.appendChild(i);let a=document.createElement("div");a.className="zr-settings-color-grid",Object.entries(u.customColors).forEach(([l,c])=>{let d=document.createElement("div");d.className="zr-settings-color-item";let h=document.createElement("input");h.type="color",h.value=c,h.addEventListener("change",f=>{u.customColors[l]=f.target.value,H()}),d.appendChild(h);let p=document.createElement("span");p.textContent=jt(l),d.appendChild(p),a.appendChild(d)}),r.appendChild(a),e.appendChild(r);let s=At();return e.appendChild(s),e}function Pt(){let e=document.createElement("div");e.className="zr-settings-section";let t=document.createElement("h3");t.className="zr-settings-section-title",t.textContent="\u270D\uFE0F \u5B57\u4F53\u6837\u5F0F",e.appendChild(t);let n=ne("\u5B57\u4F53\u7C97\u7EC6","highlightFontWeight",[{value:"normal",label:"\u6B63\u5E38"},{value:"bold",label:"\u52A0\u7C97"}],u.highlightFontWeight,i=>{u.highlightFontWeight=i,H()});e.appendChild(n);let o=ne("\u5B57\u4F53\u6837\u5F0F","highlightFontStyle",[{value:"normal",label:"\u6B63\u5E38"},{value:"italic",label:"\u659C\u4F53"}],u.highlightFontStyle,i=>{u.highlightFontStyle=i,H()});e.appendChild(o);let r=ne("\u6587\u672C\u88C5\u9970","highlightTextDecoration",[{value:"none",label:"\u65E0"},{value:"underline",label:"\u4E0B\u5212\u7EBF"}],u.highlightTextDecoration,i=>{u.highlightTextDecoration=i,H()});return e.appendChild(r),e}function Rt(){let e=document.createElement("div");e.className="zr-settings-section";let t=document.createElement("h3");t.className="zr-settings-section-title",t.textContent="\u2728 \u52A8\u753B\u548C\u6548\u679C",e.appendChild(t);let n=oe("\u542F\u7528\u52A8\u753B\u6548\u679C","enableAnimations",u.enableAnimations,r=>{u.enableAnimations=r});e.appendChild(n);let o=oe("\u542F\u7528\u58F0\u97F3\u53CD\u9988","enableSounds",u.enableSounds,r=>{u.enableSounds=r});return e.appendChild(o),e}function Bt(){let e=document.createElement("div");e.className="zr-settings-section";let t=document.createElement("h3");t.className="zr-settings-section-title",t.textContent="\u{1F527} \u5176\u4ED6\u8BBE\u7F6E",e.appendChild(t);let n=oe("\u542F\u7528\u952E\u76D8\u5FEB\u6377\u952E","shortcutsEnabled",u.shortcutsEnabled,r=>{u.shortcutsEnabled=r});e.appendChild(n);let o=oe("\u81EA\u52A8\u4FDD\u5B58\u9AD8\u4EAE","autoSave",u.autoSave,r=>{u.autoSave=r});return e.appendChild(o),e}function rt(e,t,n,o,r,i){let a=document.createElement("div");a.className="zr-settings-group";let s=document.createElement("label");s.className="zr-settings-label",s.htmlFor=t,s.textContent=e,a.appendChild(s);let l=document.createElement("div");l.className="zr-settings-slider-container";let c=document.createElement("input");c.type="range",c.id=t,c.className="zr-settings-slider",c.min=n.toString(),c.max=o.toString(),c.value=r.toString();let d=document.createElement("span");return d.className="zr-settings-slider-value",d.textContent=`${r}${o===100?"%":""}`,c.addEventListener("input",h=>{let p=parseInt(h.target.value);d.textContent=`${p}${o===100?"%":""}`,i(p)}),l.appendChild(c),l.appendChild(d),a.appendChild(l),a}function ne(e,t,n,o,r){let i=document.createElement("div");i.className="zr-settings-group";let a=document.createElement("label");a.className="zr-settings-label",a.htmlFor=t,a.textContent=e,i.appendChild(a);let s=document.createElement("select");return s.id=t,s.className="zr-settings-select",s.value=o,n.forEach(l=>{let c=document.createElement("option");c.value=l.value,c.textContent=l.label,l.value===o&&(c.selected=!0),s.appendChild(c)}),s.addEventListener("change",l=>{r(l.target.value)}),i.appendChild(s),i}function oe(e,t,n,o){let r=document.createElement("div");r.className="zr-settings-group zr-settings-checkbox-group";let i=document.createElement("input");i.type="checkbox",i.id=t,i.className="zr-settings-checkbox",i.checked=n,i.addEventListener("change",s=>{o(s.target.checked)});let a=document.createElement("label");return a.className="zr-settings-checkbox-label",a.htmlFor=t,a.textContent=e,r.appendChild(i),r.appendChild(a),r}function At(){let e=document.createElement("div");e.className="zr-settings-preview",e.id="zr-settings-preview";let t=document.createElement("div");t.className="zr-settings-preview-label",t.textContent="\u9884\u89C8\u6548\u679C",e.appendChild(t);let n=document.createElement("div");return n.className="zr-settings-preview-content",n.innerHTML=`
    <p>\u8FD9\u662F\u4E00\u6BB5\u793A\u4F8B\u6587\u672C\u3002<span class="preview-highlight preview-yellow">\u9EC4\u8272\u9AD8\u4EAE\u793A\u4F8B</span>\uFF0C<span class="preview-highlight preview-blue">\u84DD\u8272\u9AD8\u4EAE\u793A\u4F8B</span>\uFF0C<span class="preview-highlight preview-green">\u7EFF\u8272\u9AD8\u4EAE\u793A\u4F8B</span>\uFF0C<span class="preview-highlight preview-red">\u7EA2\u8272\u9AD8\u4EAE\u793A\u4F8B</span>\u3002</p>
  `,e.appendChild(n),H(),e}function H(){let e=document.getElementById("zr-settings-preview");if(!e)return;e.querySelectorAll(".preview-highlight").forEach(n=>{let o=n,r=o.classList.contains("preview-yellow")?"yellow":o.classList.contains("preview-blue")?"blue":o.classList.contains("preview-green")?"green":"red";o.style.backgroundColor=u.customColors[r],o.style.opacity=(u.highlightOpacity/100).toString(),o.style.borderStyle=u.highlightBorderStyle,o.style.borderWidth=`${u.highlightBorderWidth}px`,o.style.borderColor=_(u.customColors[r],-20),o.style.fontWeight=u.highlightFontWeight,o.style.fontStyle=u.highlightFontStyle,o.style.textDecoration=u.highlightTextDecoration})}function Mt(){try{let e=localStorage.getItem(at);e&&(u={...He,...JSON.parse(e)})}catch(e){console.error("[Z-Reader] \u52A0\u8F7D\u8BBE\u7F6E\u5931\u8D25:",e)}}function lt(){try{localStorage.setItem(at,JSON.stringify(u))}catch(e){console.error("[Z-Reader] \u4FDD\u5B58\u8BBE\u7F6E\u5931\u8D25:",e),g.error("\u4FDD\u5B58\u8BBE\u7F6E\u5931\u8D25")}}function Ne(){let e=document.getElementById("zr-custom-styles")||document.createElement("style");e.id="zr-custom-styles";let{customColors:t,highlightOpacity:n,highlightBorderStyle:o,highlightBorderWidth:r,highlightFontWeight:i,highlightFontStyle:a,highlightTextDecoration:s}=u;e.textContent=`
    [data-zr-highlight-id] {
      opacity: ${n/100} !important;
      border-style: ${o} !important;
      border-width: ${r}px !important;
      font-weight: ${i} !important;
      font-style: ${a} !important;
      text-decoration: ${s} !important;
    }
    
    [data-zr-highlight-id][style*="rgb(254, 240, 138)"] {
      background-color: ${t.yellow} !important;
      border-color: ${_(t.yellow,-20)} !important;
    }
    
    [data-zr-highlight-id][style*="rgb(147, 197, 253)"] {
      background-color: ${t.blue} !important;
      border-color: ${_(t.blue,-20)} !important;
    }
    
    [data-zr-highlight-id][style*="rgb(134, 239, 172)"] {
      background-color: ${t.green} !important;
      border-color: ${_(t.green,-20)} !important;
    }
    
    [data-zr-highlight-id][style*="rgb(252, 165, 165)"] {
      background-color: ${t.red} !important;
      border-color: ${_(t.red,-20)} !important;
    }
  `,document.head.contains(e)||document.head.appendChild(e),u.enableAnimations?document.body.classList.remove("zr-no-animations"):document.body.classList.add("zr-no-animations")}function Dt(){confirm("\u786E\u5B9A\u8981\u6062\u590D\u6240\u6709\u8BBE\u7F6E\u4E3A\u9ED8\u8BA4\u503C\u5417\uFF1F")&&(u={...He},lt(),Ne(),te(),setTimeout(()=>Se(),300),g.success("\u5DF2\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E"))}function _(e,t){let n=parseInt(e.replace("#",""),16),o=Math.round(2.55*t),r=(n>>16)+o,i=(n>>8&255)+o,a=(n&255)+o;return"#"+(16777216+(r<255?r<1?0:r:255)*65536+(i<255?i<1?0:i:255)*256+(a<255?a<1?0:a:255)).toString(16).slice(1)}function jt(e){return{yellow:"\u9EC4\u8272",blue:"\u84DD\u8272",green:"\u7EFF\u8272",red:"\u7EA2\u8272"}[e]||e}var qt="ZReaderOffline",_t=1,ct="highlights",S="pending_operations",N=null,F=navigator.onLine,Ft=null;async function pt(){try{N=await Gt(),Wt(),Ut(),console.log("[Z-Reader] \u79BB\u7EBF\u652F\u6301\u5DF2\u521D\u59CB\u5316"),F||g.info("\u5F53\u524D\u5904\u4E8E\u79BB\u7EBF\u6A21\u5F0F\uFF0C\u6570\u636E\u5C06\u5728\u8054\u7F51\u540E\u540C\u6B65")}catch(e){console.error("[Z-Reader] \u521D\u59CB\u5316\u79BB\u7EBF\u652F\u6301\u5931\u8D25:",e)}}function Gt(){return new Promise((e,t)=>{let n=indexedDB.open(qt,_t);n.onerror=()=>t(n.error),n.onsuccess=()=>e(n.result),n.onupgradeneeded=o=>{let r=o.target.result;if(!r.objectStoreNames.contains(ct)){let i=r.createObjectStore(ct,{keyPath:"id"});i.createIndex("articleId","articleId",{unique:!1}),i.createIndex("synced","synced",{unique:!1})}r.objectStoreNames.contains(S)||r.createObjectStore(S,{keyPath:"id"}).createIndex("timestamp","timestamp",{unique:!1})}})}function Wt(){window.addEventListener("online",()=>{F=!0,g.success("\u5DF2\u6062\u590D\u7F51\u7EDC\u8FDE\u63A5\uFF0C\u5F00\u59CB\u540C\u6B65\u6570\u636E"),gt()}),window.addEventListener("offline",()=>{F=!1,g.warning("\u7F51\u7EDC\u5DF2\u65AD\u5F00\uFF0C\u5207\u6362\u5230\u79BB\u7EBF\u6A21\u5F0F")})}function Ut(){Ft=window.setInterval(()=>{F&&gt()},3e4)}async function Zt(){if(!N)throw new Error("Database not initialized");return new Promise((e,t)=>{let i=N.transaction([S],"readonly").objectStore(S).index("timestamp").getAll();i.onsuccess=()=>e(i.result),i.onerror=()=>t(i.error)})}async function dt(e){if(!N)throw new Error("Database not initialized");return new Promise((t,n)=>{let i=N.transaction([S],"readwrite").objectStore(S).delete(e);i.onsuccess=()=>t(),i.onerror=()=>n(i.error)})}async function Jt(e){if(!N)throw new Error("Database not initialized");return e.retries++,new Promise((t,n)=>{let i=N.transaction([S],"readwrite").objectStore(S).put(e);i.onsuccess=()=>t(),i.onerror=()=>n(i.error)})}async function gt(){if(!(!F||!N))try{let e=await Zt();if(e.length===0)return;console.log(`[Z-Reader] \u5F00\u59CB\u540C\u6B65 ${e.length} \u4E2A\u5F85\u5904\u7406\u64CD\u4F5C`);let t=0,n=0;for(let o of e)try{if(o.retries>=5){console.warn(`[Z-Reader] \u64CD\u4F5C ${o.id} \u91CD\u8BD5\u6B21\u6570\u8FC7\u591A\uFF0C\u8DF3\u8FC7`),await dt(o.id),n++;continue}await Vt(o),await dt(o.id),t++}catch(r){console.error("[Z-Reader] \u540C\u6B65\u64CD\u4F5C\u5931\u8D25:",o,r),await Jt(o),n++}t>0&&g.success(`\u5DF2\u540C\u6B65 ${t} \u4E2A\u64CD\u4F5C`),n>0&&g.warning(`${n} \u4E2A\u64CD\u4F5C\u540C\u6B65\u5931\u8D25\uFF0C\u5C06\u7A0D\u540E\u91CD\u8BD5`)}catch(e){console.error("[Z-Reader] \u540C\u6B65\u5931\u8D25:",e)}}async function Vt(e){let t="http://127.0.0.1:21897/api";switch(e.type){case"create":if(!(await fetch(`${t}/highlights`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e.data)})).ok)throw new Error("Create failed");break;case"update":if(!(await fetch(`${t}/highlights/${e.data.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(e.data)})).ok)throw new Error("Update failed");break;case"delete":if(!(await fetch(`${t}/highlights/${e.data.id}`,{method:"DELETE"})).ok)throw new Error("Delete failed");break}}var M=null;async function Kt(){st(),pt(),Ve(),Xt(),nt();try{let e=await je(window.location.href);if(e.articleId){M=e.articleId;for(let t of e.highlights)se(t.id,t.text??"",t.color??"yellow",{startOffset:t.startOffset??void 0,endOffset:t.endOffset??void 0,paragraphIndex:t.paragraphIndex??void 0,note:t.note??void 0});B()}}catch{}}document.addEventListener("mouseup",()=>{let e=window.getSelection();!e||e.isCollapsed||!e.toString().trim()||requestAnimationFrame(()=>{let t=window.getSelection();if(!t||t.isCollapsed)return;let o=t.getRangeAt(0).getBoundingClientRect(),r=o.left+o.width/2+window.scrollX,i=o.top+window.scrollY;Me(r,i,async a=>{a.type==="highlight"?await A(a.color):a.type==="save"?await $e():a.type==="note"&&await Ie()})})});async function Le(){if(M)return!0;try{let e=document.documentElement.outerHTML,t=document.body.innerText;return M=(await De({url:window.location.href,title:document.title,content:e,contentText:t})).id,!0}catch(e){return console.error("[Z-Reader] \u4FDD\u5B58\u6587\u7AE0\u5931\u8D25:",e),!1}}async function A(e){let t=ae(e);if(t){if(!await Le()){g.error("\u4FDD\u5B58\u6587\u7AE0\u5931\u8D25\uFF0C\u65E0\u6CD5\u521B\u5EFA\u9AD8\u4EAE");return}try{let n=await de({articleId:M,text:t.text,color:e,startOffset:t.startOffset,endOffset:t.endOffset,paragraphIndex:t.paragraphIndex});t.updateId(n.id),g.success("\u9AD8\u4EAE\u5DF2\u521B\u5EFA"),B()}catch(n){console.error("[Z-Reader] \u521B\u5EFA\u9AD8\u4EAE\u5931\u8D25:",n),g.error("\u521B\u5EFA\u9AD8\u4EAE\u5931\u8D25")}}}async function $e(){await Le()?g.success("\u6587\u7AE0\u5DF2\u4FDD\u5B58\u5230 Z-Reader"):g.error("\u4FDD\u5B58\u6587\u7AE0\u5931\u8D25")}async function Ie(){let t=window.getSelection()?.toString().trim()||"";ue({selectedText:t,initialColor:"yellow",onSave:async(n,o,r)=>{let i=ae(o);if(i){if(!await Le()){g.error("\u4FDD\u5B58\u6587\u7AE0\u5931\u8D25\uFF0C\u65E0\u6CD5\u521B\u5EFA\u9AD8\u4EAE");return}try{let a=await de({articleId:M,text:i.text,note:n,color:o,startOffset:i.startOffset,endOffset:i.endOffset,paragraphIndex:i.paragraphIndex});i.updateId(a.id),le(a.id,n);for(let s of r)await he(a.id,s);g.success("\u7B14\u8BB0\u9AD8\u4EAE\u5DF2\u521B\u5EFA"),B()}catch(a){console.error("[Z-Reader] \u521B\u5EFA\u5E26\u7B14\u8BB0\u9AD8\u4EAE\u5931\u8D25:",a),g.error("\u521B\u5EFA\u7B14\u8BB0\u9AD8\u4EAE\u5931\u8D25")}}},onCancel:()=>{}})}document.addEventListener("zr-highlight-click",e=>{let t=e.detail;if(!t?.id||!t.element)return;let o=t.element.getBoundingClientRect(),r=o.left+window.scrollX,i=o.bottom+window.scrollY+5;Ue({x:r,y:i,highlightId:t.id,note:t.note,onDelete:()=>{Pe(t.id),qe(t.id).then(()=>{g.success("\u9AD8\u4EAE\u5DF2\u5220\u9664"),B()}).catch(a=>{console.error("[Z-Reader] \u5220\u9664\u9AD8\u4EAE\u5931\u8D25:",a),g.error("\u5220\u9664\u9AD8\u4EAE\u5931\u8D25")})},onEditNote:async()=>{let a=[];try{a=await ge(t.id)}catch(s){console.error("Failed to fetch highlight tags:",s)}ue({highlightId:t.id,initialNote:t.note,selectedText:t.text,initialColor:t.color,initialTags:a,onSave:async(s,l,c)=>{try{await pe(t.id,{note:s,color:l}),le(t.id,s),Re(t.id,l);let h=(await ge(t.id)).map(p=>p.id);for(let p of h)c.includes(p)||await Ge(t.id,p);for(let p of c)h.includes(p)||await he(t.id,p);g.success("\u7B14\u8BB0\u5DF2\u66F4\u65B0")}catch(d){console.error("[Z-Reader] \u66F4\u65B0\u7B14\u8BB0\u5931\u8D25:",d),g.error("\u66F4\u65B0\u7B14\u8BB0\u5931\u8D25")}},onCancel:()=>{}})},onChangeColor:async a=>{try{await pe(t.id,{color:a});let s=document.querySelector(`[data-zr-highlight-id="${t.id}"]`);s&&(s.style.backgroundColor=Yt(a)),g.success("\u989C\u8272\u5DF2\u66F4\u6539")}catch(s){console.error("[Z-Reader] \u66F4\u6539\u989C\u8272\u5931\u8D25:",s),g.error("\u66F4\u6539\u989C\u8272\u5931\u8D25")}},onCopy:()=>{navigator.clipboard.writeText(t.text).then(()=>{g.success("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F")}).catch(()=>{g.error("\u590D\u5236\u5931\u8D25")})}})});function Yt(e){return y[e]||y.yellow}chrome.runtime.onMessage.addListener(e=>{if(e.type==="ARTICLE_SAVED"&&(M=e.payload.id),e.type==="HIGHLIGHT_SELECTION"){let t=e.payload.color||"yellow";A(t)}if(e.type==="HIGHLIGHT_WITH_NOTE"&&Ie(),e.type==="SAVE_ARTICLE_WITH_CONTENT"&&$e(),e.type==="SHOW_TOAST"){let{message:t,type:n}=e.payload;n==="success"?g.success(t):n==="error"?g.error(t):n==="warning"?g.warning(t):g.info(t)}if(e.type==="SEARCH_IN_ZREADER"){let t=e.payload.text;g.info(`\u641C\u7D22\u529F\u80FD\u5F00\u53D1\u4E2D: "${t}"`)}});function Xt(){E({key:"1",alt:!0,description:"\u9EC4\u8272\u9AD8\u4EAE",category:"\u9AD8\u4EAE\u64CD\u4F5C",action:()=>A("yellow")}),E({key:"2",alt:!0,description:"\u84DD\u8272\u9AD8\u4EAE",category:"\u9AD8\u4EAE\u64CD\u4F5C",action:()=>A("blue")}),E({key:"3",alt:!0,description:"\u7EFF\u8272\u9AD8\u4EAE",category:"\u9AD8\u4EAE\u64CD\u4F5C",action:()=>A("green")}),E({key:"4",alt:!0,description:"\u7EA2\u8272\u9AD8\u4EAE",category:"\u9AD8\u4EAE\u64CD\u4F5C",action:()=>A("red")}),E({key:"n",alt:!0,description:"\u6DFB\u52A0\u7B14\u8BB0\u9AD8\u4EAE",category:"\u9AD8\u4EAE\u64CD\u4F5C",action:Ie}),E({key:"s",alt:!0,description:"\u4FDD\u5B58\u6587\u7AE0\u5230 Z-Reader",category:"\u6587\u7AE0\u64CD\u4F5C",action:$e}),E({key:"h",alt:!0,description:"\u5207\u6362\u9AD8\u4EAE\u7EDF\u8BA1\u9762\u677F",category:"\u9762\u677F\u64CD\u4F5C",action:ke}),E({key:",",alt:!0,description:"\u6253\u5F00\u8BBE\u7F6E\u9762\u677F",category:"\u9762\u677F\u64CD\u4F5C",action:Se}),E({key:"?",alt:!0,description:"\u663E\u793A\u5FEB\u6377\u952E\u5E2E\u52A9",category:"\u5E2E\u52A9",action:Ke}),console.log("[Z-Reader] \u5DF2\u6CE8\u518C 9 \u4E2A\u5FEB\u6377\u952E")}Kt();})();
