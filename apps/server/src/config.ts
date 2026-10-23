const DEV_JWT_SECRET = 'ringfall-dev-secret-not-for-production';

function jwtSecret(env: NodeJS.ProcessEnv): string {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
  return DEV_JWT_SECRET;
}

export interface Config {
  port: number;
  jwtSecret: string;
  /** Run database migrations when the server starts. */
  migrateOnStart: boolean;
  /** Run the background worker (arrivals, notifications) in this process. */
  worker: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    jwtSecret: jwtSecret(env),
    migrateOnStart: env.MIGRATE_ON_START !== 'false',
    worker: env.WORKER !== 'false',
  };
}
