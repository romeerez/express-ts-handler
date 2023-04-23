import { makeHandler } from './index';
import { Request, Response } from 'express';
import { beforeEach } from 'vitest';

type AssertEqual<T, Expected> = [T] extends [Expected]
  ? [Expected] extends [T]
    ? true
    : false
  : false;

export const assertType = <T, Expected>(
  ..._: AssertEqual<T, Expected> extends true ? [] : ['invalid type']
) => {
  // noop
};

const error = new Error('Invalid value');

const parse = vi.fn((_: { _output: unknown }, value: unknown) => {
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).key === 'string'
  ) {
    return 'parsed';
  } else {
    throw error;
  }
});

const handler = makeHandler({
  parse: (type: { _output: unknown }, value: unknown) => parse(type, value),
  object: (obj) => ({ obj }),
});

class Type<T> {
  _output: T;
  constructor(type: T) {
    this._output = type;
  }
}

const type = new Type({ key: 'value' });

const value = { key: 'value' };

const req = {} as Request;

const res = {
  send: vi.fn(() => {
    res.headersSent = true;
  }),
} as unknown as Response;

const next = vi.fn();

const expressArgs = [req, res, next] as const;

describe('express-ts-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    res.headersSent = false;
    req.query = value;
    req.params = value;
    req.body = value;
  });

  it('should make req.query, req.params, req.body unknown, no return check when no options provided', () => {
    handler({
      handler(req) {
        assertType<unknown, typeof req.query>();
        assertType<unknown, typeof req.params>();
        assertType<unknown, typeof req.body>();
      },
    });
  });

  it('should validate req.query', async () => {
    await handler({
      query: type,
      handler(req) {
        assertType<typeof type._output, typeof req.query>();
      },
    })(req, res, next);

    expect(parse).toBeCalledWith(type, value);
    expect(req.query).toBe('parsed');
  });

  it('should validate req.query when object provided', async () => {
    const obj = { key: type };

    await handler({
      query: obj,
      handler(req) {
        assertType<{ key: typeof type._output }, typeof req.query>();
      },
    })(req, res, next);

    expect(parse).toBeCalledWith({ obj }, value);
    expect(req.query).toBe('parsed');
  });

  it('should call next with error if req.query is invalid', async () => {
    await handler({
      query: type,
      handler() {},
    })(Object.assign(req, { query: 'invalid' }), res, next);

    expect(next).toBeCalledWith(error);
  });

  it('should validate req.params', () => {
    handler({
      params: type,
      handler(req) {
        assertType<typeof type._output, typeof req.params>();
      },
    })(req, res, next);

    expect(parse).toBeCalledWith(type, value);
    expect(req.params).toBe('parsed');
  });

  it('should validate req.params', () => {
    const obj = { key: type };

    handler({
      params: obj,
      handler(req) {
        assertType<{ key: typeof type._output }, typeof req.params>();
      },
    })(req, res, next);

    expect(parse).toBeCalledWith({ obj }, value);
    expect(req.params).toBe('parsed');
  });

  it('should call next with error if req.params is invalid', async () => {
    await handler({
      params: type,
      handler() {},
    })(Object.assign(req, { params: 'invalid' }), res, next);

    expect(next).toBeCalledWith(error);
  });

  it('should validate req.body', async () => {
    await handler({
      body: type,
      handler(req) {
        assertType<typeof type._output, typeof req.body>();
      },
    })(req, res, next);

    expect(parse).toBeCalledWith(type, value);
    expect(req.body).toBe('parsed');
  });

  it('should validate req.body when object provided', async () => {
    const obj = { key: type };

    await handler({
      body: obj,
      handler(req) {
        assertType<{ key: typeof type._output }, typeof req.body>();
      },
    })(req, res, next);

    expect(parse).toBeCalledWith({ obj }, value);
    expect(req.body).toBe('parsed');
  });

  it('should call next with error if req.body is invalid', async () => {
    await handler({
      body: type,
      handler() {},
    })(Object.assign(req, { body: 'invalid' }), res, next);

    expect(next).toBeCalledWith(error);
  });

  it('should validate req.send', async () => {
    await handler({
      result: type,
      handler(_, res) {
        assertType<
          Parameters<typeof res.send>[0],
          typeof type._output | undefined
        >();

        res.send(value);
      },
    })(...expressArgs);

    expect(res.send).toBeCalledWith('parsed');
  });

  it('should validate req.send when object is provided', async () => {
    await handler({
      result: { key: type },
      handler(_, res) {
        assertType<
          Parameters<typeof res.send>[0],
          { key: typeof type._output } | undefined
        >();

        // @ts-expect-error req.send is validated
        res.send(value);

        res.send({ key: value });
      },
    })(...expressArgs);

    expect(res.send).toBeCalledWith('parsed');
  });

  it('should call next with error if invalid data was sent', async () => {
    await handler({
      result: type,
      handler(_, res) {
        res.send({ invalid: true } as unknown as typeof type._output);
      },
    })(req, res, next);

    expect(next).toBeCalledWith(error);
  });

  it('should forbid returning invalid data', () => {
    handler({
      result: type,
      // @ts-expect-error invalid data
      handler() {
        return { invalid: true };
      },
    });
  });

  it('should forbid sending and returning extra fields', () => {
    handler({
      result: type,
      // @ts-expect-error extra field
      handler() {
        return { key: 'value', password: '1234' };
      },
    });
  });

  it('should forbid sending and returning extra fields from async handler', () => {
    handler({
      result: type,
      // @ts-expect-error extra field
      async handler() {
        return { key: 'value', password: '1234' };
      },
    });
  });

  it('should send returned data', async () => {
    await handler({
      result: type,
      handler() {
        return value;
      },
    })(...expressArgs);

    expect(res.send).toBeCalledWith('parsed');
  });

  it('should call next with error if invalid data was returned', async () => {
    await handler({
      result: type,
      handler() {
        return { invalid: true } as unknown as typeof type._output;
      },
    })(req, res, next);

    expect(next).toBeCalledWith(error);
  });

  it('should not send returned data if it was already sent', async () => {
    await handler({
      result: type,
      handler(_, res) {
        res.send({ key: 'send manually' });
        return { key: 'send on return' };
      },
    })(...expressArgs);

    expect(res.send).toBeCalledWith('parsed');
  });

  it('should not send returned data if handler calls next with error', async () => {
    const error = new Error();

    await handler({
      result: type,
      handler(_req, _res, next) {
        next(error);
        return value;
      },
    })(...expressArgs);

    expect(next).toBeCalledWith(error);
    expect(res.send).not.toBeCalled();
  });

  it('should handle special middleware functions in use', async () => {
    const one = vi.fn();
    const two = vi.fn();

    await handler({
      use: [
        (req: Request) => {
          one();
          return Object.assign(req, { one: 123 });
        },
        async (req: Request) => {
          two();
          return Object.assign(req, { two: 'string' });
        },
      ],
      handler(req) {
        assertType<typeof req.one, number>();
        assertType<typeof req.two, string>();
      },
    })(...expressArgs);

    expect(req).toMatchObject({ one: 123 });
    expect(one).toBeCalled();
    expect(two).toBeCalled();
  });

  it('should stop processing middleware if one of them throws', async () => {
    const one = vi.fn();
    const two = vi.fn();
    const three = vi.fn();
    const error = new Error();

    await handler({
      use: [
        () => {
          one();
          throw error;
        },
        () => {
          two();
        },
      ],
      handler() {
        three();
      },
    })(...expressArgs);

    expect(next).toBeCalledWith(error);
    expect(one).toBeCalled();
    expect(two).not.toBeCalled();
    expect(three).not.toBeCalled();
  });

  it('should stop processing middleware if one of them calls next with error', async () => {
    const one = vi.fn();
    const two = vi.fn();
    const three = vi.fn();
    const error = new Error();

    await handler({
      use: [
        (_req, _res, next) => {
          one();
          next(error);
        },
        () => {
          two();
        },
      ],
      handler() {
        three();
      },
    })(...expressArgs);

    expect(next).toBeCalledWith(error);
    expect(one).toBeCalled();
    expect(two).not.toBeCalled();
    expect(three).not.toBeCalled();
  });
});
