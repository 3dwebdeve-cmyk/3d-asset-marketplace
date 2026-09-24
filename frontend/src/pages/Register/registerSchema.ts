import { z } from 'zod'

export const registerSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters.')
      .max(255, 'Full name is too long.'),
    email: z
      .email('Enter a valid email address.')
      .max(254, 'Email address is too long.')
      .transform((value) => value.trim().toLowerCase()),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(128, 'Password is too long.'),
    password_confirm: z.string().min(1, 'Please confirm your password.'),
    phone: z.string().trim().max(20, 'Phone number is too long.').optional(),
    country: z.string().trim().max(100, 'Country name is too long.').optional(),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: 'Passwords do not match.',
    path: ['password_confirm'],
  })

export type RegisterFormValues = z.infer<typeof registerSchema>

export const defaultRegisterValues: RegisterFormValues = {
  full_name: '',
  email: '',
  password: '',
  password_confirm: '',
  phone: '',
  country: '',
}
