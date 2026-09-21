# {{AGENCY}} — Standard Prompt

The single source of truth for anything that carries the {{AGENCY}} name: web
pages, decks, ad creative, social graphics, email. Paste this whole file as
context before generating, then state the specific task.

Replace `{{AGENCY}}` throughout. Nothing else in this file is a placeholder.

---

## 1. What we are

{{AGENCY}} is an AI automation studio. Three services, in this order of
prominence, and nothing else:

1. **AI workflows and custom dashboards.** Systems that run the repetitive part
   of a business — lead qualification, support triage, reporting, internal
   tooling — plus the dashboard that makes the work visible.
2. **Custom subagents.** Purpose-built AI agents trained on a client's own
   material, wired into their own tools.
3. **The cohort.** We teach teams to build the above themselves.

A fourth page, **Projects**, is proof rather than a service.

**Audience.** Operators at small and mid-size businesses who feel a specific
cost — hours lost, leads dropped, a person doing a machine's job. They are not
technical and do not want to become technical. They are evaluating several
options and are skeptical of AI claims, correctly.

**What we sell.** Removal of a named, quantified drag on the business. Never
"AI transformation".

---

## 2. Voice

Write like a senior engineer explaining their work to a smart friend who does
not share the jargon. Calm, specific, unhurried, faintly understated.

**Rules**

- Short sentences. Vary the length. Never two long sentences in a row.
- Concrete nouns. Name the actual tool, the actual task, the actual hour saved.
- Claims carry evidence or they get cut. No unverifiable numbers, ever.
- Understate. "It works" beats "revolutionary". Confidence is quiet.
- Second person for the reader, first person plural for us. Never third person
  about ourselves ("{{AGENCY}} helps businesses…" is dead on arrival).
- One idea per paragraph. Two sentences is a normal paragraph.

**Banned outright**

Leverage · unlock · empower · transform · revolutionize · seamless · robust ·
cutting-edge · game-changer · supercharge · 10x · delve · journey · solutions ·
synergy · "in today's fast-paced world" · "we're passionate about" ·
"take your business to the next level" · any sentence containing "AI-powered"
followed by another adjective.

**Headline test.** If a competitor could paste your headline onto their site
unchanged, it says nothing. Rewrite it.

---

## 3. Design system

### The governing idea

Near-monochrome, with orange as punctuation. Orange appears on a page **three
times at most**: the primary action, one accent mark, one moment of emphasis.
An orange brand with an orange website looks cheap. Restraint is the product.

### Colour

```
--ink            #0A0A0B   near-black, all primary text
--ink-2          #52525B   secondary text
--ink-3          #8E8E93   captions, meta, disabled
--canvas         #FFFFFF   page
--canvas-2       #FAFAF9   alternating sections (warm, never blue-grey)
--canvas-3       #F4F4F2   cards, insets
--hairline       #E7E5E2   1px borders — the only divider used

--brand          #FF6A1F   fills, buttons, marks. NEVER text on white.
--brand-press    #E85400   hover/active state of a brand fill
--brand-text     #C2410C   orange *text* on white — 5.0:1, passes AA
--brand-wash     #FFF4ED   tinted section backgrounds, used sparingly
--brand-edge     #FFD9BF   hairlines inside brand-wash areas
```

Dark mode inverts to `--ink #FAFAF9` on `--canvas #0A0A0B`, brand stays
`#FF6A1F` (it reads correctly on both), `--brand-text` becomes `#FF8A4C`.

Light is the default and lives on bare `:root`. Dark engages from
`prefers-color-scheme`, and an explicit choice stamps `data-theme` on `<html>`,
which wins over both. A blocking inline script applies the saved choice before
first paint — an effect or a provider paints the wrong theme first, and there is
no fixing that flash afterwards. Set `color-scheme` alongside the tokens or
scrollbars and native controls stay the wrong colour.

**Never** use a gradient as a background. **Never** use orange for body text.
**Never** put brand orange on `--canvas-2`; it muddies.

### Type

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display",
             "Inter", system-ui, sans-serif;
