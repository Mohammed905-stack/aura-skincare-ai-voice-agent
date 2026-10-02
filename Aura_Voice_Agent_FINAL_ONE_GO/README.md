# Aria — Aura Skincare AI Voice CX Agent

A browser-based AI customer-support voice agent built for the Datastraw AI + Tech Intern assessment. Aria can speak with customers, answer Aura Skincare policy questions, retrieve mock order information through `get_order_details`, enforce guardrails, handle invalid requests gracefully, and generate a transcript plus structured post-call outcome.

## Features
- Browser microphone voice conversation (Chrome/Edge Web Speech API)
- Spoken Text-to-Speech replies with preference for an `en-IN` system voice
- Live Listening → Thinking → Speaking state indicator
- Text testing interface
- `get_order_details(order_id)` mock tool
- ORD-101 / ORD-102 / ORD-103 sample order helper
- Shipping, return/refund, cancellation and COD policy guardrails
- Invalid order ID and out-of-scope handling
- Gemini 3.8 Flash for natural general Aura conversations, with deterministic fallbacks for critical policy/order flows
- Chronological transcript
- Structured post-call JSON outcome
- Responsive premium Aura Skincare UI

## Architecture

`Microphone → Browser Speech-to-Text → Node/Express API → deterministic guardrails + order tool → Gemini 3.8 Flash when useful → browser Text-to-Speech → transcript + post-call summary`

The critical assessment paths (order lookup, cancellation, returns, shipping, COD, invalid IDs and out-of-scope requests) are deterministic. This prevents an LLM outage or unexpected generation from causing incorrect customer promises. Gemini is used to make general Aura conversations more natural while remaining constrained by the brand prompt.

## Local setup
1. Install Node.js 18+.
2. Extract/open this folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.
5. Run `npm start`.
6. Open `http://localhost:3000` in Chrome or Edge.
7. Click **Start Call**, allow microphone access, and speak.

## Environment
```env
GEMINI_API_KEY=your_key_here
PORT=3000
```
Never commit `.env`. It is excluded by `.gitignore`.

## Suggested evaluator tests
- “Where is my order ORD-101?”
- “Can you cancel ORD-103?”
- “Where is my order ORD-999?”
- “I bought this 20 days ago and opened it. Can I return it?”
- “Can you book me a flight to Goa?”
- “Do you offer cash on delivery?”
- “What is your shipping policy?”

## How I Think
### 1. Why this architecture and stack?
I chose a small Node.js/Express backend with a browser frontend because the assignment needs a public browser experience rather than telephony. Browser speech APIs keep the voice layer simple, while the backend keeps the API key private and centralizes policies, order lookup and AI reasoning. I deliberately made important order and policy flows deterministic so customer-facing facts do not depend entirely on an LLM.

### 2. Most difficult part and solution
The hardest part was coordinating microphone recognition, asynchronous backend responses and spoken output without the agent listening to its own voice. I handle this as explicit states: Listening, Thinking and Speaking. Recognition pauses while Aria speaks and resumes after speech finishes.

### 3. What would I improve with one more week?
I would first move from browser STT/TTS to a realtime streaming voice stack with stronger Indian voice quality, lower latency and true barge-in. I would also add automated conversation tests and persist anonymized call analytics.

### 4. What changes for 1,000 conversations/day?
I would use a managed deployment with autoscaling, a persistent order/service database, authentication for customer data, centralized logging/monitoring, rate limits, retries and observability for model/tool latency. I would also add evaluation datasets for policy accuracy and a human escalation path for unresolved cases.

## Deployment
Deploy the Node application on a platform such as Render or Railway. Add `GEMINI_API_KEY` as a secret environment variable in the deployment platform. Do not upload `.env` to GitHub.

## Short approach note
I built Aria as a modular browser voice pipeline: speech recognition captures the customer request, a Node backend applies Aura's policies and order lookup tool, and Gemini is used for natural responses where deterministic business logic is not sufficient. Critical order and policy paths are guarded by explicit rules, and each completed call produces a transcript and structured outcome.
