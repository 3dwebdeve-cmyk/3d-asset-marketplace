import { z } from 'zod'

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(120, 'Name must be at most 120 characters.'),
  email: z.email('Enter a valid email address.'),
  subject: z
    .string()
    .trim()
    .min(3, 'Subject must be at least 3 characters.')
    .max(200, 'Subject must be at most 200 characters.'),
  message: z
    .string()
    .trim()
    .min(10, 'Message must be at least 10 characters.')
    .max(5000, 'Message must be at most 5000 characters.'),
  website: z.string().optional(),
})

export type ContactFormValues = z.infer<typeof contactSchema>

export const defaultContactValues: ContactFormValues = {
  name: '',
  email: '',
  subject: '',
  message: '',
  website: '',
}
