import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.').max(128, 'Password is too long.'),
  remember_me: z.boolean().default(true),
})

export type LoginFormValues = z.infer<typeof loginSchema>

export const defaultLoginValues: LoginFormValues = {
  email: '',
  password: '',
  remember_me: true,
}
