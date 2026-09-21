import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { BuildTrackerView } from "@/components/build/BuildTrackerView";
import { getBuildStats, listBuildLogs, listBuildProjects } from "@/lib/services/build";

export const metadata = { title: "Build Tracker" };
export const dynamic = "force-dynamic";

export default async function BuildPage() {
  const [projects, logs, stats] = await Promise.all([
    listBuildProjects(),
    listBuildLogs(undefined, 100),
    getBuildStats(),
  ]);

  return (
    <>
      <PageHeader
        title="Build Tracker"
        description="27 projects across 9 weeks. Mark one active and the content engine writes about that one; log what you actually did and it writes with specifics instead of the plan."
      />
      <PageBody>
        <BuildTrackerView
          projects={JSON.parse(JSON.stringify(projects))}
          logs={JSON.parse(JSON.stringify(logs))}
          stats={stats}
        />
      </PageBody>
    </>
  );
}
