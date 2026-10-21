import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { hashPassword } from '../auth/session.js';
import { logger } from '../lib/logger.js';
import { db } from './client.js';
import { books, ticketMessages, tickets, users } from './schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(here, '../../data/bookleaf_sample_data.json');

// Demo credentials (documented in the README). Every author from the dataset gets the same demo password.
export const DEMO_AUTHOR_PASSWORD = 'Author@123';
export const DEMO_ADMIN_PASSWORD = 'Admin@123';
export const DEMO_ADMINS = [
  { name: 'Riya Mehta', email: 'admin@bookleafpub.com' },
  { name: 'Aman Gupta', email: 'support@bookleafpub.com' },
];

// The dataset is validated on load, so a malformed record fails loudly instead of seeding bad data.
const BookSchema = z.object({
  book_id: z.string(),
  title: z.string(),
  isbn: z.string(),
  genre: z.string(),
  publication_date: z.string().nullable(),
  status: z.string(),
  mrp: z.number().int().nullable(),
  author_royalty_per_copy: z.number().int().nullable(),
  total_copies_sold: z.number().int(),
  total_royalty_earned: z.number().int(),
  royalty_paid: z.number().int(),
  royalty_pending: z.number().int(),
  last_royalty_payout_date: z.string().nullable(),
  print_partner: z.string().nullable(),
  available_on: z.array(z.string()),
});
const DatasetSchema = z.object({
  authors: z.array(
    z.object({
      author_id: z.string(),
      name: z.string(),
      email: z.email(),
      phone: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      joined_date: z.string().nullable().optional(),
      books: z.array(BookSchema),
    }),
  ),
});

// A few realistic tickets (based on the brief's sample queries) so the admin queue isn't empty on first login.
const DEMO_TICKETS: { authorCode: string; bookId: string | null; subject: string; description: string; daysAgo: number; reply?: string }[] = [
  {
    authorCode: 'AUTH003',
    bookId: 'BK005',
    subject: "Haven't received any royalty yet",
    description:
      "My book Between Two Temples was published in July 2024 and it's been more than a year, but I still haven't received a single royalty payment. My dashboard shows ₹2,546 pending. What's going on? This is really frustrating.",
    daysAgo: 3,
  },
  {
    authorCode: 'AUTH002',
    bookId: 'BK004',
    subject: 'Different ISBN on Amazon vs printed copy',
    description:
      'The ISBN printed on the back cover of my book is different from the ISBN shown on the Amazon India listing. Readers are getting confused and I am worried sales are being split. Please fix this urgently.',
    daysAgo: 1,
  },
  {
    authorCode: 'AUTH007',
    bookId: 'BK013',
    subject: 'How long will cover design take?',
    description:
      'My new book has been in the cover design stage for a while now. Could you tell me when the cover will be ready and what the remaining steps are before it gets published?',
    daysAgo: 2,
  },
  {
    authorCode: 'AUTH005',
    bookId: 'BK009',
    subject: 'Print quality issue with author copies',
    description:
      'I received my 20 author copies yesterday and in many of them the images are blurry and a few pages are misaligned. I want to gift these at a launch event next month — please help.',
    daysAgo: 0,
  },
  {
    authorCode: 'AUTH001',
    bookId: null,
    subject: 'Can I update my author bio?',
    description:
      'I would like to update the author bio that appears on my book listings to mention my new award. Is that possible after the books are already live, and how long does it take?',
    daysAgo: 5,
    reply:
      'Hi Priya, congratulations on the award! Yes — you can submit the updated bio from your dashboard or reply here with the new text. Changes reflect on all platforms within 3–5 business days.\n\nWarm regards,\nBookLeaf Author Support',
  },
];

/** Seeds the dataset if the database is empty. Safe to call on every boot. */
export async function seedIfEmpty(): Promise<{ seeded: boolean }> {
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) return { seeded: false };

  const data = DatasetSchema.parse(JSON.parse(readFileSync(DATA_FILE, 'utf8')));
  const [authorHash, adminHash] = await Promise.all([hashPassword(DEMO_AUTHOR_PASSWORD), hashPassword(DEMO_ADMIN_PASSWORD)]);

  await db.transaction(async (tx) => {
    const admins = await tx
      .insert(users)
      .values(DEMO_ADMINS.map((a) => ({ ...a, role: 'admin' as const, passwordHash: adminHash })))
      .returning();

    const authorIds = new Map<string, string>();
    for (const a of data.authors) {
      const [author] = await tx
        .insert(users)
        .values({
          email: a.email.toLowerCase(),
          name: a.name,
          role: 'author',
          passwordHash: authorHash,
          authorCode: a.author_id,
          phone: a.phone ?? null,
          city: a.city ?? null,
          joinedDate: a.joined_date ?? null,
        })
        .returning({ id: users.id });
      authorIds.set(a.author_id, author.id);

      if (a.books.length) {
        await tx.insert(books).values(
          a.books.map((b) => ({
            id: b.book_id,
            authorId: author.id,
            title: b.title,
            isbn: b.isbn,
            genre: b.genre,
            publicationDate: b.publication_date,
            status: b.status,
            mrp: b.mrp,
            royaltyPerCopy: b.author_royalty_per_copy,
            copiesSold: b.total_copies_sold,
            royaltyEarned: b.total_royalty_earned,
            royaltyPaid: b.royalty_paid,
            royaltyPending: b.royalty_pending,
            lastPayoutDate: b.last_royalty_payout_date,
            printPartner: b.print_partner,
            availableOn: b.available_on,
          })),
        );
      }
    }

    for (const t of DEMO_TICKETS) {
      const authorId = authorIds.get(t.authorCode);
      if (!authorId) continue;
      const createdAt = new Date(Date.now() - t.daysAgo * 86_400_000 - 3_600_000);
      const [ticket] = await tx
        .insert(tickets)
        .values({ authorId, bookId: t.bookId, subject: t.subject, description: t.description, createdAt, updatedAt: createdAt })
        .returning({ id: tickets.id });
      if (t.reply) {
        const repliedAt = new Date(createdAt.getTime() + 5 * 3_600_000);
        await tx.insert(ticketMessages).values({ ticketId: ticket.id, senderId: admins[0].id, senderRole: 'admin', body: t.reply, createdAt: repliedAt });
        await tx.update(tickets).set({ status: 'resolved', firstResponseAt: repliedAt, resolvedAt: repliedAt }).where(eq(tickets.id, ticket.id));
      }
    }
  });

  logger.info('Seeded sample dataset', { authors: data.authors.length, books: data.authors.reduce((s, a) => s + a.books.length, 0) });
  return { seeded: true };
}

