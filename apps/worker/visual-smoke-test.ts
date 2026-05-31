import { checkVisualAnalysis } from './src/checks/visual.check';

async function main() {
  const result = await checkVisualAnalysis({
    asset: {
      id: 'manual-test',
      value: 'oguzhanaslan.cloud',
      type: 'DOMAIN',
      status: 'VERIFIED',
    },
    screenshotDir: './visual-smoke',
  });

  console.log(JSON.stringify({
    skipped: result.skipped,
    skipReason: result.skipReason,
    url: result.url,
    finalUrl: result.finalUrl,
    statusCode: result.statusCode,
    screenshotPath: result.screenshotPath,
    screenshotHash: result.screenshotHash,
    screenshotWidth: result.screenshotWidth,
    screenshotHeight: result.screenshotHeight,
    title: result.title,
    metaDescription: result.metaDescription,
    h1Texts: result.h1Texts,
    siteCategory: result.siteCategory,
    purposeSummary: result.purposeSummary,
    language: result.language,
    signals: result.signals,
    riskLevel: result.riskLevel,
    analysis: result.analysis,
    error: result.error,
  }, null, 2));
}

main().catch((err) => {
  console.error('VISUAL_SMOKE_TEST_FAILED');
  console.error(err);
  process.exit(1);
});
