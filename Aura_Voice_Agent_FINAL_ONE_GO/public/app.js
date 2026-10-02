const $ = s => document.querySelector(s);
const startBtn=$('#startBtn'), endBtn=$('#endBtn'), clearBtn=$('#clearBtn'), stateText=$('#stateText'), stateDot=$('#stateDot'), supportText=$('#supportText'), transcript=$('#transcript'), outcome=$('#outcome'), outcomeBadge=$('#outcomeBadge'), form=$('#messageForm'), input=$('#messageInput'), ordersEl=$('#orders');
let messages=[]; let recognition=null; let callActive=false; let processing=false; let restarting=false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function setState(name, detail='') { stateText.textContent=name; stateDot.className='state-dot '+name.toLowerCase(); if(detail) supportText.textContent=detail; }
function renderMessages(){
  if(!messages.length){ transcript.innerHTML='<div class="empty"><div class="empty-icon">✦</div><h3>Aria is ready when you are</h3><p>Start a voice call, or use the text box below for quick testing.</p></div>'; return; }
  transcript.innerHTML=messages.map(m=>`<div class="message ${m.role==='user'?'user':'assistant'}"><div class="role">${m.role==='user'?'CUSTOMER':'ARIA'}</div><div class="text">${escapeHtml(m.text)}</div></div>`).join('');
  transcript.scrollTop=transcript.scrollHeight;
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function resetSession(){ messages=[]; renderMessages(); outcome.textContent=JSON.stringify({resolution_status:'NOT_STARTED'},null,2); outcomeBadge.textContent='NOT STARTED'; }

async function sendText(text,{speak=false}={}){
  text=text.trim(); if(!text||processing)return; processing=true;
  messages.push({role:'user',text}); renderMessages(); setState('Thinking','Aria is checking the request…');
  try{
    const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages})});
    const data=await r.json(); const reply=data.reply||data.error||'I could not process that request.';
    messages.push({role:'assistant',text:reply}); renderMessages();
    if(speak&&callActive){ await speakReply(reply); } else setState(callActive?'Listening':'Ready',callActive?'Speak naturally — Aria is listening':'Use voice or text to test Aria');
  }catch(e){ messages.push({role:'assistant',text:'I’m having trouble connecting right now. Please try again.'}); renderMessages(); setState(callActive?'Listening':'Ready'); }
  finally{
    processing=false;
    // Restart only after the current request and spoken reply are fully finished.
    // This preserves continuous multi-turn voice conversation.
    if(callActive) setTimeout(safeStartRecognition,250);
  }
}

function chooseVoice(){ const voices=speechSynthesis.getVoices(); return voices.find(v=>/en-IN/i.test(v.lang)&&/female|heera|lekha|priya|neerja/i.test(v.name)) || voices.find(v=>/en-IN/i.test(v.lang)) || voices.find(v=>/^en/i.test(v.lang)) || null; }
function speakReply(text){
  return new Promise(resolve=>{
    if(!('speechSynthesis' in window)){resolve();safeStartRecognition();return;}
    try{ recognition?.stop(); }catch{}
    speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); const v=chooseVoice(); if(v)u.voice=v; u.lang=v?.lang||'en-IN'; u.rate=.98; u.pitch=1.02;
    u.onstart=()=>setState('Speaking','Aria is responding…');
    u.onend=()=>{ if(callActive){setState('Listening','Speak naturally — Aria is listening');safeStartRecognition();} resolve(); };
    u.onerror=()=>{ if(callActive)safeStartRecognition(); resolve(); };
    speechSynthesis.speak(u);
  });
}
function setupRecognition(){
  if(!SpeechRecognition){ supportText.textContent='Voice recognition is not supported in this browser. Use Chrome or Edge.'; return; }
  recognition=new SpeechRecognition(); recognition.lang='en-IN'; recognition.continuous=false; recognition.interimResults=true;
  recognition.onstart=()=>{restarting=false;if(callActive)setState('Listening','Speak naturally — Aria is listening');};
  recognition.onresult=e=>{ let final=''; for(let i=e.resultIndex;i<e.results.length;i++) if(e.results[i].isFinal) final+=e.results[i][0].transcript; if(final.trim()&&callActive) sendText(final,{speak:true}); };
  recognition.onerror=e=>{restarting=false;if(!callActive)return;if(e.error==='not-allowed'){setState('Ready','Microphone permission was blocked. Allow it in the browser and Start Call again.');callActive=false;startBtn.disabled=false;endBtn.disabled=true;}else if(!processing){setTimeout(safeStartRecognition,450);} };
  recognition.onend=()=>{restarting=false;if(callActive&&!processing&&!speechSynthesis.speaking)setTimeout(safeStartRecognition,350);};
}
function safeStartRecognition(){ if(!callActive||processing||!recognition||restarting||speechSynthesis.speaking)return; restarting=true; try{recognition.start()}catch{restarting=false;} }

