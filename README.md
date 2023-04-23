# express-ts-handler

This is route wrapper for Express that enables:

- preserving correct types of query, params, and body after validation
- type checking response, TS error when leaking extra data such as password
- validating response when not in production
- response may be returned from the handler
- fixes async error handling problem of Express
- middlewares can change the type of `req` on the fly

Supports [Zod](https://github.com/colinhacks/zod) for validations.
It doesn't depend on validation library directly, so it could be integrated with other validation libraries in future.

Check out [example](./example/src/server.ts) code.

## Get started

```sh
npm i express-ts-handler zod
```

First, we need to initialize a `handler` function:

```ts
import { makeHandler } from 'express-ts-handler';
import { z, ZodSchema } from 'zod';

export const handler = makeHandler<ZodSchema>({
  parse: (type, value) => type.parse(value),
  object: z.object,
})
```

## Validating query, params, body

When we don't specify any validations, `req.query`, `req.params`, and `req.body` become of type `unknown`:

```ts
app.post('/path/:id',
  handler({
    handler(req) {
      // no error in default Express, type error with this library:
      req.body?.name.toLowerCase();
    },
  }),
);
```

Before we can use any request data, we need to add a validation for it.
All unknown keys will be stripped by `Zod`, so we can safely save `req.body` to a database.

```ts
app.post('/path/:id',
  handler({
    // coerce and validate id from route path
    params: {
      id: z.coerce.number().int(),
    },
    // validate query string
    query: {
      key: z.string().optional(),
    },
    // validate request body
    body: {
      name: z.string(),
    },
    // finally, route handler. It may be sync or async
    async handler(req) {
      // all the data is typed properly
      const { id } = req.params // { id: number }
      const { key } = req.query // { key: string }
      const { name } = req.body // { name: string }
      
      return { ...response }
    },
  }),
);
```

Validations can be defined, as shown above, with plain objects, but also you can define a different type:

```ts
app.post('/path/:id',
  handler({
    // body can be of any type
    body: z.boolean().array().optional(),
    async handler(req) {
      // ...
    },
  }),
);
```

## Validating response

Set `result` validation to make it type-safe and validated:

```ts
app.get('/path',
  handler({
    result: {
      name: z.string(),
    },
    async handler(req) {
      // TS error:
      // return { invalid: true }
      
      return { name: 'string' }
    },
  }),
);
```

To not mistakenly leak a password, and to not send extra data when it's not intended, result validation prevents it with a TS error:

```ts
app.get('/path',
  handler({
    result: {
      name: z.string(),
    },
    // TS error
    async handler(req) {
      return { name: 'string', password: '1234' };
    },
  }),
);
```

`res.send` is also performing safely:

```ts
app.get('/path',
  handler({
    result: {
      name: z.string(),
    },
    async handler(req, res) {
      // TS error
      res.send({ name: 'string', password: '1234' });
      
      // no error
      res.send({ name: 'string' });
    },
  }),
);
```

This library runs validations on responses by default when `NODE_ENV !== 'production'`.

You can override it by passing a boolean into `checkResult`:

```ts
import { makeHandler } from 'express-ts-handler';

export const handler = makeHandler<ZodSchema>({
  // never check:
  checkResult: false,
});
```

## Special middlewares

We can define a regular function and call it inside a route handler, it's simpler than a middleware and is well typed:

```ts
// simple function
const authorizeUser = (req: Request) => {
  const token = req.header('Authorization');
  if (token === 'correct token') {
    return loadUserByToken(token);
  }
  throw new Error('Unauthorized');
};

app.get('/path', async (req) => {
  // no problems with types
  const user = await authorizeUser(req);
})
```

That works well, but for the case if we want first to run a middleware, and only after it is passed to run validations, this library supports the following:

```ts
const authorizeUser = async (req: Request) => {
  const token = req.header('Authorization');
  if (token === 'correct token') {
    const user = loadUserByToken(token);
    // assign user object to req, return result
    return Object.assign(req, { user });
  }
  throw new Error('Unauthorized');
};

app.get('/path',
  handler({
    use: authorizeUser,
    async handler(req, res) {
      // req.user has a correct type
      req.user.id
    },
  }),
);
```

`use` can take a single function, or an array of multiple middlewares:

```ts
// may be sync
const one = (req: Request) => {
  return Object.assign(req, { one: 123 });
};

// may be async
const two = async (req: Request) => {
  return Object.assign(req, { two: 'string' });
};

app.get('/path',
  handler({
    use: [one, two],
    async handler(req, res) {
      // req.one is string
      req.one.toLowerCase()
      // req.one is a number
      req.two.toFixed(2)
    },
  }),
);
```

Middlewares accept the same parameters as the Express ones, no problems with async errors, they can call `next` function.

```ts
const one = async () => {
  throw new Error('error from middleware')
};

// calling next(err) is equivalent to throwing
const two = async (req, res, next) => {
  next(new Error('error from middleware'))
};

app.get('/path',
  handler({
    use: [one, two],
    async handler(req, res) {
      // ...
    },
  }),
);
```
