import { z } from 'zod'

export const emailVerificationResendSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
})

export type EmailVerificationResendFormValues = z.infer<typeof emailVerificationResendSchema>

export const defaultEmailVerificationResendValues: EmailVerificationResendFormValues = {
  email: '',
}