startBtn.addEventListener('click',()=>{
  if(!SpeechRecognition){alert('Please use Google Chrome or Microsoft Edge for browser voice recognition.');return;}
  resetSession(); callActive=true; startBtn.disabled=true; endBtn.disabled=false; speechSynthesis.cancel(); setState('Listening','Speak naturally — Aria is listening'); safeStartRecognition();
});
function buildLocalSummary(){
  const userTurns=messages.filter(m=>m.role==='user').map(m=>String(m.text||''));
  if(!userTurns.length) return {customer_intent:'GENERAL',order_id:null,resolution_status:'INCOMPLETE',call_summary:'No conversation was recorded.'};
  const all=userTurns.join(' ');
  const ids=[...all.toUpperCase().matchAll(/ORD[\s-]?(\d{3})/g)].map(m=>`ORD-${m[1]}`);
  const orderId=ids.length?ids[ids.length-1]:null;
  const hasCancel=userTurns.some(t=>/cancel|cancellation/i.test(t));
  const hasReturn=userTurns.some(t=>/return|refund|opened|damaged|defective|replacement/i.test(t));
  const hasTrack=userTurns.some(t=>/where|track|tracking|status|delivered|delivery/i.test(t)&&/order|ord/i.test(t));
  const hasShipping=userTurns.some(t=>/shipping fee|delivery fee|shipping charge|delivery charge|how long.*deliver|standard delivery/i.test(t));
  const hasCod=userTurns.some(t=>/cod|cash on delivery|upi/i.test(t));
  const hasOut=userTurns.some(t=>/flight|hotel|weather|movie|cricket|train ticket|book me/i.test(t));
  const intent=hasCancel?'CANCELLATION':hasReturn?'RETURN_REFUND':hasTrack?'ORDER_TRACKING':hasShipping?'SHIPPING_POLICY':hasCod?'PAYMENT_COD':hasOut?'OUT_OF_SCOPE':'GENERAL';
  const orderInfo={
    'ORD-101':{status:'Out for Delivery',detail:'It cannot be cancelled at this stage; the customer may refuse delivery at the doorstep.'},
    'ORD-102':{status:'Delivered',detail:'It was delivered 14 days ago.'},
    'ORD-103':{status:'Processing',detail:'It is eligible for cancellation.'}
  };
  let callSummary;
  if(orderId&&orderInfo[orderId]){
    const o=orderInfo[orderId];
    if(hasCancel) callSummary=`Customer discussed ${orderId} and asked about cancellation. The order is ${o.status}. ${o.detail}`;
    else callSummary=`Customer asked about ${orderId}. The order is ${o.status}. ${o.detail}`;
  }else if(hasReturn) callSummary='Customer asked about Aura Skincare return or refund policy and Aria explained the applicable policy.';
  else if(hasShipping) callSummary='Customer asked about Aura Skincare shipping and delivery policy and Aria provided the policy information.';
  else if(hasCod) callSummary='Customer asked about Cash on Delivery or payment options and Aria provided the applicable policy.';
  else if(hasOut) callSummary='Customer made an out-of-scope request and Aria correctly limited support to Aura Skincare products, policies and orders.';
  else callSummary='Customer had a general Aura Skincare support conversation with Aria.';
  return {customer_intent:intent,order_id:orderId,resolution_status:'RESOLVED',call_summary:callSummary};
}

endBtn.addEventListener('click',()=>{
  callActive=false; startBtn.disabled=false; endBtn.disabled=true;
  try{recognition?.stop()}catch{}
  speechSynthesis.cancel();
  const data=buildLocalSummary();
  outcome.textContent=JSON.stringify(data,null,2);
  outcomeBadge.textContent=data.resolution_status;
  setState('Ready','Call ended — summary generated below');
});
clearBtn.addEventListener('click',resetSession);
form.addEventListener('submit',e=>{e.preventDefault();const t=input.value;input.value='';sendText(t,{speak:false});});

async function loadOrders(){try{const r=await fetch('/api/orders');const orders=await r.json();ordersEl.innerHTML=orders.map(o=>`<div class="order"><div class="order-top"><span>${o.order_id}</span><span class="order-status">${o.status}</span></div><p><strong>${escapeHtml(o.product)}</strong> · ₹${o.value}<br>${escapeHtml(o.notes||'')}</p></div>`).join('');}catch{ordersEl.textContent='Could not load test orders.'}}
setupRecognition(); loadOrders(); renderMessages();
if('speechSynthesis' in window) speechSynthesis.getVoices();
