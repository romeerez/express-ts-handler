import express, { NextFunction, Request, Response } from 'express';
import { makeHandler } from 'express-ts-handler';
import { createItem, findItemById, searchItemsByName } from './item.repo';
import { ZodSchema, z, ZodError } from 'zod';

// to differentiate application errors from unexpected errors
class AppError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
  }
}

// initialize route handler
const handler = makeHandler<ZodSchema>({
  parse: (type, value) => type.parse(value),
  object: z.object,
});

// pass a header `Authorization: secret` to authorize
const authMiddleware = (req: Request) => {
  if (req.header('Authorization') !== 'secret')
    throw new AppError('Unauthorized');

  // assign user object to req, return result
  return Object.assign(req, { user: { id: 1 } });
};

const ItemType = z.object({
  id: z.number().int(),
  name: z.string(),
  userId: z.number().int(),
});

export type Item = z.infer<typeof ItemType>;

const app = express();

// parse json body
app.use(express.json());

app.get('/', (req) => {
  req.query.body?.toLocaleString();
});

// get item by id
app.get(
  '/items/:id',
  handler({
    params: {
      id: z.coerce.number().int(),
    },
    result: ItemType,
    async handler(req) {
      const { id } = req.params;
      const item = await findItemById(id);
      if (!item) throw new AppError('Not found');

      return item;
    },
  }),
);

// search items by name
app.get(
  '/items',
  handler({
    query: {
      name: z.string(),
    },
    result: ItemType.array(),
    handler(req) {
      return searchItemsByName(req.query.name);
    },
  }),
);

app.post(
  '/items',
  handler({
    use: authMiddleware,
    body: {
      name: z.string(),
    },
    result: ItemType,
    async handler(req) {
      return createItem({
        name: req.body.name,
        userId: req.user.id,
      });
    },
  }),
);

// error handling:
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _: NextFunction) => {
  console.error(err);

  if (err instanceof AppError) {
    res.status(err.status).send(err.message);
  } else if (err instanceof ZodError) {
    res.status(422).send(err.formErrors);
  } else {
    res.status(500).send('Something went wrong');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
