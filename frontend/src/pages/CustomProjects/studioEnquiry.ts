import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'

// The HTML is a trusted bundled asset; its original scripts are never executed.
export function initializeStudioEnquiry(root: HTMLElement) {
  const controller = new AbortController()
  const { signal } = controller
  const form = root.querySelector<HTMLFormElement>('#hive-enquiry')!
  const panels = [...form.querySelectorAll<HTMLElement>('.brief-panel')]
  const steps = [...form.querySelectorAll<HTMLElement>('.brief-steps li')]
  const status = form.querySelector<HTMLElement>('.brief-status')!
  const next = form.querySelector<HTMLButtonElement>('.brief-next')!
  const back = form.querySelector<HTMLButtonElement>('.brief-back')!
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement
  const selected = (name: string) => [...form.querySelectorAll<HTMLInputElement>(`[name="${name}"]:checked`)].map(i => i.value)
  let step = 0
  let pending = false
  let sent = false
  let urls: string[] = []
  const release = () => { urls.forEach(url => URL.revokeObjectURL(url)); urls = [] }
  function show(focus = true) {
    panels.forEach((panel, index) => {
      panel.hidden = index !== step
      panel.querySelectorAll<HTMLInputElement>('input,textarea,select').forEach(i => { i.disabled = index !== step })
    })
    steps.forEach((item, index) => {
      if (index === step) item.setAttribute('aria-current', 'step')
      else item.removeAttribute('aria-current')
      item.classList.toggle('is-complete', index < step)
    })
    back.hidden = step === 0
    next.textContent = step === 2 ? 'Send enquiry' : 'Continue'
    status.textContent = ''
    if (focus) panels[step].querySelector<HTMLElement>('h3')?.focus()
  }
  back.addEventListener('click', () => { if (!pending && !sent) { step--; show() } }, { signal })
  function delivery() {
    const specific = field('delivery').value === 'Specific date'
    form.querySelector<HTMLElement>('.delivery-date')!.hidden = !specific
    field('deliveryDate').required = specific
  }
  field('delivery').addEventListener('change', delivery, { signal })
  const references = field('references')
  function previews() {
    release()
    const container = form.querySelector<HTMLElement>('.reference-previews')!
    const notice = form.querySelector<HTMLElement>('#reference-status')!
    container.replaceChildren()
    if ((references.files?.length ?? 0) > 10) {
      references.value = ''; notice.textContent = 'Please select up to 10 files.'; return
    }
    notice.textContent = 'File names are included in your enquiry. Our team will contact you to collect the files.'
    Array.from(references.files ?? []).forEach((file, index) => {
      const card = document.createElement('div')
      card.className = 'reference-preview reference-document'
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img')
        img.src = URL.createObjectURL(file); urls.push(img.src); img.alt = file.name; card.append(img)
      } else card.textContent = file.name
      const remove = document.createElement('button')
      remove.type = 'button'; remove.className = 'reference-remove'; remove.textContent = '×'
      remove.setAttribute('aria-label', `Remove reference ${file.name}`)
      remove.addEventListener('click', () => {
        const remaining = new DataTransfer()
        Array.from(references.files ?? []).forEach((item, i) => { if (i !== index) remaining.items.add(item) })
        references.files = remaining.files; previews(); references.focus()
      }, { signal })
      card.append(remove); container.append(card)
    })
  }
  references.addEventListener('change', previews, { signal })
  const drop = form.querySelector<HTMLElement>('.reference-drop')!
  drop.addEventListener('dragover', e => e.preventDefault(), { signal })
  drop.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer) { references.files = e.dataTransfer.files; previews() } }, { signal })
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (pending || sent) return
    if (step === 0 && !selected('service').length) { status.textContent = 'Choose at least one service to continue.'; return }
    if (!form.reportValidity()) return
    if (step < 2) {
      form.querySelector<HTMLElement>('#selected-services')!.textContent = `Selected services: ${selected('service').join(', ')}. Tell us the quantities, formats and details you need.`
      step++; show(); return
    }
    const message = [
      `Services: ${selected('service').join(', ')}`,
      ...['project', 'specifications', 'links', 'budget', 'delivery', 'company', 'phone'].map(name => `${name}: ${field(name).value}`),
      `Purposes: ${selected('purpose').join(', ')}`,
      `Output formats: ${selected('outputFormat').join(', ')}`,
      `Delivery date: ${field('delivery').value === 'Specific date' ? field('deliveryDate').value : 'Not specified'}`,
      `NDA requested: ${field('nda').checked ? 'Yes' : 'No'}`,
      '30% payment acknowledged: Yes',
      `Reference files to request by email: ${Array.from(references.files ?? []).map(file => file.name).join(', ') || 'None'}`,
    ].join('\n')
    if (message.length > 5000) { status.textContent = 'Please shorten your brief to fewer than 5,000 characters before sending.'; return }
    pending = true; next.disabled = true; back.disabled = true; next.textContent = 'Sending…'
    try {
      await submitContactForm({ name: field('contactName').value.trim(), email: field('contactEmail').value.trim(), subject: `Hive Studio: ${selected('service').join(', ')}`.slice(0, 200), message })
      if (signal.aborted) return
      sent = true; status.textContent = 'Your enquiry has been sent. Our team will reply by email and contact you to collect any reference files.'; next.textContent = 'Enquiry sent'
    } catch (error) {
      if (signal.aborted) return
      status.textContent = getApiErrorMessage(error, 'Could not send your enquiry. Please try again.')
      next.disabled = false; back.disabled = false; next.textContent = 'Send enquiry'
    } finally { pending = false }
  }, { signal })
  show(false); delivery()
  return () => { controller.abort(); release() }
}
