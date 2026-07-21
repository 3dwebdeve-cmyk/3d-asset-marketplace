import { z } from 'zod'

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === '' || z.url().safeParse(value).success, {
    message: 'Enter a valid website URL.',
  })

export const profileSchema = z.object({
  company_name: z.string().trim().max(255, 'Company name is too long.'),
  website: optionalUrl,
  address: z.string().trim().max(255, 'Address is too long.'),
  city: z.string().trim().max(100, 'City name is too long.'),
  country: z.string().trim().max(100, 'Country name is too long.'),
})

export type ProfileFormValues = z.infer<typeof profileSchema>

export const defaultProfileValues: ProfileFormValues = {
  company_name: '',
  website: '',
  address: '',
  city: '',
  country: '',
}
