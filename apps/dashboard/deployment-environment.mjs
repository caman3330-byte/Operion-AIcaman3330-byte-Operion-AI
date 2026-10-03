import safety from "./environment-safety.cjs";

export function assertDeploymentEnvironment(env) {
  return safety.assertEnvironment(env, "build");
}
