import type { SocialSubject } from "./types";

/**
 * The social-content instruction every real provider shares.
 *
 * Two ideas run through all of it.
 *
 * The first is grounding, carried over from the outreach prompts: the model may
 * describe only what the project record and the build logs actually say. That
 * matters more here than in a DM. These are learning projects with no users and
 * no revenue, so a model left to its own devices will reach for "shipped to
 * 500 users" and "cut response times 40%" — invented numbers that would be
 * posted under a real name to a real audience, and that a client could later
 * check. The rules below make the absence of metrics an explicit fact rather
 * than a gap the model is tempted to fill.
 *
 * The second is that on every one of these platforms the first line decides
 * whether the rest is read at all — the timeline, the "…see more" fold, the
 * two seconds before a thumb moves. So the hook is generated as its own field,
 * judged on its own, and the variations differ by *angle* rather than wording.
 * Three paraphrases of one sentence are one post; three angles are three shots.
 */
export function socialPrompt(subject: SocialSubject): string {
  const p = subject.project;

  const facts: string[] = [];
  if (p) {
    facts.push(`Project ${p.number} of 27: ${p.title} (week ${p.week} — ${p.weekTheme})`);
    facts.push(`Status: ${p.status}`);
    if (p.summary) facts.push(`What it is: ${p.summary}`);
    if (p.features.length) facts.push(`Features being built: ${p.features.join("; ")}`);
    if (p.stack.length) facts.push(`Stack: ${p.stack.join(", ")}`);
    if (p.learningGoals.length) facts.push(`Skills this week is meant to prove: ${p.learningGoals.join(", ")}`);
  }
  for (const log of subject.logs) {
    facts.push(`Build log ${log.loggedOn} — built: ${log.built}`);
    if (log.blockers) facts.push(`Build log ${log.loggedOn} — got stuck on: ${log.blockers}`);
    if (log.learned) facts.push(`Build log ${log.loggedOn} — learned: ${log.learned}`);
  }
  if (!facts.length) facts.push("No project or build-log detail was supplied.");

  const count = subject.format === "showcase" ? 1 : 3;

  return [
    `You write social content for ${subject.authorName}, who is building in public toward this: ${subject.positioning}.`,
    "",
    "FACTS — the only things you know about the work. Everything you write must trace back to this list:",
    ...facts.map((f) => `- ${f}`),
    "",
    subject.steer ? `THE ANGLE THEY WANT: ${subject.steer}` : "",
    subject.steer ? "" : "",
    "GROUNDING — read this twice",
    "A. These are portfolio and learning projects. They have no users, no revenue, no clients",
    "   and no production traffic unless a fact above says otherwise. Never invent an outcome.",
    "B. Specifically forbidden unless stated above: user counts, revenue, growth percentages,",
    "   latency or performance numbers, client names, testimonials, hiring outcomes, time saved.",
    "   Not as estimates, not as 'imagine if', not hedged with 'could'.",
    "C. The interesting material is the work itself — the bug, the decision, the thing that",
    "   turned out harder than expected, the concept that finally landed. Write about that.",
    "   A specific technical detail beats a claimed result every time, and it is also true.",
    "D. If the facts are thin, write something short and plain. A short honest post is a",
    "   good post. A long post padded with invention is a liability.",
    "",
    ...platformRules(subject),
    "",
    count === 1 ? "PRODUCE ONE PIECE." : "PRODUCE THREE VARIATIONS.",
    ...(count === 3
      ? [
          "They share one premise but must be genuinely different pieces — different opening",
          "move, different structure, different reason to care. Not three rewrites of one",
          "sentence. Use these three angles, and put the angle in `label`:",
          "  1. PROOF — the concrete thing that now works. Lead with the specific detail.",
          "  2. LESSON — what you got wrong first, and what the correction actually was.",
          "     The friction is the story. Name the wrong assumption out loud.",
          "  3. BUILD LOG — the honest in-progress note. Where you are, what is still broken,",
          "     what you are trying next. No resolution required.",
          "If a variation would need an invented fact to work, make it shorter instead.",
        ]
      : []),
    "",
    "STYLE — applies to everything you write",
    "- Plain, direct, first person singular. One person built this: write I, never we.",
    "  Write the way a competent person talks, not the way LinkedIn talks. Contractions are fine.",
    "- NO MARKDOWN OF ANY KIND. None of these platforms render it, so the characters appear",
    "  literally in the post and make it look broken. No backticks around code or function",
    "  names, no asterisks for bold or italic, no underscores, no headings, no bullet syntax.",
    "  Write Depends() and /tasks as bare words. This rule has no exceptions.",
    "- Paragraph breaks are NOT markdown and are required where a platform rule asks for them.",
    "  Separate paragraphs with a real blank line (two newline characters). Sentences must never",
    "  run together with no space between them.",
    "- No em-dashes. No emoji unless a platform rule below explicitly allows them.",
    "- Banned openers: 'I'm excited to', 'I'm humbled', 'Let that sink in', 'Here's the thing',",
    "  'Most people don't realise', 'Unpopular opinion', 'Let me explain', 'Buckle up'.",
    "- Banned words: leverage, unlock, delve, journey, game-changer, deep dive, seamless,",
    "  robust, cutting-edge, in today's fast-paced world, at the end of the day.",
    "- No engagement bait: no 'Agree?', no 'Thoughts?', no 'Comment BUILD below', no fake polls.",
    "- Never describe the post itself ('in this post I'll share'). Just say the thing.",
    "- Cut throat-clearing. A sentence that only comments on the previous one — 'It's a small",
    "  detail', 'It's all part of the process', 'That was interesting' — is dead weight. Delete it.",
    "- Never cite the curriculum numbering. 'Project 5 of 27', 'week 2 of 9' and the like mean",
    "  nothing to a reader who has not seen the plan, and naming them makes the work sound like",
    "  homework rather than engineering.",
    "- Concrete nouns over abstractions. Name the actual library, the actual error, the",
    "  actual decision.",
    "",
    "`hook` is the first line of `body`, repeated on its own so it can be judged alone.",
    "`body` is the complete text to paste, hook included, ready to post with no editing.",
    "In `basisUsed`, list the exact facts from above that you actually used.",
    "In `angle` give the shared idea in under 12 words. In `premise` give it in one sentence.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** The per-platform section. Length, shape and hashtag policy all differ. */
function platformRules(subject: SocialSubject): string[] {
  switch (subject.platform) {
    case "twitter":
      return [
        "PLATFORM: X / TWITTER",
        "- HARD LIMIT 280 characters for `body`, including spaces. Target 150–220, and never go",
        "  above 240 — that margin exists because a post one character over cannot be published",
        "  at all. Before you return, count the characters of each body. Any body above 240 must",
        "  be rewritten shorter, not trimmed at the end. Prefer cutting a whole sentence.",
        "- The commonest cause of an over-length post is explaining context nobody asked for.",
        "  Delete the setup and keep the specific.",
        "- One idea. No threads, no 'a thread 🧵', no numbered lists spilling into replies.",
        "- The first line is the whole post as far as the timeline is concerned. Front-load the",
        "  specific detail. Never open with context or setup.",
        "- Short and direct. Cut every word that is not doing work. Fragments are fine.",
        "- Line breaks are the only formatting. Two or three short lines beats one paragraph.",
        "- No hashtags. They suppress reach here and read as marketing. `hashtags` must be empty.",
        "- One post, no trailing summary of what project this is. The work has to be",
        "  interesting on its own.",
        "- No links.",
        "- `cta` is usually null. A question only if it is genuinely open and costs one line to answer.",
      ];

    case "linkedin":
      return [
        "PLATFORM: LINKEDIN",
        "- 800–1500 characters for `body`. Story-based, not a bulleted summary.",
        "- The first 140 characters are all that shows before the 'see more' fold. Those two",
        "  lines must create enough tension that unfolding it is the obvious next move.",
        "  Never spend them on setup or on naming the topic. A description of what you built is",
        "  not a hook — it answers the question before it has been asked. Open on the moment it",
        "  broke, the thing that surprised you, or the assumption that turned out wrong.",
        "- Structure: a specific moment → what went wrong or surprised you → what you did →",
        "  what it taught you → one line that hands the reader something they can use.",
        "- Whitespace is the format. One or two sentences per paragraph, blank line between.",
        "  A wall of text does not get read here.",
        "- Write about the work, not about growth. No 'lessons for founders' framing.",
        "- End with a real question a peer could answer in one sentence, or with a plain",
        "  statement. Not both, and never with a call to like or share.",
        "- 3 to 5 hashtags in `hashtags`, specific to the technology, not #motivation.",
      ];

    case "contra":
      return [
        "PLATFORM: CONTRA — this is a portfolio piece, not a feed post.",
        "- The reader is deciding whether to hire someone. They are skimming several profiles.",
        "  Write for a buyer evaluating capability, not for an audience being entertained.",
        "- 600–1000 characters for `body`.",
        "- Structure: what the thing does → the problem it solves → how it is built (name the",
        "  stack plainly) → what it demonstrates you can do for a client.",
        "- `hook` is a capability headline under 70 characters. Say what was built and for what.",
        "- Confident and plain. No storytelling, no first-person struggle narrative, no humour.",
        "- Do not claim client work, delivery timelines or business results. Describe the",
        "  system and what it proves. Capability is a claim you can back; outcomes are not.",
        "- `hashtags` must be empty. `cta` is one line offering the relevant service.",
      ];

    case "tiktok":
      return [
        "PLATFORM: TIKTOK — hook and caption only. Do not write a script or shot list.",
        "- `hook` is what gets said out loud in the first two seconds. Twelve words maximum.",
        "  It must open a loop the viewer needs closed. A question, a claim, or a mid-action",
        "  statement. Never a greeting, never 'in this video'.",
        "- `body` is the caption: at most 150 characters, and its first words repeat or sharpen",
        "  the hook, because the caption is read while the video is still deciding them.",
        "- Speak like a person filming at their desk. Casual, fast, no polish.",
        "- 3 to 5 hashtags in `hashtags`, mixing the broad (#coding) with the specific (#fastapi).",
        "- Emoji are allowed in the caption, at most one.",
      ];

    case "youtube":
      return [
        "PLATFORM: YOUTUBE SHORTS — hook and caption only. Do not write a script.",
        "- `hook` doubles as the title. Sixty characters maximum, front-loaded, searchable.",
        "  It should read like something a person would type into the search bar and also",
        "  like something worth clicking. Concrete over clever. No clickbait punctuation.",
        "- `body` is the description: two or three short lines saying what is shown and what",
        "  was built, then the hashtags on their own final line.",
        "- 3 to 5 hashtags in `hashtags`, weighted toward search terms rather than trends.",
        "- No emoji.",
      ];

    case "instagram":
      return [
        "PLATFORM: INSTAGRAM REELS — hook and caption only. Do not write a script.",
        "- `hook` is the on-screen text over the opening frame. Eight words maximum. It has to",
        "  work with the sound off, because most of the time the sound is off.",
        "- `body` is the caption: 125–220 characters. The first line is the hook or a sharper",
        "  version of it; the rest gives the one detail that makes the build worth watching.",
        "- Conversational and visual. Say what is on screen, not what it means.",
        "- 3 to 5 hashtags in `hashtags`, placed in the `hashtags` field only, not in the body.",
        "- Emoji allowed, at most two.",
      ];
  }
}


/**
 * Strip what these platforms cannot render.
 *
 * The instruction above forbids markdown, and the model mostly obeys — but
 * "mostly" is not good enough when the failure mode is asterisks and backticks
 * appearing literally in a published post. Emphasis markers are removed rather
 * than escaped because none of the six platforms render them, so there is
 * nothing to preserve. Run separators are normalised for the same reason: a
 * model that decides paragraphs are formatting will happily return prose with
 * no breaks at all, which on LinkedIn is unreadable.
 *
 * Deliberately NOT a length fix. Truncating a post mid-thought produces
 * something worse than an over-length draft, and the caller surfaces the
 * overrun instead.
 */
export function cleanPostText(text: string): string {
  let out = text
    // Emphasis and code markers, only where they wrap something.
    .replace(/`{1,3}([^`\n]+)`{1,3}/g, "$1")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1")
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, "$1$2")
    // Leftover heading and bullet syntax at the start of a line.
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "");

  /*
   * Repair the specific failure where the model returns a multi-sentence post
   * with no line breaks *anywhere* and no space between sentences, which on
   * LinkedIn is a wall of unreadable text. The gate matters: only a body with
   * no newline at all is treated this way. Applied unconditionally, the same
   * rule would split identifiers like fastapi.Depends across a paragraph, and
   * corrupting correct output to tidy broken output is a bad trade.
   */
  if (!out.includes("\n") && /[a-z]{2}[.!?][A-Z]/.test(out)) {
    out = out.replace(/([a-z]{2}[.!?])([A-Z])/g, "$1\n\n$2");
  }

  return out
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
