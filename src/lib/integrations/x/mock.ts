import type { XClient, XSearchPage, XTweet, XUsage, XUser } from "./client";

/**
 * Offline X adapter, for exercising the pipeline without an API key.
 *
 * Only used when X_PROVIDER=mock is set explicitly — it is never a silent
 * fallback, because unlike the other mocks its output lands in a lead queue.
 * Every account it invents is `mock_…` with an RFC 2606 `.example` website, so
 * nothing it produces can be mistaken for a real person.
 *
 * The posts are a deliberate mix of intents (buyers, people describing pain,
 * vendors selling, bystanders) so the classifier has something to separate.
 */
const TEMPLATES: { user: Omit<XUser, "id">; text: string }[] = [
  {
    user: { username: "mock_brightsmile_dental", name: "Bright Smile Dental", description: "Family dental practice, 4 chairs. Owner-operated.", website: "https://brightsmile.example", followers: 820 },
    text: "Our front desk spends half the day chasing no-shows and reminder calls. Can anyone recommend a system that automates recalls for a small dental practice?",
  },
  {
    user: { username: "mock_harbor_realty", name: "Harbor Realty — Jen", description: "Broker/owner, 22 agents. Coastal homes.", website: "https://harborrealty.example", followers: 1430 },
    text: "Looking for someone to set up instant replies to Zillow leads. We lose deals because enquiries sit for hours before an agent calls back.",
  },
  {
    user: { username: "mock_growthloop_agency", name: "GrowthLoop", description: "Performance agency · 18 people · we run paid social for DTC", website: "https://growthloop.example", followers: 5100 },
    text: "Client reporting is killing us. Every Monday two people spend 6 hours copying numbers into slides by hand. There has to be a better way — what do other agencies use?",
  },
  {
    user: { username: "mock_automation_guru", name: "Automation Guru", description: "I build n8n + AI agents for businesses. DM me.", website: "https://guru.example", followers: 12000 },
    text: "I build custom AI automations for agencies and dentists. DM me for a free audit, link in bio.",
  },
  {
    user: { username: "mock_tech_news_daily", name: "Tech News Daily", description: "AI news, every day.", website: null, followers: 88000 },
    text: "New study: 62% of small businesses plan to adopt AI automation this year. Thread on what it means for workflow tools like Zapier and n8n.",
  },
  {
    user: { username: "mock_peakplumbing", name: "Peak Plumbing & Heating", description: "Owner of a 12-van plumbing company.", website: "https://peakplumbing.example", followers: 310 },
    text: "Missed 9 calls yesterday while on jobs. Every missed call is a lost job. Need help setting up something that texts people back automatically.",
  },
  {
    user: { username: "mock_talentbridge", name: "TalentBridge Recruiting", description: "Agency owner. Tech & finance recruiting, 15 recruiters.", website: "https://talentbridge.example", followers: 2200 },
    text: "We are spending hours screening CVs manually for every role. Anyone know a good way to automate first-pass screening and interview scheduling?",
  },
  {
    user: { username: "mock_jane_dev", name: "Jane", description: "Software engineer. Opinions my own.", website: null, followers: 640 },
    text: "Hot take: most workflow automation is just cron jobs with a nicer UI. Still love n8n though.",
  },
];

let counter = BigInt(0);

export class MockXClient implements XClient {
  readonly name = "mock" as const;
  isConfigured() { return true; }

  async searchRecent(params: {
    query: string;
    maxResults: number;
    sinceId?: string | null;
    nextToken?: string | null;
  }): Promise<XSearchPage> {
    // Ids only ever increase, like real snowflake ids, so since_id works.
    const base = BigInt(params.sinceId ?? "1900000000000000000") + BigInt(1000) + counter;
    counter += BigInt(100);
    const count = Math.min(params.maxResults, params.nextToken ? 3 : TEMPLATES.length);

    const users = new Map<string, XUser>();
    const tweets: XTweet[] = [];
    for (let i = 0; i < count; i++) {
      const tpl = TEMPLATES[(i + (params.nextToken ? 5 : 0)) % TEMPLATES.length];
      const userId = `mock-${tpl.user.username}`;
      users.set(userId, { id: userId, ...tpl.user });
      const id = String(base + BigInt(i));
      tweets.push({
        id, text: tpl.text, authorId: userId, lang: "en",
        createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
        isReply: false, metrics: { like_count: i, reply_count: 0, retweet_count: 0 },
        raw: { mock: true, query: params.query },
      });
    }
    tweets.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));

    return {
      tweets, users,
      newestId: tweets[0]?.id ?? null,
      // One follow-up page on a first run, so pagination is exercised too.
      nextToken: params.nextToken ? null : "mock-page-2",
      rateLimit: { remaining: 400, resetAt: new Date(Date.now() + 15 * 60_000) },
    };
  }

  async getUsage(): Promise<XUsage> {
    return { projectCap: null, projectUsage: null, capResetDay: null };
  }
}
