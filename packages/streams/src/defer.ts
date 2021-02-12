export default function defer<T = void>(): {
  promise: Promise<T>;
  resolve:
    | ((v: T | PromiseLike<T>) => void)
    | (void extends T ? () => void : never);
  reject: (e: Error) => void;
} {
  let resolve = (_v: T | PromiseLike<T>) => {};
  let reject = (_e: Error) => {};
  return {
    promise: new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    resolve,
    reject,
  };
}
