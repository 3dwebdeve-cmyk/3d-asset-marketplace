import { z } from 'zod'

export const passwordResetRequestSchema = z.object({
  email: z.email('Enter a valid email address.'),
})

export type PasswordResetRequestFormValues = z.infer<typeof passwordResetRequestSchema>

export const defaultPasswordResetRequestValues: PasswordResetRequestFormValues = {
  email: '',
}
