import express from 'express';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const ORDERS = {
  'ORD-101': { order_id:'ORD-101', customer:'Priya Sharma', product:'Vitamin C Serum (30ml)', value:699, status:'Out for Delivery', courier:'BlueDart', tracking_id:'BD-982103', notes:'Expected by 6 PM today' },
  'ORD-102': { order_id:'ORD-102', customer:'Rahul Verma', product:'Hydrating Sunscreen SPF 50', value:499, status:'Delivered', courier:'Delhivery', tracking_id:'DL-441029', notes:'Delivered 14 days ago' },
  'ORD-103': { order_id:'ORD-103', customer:'Ananya Patel', product:'Green Tea Face Wash + Toner', value:850, status:'Processing', courier:null, tracking_id:null, notes:'Ordered 3 hours ago. Eligible for cancellation' }
};

const POLICY = {
  brand: 'Aura Skincare is a premium organic Indian skincare brand focused on simple, effective skincare products made with thoughtfully selected ingredients.',
  shipping: 'Free delivery on orders above ₹499. Orders below ₹499 have a ₹50 shipping fee. Standard delivery takes 3–5 business days.',
  returns: 'Returns are accepted within 7 days of delivery for unopened, unused products in original packaging. Damaged or defective products must be reported within 48 hours of delivery with photos for replacement.',
  cancellation: 'Orders can be cancelled only while their status is Processing. Once an order is Shipped or Out for Delivery, it cannot be cancelled; customers may refuse delivery at the doorstep.',
  cod: 'Cash on Delivery is available for orders up to ₹2,500. Customers can pay by cash or UPI at the doorstep.'
};

function normalizeOrderId(text='') {
  const m = String(text).toUpperCase().match(/ORD[\s-]?(\d{3})/);
  return m ? `ORD-${m[1]}` : null;
}
function get_order_details(orderId) {
  const id = normalizeOrderId(orderId || '');
  return id && ORDERS[id] ? { found:true, ...ORDERS[id] } : { found:false, order_id:id || orderId || null };
}
function classify(text='') {
  const t = text.toLowerCase();
  if (/cancel|cancellation/.test(t)) return 'CANCELLATION';
  if (/return|refund|opened|damaged|defective|replacement/.test(t)) return 'RETURN_REFUND';
  if (/cod|cash on delivery|cash|upi/.test(t)) return 'PAYMENT_COD';
  if (/shipping fee|delivery fee|shipping charge|delivery charge|how long.*deliver|standard delivery/.test(t)) return 'SHIPPING_POLICY';
  if ((/where|track|tracking|status|delivered|delivery/.test(t)) && (/order|ord/.test(t))) return 'ORDER_TRACKING';
  return 'GENERAL';
}
function deterministicReply(text, contextOrderId = null) {
  const t = text.toLowerCase();
  const intent = classify(text);
  // Resolve explicit IDs first; otherwise carry the most recent valid order through
  // conversational references such as "this order", "it" or "that order".
  const explicitId = normalizeOrderId(text);
  const refersToCurrentOrder = /\b(this|that|the|my)\s+order\b|\bit\b/i.test(text);
  const id = explicitId || ((intent === 'CANCELLATION' || intent === 'ORDER_TRACKING' || refersToCurrentOrder) ? contextOrderId : null);
  const order = id ? get_order_details(id) : null;

  if (/^(thanks?|thank you|okay thanks?|ok thanks?|great thanks?)[.! ]*$/i.test(text.trim())) {
    return { reply:"You're welcome! I'm happy to help with anything else related to Aura Skincare.", intent:'COURTESY', order_id:contextOrderId, tool_result:null };
  }

  if ((intent === 'ORDER_TRACKING' || intent === 'CANCELLATION') && !id) {
    return { reply:'Please share your order ID, for example ORD-101, so I can check it for you.', intent, order_id:null, tool_result:null };
  }
  if (id && !order?.found) {
    return { reply:`I couldn't locate an order with ${id}. Could you please repeat or verify the order ID?`, intent, order_id:id, tool_result:order };
  }
  if (intent === 'ORDER_TRACKING' && order?.found) {
    let reply = `${order.order_id} is currently ${order.status}.`;
    if (order.courier) reply += ` It is with ${order.courier}`;
    if (order.tracking_id) reply += ` and the tracking ID is ${order.tracking_id}.`;
    else reply += '.';
    if (order.notes) reply += ` ${order.notes}.`;
    return { reply, intent, order_id:id, tool_result:order };
  }
  if (intent === 'CANCELLATION' && order?.found) {
    const reply = order.status === 'Processing'
      ? `${order.order_id} is currently Processing, so it is eligible for cancellation.`
      : `${order.order_id} is currently ${order.status}, so it can no longer be cancelled. If it is out for delivery, you may refuse it at the doorstep.`;
    return { reply, intent, order_id:id, tool_result:order };
  }
  if (/20\s*days|twenty\s*days/.test(t) && /open|opened|return|refund/.test(t)) {
    return { reply:"That request falls outside Aura Skincare's return policy. Returns are accepted within 7 days only for unopened, unused products in original packaging.", intent:'RETURN_REFUND', order_id:id, tool_result:order };
  }
  if (/flight|hotel|weather|movie|cricket|train ticket|book me/.test(t)) {
    return { reply:"I'm Aria from Aura Skincare, so I can only help with Aura Skincare products, policies, and orders.", intent:'OUT_OF_SCOPE', order_id:id, tool_result:order };
  }
  if (intent === 'SHIPPING_POLICY') return { reply:POLICY.shipping, intent, order_id:id, tool_result:order };
  if (intent === 'PAYMENT_COD') return { reply:POLICY.cod, intent, order_id:id, tool_result:order };
  if (intent === 'RETURN_REFUND' && /damaged|defective/.test(t)) return { reply:'Damaged or defective products must be reported within 48 hours of delivery with photos for replacement.', intent, order_id:id, tool_result:order };
  if (intent === 'RETURN_REFUND' && /return|refund|opened|unused|unopened/.test(t)) return { reply:POLICY.returns, intent, order_id:id, tool_result:order };
  return null;
}

