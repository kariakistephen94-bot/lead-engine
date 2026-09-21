import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { ContentEngineView } from "@/components/content/ContentEngineView";
import { getAIProvider } from "@/lib/ai";
import { listBuildProjects } from "@/lib/services/build";
import { getContentStats, listPosts } from "@/lib/services/content";

export const metadata = { title: "Content Engine" };
export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const [posts, projects, stats] = await Promise.all([
    listPosts({}, 300),
    listBuildProjects(),
    getContentStats(),
  ]);

  return (
    <>
      <PageHeader
        title="Content Engine"
        description="Posts written from the project you are building, for X, LinkedIn, Instagram, TikTok, YouTube and Contra. Three takes on every text idea. Post by hand, then record what happened."
      />
      <PageBody>
        <ContentEngineView
          posts={JSON.parse(JSON.stringify(posts))}
          projects={JSON.parse(JSON.stringify(
            projects.map((p) => ({ id: p.id, number: p.number, title: p.title, status: p.status })),
          ))}
          stats={stats}
          providerName={getAIProvider().name}
        />
      </PageBody>
    </>
  );
}
