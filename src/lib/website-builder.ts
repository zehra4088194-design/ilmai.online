import { z } from 'zod';

const FileSchema = z.object({
  path: z.string().min(1).max(180),
  content: z.string().max(40_000),
});

const ProjectSchema = z.object({
  projectName: z.string().trim().min(2).max(80),
  summary: z.string().trim().min(10).max(1200),
  files: z.array(FileSchema).min(4).max(70),
  nextSteps: z.array(z.string().trim().min(3).max(240)).max(12).default([]),
});

const MAX_TOTAL_BYTES = 650_000;
const RESERVED_NAMES = new Set(['.env', '.npmrc', '.yarnrc', '.pnp.cjs']);

function safePath(raw: string) {
  const path = raw.trim().replace(/\\/g, '/');
  if (!path || path.startsWith('/') || /^[a-z]:/i.test(path) || /[\u0000-\u001f\u007f]/.test(path))
    throw new Error('The generated project contains an invalid file path');
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error('The generated project contains an unsafe path');
  if (parts.some((part) => RESERVED_NAMES.has(part.toLowerCase()) || /^\.env($|\.)/i.test(part) || /\.(pem|key|p12|pfx)$/i.test(part)))
    throw new Error('The generated project attempted to include a secret or private-key file');
  return parts.join('/');
}

function validatePackageJson(content: string) {
  let pkg: Record<string, unknown>;
  try { pkg = JSON.parse(content) as Record<string, unknown>; }
  catch { throw new Error('Generated package.json is not valid JSON'); }
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts as Record<string, unknown> : {};
  const deps = { ...(pkg.dependencies as Record<string, unknown> ?? {}), ...(pkg.devDependencies as Record<string, unknown> ?? {}) };
  if (typeof scripts.dev !== 'string' || typeof scripts.build !== 'string' ||
      !deps.next || !deps.react || !deps['react-dom'])
    throw new Error('The website project is incomplete: package.json needs Next.js, React, and dev/build scripts');
  const lifecycle = ['preinstall', 'install', 'postinstall', 'prepare'];
  if (lifecycle.some((key) => scripts[key])) throw new Error('Generated package.json includes a blocked install lifecycle script');
  for (const value of Object.values(scripts)) {
    if (typeof value === 'string' && /\b(curl|wget|powershell|invoke-webrequest|rm\s+-rf|mkfs|format\s+[a-z]:|nc\s+-|netcat)\b/i.test(value))
      throw new Error('Generated package.json includes an unsafe shell command');
  }
}

export type WebsiteProject = {
  projectName: string;
  summary: string;
  files: { path: string; content: string }[];
  nextSteps: string[];
};

/** Validates and normalizes model-generated source before it can be packaged for download. */
export function validateWebsiteProject(value: unknown): WebsiteProject {
  const parsed = ProjectSchema.parse(value);
  const seen = new Set<string>();
  let total = 0;
  const files = parsed.files.map((file) => {
    const path = safePath(file.path);
    if (seen.has(path.toLowerCase())) throw new Error('The generated project contains duplicate file paths');
    seen.add(path.toLowerCase());
    total += Buffer.byteLength(file.content, 'utf8');
    if (total > MAX_TOTAL_BYTES) throw new Error('The generated project is too large to package safely');
    if (file.content.includes('-----BEGIN PRIVATE KEY-----') || /sk-[A-Za-z0-9]{24,}/.test(file.content))
      throw new Error('A generated file appears to contain a private key or API token');
    return { path, content: file.content };
  });

  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const packageJson = byPath.get('package.json');
  if (!packageJson) throw new Error('The generated project is missing package.json');
  validatePackageJson(packageJson);
  if (!['src/app/page.tsx', 'app/page.tsx', 'src/pages/index.tsx', 'pages/index.tsx'].some((path) => byPath.has(path)))
    throw new Error('The generated project is missing its main page');

  if (!byPath.has('README.md')) {
    files.push({
      path: 'README.md',
      content: '# ' + parsed.projectName + '\n\n' + parsed.summary +
        '\n\n## Run locally\n\n~~~bash\nnpm install\nnpm run dev\n~~~\n\n## Production check\n\n~~~bash\nnpm run build\n~~~\n\nReview the generated pages, links, forms and responsive layouts before publishing.',
    });
  }
  if (!byPath.has('PROJECT_CHECKLIST.md')) {
    files.push({
      path: 'PROJECT_CHECKLIST.md',
      content: '# Launch checklist\n\n- [ ] Run npm install and confirm dependencies install cleanly.\n- [ ] Run npm run build and resolve any TypeScript or build errors.\n- [ ] Test every page, navigation link, form and CTA.\n- [ ] Review mobile, tablet and desktop layouts.\n- [ ] Replace demo copy, placeholder images and contact details.\n- [ ] Add real API keys only through server-side environment variables.\n- [ ] Configure the production domain, HTTPS and hosting environment.\n',
    });
  }
  const nextSteps = parsed.nextSteps.length ? parsed.nextSteps : [
    'Extract the ZIP into a new folder.',
    'Run npm install, then npm run dev to preview the website locally.',
    'Run npm run build and fix any reported issues before publishing.',
    'Connect your GitHub repository to your hosting provider and configure the production domain.',
  ];
  return { projectName: parsed.projectName, summary: parsed.summary, files, nextSteps };
}
