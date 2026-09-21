import { factSheet } from "./personalisation";
import type { DmSubject } from "./types";

const PLATFORM_LABEL: Record<DmSubject["platform"], string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
};

/**
 * Per-platform physics of a cold DM.
 *
 * The blueprint's method is constant; the container is not. An Instagram DM
 * lands in a request folder and is read on a phone. An X DM competes with a
 * spam tide and is judged in one line. A LinkedIn message cannot even be sent
 * until a connection request has been accepted, which makes the 300-character
 * note the real first touch and the message a second-order concern.
 */
function platformRules(platform: DmSubject["platform"]): string[] {
  switch (platform) {
    case "instagram":
    case "facebook":
      return [
        "2–4 short sentences, written like a casual DM between business people.",
        "No links. Links in a first DM read as spam and get the account flagged.",
      ];
    case "twitter":
      return [
        "2–3 sentences, hard maximum 4 lines. X DMs are skimmed in a crowded, spam-heavy inbox",
        "and anything that looks like a template is gone in under a second.",
        "Lowercase-casual is fine here and reads as human. No links.",
      ];
    case "linkedin":
      return [
        "3–5 sentences. LinkedIn tolerates slightly more context than the others because the",
        "reader is already in a work mindset, but it punishes anything that reads like a pitch",
        "deck. Still no pleasantries, still no introduction of the sender first.",
        "No links in the first message.",
      ];
  }
}

/**
 * The DM instruction both real providers share.
 *
 * The rules encode the Client Acquisition Blueprint's cold-DM method: the only
 * goal of message one is a reply (never a sale), the opener must read like a
 * notification preview, value is suggested rather than pitched, and the
 * follow-up stays light instead of guilt-tripping. The same fact-sheet
 * grounding as email applies — nothing the scan didn't observe may be claimed.
 */
export function dmPrompt(subject: DmSubject): string {
  const platform = PLATFORM_LABEL[subject.platform];
  const isLinkedIn = subject.platform === "linkedin";

  return [
    `You write cold ${platform} messages for ${subject.senderName}, who sells: ${subject.offer}.`,
    isLinkedIn
      ? `The recipient is a person on LinkedIn (${subject.handle}). They do not know the sender, and`
      : `The recipient runs the business's ${platform} account (@${subject.handle}). They do not know the sender.`,
    isLinkedIn
      ? "you cannot message them until they accept a connection request."
      : "",
    "",
    "FACTS ABOUT THE RECIPIENT — these are the only things you know:",
    ...factSheet(subject).map((f) => `- ${f}`),
    "",
    isLinkedIn
      ? "Write THREE things: the connection note, the opener sent after they accept, and one follow-up."
      : "Write TWO messages: the opener, and one follow-up sent 3–5 days later only if the opener got no reply.",
    "",
    "GOAL",
    "The only goal of the opener is a reply — never a sale, never a call. A reply moves the",
    "thread out of the request folder, and that is the whole game.",
    "",
    ...(isLinkedIn
      ? [
          "RULES FOR THE CONNECTION NOTE (connectionNote)",
          "0a. Hard limit 300 characters. Over the limit means it cannot be sent at all.",
          "0b. This is the only thing they read before deciding whether to accept, so it must earn",
          "    the click on its own. Lead with the specific observed detail about them.",
          "0c. Do not pitch, do not mention what the sender sells, do not ask for a call. The note",
          "    asks for nothing except the connection. Anything that smells like selling gets",
          "    ignored, and a rejected request cannot be retried.",
          "0d. No 'I'd like to add you to my professional network'. Ever.",
          "",
        ]
      : []),
    "RULES FOR THE OPENER (firstMessage)",
    ...platformRules(subject.platform).map((rule, i) => `${i + 1}. ${rule}`),
    "3. The first 8–12 words must work as a notification preview: start with a concrete,",
    "   specific detail you observed about THEM — never a greeting, never who the sender is.",
    "   No 'Hi, I'm…' introductions anywhere. They don't care.",
    "4. Use ONLY the facts above. Never invent a detail about their business, their content,",
    "   their followers, or their results. If evidence is thin, stay plain and short.",
    "5. Point out ONE specific problem or missed opportunity that plausibly costs them money,",
    "   time or leads — drawn from the observed gaps. One, not a list.",
    "6. Suggest, don't pitch. Sound like a peer who spotted something and thought they should",
    "   mention it, not a vendor. It should answer the reader's silent question: what's in it for me?",
    "7. End with a low-friction curiosity CTA such as: Want me to send it over? / Want me to",
    "   show you what I mean? A question that costs them one word to answer.",
    isLinkedIn
      ? "8. Do not repeat the connection note. They have already read it — reusing it wastes the"
      : "",
    isLinkedIn ? "   one message you get and signals a template." : "",
    "",
    "RULES FOR THE FOLLOW-UP (secondMessage)",
    "9. 1–3 sentences. Light, human, zero guilt. Either a playful nudge about the platform",
    "   burying messages, or a callback to the opener's idea with ONE new concrete angle.",
    "10. Do not repeat the opener. Do not apologise for following up. End with an even",
    "    smaller ask — a yes/no question works.",
    "",
    "STYLE — ALL MESSAGES",
    "11. Plain conversational English. No em-dashes. No quotation marks inside the messages.",
    "12. No clichés: 'hope you're well', 'circle back', 'leverage', 'game-changer',",
    "    'quick question', 'I'll be brief'. No emoji. No exclamation marks.",
    "13. Address them by first name only if a contact name is in the facts; otherwise no name.",
    isLinkedIn ? "" : "14. connectionNote must be null — this platform has no connection request.",
    "",
    "In basisUsed, list the exact facts from above that you actually used.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
