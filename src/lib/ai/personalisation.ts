import type { PersonalisationSubject } from "./types";

/**
 * Turn the database row into the fact sheet the model is allowed to draw on.
 *
 * Only observed evidence goes in. If a fact is not here, the model has no basis
 * for it — which is the entire safeguard against an opener that confidently
 * describes a business the recipient does not recognise.
 */
export function factSheet(subject: PersonalisationSubject): string[] {
  const facts: string[] = [`Company name: ${subject.companyName}`];
  if (subject.industry) facts.push(`Industry: ${subject.industry}`);
  if (subject.city || subject.country) {
    facts.push(`Location: ${[subject.city, subject.country].filter(Boolean).join(", ")}`);
  }
  if (subject.contactName) facts.push(`Contact name: ${subject.contactName}`);
  if (subject.jobTitle) facts.push(`Contact role: ${subject.jobTitle}`);

  const s = subject.signals;
  if (s) {
    if (s.runsAds && s.adPlatforms?.length) {
      facts.push(`Their website carries advertising pixels: ${s.adPlatforms.join(", ")} — they are paying for traffic.`);
    }
    if (s.hasLiveChat === false) facts.push("Their website has no live chat or chatbot.");
    if (s.hasLiveChat === true) facts.push("Their website already has live chat.");
    if (s.hasBooking === false) facts.push("Their website has no online booking — appointments are likely taken by phone.");
    if (s.hasBooking === true) facts.push("Their website already has online booking.");
    if (s.hasVideo === false) facts.push("There is no video anywhere on their website.");
    if (s.hasLeadForm === false) facts.push("Their website has no lead capture form.");
    if (s.cms) facts.push(`Their site is built on ${s.cms}.`);
    if (s.socials?.length) facts.push(`They have social accounts: ${s.socials.join(", ")}.`);
    for (const o of s.opportunities ?? []) facts.push(`Observed gap: ${o}`);
  }
  for (const post of subject.publicPosts ?? []) {
    facts.push(`They posted publicly on ${post.platform}: "${post.text.replace(/\s+/g, " ").trim().slice(0, 400)}"`);
  }
  return facts;
}

/** The instruction both real providers share, so their output stays comparable. */
export function personalisationPrompt(subject: PersonalisationSubject): string {
  return [
    `You write short cold outreach emails for ${subject.senderName}, who sells: ${subject.offer}.`,
    "",
    "FACTS ABOUT THE RECIPIENT — these are the only things you know:",
    ...factSheet(subject).map((f) => `- ${f}`),
    "",
    "RULES",
    "1. Use ONLY the facts above. Never invent a detail about their business, their",
    "   customers, their revenue, or anything you were not told. If you have little",
    "   to work with, write something short and plain rather than padding it.",
    "2. Open by naming one specific thing you observed about them. Not flattery.",
    "3. Connect that observation to one concrete outcome. No feature lists.",
    "4. 90 words maximum in the body. Short sentences.",
    "5. No greeting line beyond 'Hi <name>,' or 'Hi there,' if no name is known.",
    "6. No sign-off, no signature, no unsubscribe text — the app appends those.",
    "7. Plain conversational English. No 'I hope this finds you well', no 'game-changer',",
    "   no 'revolutionise', no exclamation marks, no emoji.",
    "8. Subject line: 6 words maximum, lowercase, specific to them, not salesy.",
    "",
    "In basisUsed, list the exact facts from above that you actually used.",
  ].join("\n");
}
