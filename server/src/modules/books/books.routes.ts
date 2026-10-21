import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { royaltyState, ROYALTY_STATE_NOTE, payoutCalendar } from '../../ai/royalty-facts.js';
import { db } from '../../db/client.js';
import { books, users, type Book } from '../../db/schema.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { validate, validatedQuery } from '../../middleware/validate.js';

export const booksRouter = Router();
booksRouter.use(requireAuth);

const toBookDto = (b: Book & { authorName?: string }) => {
  const state = royaltyState(b);
  return {
    id: b.id,
    title: b.title,
    isbn: b.isbn,
    genre: b.genre,
    publicationDate: b.publicationDate,
    status: b.status,
    inProduction: state === 'in_production',
    mrp: b.mrp,
    royaltyPerCopy: b.royaltyPerCopy,
    copiesSold: b.copiesSold,
    royaltyEarned: b.royaltyEarned,
    royaltyPaid: b.royaltyPaid,
    royaltyPending: b.royaltyPending,
    lastPayoutDate: b.lastPayoutDate,
    royaltyState: state,
    royaltyNote: ROYALTY_STATE_NOTE[state],
    printPartner: b.printPartner,
    availableOn: b.availableOn,
    ...(b.authorName ? { authorName: b.authorName } : {}),
  };
};

const ListBooksSchema = z.object({ authorId: z.uuid().optional() });

// GET /books — an author sees only their own books; an admin can see any (optionally by author).
booksRouter.get('/', validate('query', ListBooksSchema), async (req, res) => {
  const user = currentUser(req);
  const { authorId } = validatedQuery<z.infer<typeof ListBooksSchema>>(req);
  const scopeAuthor = user.role === 'author' ? user.id : authorId;

  const rows = await db
    .select({ book: books, authorName: users.name })
    .from(books)
    .innerJoin(users, eq(users.id, books.authorId))
    .where(scopeAuthor ? eq(books.authorId, scopeAuthor) : undefined)
    .orderBy(asc(books.id));

  const items = rows.map((r) => toBookDto(user.role === 'admin' ? { ...r.book, authorName: r.authorName } : r.book));
  const totals = items.reduce(
    (t, b) => ({
      copiesSold: t.copiesSold + b.copiesSold,
      royaltyEarned: t.royaltyEarned + b.royaltyEarned,
      royaltyPaid: t.royaltyPaid + b.royaltyPaid,
      royaltyPending: t.royaltyPending + b.royaltyPending,
    }),
    { copiesSold: 0, royaltyEarned: 0, royaltyPaid: 0, royaltyPending: 0 },
  );
  res.json({ items, totals, payoutCalendar: payoutCalendar() });
});
