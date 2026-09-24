import { z } from 'zod'

import { getPhoneCountryByIso, PHONE_COUNTRY_CODES } from './phoneCountryCodes'

export { PHONE_COUNTRY_CODES } from './phoneCountryCodes'
export {
  getPhoneCountryByIso,
  getPhoneCountryFlagUrl,
} from './phoneCountryCodes'

export const ENQUIRY_TYPES = [
  '3D Model Information',
  'Plugins & Tools',
  'Custom 3D Modeling',
  'Bulk Purchase / Studio Licensing',
  'Technical Support',
  'Other',
] as const

export type EnquiryType = (typeof ENQUIRY_TYPES)[number]

const VALID_PHONE_COUNTRY_ISOS = new Set<string>(
  PHONE_COUNTRY_CODES.map((item) => item.iso),
)

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(120, 'Name must be at most 120 characters.'),
  company: z.string().trim().max(160, 'Company must be at most 160 characters.'),
  email: z.email('Enter a valid email address.'),
  phoneCountryCode: z
    .string()
    .trim()
    .min(1, 'Select a country code.')
    .refine((value) => VALID_PHONE_COUNTRY_ISOS.has(value), {
      message: 'Select a valid country code.',
    }),
  phone: z.string().trim().max(40, 'Phone must be at most 40 characters.'),
  enquiryType: z
    .string()
    .refine(
      (value): value is EnquiryType =>
        (ENQUIRY_TYPES as readonly string[]).includes(value),
      'Select an enquiry type.',
    ),
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
  privacyAccepted: z
    .boolean()
    .refine((value) => value === true, 'Please agree to the Privacy Policy to continue.'),
  website: z.string().optional(),
})

export type ContactFormValues = {
  name: string
  company: string
  email: string
  /** ISO 3166-1 alpha-2 country key used to look up dial code + flag. */
  phoneCountryCode: string
  phone: string
  enquiryType: EnquiryType | ''
  subject: string
  message: string
  privacyAccepted: boolean
  website?: string
}

export const defaultContactValues: ContactFormValues = {
  name: '',
  company: '',
  email: '',
  phoneCountryCode: 'IN',
  phone: '',
  enquiryType: '',
  subject: '',
  message: '',
  privacyAccepted: false,
  website: '',
}

export function composeContactMessage(
  values: {
    enquiryType: string
    company: string
    phoneCountryCode: string
    phone: string
    message: string
  },
  attachmentNames: string[],
): string {
  const dialCode = getPhoneCountryByIso(values.phoneCountryCode)?.code ?? values.phoneCountryCode
  const phone = values.phone.trim() ? `${dialCode} ${values.phone.trim()}` : ''
  const lines = [
    `Enquiry type: ${values.enquiryType}`,
    values.company.trim() ? `Company / Studio: ${values.company.trim()}` : null,
    phone ? `Phone: ${phone}` : null,
    '',
    values.message.trim(),
  ]

  if (attachmentNames.length > 0) {
    lines.push(
      '',
      `Attachment note: customer selected ${attachmentNames.length} file(s) in the browser (${attachmentNames.join(', ')}). Files were not uploaded with this enquiry — please follow up if references are needed.`,
    )
  }

  return lines.filter((line) => line !== null).join('\n')
}
