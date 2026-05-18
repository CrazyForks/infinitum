import {
  EnvHttpProxyAgent,
  getGlobalDispatcher,
  setGlobalDispatcher,
  type Dispatcher,
} from "undici";

type ProxyEnvironment = Record<string, string | undefined>;

type ProxyConfigurationResult =
  | {
      enabled: true;
      dispatcher: Dispatcher;
    }
  | {
      enabled: false;
      dispatcher: Dispatcher;
    };

let configuredDispatcher: Dispatcher | null = null;

function getProxyEnvironmentValue(
  env: ProxyEnvironment,
  uppercaseKey: keyof ProxyEnvironment,
  lowercaseKey: keyof ProxyEnvironment,
) {
  return env[lowercaseKey] || env[uppercaseKey] || undefined;
}

export function hasProxyEnvironment(env: ProxyEnvironment = process.env) {
  return Boolean(
    getProxyEnvironmentValue(env, "HTTP_PROXY", "http_proxy") ||
      getProxyEnvironmentValue(env, "HTTPS_PROXY", "https_proxy"),
  );
}

export function configureFetchProxyFromEnv(env: ProxyEnvironment = process.env): ProxyConfigurationResult {
  if (configuredDispatcher) {
    return {
      enabled: true,
      dispatcher: configuredDispatcher,
    };
  }

  if (!hasProxyEnvironment(env)) {
    return {
      enabled: false,
      dispatcher: getGlobalDispatcher(),
    };
  }

  const dispatcher = new EnvHttpProxyAgent({
    httpProxy: getProxyEnvironmentValue(env, "HTTP_PROXY", "http_proxy"),
    httpsProxy: getProxyEnvironmentValue(env, "HTTPS_PROXY", "https_proxy"),
    noProxy: getProxyEnvironmentValue(env, "NO_PROXY", "no_proxy"),
  });

  setGlobalDispatcher(dispatcher);
  configuredDispatcher = dispatcher;

  return {
    enabled: true,
    dispatcher,
  };
}
