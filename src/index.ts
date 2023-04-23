import { NextFunction, Request, RequestHandler, Response, Send } from 'express';

type BaseType = { _output: unknown };

type ObjectType<T extends BaseType> = Record<string, T>;

type Parse<T extends BaseType, Result> = (type: T, value: unknown) => Result;

type Output<T extends BaseType | ObjectType<BaseType>> = T extends BaseType
  ? T['_output']
  : {
      [K in keyof T]: T[K] extends BaseType ? T[K]['_output'] : never;
    };

type Options<T extends BaseType> = {
  parse: Parse<T, unknown>;
  object(props: Record<string, T>): unknown;
  checkResult?: boolean;
};

type Middleware = <Req extends Request>(
  req: Req,
  res: Response,
  next: NextFunction,
) => Req | Request | void | Promise<Req | Request | void>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReduceMiddleware<U extends any[], Req> = U extends [infer L, ...infer R]
  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L extends (...args: any[]) => Request | Promise<Request>
    ? ReduceMiddleware<R, Awaited<ReturnType<L>> & Req>
    : ReduceMiddleware<R, Req>
  : Req;

type MiddlewareResult<
  U extends Middleware[],
  M extends Middleware,
> = Middleware[] extends U
  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Middleware extends M
    ? Request
    : Awaited<ReturnType<M>>
  : ReduceMiddleware<U, Request>;

type CheckResult<Expected, Actual> = [Expected] extends [Actual]
  ? [Actual] extends [Expected]
    ? Actual
    : never
  : never;

export type ToArray<T> = T extends unknown[] ? T : [T];

type Handler<T extends BaseType> = <
  U extends Middleware[],
  M extends Middleware,
  Q extends T | ObjectType<T>,
  P extends T | ObjectType<T>,
  B extends T | ObjectType<T>,
  R extends T | ObjectType<T>,
  Result extends Output<R> | Promise<Output<R>>,
>(obj: {
  use?: M | [...U];
  query?: Q;
  params?: P;
  body?: B;
  result?: R;
  handler: (
    req: {
      [K in keyof MiddlewareResult<U, M>]: K extends 'query'
        ? Output<Q>
        : K extends 'params'
        ? Output<P>
        : K extends 'body'
        ? Output<B>
        : K extends 'res'
        ? Response<Output<R>>
        : MiddlewareResult<U, M>[K];
    },
    res: Response<Output<R>>,
    next: NextFunction,
  ) =>
    | CheckResult<Output<R>, Result>
    | CheckResult<Promise<Output<R>>, Result>
    | void
    | Promise<void>;
}) => RequestHandler;

const objectToType = (object: Options<BaseType>['object'], obj: unknown) => {
  if (obj?.constructor === Object) {
    obj = object(obj as Record<string, BaseType>);
  }
  return obj;
};

export const makeHandler = <T extends BaseType>({
  parse,
  checkResult = process.env.NODE_ENV !== 'production',
  object,
}: Options<T>): Handler<T> => {
  return (({ use, query, params, body, result, handler }) => {
    query = objectToType(object, query) as typeof query;
    params = objectToType(object, params) as typeof params;
    body = objectToType(object, body) as typeof body;
    result = objectToType(object, result) as typeof result;
    if (use && !Array.isArray(use)) (use as unknown) = [use];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (async (req: any, res: any, next: (err?: unknown) => void) => {
      let err;
      let originalSend: Send | undefined;

      const localNext = (error?: unknown) => {
        err = error;
      };

      try {
        if (use) {
          for (const fn of use as Middleware[]) {
            await fn(req, res, localNext);
            if (err) {
              next(err);
              return;
            }
          }
        }

        if (query) req.query = parse(query as T, req.query);
        if (params) req.params = parse(params as T, req.params);
        if (body) req.body = parse(body as T, req.body);

        if (result && checkResult) {
          const send = res.send;
          originalSend = send;
          res.send = (value: unknown) => {
            originalSend = undefined;
            res.send = send;
            return send.call(res, parse(result as T, value));
          };
        }

        const output = await (handler as (...args: unknown[]) => unknown)(
          req,
          res,
          localNext,
        );
        if (!res.headersSent && !err) {
          res.send(output as Output<Exclude<typeof result, undefined>>);
        }
      } catch (e) {
        err = e;
      }

      if (originalSend) {
        res.send = originalSend;
      }

      next(err);
    }) as typeof handler;
  }) as Handler<T>;
};
