import type { CaseStudySubject } from "./types";

/**
 * The case-study instruction both real providers share.
 *
 * This is the hardest of the writing prompts to keep honest, because it is the
 * one aimed at someone deciding whether to pay. Every instinct a model has
 * about "case study" comes from marketing copy full of invented percentages,
 * and these are portfolio builds with no users and no clients. So the rules
 * below replace the missing outcome with the thing that is actually true and
 * actually persuasive: the mechanism. A reader who understands how the system
 * works trusts the builder more than one who has been told it saved 40%.
 *
 * The build logs matter more here than anywhere else. They are the difference
 * between describing a plan and describing a thing that was made.
 */
export function caseStudyPrompt(subject: CaseStudySubject): string {
  const p = subject.project;

  const facts: string[] = [
    `Project: ${p.title}`,
    `Status: ${p.status}`,
  ];
  if (p.summary) facts.push(`What it is: ${p.summary}`);
  if (p.features.length) facts.push(`Features built: ${p.features.join("; ")}`);
  if (p.stack.length) facts.push(`Built with: ${p.stack.join(", ")}`);
  if (p.repoUrl) facts.push("The source code is public.");
  if (p.demoUrl) facts.push("There is a live version.");
  if (p.youtubeUrl) facts.push("There is a video walkthrough.");
  for (const log of subject.logs) {
    facts.push(`Build log ${log.loggedOn} — built: ${log.built}`);
    if (log.blockers) facts.push(`Build log ${log.loggedOn} — difficulty hit: ${log.blockers}`);
    if (log.learned) facts.push(`Build log ${log.loggedOn} — learned: ${log.learned}`);
  }

  return [
    `You write project pages for ${subject.authorName}, who is looking for clients who need this kind of work: ${subject.positioning}.`,
    "",
    "THE READER",
    "Someone who runs a business and is deciding whether this person could build something",
    "for them. They are not technical. They are skimming several people's work. They are",
    "sceptical of anyone claiming AI results, and they are right to be.",
    "",
    "FACTS — the only things you know. Everything you write must trace back to this list:",
    ...facts.map((f) => `- ${f}`),
    "",
    "THE ONE RULE THAT MATTERS",
    "This project has no users, no clients, no revenue and no production traffic. You may",
    "not invent an outcome, and you may not imply one. Specifically forbidden: percentages,",
    "hours saved, users served, revenue, response times, client names, testimonials, and",
    "phrases like 'could save you up to'. Not as estimates, not hedged, not hypothetical.",
    "",
    "What replaces the missing numbers is the mechanism. Explain clearly how the thing works",
    "and what it does, and the reader draws their own conclusion — which is more convincing",
    "than a number they would not have believed anyway.",
    "",
    "WHAT TO WRITE",
    "`headline` — under 70 characters. What was built and what it does, stated as a capability.",
    "  Not a slogan, not a question, not a benefit claim.",
    "`intro` — one or two sentences. What the thing is, plainly, for someone who has just landed.",
    "`problem` — the real business problem this *kind* of system solves. Write about the problem",
    "  in general terms; do not claim this specific build solved it for anyone.",
    "`approach` — how it was built, in plain language. Name the tools once. This is where the",
    "  build logs earn their place: a specific decision or difficulty makes it real.",
    "`howItWorks` — three to five steps describing the mechanism end to end. Each one a short",
    "  sentence a non-technical reader follows without stopping.",
    "`demonstrates` — three or four things this build proves the author can do for a client.",
    "  Capability claims only, each one backed by something in the facts above.",
    "",
    "STYLE",
    "- Plain, direct, calm. Short sentences. Concrete nouns.",
    "- Confident without selling. State what it does; do not argue for it.",
    "- No first-person struggle narrative and no storytelling. The reader is evaluating, not",
    "  being entertained.",
    "- Banned: leverage, unlock, empower, seamless, robust, cutting-edge, game-changer,",
    "  solutions, transform, revolutionize, supercharge, delve, journey, in today's world.",
    "- No em-dashes. No emoji. No exclamation marks. No rhetorical questions.",
    "- Never say 'this project' or 'this case study'. Describe the system itself.",
    "",
    "If the facts are thin, write less. A short honest page reads as confident. A long one",
    "padded with invention is the thing that loses the client on the follow-up call.",
    "",
    "In basisUsed, list the exact facts from above that you actually used.",
  ].join("\n");
}
