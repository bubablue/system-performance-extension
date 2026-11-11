import * as path from "path";

export function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
  try {
    return fn();
  } finally {
    Object.defineProperty(process, "platform", original);
  }
}

export function freshRequire<T = any>(modulePath: string): T {
  const resolved = require.resolve(path.join(__dirname, "../..", modulePath));
  delete require.cache[resolved];
  return require(resolved);
}

export type Counter = { calls: number };

export function stub(
  target: any,
  name: string,
  impl: (...args: any[]) => any
): { counter: Counter; restore: () => void } {
  const original = target[name];
  const counter: Counter = { calls: 0 };
  target[name] = (...args: any[]) => {
    counter.calls++;
    return impl(...args);
  };
  return {
    counter,
    restore: () => {
      target[name] = original;
    },
  };
}

export async function quietErrors<T>(fn: () => T | Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

export function realModule(name: string): any {
  return require(name);
}