```

The system stack renders genuine SF on Apple hardware — the real thing, no
licence needed. Inter is the fallback everywhere else.

Two weights only: **400** and **600**. No 500, no 700, no italics.

| Role | Size (desktop) | Tracking | Leading |
|---|---|---|---|
| Display | 76px / 600 | -0.035em | 1.02 |
| H1 | 56px / 600 | -0.03em | 1.06 |
| H2 | 40px / 600 | -0.025em | 1.1 |
| H3 | 26px / 600 | -0.02em | 1.2 |
| Lead | 21px / 400 | -0.01em | 1.5 |
| Body | 17px / 400 | 0 | 1.65 |
| Caption | 14px / 400 | 0 | 1.5 |

Mobile: scale display and headings by 0.62, body stays 17px. Negative tracking
above 32px is not optional — it is most of what makes type look Apple-made.

Measure caps at **68 characters**. Body text is never full-width.

### Space

An 8px base. The spacing that matters is the big kind: **section padding is
160px desktop / 96px tablet / 72px mobile**, top and bottom. Content max-width
1120px; text blocks 680px.

If a section feels crowded, the fix is always more space, never smaller type.

### Surface

- **One** radius: 16px for cards and buttons, 12px for inputs, 999px for pills.
- Borders are `1px solid var(--hairline)`. That is the divider. No rules, no
  dotted lines, no thick strokes.
- Shadows are for genuinely floating things only (menus, modals, the chat
  panel): `0 12px 32px -8px rgb(10 10 11 / 0.12)`. Cards do not float.
- No glassmorphism, no neon, no mesh gradients, no 3D blobs, no stock
  photography of people pointing at monitors.

### Motion

Only `opacity` and `transform`. Nothing else animates.

```
duration: 220ms interactions · 420ms entrances
easing:   cubic-bezier(0.16, 1, 0.3, 1)
```

Entrances: 16px rise plus fade, staggered 60ms, triggered once on scroll.
Honour `prefers-reduced-motion: reduce` by disabling all of it.

### Imagery

Show the actual product: real dashboard screens, real workflow graphs, real
terminal output. A cropped screenshot of something that genuinely runs beats
any illustration. If there is no artefact to show, show type on space instead.

---

## 4. Page rules

**One primary action per screen**, repeated verbatim each time it appears.
Never two competing buttons. Secondary actions are plain text links.

**Above the fold**: what it is, who it is for, what it costs them not to have
it, and the action. Four things. No carousel, no autoplay video, no cookie wall
covering the content.

**Proof over claims.** Since the logo wall is empty, proof is the work itself —
a real system, described concretely, with the mechanism visible.

**The cohort page is an advertising destination.** It carries paid traffic and
obeys stricter rules: no site navigation, no outbound links except the single
action, one offer, one price, one form. Every element either moves toward
enrolment or is deleted. It is the only page in the system allowed to be
long-scrolling and repetitive.

**Accessibility is not optional.** 4.5:1 on all text, visible focus rings
(`2px solid var(--brand)` at 2px offset), full keyboard reach, real semantic
landmarks, alt text that describes rather than labels.

---

## 5. The chatbot

It is a knowledgeable person on the team, not a mascot. No greeting bubble
auto-popping after three seconds, no emoji, no "Hi there! 👋 How can I help
you today?".

- Answers only from what the site actually says about our services, process,
  and prior work. Everything else: "I don't know that one — worth asking on a
  call."
- Never quotes a price it was not given, never promises a timeline, never
  claims a client or a result.
- Two to four sentences. It is a chat, not an essay.
- Its job is to get a real conversation booked, and it says so plainly rather
  than manoeuvring toward it.
- Every conversation that yields a name or an email becomes a lead in the
  marketing engine. The visitor is told that, once, in plain words.

---

## 6. Before anything ships

- [ ] Could a competitor paste this headline on their site unchanged? Rewrite.
- [ ] Orange used three times or fewer on the page?
- [ ] Every number on the page true and checkable?
- [ ] Any word from the banned list survived?
- [ ] Body text under 68 characters per line?
- [ ] Works at 320px wide, and in dark mode?
- [ ] Keyboard-only pass reaches every action, with a visible focus ring?
- [ ] Does it still work with every image removed? (If not, the words are weak.)
