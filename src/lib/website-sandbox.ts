import 'server-only';

import { Sandbox } from 'e2b';
import type { WebsiteProject } from '@/lib/website-builder';

export type WebsiteBuildCheck = {
  status: 'passed' | 'failed' | 'unavailable';
  phase: 'sandbox' | 'runtime' | 'dependencies' | 'production';
  durationMs: number;
  summary: string;
  details?: string;
  repairAttempts?: number;
};

const WORKDIR = '/home/user/ilmai-website';
const DEFAULT_TEMPLATE = 'ilmai-website-builder-node22';
const MAX_LOG_CHARS = 2_400;
const SANDBOX_TIMEOUT_MS = 300_000;

function outputFromError(error: unknown) {
  if (!error || typeof error !== 'object') return error instanceof Error ? error.message : String(error);
  const value = error as { message?: unknown; stdout?: unknown; stderr?: unknown };
  return [value.stderr, value.stdout, value.message]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .trim()
    .slice(-MAX_LOG_CHARS);
}

function resultOutput(stdout?: string, stderr?: string) {
  return [stdout, stderr]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .trim()
    .slice(-MAX_LOG_CHARS);
}

/**
 * Runs untrusted, model-generated source in a short-lived E2B microVM.
 * The sandbox receives source files only: never pass app credentials or user secrets.
 */
export async function runWebsiteBuildInSandbox(
  project: WebsiteProject,
  requestId: string,
): Promise<WebsiteBuildCheck> {
  const apiKey = process.env.E2B_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: 'unavailable',
      phase: 'sandbox',
      durationMs: 0,
      summary: 'E2B is not configured. Add the server-only E2B_API_KEY in Coolify and redeploy.',
    };
  }

  const startedAt = Date.now();
  let phase: WebsiteBuildCheck['phase'] = 'sandbox';
  let sandbox: Sandbox | undefined;

  try {
    const templateName = process.env.E2B_WEBSITE_TEMPLATE?.trim() || DEFAULT_TEMPLATE;
    sandbox = await Sandbox.create(templateName, {
      apiKey,
      timeoutMs: SANDBOX_TIMEOUT_MS,
      cpuCount: 2,
      metadata: {
        app: 'ilmai-website-builder',
        request: requestId,
      },
      lifecycle: {
        onTimeout: 'kill',
        autoResume: false,
      },
      network: {
        // Only the package registry is reachable while dependencies are downloaded.
        allowOut: ['registry.npmjs.org'],
        denyOut: ['0.0.0.0/0'],
      },
    });

    phase = 'runtime';
    const runtime = await sandbox.commands.run('node --version && npm --version', {
      timeoutMs: 15_000,
      cwd: '/home/user',
      envs: { CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
    });
    if (runtime.exitCode !== 0) {
      throw new Error(resultOutput(runtime.stdout, runtime.stderr) || 'The E2B template does not contain Node.js and npm.');
    }

    await sandbox.files.write(
      project.files.map((file) => ({
        path: `${WORKDIR}/${file.path}`,
        data: file.content,
      })),
    );

    phase = 'dependencies';
    const install = await sandbox.commands.run(
      'npm install --ignore-scripts --no-audit --no-fund --no-progress --registry=https://registry.npmjs.org',
      {
        cwd: WORKDIR,
        timeoutMs: 120_000,
        envs: {
          CI: '1',
          npm_config_ignore_scripts: 'true',
          npm_config_audit: 'false',
          npm_config_fund: 'false',
          NEXT_TELEMETRY_DISABLED: '1',
        },
      },
    );
    if (install.exitCode !== 0) {
      throw new Error(resultOutput(install.stdout, install.stderr) || 'npm could not install the generated project dependencies.');
    }

    // The only network phase is dependency download. Build code runs with all egress disabled.
    await sandbox.updateNetwork({ allowInternetAccess: false });

    phase = 'production';
    const build = await sandbox.commands.run('npm run build', {
      cwd: WORKDIR,
      timeoutMs: 150_000,
      envs: {
        CI: '1',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    });
    if (build.exitCode !== 0) {
      throw new Error(resultOutput(build.stdout, build.stderr) || 'The production build command failed.');
    }

    return {
      status: 'passed',
      phase,
      durationMs: Date.now() - startedAt,
      summary: 'Dependencies installed and the production build completed successfully in an isolated E2B sandbox.',
      details: resultOutput(build.stdout, build.stderr) || undefined,
    };
  } catch (error) {
    const details = outputFromError(error);
    const status = phase === 'sandbox' ? 'unavailable' : 'failed';
    return {
      status,
      phase,
      durationMs: Date.now() - startedAt,
      summary: status === 'unavailable'
        ? 'E2B could not start the isolated build environment. The project was generated but not build-verified.'
        : phase === 'dependencies'
          ? 'The generated project dependencies could not be installed safely.'
          : phase === 'runtime'
            ? 'The E2B sandbox could not prepare its Node.js runtime or project files.'
            : 'The generated project did not pass its production build.',
      details: details || undefined,
    };
  } finally {
    if (sandbox) {
      await sandbox.kill().catch((error: unknown) => {
        console.error('[website-builder] failed to destroy E2B sandbox', error instanceof Error ? error.message : 'unknown error');
      });
    }
  }
}
