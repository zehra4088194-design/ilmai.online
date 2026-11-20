import { z } from 'zod';

const shortText = z.string().trim().min(1).max(600);
const textList = z.array(shortText).max(10);

export const PresentationSlideSchema = z.object({
  type: z.enum(['title', 'bullets', 'two_column', 'quote', 'closing']),
  title: shortText,
  bullets: textList.optional().default([]),
  left: textList.optional().default([]),
  right: textList.optional().default([]),
  quote: z.string().trim().max(1200).default(''),
  notes: z.string().trim().max(3000).default(''),
}).strict().superRefine((slide, ctx) => {
  if (slide.type === 'bullets' && !slide.bullets.length)
    ctx.addIssue({ code: 'custom', message: 'Bullet slides need at least one point', path: ['bullets'] });
  if (slide.type === 'two_column' && (!slide.left.length || !slide.right.length))
    ctx.addIssue({ code: 'custom', message: 'Both columns need content', path: ['left'] });
  if (slide.type === 'quote' && !slide.quote)
    ctx.addIssue({ code: 'custom', message: 'Quote text is required', path: ['quote'] });
});

export const PresentationDeckSchema = z.object({
  title: shortText,
  slides: z.array(PresentationSlideSchema).min(3).max(20),
}).strict().superRefine((deck, ctx) => {
  if (deck.slides[0]?.type !== 'title')
    ctx.addIssue({ code: 'custom', message: 'The first slide must be a title slide', path: ['slides', 0, 'type'] });
  if (deck.slides[deck.slides.length - 1]?.type !== 'closing')
    ctx.addIssue({ code: 'custom', message: 'The last slide must be a closing slide', path: ['slides', deck.slides.length - 1, 'type'] });
});

export const PresentationGenerateInput = z.object({
  topic: z.string().trim().min(3).max(2000),
  slides: z.number().int().min(3).max(20).default(8),
  language: z.enum(['English','Urdu','Roman Urdu']).default('English'),
  model: z.string().trim().min(3).max(200).optional(),
}).strict();

export const PresentationExportInput = z.object({
  format: z.enum(['pptx','pdf']),
  language: z.enum(['English','Urdu','Roman Urdu']).default('English'),
  theme: z.enum(['emerald','midnight','sand']).default('emerald'),
  deck: PresentationDeckSchema,
}).strict();

export type PresentationSlide = z.infer<typeof PresentationSlideSchema>;
export type PresentationDeck = z.infer<typeof PresentationDeckSchema>;
