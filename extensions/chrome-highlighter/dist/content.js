"use strict";(()=>{var b={yellow:"#fef08a",blue:"#93c5fd",green:"#86efac",red:"#fca5a5"};var I="data-zr-highlight-id",$e="zr-highlight";function ae(e="yellow"){let t=window.getSelection();if(!t||t.isCollapsed||!t.rangeCount)return null;let n=t.getRangeAt(0),o=t.toString().trim();if(!o)return null;let r=n.startContainer.parentElement,i=ht(r),a=n.startOffset,s=n.endOffset,l=ut(),c=Re(l,e);try{n.surroundContents(c)}catch{let d=n.extractContents();c.appendChild(d),n.insertNode(c)}return t.removeAllRanges(),Be(c),{text:o,startOffset:a,endOffset:s,paragraphIndex:i,updateId:d=>{c.setAttribute(I,d)}}}function se(e,t,n,o){let r=document.body;if(o?.paragraphIndex!==void 0){let s=document.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, pre");o.paragraphIndex<s.length&&(r=s[o.paragraphIndex])}let i=document.createTreeWalker(r,NodeFilter.SHOW_TEXT),a;for(;a=i.nextNode();){let s=a,c=(s.textContent??"").indexOf(t);if(c===-1||s.parentElement?.classList.contains($e))continue;let d=document.createRange();d.setStart(s,c),d.setEnd(s,c+t.length);let u=Re(e,n);try{d.surroundContents(u)}catch{let g=d.extractContents();u.appendChild(g),d.insertNode(u)}return o?.note&&u.setAttribute("data-note",o.note),u.setAttribute("data-zr-color",n),Be(u),!0}return r!==document.body?se(e,t,n):!1}function Oe(e){document.querySelectorAll(`[${I}="${e}"]`).forEach(n=>{let o=n.parentNode;if(o){for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n),o.normalize()}})}function le(e,t){document.querySelectorAll(`[${I}="${e}"]`).forEach(o=>{t?o.setAttribute("data-note",t):o.removeAttribute("data-note")})}function Pe(e,t){document.querySelectorAll(`[${I}="${e}"]`).forEach(o=>{o.style.backgroundColor=b[t],o.setAttribute("data-zr-color",t)})}function Re(e,t){let n=document.createElement("mark");return n.className=$e,n.setAttribute(I,e),n.setAttribute("data-zr-color",t),n.style.backgroundColor=b[t],n.style.borderRadius="2px",n.style.padding="0 1px",n.style.cursor="pointer",n}function Be(e){e.addEventListener("click",()=>{let t=e.getAttribute(I),n=e.textContent,o=e.getAttribute("data-note"),r=e.getAttribute("data-zr-color");document.dispatchEvent(new CustomEvent("zr-highlight-click",{detail:{id:t,text:n,note:o,color:r,element:e}}))})}function ht(e){if(!e)return 0;let t=e.closest("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, pre");if(!t)return 0;let n=document.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, pre");for(let o=0;o<n.length;o++)if(n[o]===t)return o;return 0}function ut(){return`zr_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}var ce="zr-highlight-toolbar",D=null;function Ae(e,t,n){j(),D=n;let o=document.createElement("div");o.id=ce,["yellow","blue","green","red"].forEach(l=>{let c=document.createElement("button");c.className="zr-toolbar-btn zr-color-btn",c.style.backgroundColor=b[l],c.title=`${l} \u9AD8\u4EAE`,c.addEventListener("click",d=>{d.stopPropagation(),D?.({type:"highlight",color:l}),j()}),o.appendChild(c)});let i=document.createElement("span");i.className="zr-toolbar-divider",o.appendChild(i);let a=document.createElement("button");a.className="zr-toolbar-btn zr-action-btn",a.textContent="\u{1F4DD}",a.title="\u6DFB\u52A0\u7B14\u8BB0",a.addEventListener("click",l=>{l.stopPropagation(),D?.({type:"note"}),j()}),o.appendChild(a);let s=document.createElement("button");s.className="zr-toolbar-btn zr-action-btn",s.textContent="\u{1F4BE}",s.title="\u4FDD\u5B58\u5230 Z-Reader",s.addEventListener("click",l=>{l.stopPropagation(),D?.({type:"save"}),j()}),o.appendChild(s),o.style.left=`${e}px`,o.style.top=`${t-50}px`,document.body.appendChild(o),requestAnimationFrame(()=>{let l=o.getBoundingClientRect();l.right>window.innerWidth&&(o.style.left=`${window.innerWidth-l.width-8}px`),l.left<0&&(o.style.left="8px"),l.top<0&&(o.style.top=`${t+20}px`)})}function j(){let e=document.getElementById(ce);e&&e.remove(),D=null}document.addEventListener("mousedown",e=>{let t=document.getElementById(ce);t&&!t.contains(e.target)&&j()});var pt="http://127.0.0.1:21897/api";async function v(e,t){let n=`${pt}${e}`,o=await fetch(n,{headers:{"Content-Type":"application/json"},...t});if(!o.ok){let r=await o.text().catch(()=>"\u672A\u77E5\u9519\u8BEF");throw new Error(`API \u8BF7\u6C42\u5931\u8D25 [${o.status}]: ${r}`)}return o.json()}async function Me(e){return v("/articles",{method:"POST",body:JSON.stringify(e)})}async function De(e){return v(`/highlights?url=${encodeURIComponent(e)}`)}async function de(e){return v("/highlights",{method:"POST",body:JSON.stringify(e)})}async function je(e){await v(`/highlights/${e}`,{method:"DELETE"})}async function ge(e,t){return v(`/highlights/${e}`,{method:"PUT",body:JSON.stringify(t)})}async function qe(){return v("/tags")}async function Ge(e){return v("/tags",{method:"POST",body:JSON.stringify({name:e})})}async function he(e){return v(`/highlights/${e}/tags`)}async function ue(e,t){await v(`/highlights/${e}/tags`,{method:"POST",body:JSON.stringify({tagId:t})})}async function _e(e,t){await v(`/highlights/${e}/tags/${t}`,{method:"DELETE"})}var Fe="zr-note-editor-container",K={close:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',check:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',plus:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',tag:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>'},mt=`
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
`;async function pe(e){L();let t=e.initialColor||"yellow",n=new Set(e.initialTags?.map(m=>m.id)||[]),o=[];try{o=await qe()}catch(m){console.error("Failed to fetch tags:",m)}let r=document.createElement("div");r.id=Fe;let i=r.attachShadow({mode:"open"}),a=document.createElement("style");a.textContent=mt,i.appendChild(a);let s=document.createElement("div");s.className="zr-editor-backdrop",i.appendChild(s);let l=document.createElement("div");l.className="zr-note-editor";let c=document.createElement("div");c.className="zr-editor-header",c.innerHTML=`<h3>${e.initialNote?"\u7F16\u8F91\u7B14\u8BB0":"\u6DFB\u52A0\u7B14\u8BB0"}</h3>`;let d=document.createElement("button");d.className="zr-editor-close",d.innerHTML=K.close,d.onclick=()=>{e.onCancel(),L()},c.appendChild(d),l.appendChild(c);let u=document.createElement("div");if(u.className="zr-editor-body",e.selectedText){let m=document.createElement("div");m.className="zr-editor-quote-container",m.innerHTML=`
      <div class="zr-editor-label">\u5F15\u7528\u539F\u6587</div>
      <div class="zr-editor-quote">${e.selectedText}</div>
    `,u.appendChild(m)}let g=document.createElement("div");g.className="zr-editor-quote-container",g.innerHTML='<div class="zr-editor-label">\u9AD8\u4EAE\u989C\u8272</div>';let f=document.createElement("div");f.className="zr-editor-colors";let w=["yellow","blue","green","red"],x=()=>{f.innerHTML="",w.forEach(m=>{let y=document.createElement("button");y.className=`zr-color-option ${m===t?"active":""}`,y.style.backgroundColor=b[m],y.innerHTML=m===t?K.check:"",y.onclick=()=>{t=m,x();let k=u.querySelector(".zr-editor-quote");k&&(k.style.borderLeftColor=b[t])},f.appendChild(y)})};x(),g.appendChild(f),u.appendChild(g);let z=document.createElement("div");z.className="zr-editor-quote-container",z.innerHTML='<div class="zr-editor-label">\u6807\u7B7E</div>';let E=document.createElement("div");E.className="zr-editor-tags-list";let re=()=>{E.innerHTML="",o.forEach(y=>{let k=n.has(y.id),J=document.createElement("button");J.className=`zr-tag-item ${k?"active":""}`,J.innerHTML=`${K.tag} <span>${y.name}</span>`,J.onclick=()=>{k?n.delete(y.id):n.add(y.id),re()},E.appendChild(J)});let m=document.createElement("button");m.className="zr-tag-item zr-tag-add",m.innerHTML=`${K.plus} <span>\u65B0\u5EFA\u6807\u7B7E</span>`,m.onclick=async()=>{let y=prompt("\u8F93\u5165\u65B0\u6807\u7B7E\u540D\u79F0:");if(y?.trim()){let k=await Ge(y.trim());o.push(k),n.add(k.id),re()}},E.appendChild(m)};re(),z.appendChild(E),u.appendChild(z);let F=document.createElement("div");F.className="zr-editor-textarea-container",F.innerHTML='<div class="zr-editor-label">\u7B14\u8BB0\u5185\u5BB9</div>';let T=document.createElement("textarea");T.className="zr-editor-textarea",T.placeholder="\u5728\u6B64\u8F93\u5165\u60A8\u7684\u60F3\u6CD5...",T.value=e.initialNote||"",F.appendChild(T),u.appendChild(F),l.appendChild(u);let W=document.createElement("div");W.className="zr-editor-footer",W.innerHTML='<span class="zr-editor-hint">Ctrl+Enter \u4FDD\u5B58</span>';let ie=document.createElement("div");ie.className="zr-editor-actions";let U=document.createElement("button");U.className="zr-btn zr-btn-secondary",U.textContent="\u53D6\u6D88",U.onclick=()=>{e.onCancel(),L()};let Z=document.createElement("button");Z.className="zr-btn zr-btn-primary",Z.textContent="\u4FDD\u5B58\u7B14\u8BB0",Z.onclick=()=>{e.onSave(T.value.trim(),t,Array.from(n)),L()},ie.append(U,Z),W.appendChild(ie),l.appendChild(W),i.appendChild(l),document.body.appendChild(r),T.focus(),T.onkeydown=m=>{(m.ctrlKey||m.metaKey)&&m.key==="Enter"&&(m.preventDefault(),e.onSave(T.value.trim(),t,Array.from(n)),L()),m.key==="Escape"&&(m.preventDefault(),e.onCancel(),L())},s.onclick=()=>{e.onCancel(),L()}}function L(){let e=document.getElementById(Fe);if(!e)return;let t=e.shadowRoot?.querySelector(".zr-note-editor"),n=e.shadowRoot?.querySelector(".zr-editor-backdrop");t&&(t.style.transform="translateX(100%)",t.style.opacity="0",t.style.transition="all 0.2s ease-in"),n&&(n.style.opacity="0",n.style.transition="opacity 0.2s"),setTimeout(()=>e.remove(),200)}var me="zr-highlight-menu";function We(e){V();let t=document.createElement("div");t.id=me,t.className="zr-highlight-menu",[{icon:"\u{1F4DD}",text:e.note?"\u7F16\u8F91\u7B14\u8BB0":"\u6DFB\u52A0\u7B14\u8BB0",onClick:e.onEditNote},{icon:"\u{1F3A8}",text:"\u66F4\u6539\u989C\u8272",submenu:[{color:"yellow",label:"\u9EC4\u8272"},{color:"blue",label:"\u84DD\u8272"},{color:"green",label:"\u7EFF\u8272"},{color:"red",label:"\u7EA2\u8272"}]},{icon:"\u{1F4CB}",text:"\u590D\u5236\u6587\u672C",onClick:e.onCopy},{type:"divider"},{icon:"\u{1F5D1}\uFE0F",text:"\u5220\u9664\u9AD8\u4EAE",onClick:e.onDelete,danger:!0}].forEach(o=>{if(o.type==="divider"){let r=document.createElement("div");r.className="zr-menu-divider",t.appendChild(r)}else if(o.submenu){let r=bt(o,e.onChangeColor);t.appendChild(r)}else{let r=ft(o);t.appendChild(r)}}),t.style.left=`${e.x}px`,t.style.top=`${e.y}px`,document.body.appendChild(t),requestAnimationFrame(()=>{let o=t.getBoundingClientRect();o.right>window.innerWidth&&(t.style.left=`${e.x-o.width}px`),o.bottom>window.innerHeight&&(t.style.top=`${e.y-o.height}px`),o.left<0&&(t.style.left="8px"),o.top<0&&(t.style.top="8px")}),setTimeout(()=>{document.addEventListener("click",Ue)},0)}function ft(e){let t=document.createElement("div");t.className=`zr-menu-item ${e.danger?"zr-menu-item-danger":""}`;let n=document.createElement("span");n.className="zr-menu-icon",n.textContent=e.icon,t.appendChild(n);let o=document.createElement("span");return o.className="zr-menu-text",o.textContent=e.text,t.appendChild(o),t.addEventListener("click",r=>{r.stopPropagation(),e.onClick(),V()}),t}function bt(e,t){let n=document.createElement("div");n.className="zr-menu-submenu-container";let o=document.createElement("div");o.className="zr-menu-item";let r=document.createElement("span");r.className="zr-menu-icon",r.textContent=e.icon,o.appendChild(r);let i=document.createElement("span");i.className="zr-menu-text",i.textContent=e.text,o.appendChild(i);let a=document.createElement("span");a.className="zr-menu-arrow",a.textContent="\u203A",o.appendChild(a),n.appendChild(o);let s=document.createElement("div");s.className="zr-menu-submenu",e.submenu.forEach(c=>{let d=document.createElement("div");d.className="zr-menu-item";let u=document.createElement("span");u.className="zr-menu-color-dot",u.style.backgroundColor=yt(c.color),d.appendChild(u);let g=document.createElement("span");g.className="zr-menu-text",g.textContent=c.label,d.appendChild(g),d.addEventListener("click",f=>{f.stopPropagation(),t(c.color),V()}),s.appendChild(d)}),n.appendChild(s);let l;return n.addEventListener("mouseenter",()=>{clearTimeout(l),s.classList.add("zr-submenu-show")}),n.addEventListener("mouseleave",()=>{l=window.setTimeout(()=>{s.classList.remove("zr-submenu-show")},300)}),n}function yt(e){return{yellow:"#fbbf24",blue:"#60a5fa",green:"#34d399",red:"#f87171"}[e]||"#fbbf24"}function V(){let e=document.getElementById(me);e&&e.remove(),document.removeEventListener("click",Ue)}function Ue(e){let t=document.getElementById(me);t&&!t.contains(e.target)&&V()}var be="zr-toast-container";function X(e){let{message:t,type:n="info",duration:o=3e3,action:r}=e,i=document.getElementById(be);i||(i=document.createElement("div"),i.id=be,i.className="zr-toast-container",document.body.appendChild(i));let a=document.createElement("div");a.className=`zr-toast zr-toast-${n}`;let s=document.createElement("span");s.className="zr-toast-icon",s.textContent=xt(n),a.appendChild(s);let l=document.createElement("span");if(l.className="zr-toast-message",l.textContent=t,a.appendChild(l),r){let d=document.createElement("button");d.className="zr-toast-action",d.textContent=r.text,d.addEventListener("click",()=>{r.onClick(),fe(a)}),a.appendChild(d)}let c=document.createElement("button");c.className="zr-toast-close",c.innerHTML="\u2715",c.addEventListener("click",()=>{fe(a)}),a.appendChild(c),i.appendChild(a),requestAnimationFrame(()=>{a.classList.add("zr-toast-show")}),o>0&&setTimeout(()=>{fe(a)},o)}function fe(e){e.classList.remove("zr-toast-show"),e.classList.add("zr-toast-hide"),setTimeout(()=>{e.remove();let t=document.getElementById(be);t&&t.children.length===0&&t.remove()},300)}function xt(e){return{success:"\u2713",error:"\u2715",info:"\u2139",warning:"\u26A0"}[e]}var h={success:(e,t)=>{X({message:e,type:"success",duration:t})},error:(e,t)=>{X({message:e,type:"error",duration:t})},info:(e,t)=>{X({message:e,type:"info",duration:t})},warning:(e,t)=>{X({message:e,type:"warning",duration:t})}};var Ze="zr-shortcuts-help",ve=[],xe=!1;function C(e){ve.push(e)}function Je(){document.addEventListener("keydown",vt),console.log("[Z-Reader] \u5FEB\u6377\u952E\u7CFB\u7EDF\u5DF2\u521D\u59CB\u5316")}function vt(e){let t=e.target;if((t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.contentEditable==="true")&&e.key!=="Escape"&&!(e.altKey&&e.key==="?"))return;let n=ve.find(o=>o.key.toLowerCase()===e.key.toLowerCase()&&!!o.ctrl===e.ctrlKey&&!!o.alt===e.altKey&&!!o.shift===e.shiftKey&&!!o.meta===e.metaKey);n&&(e.preventDefault(),e.stopPropagation(),n.action())}function Ke(){if(xe){ye();return}let e=document.createElement("div");e.className="zr-shortcuts-backdrop",e.addEventListener("click",ye);let t=document.createElement("div");t.id=Ze,t.className="zr-shortcuts-help";let n=document.createElement("div");n.className="zr-shortcuts-header";let o=document.createElement("h2");o.textContent="\u2328\uFE0F \u952E\u76D8\u5FEB\u6377\u952E",n.appendChild(o);let r=document.createElement("button");r.className="zr-shortcuts-close",r.innerHTML="\u2715",r.addEventListener("click",ye),n.appendChild(r),t.appendChild(n);let i=Ct(ve),a=document.createElement("div");a.className="zr-shortcuts-content",Object.entries(i).forEach(([s,l])=>{let c=document.createElement("div");c.className="zr-shortcuts-section";let d=document.createElement("h3");d.className="zr-shortcuts-category",d.textContent=s,c.appendChild(d);let u=document.createElement("div");u.className="zr-shortcuts-list",l.forEach(g=>{let f=document.createElement("div");f.className="zr-shortcut-item";let w=document.createElement("span");w.className="zr-shortcut-desc",w.textContent=g.description,f.appendChild(w);let x=document.createElement("div");x.className="zr-shortcut-keys",x.innerHTML=wt(g),f.appendChild(x),u.appendChild(f)}),c.appendChild(u),a.appendChild(c)}),t.appendChild(a),document.body.appendChild(e),document.body.appendChild(t),xe=!0}function ye(){let e=document.getElementById(Ze),t=document.querySelector(".zr-shortcuts-backdrop");e&&e.remove(),t&&t.remove(),xe=!1}function Ct(e){let t={};return e.forEach(n=>{t[n.category]||(t[n.category]=[]),t[n.category].push(n)}),t}function wt(e){let t=[];return e.ctrl&&t.push("<kbd>Ctrl</kbd>"),e.alt&&t.push("<kbd>Alt</kbd>"),e.shift&&t.push("<kbd>Shift</kbd>"),e.meta&&t.push("<kbd>\u2318</kbd>"),t.push(`<kbd>${e.key.toUpperCase()}</kbd>`),t.join(" + ")}async function ee(e){let t=Xe();if(t.length===0){h.warning("\u5F53\u524D\u9875\u9762\u6CA1\u6709\u9AD8\u4EAE\u53EF\u5BFC\u51FA");return}let n,o,r;switch(e.format){case"markdown":n=Et(t,e),o=`highlights-${Q()}.md`,r="text/markdown";break;case"text":n=Ye(t,e),o=`highlights-${Q()}.txt`,r="text/plain";break;case"html":n=Qe(t,e),o=`highlights-${Q()}.html`,r="text/html";break;case"json":n=zt(t,e),o=`highlights-${Q()}.json`,r="application/json";break;default:h.error("\u4E0D\u652F\u6301\u7684\u5BFC\u51FA\u683C\u5F0F");return}Tt(n,o,r),h.success(`\u5DF2\u5BFC\u51FA ${t.length} \u6761\u9AD8\u4EAE\u4E3A ${e.format.toUpperCase()}`)}async function Ve(){let e=Xe();if(e.length===0){h.warning("\u5F53\u524D\u9875\u9762\u6CA1\u6709\u9AD8\u4EAE\u53EF\u590D\u5236");return}let t=Qe(e,{format:"html",includeNotes:!0,groupByColor:!0}),n=Ye(e,{format:"text",includeNotes:!0,groupByColor:!0});try{let o=new ClipboardItem({"text/html":new Blob([t],{type:"text/html"}),"text/plain":new Blob([n],{type:"text/plain"})});await navigator.clipboard.write([o]),h.success(`\u5DF2\u590D\u5236 ${e.length} \u6761\u9AD8\u4EAE\u5230\u526A\u8D34\u677F`)}catch{try{await navigator.clipboard.writeText(n),h.success(`\u5DF2\u590D\u5236 ${e.length} \u6761\u9AD8\u4EAE\u5230\u526A\u8D34\u677F\uFF08\u7EAF\u6587\u672C\uFF09`)}catch{h.error("\u590D\u5236\u5931\u8D25")}}}function Xe(){return Array.from(document.querySelectorAll("[data-zr-highlight-id]")).map(t=>({id:t.dataset.zrHighlightId||"",text:t.textContent||"",note:t.dataset.note,color:Ht(t.style.backgroundColor),element:t}))}function Et(e,t){let n=`# ${document.title}

`;if(n+=`**\u6765\u6E90**: ${window.location.href}
`,n+=`**\u5BFC\u51FA\u65F6\u95F4**: ${new Date().toLocaleString("zh-CN")}
`,n+=`**\u9AD8\u4EAE\u6570\u91CF**: ${e.length}

`,n+=`---

`,t.groupByColor){let o=we(e);Object.entries(o).forEach(([r,i])=>{i.length!==0&&(n+=`## ${Ce(r)} ${$(r)} (${i.length})

`,i.forEach((a,s)=>{n+=`### ${s+1}. ${a.text.slice(0,50)}...

`,n+=`> ${a.text}

`,t.includeNotes&&a.note&&(n+=`**\u{1F4DD} \u7B14\u8BB0**: ${a.note}

`),n+=`---

`}))})}else e.forEach((o,r)=>{n+=`## ${r+1}. ${Ce(o.color)} ${o.text.slice(0,50)}...

`,n+=`> ${o.text}

`,t.includeNotes&&o.note&&(n+=`**\u{1F4DD} \u7B14\u8BB0**: ${o.note}

`),n+=`---

`});return n}function Ye(e,t){let n=`${document.title}
`;if(n+=`${"=".repeat(document.title.length)}

`,n+=`\u6765\u6E90: ${window.location.href}
`,n+=`\u5BFC\u51FA\u65F6\u95F4: ${new Date().toLocaleString("zh-CN")}
`,n+=`\u9AD8\u4EAE\u6570\u91CF: ${e.length}

`,n+=`${"-".repeat(80)}

`,t.groupByColor){let o=we(e);Object.entries(o).forEach(([r,i])=>{i.length!==0&&(n+=`\u3010${$(r)}\u3011(${i.length} \u6761)

`,i.forEach((a,s)=>{n+=`${s+1}. ${a.text}
`,t.includeNotes&&a.note&&(n+=`   \u{1F4DD} ${a.note}
`),n+=`
`}),n+=`${"-".repeat(80)}

`)})}else e.forEach((o,r)=>{n+=`${r+1}. [${$(o.color)}] ${o.text}
`,t.includeNotes&&o.note&&(n+=`   \u{1F4DD} ${o.note}
`),n+=`
`});return n}function Qe(e,t){let n=`<!DOCTYPE html>
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
`;if(t.groupByColor){let o=we(e);Object.entries(o).forEach(([r,i])=>{i.length!==0&&(n+=`<h2 class="section-title">${Ce(r)} ${$(r)} (${i.length})</h2>
`,i.forEach(a=>{n+=`<div class="highlight">
          <span class="color-badge color-${r}">${$(r)}</span>
          <div class="highlight-text">${Y(a.text)}</div>`,t.includeNotes&&a.note&&(n+=`<div class="highlight-note">\u{1F4DD} ${Y(a.note)}</div>`),n+=`</div>
`}))})}else e.forEach(o=>{n+=`<div class="highlight">
        <span class="color-badge color-${o.color}">${$(o.color)}</span>
        <div class="highlight-text">${Y(o.text)}</div>`,t.includeNotes&&o.note&&(n+=`<div class="highlight-note">\u{1F4DD} ${Y(o.note)}</div>`),n+=`</div>
`});return n+=`
</body>
</html>`,n}function zt(e,t){let n={title:document.title,url:window.location.href,exportTime:new Date().toISOString(),count:e.length,highlights:e.map(o=>({id:o.id,text:o.text,note:t.includeNotes?o.note:void 0,color:o.color}))};return JSON.stringify(n,null,2)}function we(e){let t={yellow:[],blue:[],green:[],red:[]};return e.forEach(n=>{t[n.color]&&t[n.color].push(n)}),t}function Tt(e,t,n){let o=new Blob([e],{type:`${n};charset=utf-8`}),r=URL.createObjectURL(o),i=document.createElement("a");i.href=r,i.download=t,i.click(),URL.revokeObjectURL(r)}function kt(e){let t=parseInt(e.slice(1,3),16),n=parseInt(e.slice(3,5),16),o=parseInt(e.slice(5,7),16);return`${t}, ${n}, ${o}`}function Ht(e){for(let[t,n]of Object.entries(b))if(e===n||e.includes(kt(n)))return t;return"yellow"}function $(e){return{yellow:"\u9EC4\u8272",blue:"\u84DD\u8272",green:"\u7EFF\u8272",red:"\u7EA2\u8272"}[e]||"\u672A\u77E5"}function Ce(e){return{yellow:"\u{1F7E1}",blue:"\u{1F535}",green:"\u{1F7E2}",red:"\u{1F534}"}[e]||"\u26AA"}function Y(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}function Q(){let e=new Date;return`${e.getFullYear()}${String(e.getMonth()+1).padStart(2,"0")}${String(e.getDate()).padStart(2,"0")}_${String(e.getHours()).padStart(2,"0")}${String(e.getMinutes()).padStart(2,"0")}`}var q="zr-stats-panel-container",P=!1,R=[],O={stats:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',export:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',close:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',jump:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>',note:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',toggle:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>'};function et(){ze(),B()}function ze(){let e=document.getElementById(q);if(!e){e=document.createElement("div"),e.id=q;let t=e.attachShadow({mode:"open"}),n=document.createElement("style");fetch(chrome.runtime.getURL("dist/styles.css")).then(o=>o.text()).then(o=>{n.textContent=o}),t.appendChild(n),document.body.appendChild(e)}return e}function St(e){let n=ze().shadowRoot,o=n.querySelector(".zr-stats-toggle");o||(o=document.createElement("button"),o.className="zr-stats-toggle",o.onclick=Te,n.appendChild(o)),o.innerHTML=`
    ${O.toggle}
    <span class="zr-stats-badge" style="display: ${e>0?"flex":"none"}">${e}</span>
  `}function Te(){P?Ee():tt()}function tt(){if(P)return;let t=ze().shadowRoot,n=document.createElement("div");n.className="zr-stats-panel";let o=document.createElement("div");o.className="zr-stats-header",o.innerHTML=`<h3>${O.stats} \u9AD8\u4EAE\u7EDF\u8BA1</h3>`;let r=document.createElement("div");r.className="zr-header-actions";let i=document.createElement("button");i.className="zr-icon-btn",i.innerHTML=O.export,i.title="\u5BFC\u51FA\u9AD8\u4EAE",i.onclick=g=>{g.stopPropagation(),Lt(i)};let a=document.createElement("button");a.className="zr-icon-btn",a.innerHTML=O.close,a.onclick=Ee,r.append(i,a),o.appendChild(r),n.appendChild(o);let s=Nt(),l=document.createElement("div");l.className="zr-stats-cards",[{label:"Total",value:s.total,color:"var(--zr-blue)"},{label:"Notes",value:s.withNotes,color:"#a78bfa"},{label:"Yellow",value:s.byColor.yellow,color:"#facc15"}].forEach(g=>{let f=document.createElement("div");f.className="zr-stats-card",f.innerHTML=`
      <div class="zr-stats-value" style="color: ${g.color}">${g.value}</div>
      <div class="zr-stats-label">${g.label}</div>
    `,l.appendChild(f)}),n.appendChild(l);let d=document.createElement("div");d.className="zr-stats-list-container",d.innerHTML='<div class="zr-stats-list-header">\u9AD8\u4EAE\u5217\u8868</div>';let u=document.createElement("div");u.className="zr-stats-list",R.length===0?u.innerHTML='<div class="zr-stats-empty">\u5F53\u524D\u9875\u9762\u6CA1\u6709\u9AD8\u4EAE\u5185\u5BB9</div>':R.forEach(g=>{let f=document.createElement("div");f.className="zr-stats-item";let w=document.createElement("div");w.className="zr-stats-indicator",w.style.backgroundColor=g.style.backgroundColor;let x=document.createElement("div");if(x.className="zr-stats-item-content",x.innerHTML=`<div class="zr-stats-item-text">${g.textContent||""}</div>`,g.dataset.note){let E=document.createElement("div");E.className="zr-stats-item-note",E.innerHTML=`${O.note} <span>${g.dataset.note}</span>`,x.appendChild(E)}let z=document.createElement("div");z.className="zr-stats-jump",z.innerHTML=O.jump,f.append(w,x,z),f.onclick=()=>{g.scrollIntoView({behavior:"smooth",block:"center"}),g.style.outline="2px solid var(--zr-blue)",g.style.outlineOffset="2px",setTimeout(()=>{g.style.outline="none"},2e3),Ee()},u.appendChild(f)}),d.appendChild(u),n.appendChild(d),t.appendChild(n),P=!0}function Ee(){let e=document.getElementById(q);if(!e)return;let t=e.shadowRoot?.querySelector(".zr-stats-panel");t&&(t.classList.add("zr-panel-fade-out"),setTimeout(()=>{t.remove(),P=!1},200))}function B(){if(R=Array.from(document.querySelectorAll("[data-zr-highlight-id]")),St(R.length),P){let t=document.getElementById(q)?.shadowRoot?.querySelector(".zr-stats-panel");t&&(t.remove(),P=!1,tt())}}function Nt(){let e={total:R.length,byColor:{yellow:0,blue:0,green:0,red:0},withNotes:0};return R.forEach(t=>{let n=t.getAttribute("data-zr-color")||"yellow";e.byColor[n]!==void 0&&e.byColor[n]++,t.dataset.note&&e.withNotes++}),e}function Lt(e){let n=document.getElementById(q)?.shadowRoot;if(!n)return;let o=document.createElement("div");o.className="zr-export-menu",[{icon:"\u{1F4DD}",text:"Markdown",action:()=>ee({format:"markdown",includeNotes:!0,groupByColor:!0})},{icon:"\u{1F4C4}",text:"\u7EAF\u6587\u672C",action:()=>ee({format:"text",includeNotes:!0,groupByColor:!0})},{icon:"\u{1F310}",text:"HTML",action:()=>ee({format:"html",includeNotes:!0,groupByColor:!0})},{type:"divider"},{icon:"\u{1F4CB}",text:"\u590D\u5236\u5BCC\u6587\u672C",action:Ve}].forEach(s=>{if(s.type==="divider"){let l=document.createElement("div");l.className="zr-export-divider",o.appendChild(l)}else{let l=document.createElement("div");l.className="zr-export-item",l.innerHTML=`<span>${s.icon}</span> <span>${s.text}</span>`,l.onclick=()=>{s.action(),o.remove()},o.appendChild(l)}});let i=e.getBoundingClientRect();o.style.top=`${i.bottom+8}px`,o.style.right=`${window.innerWidth-i.right}px`,n.appendChild(o);let a=s=>{o.contains(s.target)||(o.remove(),document.removeEventListener("mousedown",a))};setTimeout(()=>document.addEventListener("mousedown",a),0)}var ot="zr-settings-panel",rt="zr-user-preferences",He={highlightOpacity:60,highlightBorderStyle:"none",highlightBorderWidth:0,customColors:{yellow:b.yellow,blue:b.blue,green:b.green,red:b.red},highlightFontWeight:"normal",highlightFontStyle:"normal",highlightTextDecoration:"none",enableAnimations:!0,enableSounds:!1,shortcutsEnabled:!0,autoSave:!0},p={...He},ke=!1;function it(){Bt(),Ne(),console.log("[Z-Reader] \u8BBE\u7F6E\u7CFB\u7EDF\u5DF2\u521D\u59CB\u5316")}function Se(){if(ke)return;let e=document.createElement("div");e.className="zr-settings-backdrop",e.addEventListener("click",te);let t=document.createElement("div");t.id=ot,t.className="zr-settings-panel";let n=document.createElement("div");n.className="zr-settings-header";let o=document.createElement("h2");o.textContent="\u2699\uFE0F \u8BBE\u7F6E",n.appendChild(o);let r=document.createElement("button");r.className="zr-settings-close",r.innerHTML="\u2715",r.addEventListener("click",te),n.appendChild(r),t.appendChild(n);let i=document.createElement("div");i.className="zr-settings-content",i.appendChild(It()),i.appendChild($t()),i.appendChild(Ot()),i.appendChild(Pt()),t.appendChild(i);let a=document.createElement("div");a.className="zr-settings-footer";let s=document.createElement("button");s.className="zr-settings-btn zr-settings-btn-secondary",s.textContent="\u6062\u590D\u9ED8\u8BA4",s.addEventListener("click",At),a.appendChild(s);let l=document.createElement("button");l.className="zr-settings-btn zr-settings-btn-primary",l.textContent="\u4FDD\u5B58\u8BBE\u7F6E",l.addEventListener("click",()=>{at(),Ne(),te(),h.success("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58")}),a.appendChild(l),t.appendChild(a),document.body.appendChild(e),document.body.appendChild(t),requestAnimationFrame(()=>{t.classList.add("zr-settings-panel-show")}),ke=!0}function te(){let e=document.getElementById(ot),t=document.querySelector(".zr-settings-backdrop");e&&(e.classList.remove("zr-settings-panel-show"),setTimeout(()=>e.remove(),300)),t&&t.remove(),ke=!1}function It(){let e=document.createElement("div");e.className="zr-settings-section";let t=document.createElement("h3");t.className="zr-settings-section-title",t.textContent="\u{1F3A8} \u9AD8\u4EAE\u6837\u5F0F",e.appendChild(t);let n=nt("\u900F\u660E\u5EA6","highlightOpacity",0,100,p.highlightOpacity,l=>{p.highlightOpacity=l,H()});e.appendChild(n);let o=ne("\u8FB9\u6846\u6837\u5F0F","highlightBorderStyle",[{value:"none",label:"\u65E0\u8FB9\u6846"},{value:"solid",label:"\u5B9E\u7EBF"},{value:"dashed",label:"\u865A\u7EBF"},{value:"dotted",label:"\u70B9\u7EBF"}],p.highlightBorderStyle,l=>{p.highlightBorderStyle=l,H()});if(e.appendChild(o),p.highlightBorderStyle!=="none"){let l=nt("\u8FB9\u6846\u7C97\u7EC6","highlightBorderWidth",0,3,p.highlightBorderWidth,c=>{p.highlightBorderWidth=c,H()});e.appendChild(l)}let r=document.createElement("div");r.className="zr-settings-group";let i=document.createElement("label");i.className="zr-settings-label",i.textContent="\u81EA\u5B9A\u4E49\u989C\u8272",r.appendChild(i);let a=document.createElement("div");a.className="zr-settings-color-grid",Object.entries(p.customColors).forEach(([l,c])=>{let d=document.createElement("div");d.className="zr-settings-color-item";let u=document.createElement("input");u.type="color",u.value=c,u.addEventListener("change",f=>{p.customColors[l]=f.target.value,H()}),d.appendChild(u);let g=document.createElement("span");g.textContent=Mt(l),d.appendChild(g),a.appendChild(d)}),r.appendChild(a),e.appendChild(r);let s=Rt();return e.appendChild(s),e}function $t(){let e=document.createElement("div");e.className="zr-settings-section";let t=document.createElement("h3");t.className="zr-settings-section-title",t.textContent="\u270D\uFE0F \u5B57\u4F53\u6837\u5F0F",e.appendChild(t);let n=ne("\u5B57\u4F53\u7C97\u7EC6","highlightFontWeight",[{value:"normal",label:"\u6B63\u5E38"},{value:"bold",label:"\u52A0\u7C97"}],p.highlightFontWeight,i=>{p.highlightFontWeight=i,H()});e.appendChild(n);let o=ne("\u5B57\u4F53\u6837\u5F0F","highlightFontStyle",[{value:"normal",label:"\u6B63\u5E38"},{value:"italic",label:"\u659C\u4F53"}],p.highlightFontStyle,i=>{p.highlightFontStyle=i,H()});e.appendChild(o);let r=ne("\u6587\u672C\u88C5\u9970","highlightTextDecoration",[{value:"none",label:"\u65E0"},{value:"underline",label:"\u4E0B\u5212\u7EBF"}],p.highlightTextDecoration,i=>{p.highlightTextDecoration=i,H()});return e.appendChild(r),e}function Ot(){let e=document.createElement("div");e.className="zr-settings-section";let t=document.createElement("h3");t.className="zr-settings-section-title",t.textContent="\u2728 \u52A8\u753B\u548C\u6548\u679C",e.appendChild(t);let n=oe("\u542F\u7528\u52A8\u753B\u6548\u679C","enableAnimations",p.enableAnimations,r=>{p.enableAnimations=r});e.appendChild(n);let o=oe("\u542F\u7528\u58F0\u97F3\u53CD\u9988","enableSounds",p.enableSounds,r=>{p.enableSounds=r});return e.appendChild(o),e}function Pt(){let e=document.createElement("div");e.className="zr-settings-section";let t=document.createElement("h3");t.className="zr-settings-section-title",t.textContent="\u{1F527} \u5176\u4ED6\u8BBE\u7F6E",e.appendChild(t);let n=oe("\u542F\u7528\u952E\u76D8\u5FEB\u6377\u952E","shortcutsEnabled",p.shortcutsEnabled,r=>{p.shortcutsEnabled=r});e.appendChild(n);let o=oe("\u81EA\u52A8\u4FDD\u5B58\u9AD8\u4EAE","autoSave",p.autoSave,r=>{p.autoSave=r});return e.appendChild(o),e}function nt(e,t,n,o,r,i){let a=document.createElement("div");a.className="zr-settings-group";let s=document.createElement("label");s.className="zr-settings-label",s.htmlFor=t,s.textContent=e,a.appendChild(s);let l=document.createElement("div");l.className="zr-settings-slider-container";let c=document.createElement("input");c.type="range",c.id=t,c.className="zr-settings-slider",c.min=n.toString(),c.max=o.toString(),c.value=r.toString();let d=document.createElement("span");return d.className="zr-settings-slider-value",d.textContent=`${r}${o===100?"%":""}`,c.addEventListener("input",u=>{let g=parseInt(u.target.value);d.textContent=`${g}${o===100?"%":""}`,i(g)}),l.appendChild(c),l.appendChild(d),a.appendChild(l),a}function ne(e,t,n,o,r){let i=document.createElement("div");i.className="zr-settings-group";let a=document.createElement("label");a.className="zr-settings-label",a.htmlFor=t,a.textContent=e,i.appendChild(a);let s=document.createElement("select");return s.id=t,s.className="zr-settings-select",s.value=o,n.forEach(l=>{let c=document.createElement("option");c.value=l.value,c.textContent=l.label,l.value===o&&(c.selected=!0),s.appendChild(c)}),s.addEventListener("change",l=>{r(l.target.value)}),i.appendChild(s),i}function oe(e,t,n,o){let r=document.createElement("div");r.className="zr-settings-group zr-settings-checkbox-group";let i=document.createElement("input");i.type="checkbox",i.id=t,i.className="zr-settings-checkbox",i.checked=n,i.addEventListener("change",s=>{o(s.target.checked)});let a=document.createElement("label");return a.className="zr-settings-checkbox-label",a.htmlFor=t,a.textContent=e,r.appendChild(i),r.appendChild(a),r}function Rt(){let e=document.createElement("div");e.className="zr-settings-preview",e.id="zr-settings-preview";let t=document.createElement("div");t.className="zr-settings-preview-label",t.textContent="\u9884\u89C8\u6548\u679C",e.appendChild(t);let n=document.createElement("div");return n.className="zr-settings-preview-content",n.innerHTML=`
    <p>\u8FD9\u662F\u4E00\u6BB5\u793A\u4F8B\u6587\u672C\u3002<span class="preview-highlight preview-yellow">\u9EC4\u8272\u9AD8\u4EAE\u793A\u4F8B</span>\uFF0C<span class="preview-highlight preview-blue">\u84DD\u8272\u9AD8\u4EAE\u793A\u4F8B</span>\uFF0C<span class="preview-highlight preview-green">\u7EFF\u8272\u9AD8\u4EAE\u793A\u4F8B</span>\uFF0C<span class="preview-highlight preview-red">\u7EA2\u8272\u9AD8\u4EAE\u793A\u4F8B</span>\u3002</p>
  `,e.appendChild(n),H(),e}function H(){let e=document.getElementById("zr-settings-preview");if(!e)return;e.querySelectorAll(".preview-highlight").forEach(n=>{let o=n,r=o.classList.contains("preview-yellow")?"yellow":o.classList.contains("preview-blue")?"blue":o.classList.contains("preview-green")?"green":"red";o.style.backgroundColor=p.customColors[r],o.style.opacity=(p.highlightOpacity/100).toString(),o.style.borderStyle=p.highlightBorderStyle,o.style.borderWidth=`${p.highlightBorderWidth}px`,o.style.borderColor=G(p.customColors[r],-20),o.style.fontWeight=p.highlightFontWeight,o.style.fontStyle=p.highlightFontStyle,o.style.textDecoration=p.highlightTextDecoration})}function Bt(){try{let e=localStorage.getItem(rt);e&&(p={...He,...JSON.parse(e)})}catch(e){console.error("[Z-Reader] \u52A0\u8F7D\u8BBE\u7F6E\u5931\u8D25:",e)}}function at(){try{localStorage.setItem(rt,JSON.stringify(p))}catch(e){console.error("[Z-Reader] \u4FDD\u5B58\u8BBE\u7F6E\u5931\u8D25:",e),h.error("\u4FDD\u5B58\u8BBE\u7F6E\u5931\u8D25")}}function Ne(){let e=document.getElementById("zr-custom-styles")||document.createElement("style");e.id="zr-custom-styles";let{customColors:t,highlightOpacity:n,highlightBorderStyle:o,highlightBorderWidth:r,highlightFontWeight:i,highlightFontStyle:a,highlightTextDecoration:s}=p;e.textContent=`
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
      border-color: ${G(t.yellow,-20)} !important;
    }
    
    [data-zr-highlight-id][style*="rgb(147, 197, 253)"] {
      background-color: ${t.blue} !important;
      border-color: ${G(t.blue,-20)} !important;
    }
    
    [data-zr-highlight-id][style*="rgb(134, 239, 172)"] {
      background-color: ${t.green} !important;
      border-color: ${G(t.green,-20)} !important;
    }
    
    [data-zr-highlight-id][style*="rgb(252, 165, 165)"] {
      background-color: ${t.red} !important;
      border-color: ${G(t.red,-20)} !important;
    }
  `,document.head.contains(e)||document.head.appendChild(e),p.enableAnimations?document.body.classList.remove("zr-no-animations"):document.body.classList.add("zr-no-animations")}function At(){confirm("\u786E\u5B9A\u8981\u6062\u590D\u6240\u6709\u8BBE\u7F6E\u4E3A\u9ED8\u8BA4\u503C\u5417\uFF1F")&&(p={...He},at(),Ne(),te(),setTimeout(()=>Se(),300),h.success("\u5DF2\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E"))}function G(e,t){let n=parseInt(e.replace("#",""),16),o=Math.round(2.55*t),r=(n>>16)+o,i=(n>>8&255)+o,a=(n&255)+o;return"#"+(16777216+(r<255?r<1?0:r:255)*65536+(i<255?i<1?0:i:255)*256+(a<255?a<1?0:a:255)).toString(16).slice(1)}function Mt(e){return{yellow:"\u9EC4\u8272",blue:"\u84DD\u8272",green:"\u7EFF\u8272",red:"\u7EA2\u8272"}[e]||e}var Dt="ZReaderOffline",jt=1,st="highlights",S="pending_operations",N=null,_=navigator.onLine,qt=null;async function ct(){try{N=await Gt(),_t(),Ft(),console.log("[Z-Reader] \u79BB\u7EBF\u652F\u6301\u5DF2\u521D\u59CB\u5316"),_||h.info("\u5F53\u524D\u5904\u4E8E\u79BB\u7EBF\u6A21\u5F0F\uFF0C\u6570\u636E\u5C06\u5728\u8054\u7F51\u540E\u540C\u6B65")}catch(e){console.error("[Z-Reader] \u521D\u59CB\u5316\u79BB\u7EBF\u652F\u6301\u5931\u8D25:",e)}}function Gt(){return new Promise((e,t)=>{let n=indexedDB.open(Dt,jt);n.onerror=()=>t(n.error),n.onsuccess=()=>e(n.result),n.onupgradeneeded=o=>{let r=o.target.result;if(!r.objectStoreNames.contains(st)){let i=r.createObjectStore(st,{keyPath:"id"});i.createIndex("articleId","articleId",{unique:!1}),i.createIndex("synced","synced",{unique:!1})}r.objectStoreNames.contains(S)||r.createObjectStore(S,{keyPath:"id"}).createIndex("timestamp","timestamp",{unique:!1})}})}function _t(){window.addEventListener("online",()=>{_=!0,h.success("\u5DF2\u6062\u590D\u7F51\u7EDC\u8FDE\u63A5\uFF0C\u5F00\u59CB\u540C\u6B65\u6570\u636E"),dt()}),window.addEventListener("offline",()=>{_=!1,h.warning("\u7F51\u7EDC\u5DF2\u65AD\u5F00\uFF0C\u5207\u6362\u5230\u79BB\u7EBF\u6A21\u5F0F")})}function Ft(){qt=window.setInterval(()=>{_&&dt()},3e4)}async function Wt(){if(!N)throw new Error("Database not initialized");return new Promise((e,t)=>{let i=N.transaction([S],"readonly").objectStore(S).index("timestamp").getAll();i.onsuccess=()=>e(i.result),i.onerror=()=>t(i.error)})}async function lt(e){if(!N)throw new Error("Database not initialized");return new Promise((t,n)=>{let i=N.transaction([S],"readwrite").objectStore(S).delete(e);i.onsuccess=()=>t(),i.onerror=()=>n(i.error)})}async function Ut(e){if(!N)throw new Error("Database not initialized");return e.retries++,new Promise((t,n)=>{let i=N.transaction([S],"readwrite").objectStore(S).put(e);i.onsuccess=()=>t(),i.onerror=()=>n(i.error)})}async function dt(){if(!(!_||!N))try{let e=await Wt();if(e.length===0)return;console.log(`[Z-Reader] \u5F00\u59CB\u540C\u6B65 ${e.length} \u4E2A\u5F85\u5904\u7406\u64CD\u4F5C`);let t=0,n=0;for(let o of e)try{if(o.retries>=5){console.warn(`[Z-Reader] \u64CD\u4F5C ${o.id} \u91CD\u8BD5\u6B21\u6570\u8FC7\u591A\uFF0C\u8DF3\u8FC7`),await lt(o.id),n++;continue}await Zt(o),await lt(o.id),t++}catch(r){console.error("[Z-Reader] \u540C\u6B65\u64CD\u4F5C\u5931\u8D25:",o,r),await Ut(o),n++}t>0&&h.success(`\u5DF2\u540C\u6B65 ${t} \u4E2A\u64CD\u4F5C`),n>0&&h.warning(`${n} \u4E2A\u64CD\u4F5C\u540C\u6B65\u5931\u8D25\uFF0C\u5C06\u7A0D\u540E\u91CD\u8BD5`)}catch(e){console.error("[Z-Reader] \u540C\u6B65\u5931\u8D25:",e)}}async function Zt(e){let t="http://127.0.0.1:21897/api";switch(e.type){case"create":if(!(await fetch(`${t}/highlights`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e.data)})).ok)throw new Error("Create failed");break;case"update":if(!(await fetch(`${t}/highlights/${e.data.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(e.data)})).ok)throw new Error("Update failed");break;case"delete":if(!(await fetch(`${t}/highlights/${e.data.id}`,{method:"DELETE"})).ok)throw new Error("Delete failed");break}}var M=null;async function Jt(){it(),ct(),Je(),Vt(),et();try{let e=await De(window.location.href);if(e.articleId){M=e.articleId;for(let t of e.highlights)se(t.id,t.text??"",t.color??"yellow",{startOffset:t.startOffset??void 0,endOffset:t.endOffset??void 0,paragraphIndex:t.paragraphIndex??void 0,note:t.note??void 0});B()}}catch{}}document.addEventListener("mouseup",()=>{let e=window.getSelection();!e||e.isCollapsed||!e.toString().trim()||requestAnimationFrame(()=>{let t=window.getSelection();if(!t||t.isCollapsed)return;let o=t.getRangeAt(0).getBoundingClientRect(),r=o.left+o.width/2+window.scrollX,i=o.top+window.scrollY;Ae(r,i,async a=>{a.type==="highlight"?await A(a.color):a.type==="save"?await gt():a.type==="note"&&await Ie()})})});async function Le(){if(M)return!0;try{return M=(await Me({url:window.location.href,title:document.title})).id,!0}catch(e){return console.error("[Z-Reader] \u4FDD\u5B58\u6587\u7AE0\u5931\u8D25:",e),!1}}async function A(e){let t=ae(e);if(t){if(!await Le()){h.error("\u4FDD\u5B58\u6587\u7AE0\u5931\u8D25\uFF0C\u65E0\u6CD5\u521B\u5EFA\u9AD8\u4EAE");return}try{let n=await de({articleId:M,text:t.text,color:e,startOffset:t.startOffset,endOffset:t.endOffset,paragraphIndex:t.paragraphIndex});t.updateId(n.id),h.success("\u9AD8\u4EAE\u5DF2\u521B\u5EFA"),B()}catch(n){console.error("[Z-Reader] \u521B\u5EFA\u9AD8\u4EAE\u5931\u8D25:",n),h.error("\u521B\u5EFA\u9AD8\u4EAE\u5931\u8D25")}}}async function gt(){await Le()?h.success("\u6587\u7AE0\u5DF2\u4FDD\u5B58\u5230 Z-Reader"):h.error("\u4FDD\u5B58\u6587\u7AE0\u5931\u8D25")}async function Ie(){let t=window.getSelection()?.toString().trim()||"";pe({selectedText:t,initialColor:"yellow",onSave:async(n,o,r)=>{let i=ae(o);if(i){if(!await Le()){h.error("\u4FDD\u5B58\u6587\u7AE0\u5931\u8D25\uFF0C\u65E0\u6CD5\u521B\u5EFA\u9AD8\u4EAE");return}try{let a=await de({articleId:M,text:i.text,note:n,color:o,startOffset:i.startOffset,endOffset:i.endOffset,paragraphIndex:i.paragraphIndex});i.updateId(a.id),le(a.id,n);for(let s of r)await ue(a.id,s);h.success("\u7B14\u8BB0\u9AD8\u4EAE\u5DF2\u521B\u5EFA"),B()}catch(a){console.error("[Z-Reader] \u521B\u5EFA\u5E26\u7B14\u8BB0\u9AD8\u4EAE\u5931\u8D25:",a),h.error("\u521B\u5EFA\u7B14\u8BB0\u9AD8\u4EAE\u5931\u8D25")}}},onCancel:()=>{}})}document.addEventListener("zr-highlight-click",e=>{let t=e.detail;if(!t?.id||!t.element)return;let o=t.element.getBoundingClientRect(),r=o.left+window.scrollX,i=o.bottom+window.scrollY+5;We({x:r,y:i,highlightId:t.id,note:t.note,onDelete:()=>{Oe(t.id),je(t.id).then(()=>{h.success("\u9AD8\u4EAE\u5DF2\u5220\u9664"),B()}).catch(a=>{console.error("[Z-Reader] \u5220\u9664\u9AD8\u4EAE\u5931\u8D25:",a),h.error("\u5220\u9664\u9AD8\u4EAE\u5931\u8D25")})},onEditNote:async()=>{let a=[];try{a=await he(t.id)}catch(s){console.error("Failed to fetch highlight tags:",s)}pe({highlightId:t.id,initialNote:t.note,selectedText:t.text,initialColor:t.color,initialTags:a,onSave:async(s,l,c)=>{try{await ge(t.id,{note:s,color:l}),le(t.id,s),Pe(t.id,l);let u=(await he(t.id)).map(g=>g.id);for(let g of u)c.includes(g)||await _e(t.id,g);for(let g of c)u.includes(g)||await ue(t.id,g);h.success("\u7B14\u8BB0\u5DF2\u66F4\u65B0")}catch(d){console.error("[Z-Reader] \u66F4\u65B0\u7B14\u8BB0\u5931\u8D25:",d),h.error("\u66F4\u65B0\u7B14\u8BB0\u5931\u8D25")}},onCancel:()=>{}})},onChangeColor:async a=>{try{await ge(t.id,{color:a});let s=document.querySelector(`[data-zr-highlight-id="${t.id}"]`);s&&(s.style.backgroundColor=Kt(a)),h.success("\u989C\u8272\u5DF2\u66F4\u6539")}catch(s){console.error("[Z-Reader] \u66F4\u6539\u989C\u8272\u5931\u8D25:",s),h.error("\u66F4\u6539\u989C\u8272\u5931\u8D25")}},onCopy:()=>{navigator.clipboard.writeText(t.text).then(()=>{h.success("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F")}).catch(()=>{h.error("\u590D\u5236\u5931\u8D25")})}})});function Kt(e){return b[e]||b.yellow}chrome.runtime.onMessage.addListener(e=>{if(e.type==="ARTICLE_SAVED"&&(M=e.payload.id),e.type==="HIGHLIGHT_SELECTION"){let t=e.payload.color||"yellow";A(t)}if(e.type==="HIGHLIGHT_WITH_NOTE"&&Ie(),e.type==="SHOW_TOAST"){let{message:t,type:n}=e.payload;n==="success"?h.success(t):n==="error"?h.error(t):n==="warning"?h.warning(t):h.info(t)}if(e.type==="SEARCH_IN_ZREADER"){let t=e.payload.text;h.info(`\u641C\u7D22\u529F\u80FD\u5F00\u53D1\u4E2D: "${t}"`)}});function Vt(){C({key:"1",alt:!0,description:"\u9EC4\u8272\u9AD8\u4EAE",category:"\u9AD8\u4EAE\u64CD\u4F5C",action:()=>A("yellow")}),C({key:"2",alt:!0,description:"\u84DD\u8272\u9AD8\u4EAE",category:"\u9AD8\u4EAE\u64CD\u4F5C",action:()=>A("blue")}),C({key:"3",alt:!0,description:"\u7EFF\u8272\u9AD8\u4EAE",category:"\u9AD8\u4EAE\u64CD\u4F5C",action:()=>A("green")}),C({key:"4",alt:!0,description:"\u7EA2\u8272\u9AD8\u4EAE",category:"\u9AD8\u4EAE\u64CD\u4F5C",action:()=>A("red")}),C({key:"n",alt:!0,description:"\u6DFB\u52A0\u7B14\u8BB0\u9AD8\u4EAE",category:"\u9AD8\u4EAE\u64CD\u4F5C",action:Ie}),C({key:"s",alt:!0,description:"\u4FDD\u5B58\u6587\u7AE0\u5230 Z-Reader",category:"\u6587\u7AE0\u64CD\u4F5C",action:gt}),C({key:"h",alt:!0,description:"\u5207\u6362\u9AD8\u4EAE\u7EDF\u8BA1\u9762\u677F",category:"\u9762\u677F\u64CD\u4F5C",action:Te}),C({key:",",alt:!0,description:"\u6253\u5F00\u8BBE\u7F6E\u9762\u677F",category:"\u9762\u677F\u64CD\u4F5C",action:Se}),C({key:"?",alt:!0,description:"\u663E\u793A\u5FEB\u6377\u952E\u5E2E\u52A9",category:"\u5E2E\u52A9",action:Ke}),console.log("[Z-Reader] \u5DF2\u6CE8\u518C 9 \u4E2A\u5FEB\u6377\u952E")}Jt();})();
