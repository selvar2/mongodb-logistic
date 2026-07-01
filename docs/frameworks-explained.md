# ResilioChain — The Technology Behind It, Explained Simply 🧰

*Why we chose each framework, what it does for the business, and where it lives in our code.*

> This guide is written for **everyone** — leadership, business stakeholders, and
> non‑technical readers. No coding knowledge required. Each section answers four
> questions: **What is it? Why did we pick it? What does the business get? Where is it
> in the app?**

---

## The 30‑second summary

ResilioChain watches for supply‑chain shocks (a typhoon, a port closure, sanctions) and, in
seconds, finds a **safe, allowed, reliable backup supplier**. To do that well, it needs a
few specialist tools working together:

| The technology | In one line | The business payoff |
|---|---|---|
| **LangGraph** | The "team manager" that runs our 5 AI helpers in the right order | Reliable, repeatable decisions — never a chaotic free‑for‑all |
| **AWS Bedrock (Claude)** | The "brain" that reads and reasons about messy real‑world text | Understands a disruption alert like a human analyst would |
| **Bedrock AgentCore Runtime** | The secure "engine room" that hosts the whole thing on AWS | Enterprise‑grade hosting, security, and scale |
| **MongoDB `$graphLookup`** | Traces the "ripple effect" of a disruption | Instantly sees *every* order a single supplier can sink |
| **MongoDB `$vectorSearch`** | Finds suppliers by *meaning*, not exact keywords | Discovers backups a keyword search would miss |
| **Atlas autoEmbed** | Lets the database handle the AI "translation" automatically | Less code to maintain, fewer things to break |
| **Voyage AI** | The specialist that turns text into searchable "meaning" | High‑quality matches, best‑in‑class search relevance |
| **GraphRAG** | Answers plain‑English questions about the disruption | Ask "what does Typhoon Yagi affect?" and get a grounded answer |
| **MCP server (FastMCP) + fallback** | An industry‑standard, plug‑in way to expose our tools | Future‑proof, interoperable, and never goes down in a demo |

The rest of this document explains each one properly, with a real example.

---

## 1. LangGraph — the team manager 🧠

**What it is (in plain terms).**
Our app isn't one big robot — it's a **team of five AI helpers** (Supervisor, Impact
Assessor, Sourcing, Compliance, Planner), each with one job. LangGraph is the **manager**
that decides who works next, passes the problem down the line like a relay race, and knows
when to loop back or stop.

**Why we chose it.**
When you let AI agents talk freely, they wander, repeat themselves, or get stuck. LangGraph
turns that into a **clear flowchart with rules**: "after the Sourcing helper finds
candidates, always send them to Compliance; if Compliance rejects everyone, try again — but
no more than 3 times." Predictable every single time.

**What the business gets.**
- **Reliability** — the same alert always follows the same disciplined process.
- **Auditability** — you can point to exactly which helper made which decision and when.
- **Safety rails** — built‑in limits stop it looping forever or spending without control.

