type Environment = Record<string, string | undefined>;
export const PRODUCTION_REF: string;
export const STAGING_REF: string;
export function environmentName(env: Environment): string;
export function assertEnvironment(env: Environment, purpose?: string): string;
export function databaseTarget(value: string): string;
export function permitsExternalDelivery(env: Environment): boolean;
export function assertMigrationTarget(env: Environment, dbUrl: string, args?: string[]): string;
