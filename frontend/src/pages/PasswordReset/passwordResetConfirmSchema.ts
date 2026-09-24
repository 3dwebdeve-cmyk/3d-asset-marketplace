import { z } from 'zod'

export const passwordResetConfirmSchema = z
  .object({
    new_password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(128, 'Password is too long.'),
    new_password_confirm: z.string().min(1, 'Please confirm your new password.'),
  })
  .refine((data) => data.new_password === data.new_password_confirm, {
    message: 'Passwords do not match.',
    path: ['new_password_confirm'],
  })

export type PasswordResetConfirmFormValues = z.infer<typeof passwordResetConfirmSchema>

export const defaultPasswordResetConfirmValues: PasswordResetConfirmFormValues = {
  new_password: '',
  new_password_confirm: '',
}