**Business example.**
> Typhoon Yagi alert arrives → LangGraph sends it to the **Supervisor** ("how bad is
> this?") → then the **Impact Assessor** ("23 orders, 48,200 units at risk") → then
> **Sourcing** ("here are 3 backups") → then **Compliance** ("reject the unethical one") →
> if a backup fails ethics, LangGraph **automatically loops back** to Sourcing to find the
> next one — up to 3 tries — then hands the winner to the **Planner**. That whole relay is
> LangGraph.

**Where it is in our code.**
- `backend/app/agents/graph.py` — the flowchart itself: the five helpers are wired together
  with the "if this, go there" rules (`build_graph()`), including the retry loop and the
  stop conditions.

---

## 2. AWS Bedrock (Claude) — the reasoning brain 🤖

**What it is.**
Bedrock is Amazon's secure service for running top‑tier AI models. We use it to run
**Claude** (from Anthropic) — the model that actually *reads and understands* language.
When a disruption alert says *"Typhoon Yagi has closed the Port of Tanjung Pelepas for 72
hours,"* Claude is what grasps that this is severe, which supplier is hit, and what it means.

**Why we chose it.**
- **Enterprise trust** — it runs inside AWS, our data stays in our cloud, no consumer AI service involved.
- **No vendor lock‑in** — we wrote a thin "adapter" so we could swap the AI vendor later without rewriting the app.
- **It keeps working even offline** — if the AI service is unreachable, the app falls back to a built‑in deterministic stand‑in so a live demo never crashes.

**What the business gets.**
Human‑level understanding of messy, real‑world text — at machine speed and scale, with
enterprise security and a graceful safety net.

**Business example.**
> The Supervisor helper hands the raw alert to Claude and asks, *"How severe is this and
> who's affected?"* Claude replies in a structured form the app can act on. We even use a
> **stronger Claude model** for the hardest thinking (Supervisor + Planner) and a **faster,
> cheaper model** for the routine helpers — balancing quality and cost, just like staffing a
> team with seniors and juniors.

**Where it is in our code.**
- `backend/app/llm/bedrock.py` — the single doorway to the AI. Every helper asks questions
  through here (`complete_json`, `complete_text`), so the vendor is swappable and the
  offline fallback lives in one place.
- `backend/app/config.py` — where we assign the stronger vs. faster model per helper
  (`bedrock_model_supervisor`, `bedrock_model_planner`, etc.).

---

## 3. Bedrock AgentCore Runtime — the engine room 🏭

**What it is.**
AgentCore Runtime is Amazon's **managed hosting for AI agents**. Think of it as the secure,
professionally‑run building where our whole AI team lives and takes requests — instead of us
renting a bare server and wiring up the plumbing ourselves.

**Why we chose it.**
- **Security done right** — it uses an AWS "execution role" for permissions, so we don't scatter secret keys and passwords around.
- **Scales on demand** — handles one alert or a thousand without us re‑architecting.
- **Purpose‑built for agents** — it's designed for exactly this kind of multi‑step AI workflow.

**What the business gets.**
Enterprise‑grade hosting, security, and scale — the difference between a hackathon prototype
and something an IT department would actually approve for production.

**Business example.**
> When our app is deployed to AgentCore, an external system just calls it with
> `{"alert_text": "Typhoon Yagi has closed the port…"}` and gets back the full mitigation
> decision — winner supplier, confidence score, cost impact — as a clean summary. AgentCore
> handles the security, packaging, and scaling around that call.

**Where it is in our code.**
- `backend/agentcore_app.py` — the official "front door" for AgentCore. It wraps our
  LangGraph workflow so AWS can host and invoke it (`@app.entrypoint … invoke(payload)`).
- `backend/requirements-agentcore.txt` — the exact ingredients list for that hosted engine.

---

## 4. MongoDB `$graphLookup` — tracing the ripple effect 💥

**What it is.**
`$graphLookup` is a MongoDB feature that **follows chains of connections** inside your data.
In supply chains, one broken link ripples outward: a down supplier → the orders that depend
on it → the products those orders feed. `$graphLookup` walks that chain for you in a single
step.

**Why we chose it.**
The "ripple effect" is the whole point of supply‑chain risk. Doing this by hand (query the
supplier, then its orders, then loop again…) is slow and error‑prone. MongoDB does the
traversal *inside the database*, where the data already lives — fast and complete.

**What the business gets.**
The moment a supplier goes down, you instantly see **every order at risk and the exact total
you must re‑source** — no manual chasing, nothing missed.

**Business example.**
> SUP‑001 (Chang Electronics) is down. `$graphLookup` traces every active order that
> *depends on* SUP‑001, gathers the affected part numbers, and **sums the shortfall to
> exactly 48,200 units** — the number the rest of the workflow must cover.

**Where it is in our code.**
- `backend/app/mcp_tools/blast_radius_query.py` — the "blast radius" tool. It runs the
  `$graphLookup` over orders → suppliers to find impacted orders and total required capacity.
- `backend/app/graphrag.py` — a second, multi‑hop `$graphLookup` used by the plain‑English
  Q&A feature (see GraphRAG below).

---

## 5. MongoDB `$vectorSearch` — finding suppliers by *meaning* 🔎

**What it is.**
A normal search matches exact words. `$vectorSearch` matches **meaning**. It understands that
a supplier described as *"automotive microcontroller assembly"* is a strong match for a need
for *"car‑grade MCU components"* — even though the words differ.

**Why we chose it.**
Real supplier catalogs never use identical wording. A keyword search would miss perfectly
good backups. Meaning‑based search finds the *right* candidates, not just the
identically‑worded ones — and MongoDB runs it right alongside our business data.

**What the business gets.**
Better backup suppliers discovered faster, with a critical safety rule baked in: **we filter
by real capacity at the database level**, so a supplier that literally cannot cover the
volume is never even suggested — that rule is enforced by code, not left to the AI.

**Business example.**
> After the shortfall is known (48,200 units), the Sourcing helper asks `$vectorSearch`:
> *"Find suppliers similar to what we need — but ONLY ones that can make at least 48,200
> units a month, and NOT the supplier that just went down, and NOT in the disrupted region."*
> It returns the top 3 candidates, each with a similarity score.

**Where it is in our code.**
- `backend/app/mcp_tools/supplier_vector_search.py` — meaning‑based supplier search with a
  hard, code‑enforced capacity filter and region/supplier exclusions.
- `backend/app/mcp_tools/compliance_rag_query.py` — the same `$vectorSearch` technique used
  to pull the most relevant compliance‑policy passages for a supplier.
- `backend/app/mcp_tools/_vs.py` — a shared helper that runs these searches and patiently
  retries if we hit the free‑tier rate limit.

---

## 6. Atlas autoEmbed (Automated Embedding) — let the database do the AI translation ⚙️

**What it is.**
To search by *meaning*, text first has to be turned into a list of numbers that captures its
meaning (an "embedding" — see the next section). **autoEmbed** means MongoDB Atlas does that
translation **automatically**, both when we store a supplier and when we search — we never
have to run it ourselves.

**Why we chose it.**
The alternative ("explicit" mode) means *we* generate every embedding, store it, keep it in
sync, and never let it drift. That's more code and more ways to break. With autoEmbed, the
database owns it — simpler and more reliable. (We kept the manual mode available as a backup
option, controlled by one setting.)

**What the business gets.**
Less custom code to maintain, fewer moving parts, and no risk of the search "translations"
going stale — the platform guarantees they're always current.

**Business example.**
> When we load a new supplier, we just save its description text. Atlas + Voyage
> automatically turn it into searchable meaning behind the scenes. When Sourcing searches
> later, Atlas translates the *query* the same way, so both sides speak the same language.

**Where it is in our code.**
- `backend/app/db/indexes.py` — where we define the vector indexes as `type: "autoEmbed"`,
  telling Atlas to manage the embeddings with Voyage AI automatically.
- `backend/app/config.py` — the single switch (`EMBEDDING_MODE = autoembed | explicit`) that
  chooses automatic vs. manual mode.

---

## 7. Voyage AI — the specialist that turns words into "meaning" 🧬

**What it is.**
Voyage AI is a best‑in‑class **embedding provider** — the specialist that actually performs
the "text → meaning‑numbers" translation that powers `$vectorSearch`. MongoDB partners with
Voyage and uses it under the hood for autoEmbed.

**Why we chose it.**
The quality of your search is only as good as the quality of these "meaning" translations.
Voyage's models are highly rated for retrieval accuracy, and because Atlas integrates them
natively, we get top‑tier relevance without gluing together a separate service.

**What the business gets.**
More accurate supplier and policy matches — the search genuinely understands the domain, so
the backups it surfaces are the *right* ones.

**Business example.**
> Voyage is what lets *"automotive‑grade MCU and sensor components"* find *"car electronics
> controller manufacturing"* as a match. It's the intelligence behind the "search by meaning"
> magic.

**Where it is in our code.**
- `backend/app/db/indexes.py` — Voyage (`voyage-4`) is named as the model Atlas uses for
  autoEmbed.
- `backend/app/mcp_tools/_embed.py` — the direct Voyage client, used only in the optional
  manual ("explicit") mode.
- `backend/app/config.py` — the Voyage API key and model settings live here.

---

## 8. GraphRAG — ask the disruption a question in plain English 💬

**What it is.**
GraphRAG combines the two ideas above: it **reads unstructured disruption text, builds a
little map (a "knowledge graph") of who‑relates‑to‑whom, then answers questions using only
that map.** RAG means "Retrieval‑Augmented Generation" — the AI only answers from facts we
retrieved, so it can't make things up.

**Why we chose it.**
Leaders don't want to read raw data — they want to *ask*: *"What does Typhoon Yagi affect,
and how?"* GraphRAG turns messy text into a connected map and gives a grounded, cited answer.
And because the answer is built strictly from the retrieved map, it's trustworthy — no
hallucinations.

**What the business gets.**
A plain‑English Q&A layer over the disruption. Ask a question, get an answer that's backed by
the actual relationships in the data — with the reasoning traceable.

**Business example.**
> Type: *"What is impacted by Typhoon Yagi?"* GraphRAG finds the starting points (Yagi,
> Tanjung Pelepas, SUP‑001) and **hops across the relationship map** — Yagi *affects*
> Malaysia, SUP‑001 is *located_in* Malaysia, orders *depend_on* SUP‑001 — then answers in
> sentences, citing exactly those links.

**Where it is in our code.**
- `backend/app/graphrag.py` — the full canonical GraphRAG (MongoDBGraphStore‑style):
  `extract_graph()` builds the map, `query_graph()` does the multi‑hop `$graphLookup`
  traversal, and `answer()` writes the grounded reply.
- `backend/app/api/graphrag.py` — exposes this as an API the dashboard can call.

---

## 9. Real MCP server (FastMCP) + Python fallback — a universal, always‑on toolbox 🔌

**What it is.**
**MCP (Model Context Protocol)** is the emerging **industry standard** for how AI agents plug
into tools — like USB is the standard for plugging in devices. We expose our five MongoDB
tools (blast radius, supplier search, compliance, plan‑writing, memory) as a proper MCP
server using **FastMCP**. Crucially, we also built a **fallback**: if the MCP server isn't
running, the app quietly uses the same tools directly in‑process instead.

**Why we chose it.**
- **Interoperability & future‑proofing** — because our tools speak the MCP standard, *any*
  MCP‑compatible AI system (not just ours) could use them.
- **The same logic, two ways in** — the MongoDB code is written once and shared, so the
  answer is identical whether called over the network or directly.
- **It never dies mid‑demo** — the automatic fallback means a down server or a network hiccup
  can't break the workflow. It just switches lanes and keeps going.

**What the business gets.**
A standards‑based, interoperable, and **bulletproof** integration layer — enterprise‑ready
today, and ready to plug into the wider AI ecosystem tomorrow.

**Business example.**
> During a live demo the Sourcing helper calls `supplier_vector_search`. If the MCP server is
> up, the request goes over the standard MCP protocol. If it's not, the app **instantly and
> invisibly** runs the exact same MongoDB search in‑process. Either way, the audience sees the
> right answer — no error, no drama.

**Where it is in our code.**
- `backend/app/mcp_server.py` — the real MCP server (FastMCP), exposing the tools as genuine
  MCP **tools** and **resources**.
- `backend/app/mcp_client.py` — the smart client that tries MCP first and **automatically
  falls back** to the local Python tools on any failure.
- `backend/app/mcp_tools/*` — the single, shared implementation of each tool (the "source of
  truth" both paths use).

---

## How it all fits together 🧩

```
        A disruption alert arrives ("Typhoon Yagi closed the port…")
                              │
              ┌───────────────▼────────────────┐
              │   Bedrock AgentCore Runtime     │   ← secure AWS hosting (the engine room)
              │                                 │
              │   LangGraph runs the 5 helpers  │   ← the team manager
              │      in a disciplined relay      │
              └───────────────┬────────────────┘
                              │
         each helper thinks with  ── AWS Bedrock (Claude)   ← the reasoning brain
                              │
         and uses MongoDB tools (over MCP, with fallback):
                              │
   ┌───────────────┬──────────┴───────────┬────────────────────┐
   ▼               ▼                       ▼                    ▼
$graphLookup   $vectorSearch          Vector RAG            GraphRAG
"ripple        "find backups          "check the            "answer plain-
 effect"        by meaning"            compliance rules"      English questions"
   │               │                                              │
   └── all powered by meaning-search from Voyage AI + Atlas autoEmbed ──┘
                              │
                              ▼
        A ranked mitigation brief + confidence score for a human to approve
```

---

## The one‑paragraph takeaway for leadership

ResilioChain pairs the **best reasoning AI (Claude on AWS Bedrock)** with the **best
operational database for this job (MongoDB Atlas)**. **LangGraph** keeps the AI team
disciplined and auditable; **AgentCore** hosts it securely at enterprise scale. MongoDB does
the heavy lifting where the data lives — tracing the **ripple effect** (`$graphLookup`) and
finding backups **by meaning** (`$vectorSearch`, powered by **Voyage AI** and **autoEmbed**).
**GraphRAG** lets anyone ask the disruption questions in plain English, and our
**MCP + fallback** design makes the whole thing interoperable and impossible to break in a
demo. Every choice trades a hackathon shortcut for something an enterprise would actually
ship. 🛡️
