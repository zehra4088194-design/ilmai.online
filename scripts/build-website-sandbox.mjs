import { Template, defaultBuildLogger } from 'e2b';

const apiKey = process.env.E2B_API_KEY?.trim();
if (!apiKey) throw new Error('Set E2B_API_KEY in your environment before building the template.');

const templateName = process.env.E2B_WEBSITE_TEMPLATE?.trim() || 'ilmai-website-builder-node22';
const build = await Template.build(Template().fromNodeImage('22'), templateName, {
  apiKey,
  cpuCount: 2,
  memoryMB: 2048,
  onBuildLogs: defaultBuildLogger(),
});

console.log('Template ready:', build.templateId);
console.log('Coolify environment variable: E2B_WEBSITE_TEMPLATE=' + build.templateId);
