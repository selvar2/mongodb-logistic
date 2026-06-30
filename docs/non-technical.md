# ResilioChain — Explained Simply 🛡️

*A friendly guide for people who don't write code.*

---

## What is ResilioChain? (in one breath)

Imagine you run a company that builds things — say, cars. To build cars, you need
thousands of little parts. You buy those parts from other companies. When something
goes wrong and your parts can't arrive, your whole factory can grind to a halt.

**ResilioChain is a smart assistant that watches for trouble and, the moment a part
stops flowing, quickly finds you a new place to buy that part from — a safe, allowed,
and reliable one.**

Think of it like a GPS that reroutes you around a traffic jam. Except instead of roads,
it reroutes your *suppliers*.

---

## Let's learn three words first

**1. A "supplier"** is just a company that sells you something you need.
If you make cars, a supplier might be the company that makes the tiny computer chips
that go inside the dashboard. No chips → no dashboards → no cars.

**2. A "disruption"** is anything that suddenly stops a supplier from delivering.
Examples:
- 🌀 A **typhoon** floods a region.
- ⚓ A **port closes** (the place where ships load and unload).
- ⚔️ A **war** breaks out near a factory.
- 🚫 **Sanctions** — when governments say "you're not allowed to trade with that company anymore."

**3. The "ripple effect"** (we'll explain this below) is how *one* problem spreads to
hurt *lots* of things downstream — like dropping a stone in a pond.

---

## The sneaky problem most people miss 🤔

Here's the part that surprises everyone:

> **A supplier can have your parts sitting right there in the warehouse — and you still
> can't get them.**

How? Picture this. Your supplier has **48,200 little computer chips** ready to ship.
They're boxed up. They're paid for. But the **port is closed** because a typhoon hit.
The truck can't drive onto the ship. The ship can't leave the harbor.

The stock exists. The *delivery* is stuck. **Having the parts and getting the parts are
two completely different things.** ResilioChain understands this difference — that's why
it doesn't just ask "who has stock?" It asks "who can actually deliver?"

---

## Our story: Typhoon Yagi 🌀

Let's follow a real-feeling example all the way through. (This is the demo you can run.)

> **Typhoon Yagi** closes the **Port of Tanjung Pelepas in Malaysia** for 72 hours.
> Our main supplier, **SUP-001 (Chang Electronics)**, has **48,200 units** of special
> automotive computer chips stuck behind that closed port. They can't ship. Twenty-three
> of our orders are about to be late.

Uh oh. Now watch how ResilioChain handles it, step by step.

---

## How the smart assistant thinks (5 helpers working together)

ResilioChain isn't one robot — it's a little **team of five AI helpers**, each with one
job. They pass the problem down the line like a relay race.

### 🧠 Helper 1 — The Supervisor ("the brain")
Reads the alarm ("Typhoon Yagi closed the port!") and figures out *how bad* it is and
*who* is affected. Then it tells the rest of the team to get to work. At the very end,
it also writes the final recommendation.

### 💥 Helper 2 — The Impact Assessor ("who gets hurt?")
This is the **ripple effect** helper. It asks: *"If SUP-001 is down, which of our orders
and products are in trouble?"* It traces every connection — like following every string
tied to one balloon. It adds up exactly how much we now need from somewhere else:
**48,200 units**.

### 🔎 Helper 3 — The Sourcing Agent ("find me a replacement")
Now it goes shopping for a backup. It searches for suppliers that make *the same kind of
part* — and, crucially, **only ones big enough to actually cover all 48,200 units.** A
supplier that can only make 5,000 is no help, so it's filtered out automatically.

### ✅ Helper 4 — The Compliance Agent ("is this one allowed and ethical?")
Before recommending anyone, it checks the rules. Is this supplier under sanctions? Do
they treat workers fairly? Are they environmentally responsible (their "ESG score")? If a
candidate fails, the helper says "nope" and sends it back to Helper 3 to find the next
best option. It will try again up to **3 times**.

### 📋 Helper 5 — The Mitigation Planner ("write the final answer")
It picks the best supplier that passed all checks, works out how much extra it'll cost and
how many days later parts will arrive, gives the plan a **confidence score**, and writes a
clear one-page brief for the humans.

---

## A picture of the relay race

```
   🌀 Typhoon alert comes in
            │
            ▼
   🧠 Supervisor  ── "This is serious. SUP-001 is down."
            │
            ▼
   💥 Impact Assessor  ── "23 orders, 48,200 units at risk."  (the ripple effect)
            │
            ▼
   🔎 Sourcing  ── "Here are 3 backups big enough to cover it."
            │
            ▼
   ✅ Compliance  ── "Check each one's ethics & sanctions."
            │              ↺ (if one fails, go back and try the next — up to 3 times)
            ▼
   📋 Planner  ── "Best safe choice + confidence score + cost."
            │
            ▼
   👀 Human reads the one-page brief and approves
```

---

## Why a supplier gets rejected 🚫

This is where it gets interesting. In our story, the sourcing helper found backups. But
not all of them were good citizens.

- **SUP-FAIL (a supplier in Vietnam)** had the right parts and enough capacity — but it
  **failed the ethics check.** Its ESG score was too low (maybe poor labor practices or
  environmental concerns). ResilioChain **rejected it.** Cheap and fast isn't worth it if
  it's not ethical or allowed.

- **SUP-002, "PT Maju Jaya" in Indonesia**, made the same parts, had enough capacity,
  *and* passed every rule check. **It won.** ✅

So the final recommendation is: **reroute the orders to PT Maju Jaya in Indonesia.**

The point: ResilioChain doesn't just chase the cheapest option. It refuses to recommend a
supplier that breaks the rules — even if that supplier would otherwise look great.

---

## "Confidence score" and "human review" — what do they mean? 🎯

When ResilioChain finishes, it grades its own answer from **0 to 100** — its
**confidence score**. It's like a student saying "I'm 92% sure this answer is right."

- **High confidence (85 or above):** the plan is solid. It can be set to go ahead quickly.
- **Lower confidence (below 85), OR a supplier with a shaky ethics score:** the computer
  raises its hand and says *"a human should look at this first."* That's **human review**
  (sometimes called "human-in-the-loop").

This is on purpose. When the computer isn't sure, it doesn't guess — it asks a person.
**You stay in control.** The AI does the heavy lifting in seconds; the human makes the
final call when it matters.

And every single decision is written down in an audit trail, so later you can always see
*why* a choice was made.

---

## Try the demo yourself 🚀

You don't need to understand any code to watch it work. Here are the simple steps.

> **Step 1 — Set up your secret keys.** Copy the example settings file and fill in your
> account details.
>
> ```
> cp .env.example .env
> ```

> **Step 2 — Load the practice data.** This fills the system with our pretend suppliers
> and orders.
>
> ```
> python -m app.db.seed
> ```

> **Step 3 — Run the Typhoon Yagi story from start to finish.** Watch the five helpers do
> their relay race.
>
> ```
> python -m app.agents.graph --demo
> ```

> **Step 4 — Open the dashboard in your web browser** to see it all on screen.
>
> ```
> npm run dev
> ```
> Then visit **http://localhost:3000**

That's it. You'll watch a typhoon alert come in, the 48,200 stuck units get spotted, the
Vietnam supplier get rejected for ethics, and **PT Maju Jaya in Indonesia** get
recommended — with a confidence score and a tidy one-page brief.

---

## The big idea, in one sentence

> When the world throws a surprise at your supply chain, ResilioChain finds you a safe,
> allowed, and reliable backup *before* the surprise turns into a crisis — and tells you
> how sure it is, so you always know when to double-check.

🛡️ That's ResilioChain.
