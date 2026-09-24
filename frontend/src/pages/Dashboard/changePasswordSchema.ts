import { z } from 'zod'

export const changePasswordSchema = z
  .object({
    current_password: z
      .string()
      .min(1, 'Current password is required.')
      .max(128, 'Password is too long.'),
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
  .refine((data) => data.current_password !== data.new_password, {
    message: 'New password must be different from the current password.',
    path: ['new_password'],
  })

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

export const defaultChangePasswordValues: ChangePasswordFormValues = {
  current_password: '',
  new_password: '',
  new_password_confirm: '',
}