async function geminiReply(messages) {
  if (!process.env.GEMINI_API_KEY) return null;
  const conversation = messages.slice(-10).map(m => `${m.role === 'user' ? 'Customer' : 'Aria'}: ${m.text}`).join('\n');
  const prompt = `You are Aria, Aura Skincare's friendly, professional and concise Indian customer support specialist.\n\nBRAND: ${POLICY.brand}\nSHIPPING: ${POLICY.shipping}\nRETURNS: ${POLICY.returns}\nCANCELLATION: ${POLICY.cancellation}\nCOD: ${POLICY.cod}\n\nConversation:\n${conversation}\n\nRules: Only discuss Aura Skincare products, policies and orders. Never invent an order, policy, refund, discount, delivery promise or action. If information is missing, ask for it. Keep the spoken response to 1-3 short sentences. Return only Aria's response.`;
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-goog-api-key':process.env.GEMINI_API_KEY },
      body:JSON.stringify({
        contents:[{ parts:[{ text:prompt }] }],
        generationConfig:{ temperature:0.2, maxOutputTokens:180, thinkingConfig:{ thinkingLevel:'low' } }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini API:', response.status, data?.error?.message || data);
      return null;
    }
    return data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || null;
  } catch (error) {
    console.error('Gemini network error:', error.message);
    return null;
  }
}

app.get('/api/health', (req,res) => res.json({ ok:true, gemini_configured:Boolean(process.env.GEMINI_API_KEY), model:'gemini-3.8-flash' }));
app.get('/api/orders', (req,res) => res.json(Object.values(ORDERS)));

app.post('/api/chat', async (req,res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const latest = [...messages].reverse().find(m => m.role === 'user')?.text?.trim();
  if (!latest) return res.status(400).json({ error:'Message required' });
  // The full message history is sent by the browser, so derive call-level context
  // without storing customer data on the server.
  const priorUsers = messages.filter(m => m.role === 'user').slice(0, -1);
  const contextOrderId = [...priorUsers].reverse().map(m => normalizeOrderId(m.text)).find(Boolean) || null;
  const fixed = deterministicReply(latest, contextOrderId);
  if (fixed) return res.json(fixed);
  const ai = await geminiReply(messages);
  const reply = ai || "I can help with Aura Skincare orders, shipping, returns, cancellations and payment policies. Could you tell me what you need help with?";
  return res.json({ reply, intent:classify(latest), order_id:normalizeOrderId(latest), tool_result:null, ai_fallback:!ai });
});

app.post('/api/summary', (req,res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const users = messages.filter(m => m.role === 'user');
  const assistants = messages.filter(m => m.role === 'assistant');

  if (!users.length) {
    return res.json({ customer_intent:'GENERAL', order_id:null, resolution_status:'INCOMPLETE', call_summary:'No conversation was recorded.' });
  }

  // Summaries are call-level: do not let a final "thanks" erase the actual reason
  // for the call. Preserve the most recent meaningful intent and any order discussed.
  const userTurns = users.map(m => ({ text:m.text || '', intent:classify(m.text || ''), order_id:normalizeOrderId(m.text || '') }));
  const meaningful = userTurns.filter(x => x.intent !== 'GENERAL');
  const primary = meaningful.at(-1) || userTurns[0];
  const orderId = [...userTurns].reverse().map(x => x.order_id).find(Boolean) || null;
  const lastAssistant = assistants.at(-1)?.text || '';
  const unresolved = /share your order id|couldn't locate|repeat or verify|could you tell me/i.test(lastAssistant);

  const topics = [];
  for (const turn of meaningful) if (!topics.includes(turn.intent)) topics.push(turn.intent);
  let summary;
  if (orderId && ORDERS[orderId]) {
    const order = ORDERS[orderId];
    if (topics.includes('CANCELLATION')) {
      summary = `Customer discussed ${orderId} and asked about cancellation. The order is ${order.status}. ${order.status === 'Processing' ? 'It is eligible for cancellation.' : 'It cannot be cancelled at this stage; if out for delivery, the customer may refuse it at the doorstep.'}`;
    } else if (topics.includes('ORDER_TRACKING')) {
      summary = `Customer asked about the status of ${orderId}. The order is ${order.status}${order.notes ? ` and ${order.notes.toLowerCase()}` : ''}.`;
    } else {
      summary = `Customer discussed ${orderId}. The order is currently ${order.status}.`;
    }
  } else if (topics.length) {
    summary = `Customer contacted Aura Skincare about ${topics.map(x => x.replaceAll('_',' ').toLowerCase()).join(' and ')}. ${lastAssistant}`;
  } else {
    summary = `Customer had a general Aura Skincare conversation. ${lastAssistant}`;
  }

  res.json({
    customer_intent: primary.intent,
    order_id: orderId,
    resolution_status: unresolved ? 'NEEDS_FOLLOW_UP' : 'RESOLVED',
    call_summary: summary
  });
});

app.listen(PORT, () => console.log(`Aura Voice Agent running at http://localhost:${PORT}`));
