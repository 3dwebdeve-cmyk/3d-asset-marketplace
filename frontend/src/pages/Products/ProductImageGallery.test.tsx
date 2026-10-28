import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ProductImageGallery } from './ProductImageGallery'

vi.mock('../../components/viewer/LazyModelViewer', () => ({
  LazyModelViewer: () => <div data-testid="model-preview"><canvas tabIndex={0} /></div>,
}))

const images = [1, 2].map((number) => ({
  id: String(number), image_url: `https://example.com/render-${number}.webp`,
  display_order: number, is_primary: false, created_at: '',
}))
const defaults = {
  productName: 'Chair', thumbnail: '', images,
  previewModelUrl: 'https://example.com/preview.glb',
  previewVideoUrl: 'https://example.com/preview.mp4', showPreviewModeThumbs: true,
}
const stage = () => screen.getByRole('region', { name: 'Chair media gallery' })
const next = () => screen.getByRole('button', { name: 'Next preview' })
const previous = () => screen.getByRole('button', { name: 'Previous preview' })
const counter = () => screen.getByRole('status')

describe('product gallery navigation', () => {
  it('cycles through model, video and renders in both directions, and returns using the 3D thumbnail', async () => {
    const user = userEvent.setup()
    render(<ProductImageGallery {...defaults} />)
    expect(counter()).toHaveTextContent('1 / 4')
    await user.click(next())
    expect(screen.getByLabelText('Preview video of Chair')).toBeInTheDocument()
    expect(counter()).toHaveTextContent('2 / 4')
    await user.click(next())
    expect(within(stage()).getByAltText('Chair 3D model, image 1')).toBeInTheDocument()
    expect(counter()).toHaveTextContent('3 / 4')
    await user.click(next())
    expect(counter()).toHaveTextContent('4 / 4')
    await user.click(next())
    expect(screen.getByTestId('model-preview')).toBeInTheDocument()
    await user.click(previous())
    expect(counter()).toHaveTextContent('4 / 4')
    await user.click(previous())
    expect(counter()).toHaveTextContent('3 / 4')
    await user.click(previous())
    expect(counter()).toHaveTextContent('2 / 4')
    await user.click(screen.getByRole('button', { name: 'Show 3D preview' }))
    expect(counter()).toHaveTextContent('1 / 4')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('wraps backwards to video when there are no images', async () => {
    render(<ProductImageGallery {...defaults} images={[]} />)
    await userEvent.click(previous())
    expect(counter()).toHaveTextContent('2 / 2')
    await userEvent.click(next())
    expect(counter()).toHaveTextContent('1 / 2')
  })

  it('hides navigation for a single preview or empty gallery', () => {
    const { rerender } = render(<ProductImageGallery {...defaults} images={[]} previewVideoUrl="" />)
    expect(screen.queryByRole('button', { name: 'Next preview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    rerender(<ProductImageGallery {...defaults} images={[]} previewVideoUrl="" previewModelUrl="" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('supports focused stage arrow keys without consuming viewer or video keys', () => {
    render(<ProductImageGallery {...defaults} />)
    fireEvent.keyDown(screen.getByTestId('model-preview').querySelector('canvas')!, { key: 'ArrowRight' })
    expect(counter()).toHaveTextContent('1 / 4')
    stage().focus()
    fireEvent.keyDown(stage(), { key: 'ArrowRight' })
    expect(counter()).toHaveTextContent('2 / 4')
    fireEvent.keyDown(screen.getByLabelText('Preview video of Chair'), { key: 'ArrowRight' })
    expect(counter()).toHaveTextContent('2 / 4')
    fireEvent.keyDown(stage(), { key: 'ArrowLeft' })
    expect(counter()).toHaveTextContent('1 / 4')
  })

  it('swipes renders, ignores vertical gestures and model drags, and suppresses the swipe click', async () => {
    render(<ProductImageGallery {...defaults} />)
    const swipe = (target: HTMLElement, x: number, y: number) => {
      fireEvent.touchStart(target, { touches: [{ clientX: 200, clientY: 200 }] })
      fireEvent.touchEnd(target, { touches: [], changedTouches: [{ clientX: x, clientY: y }] })
    }
    swipe(screen.getByTestId('model-preview'), 50, 200)
    expect(counter()).toHaveTextContent('1 / 4')
    await userEvent.click(screen.getByRole('button', { name: 'Show image 1 of 2' }))
    const imageButton = screen.getByRole('button', { name: 'View larger image of Chair' })
    swipe(imageButton, 190, 60)
    expect(counter()).toHaveTextContent('3 / 4')
    swipe(imageButton, 50, 200)
    fireEvent.click(imageButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(counter()).toHaveTextContent('4 / 4')
    swipe(imageButton, 300, 200)
    expect(counter()).toHaveTextContent('3 / 4')
  })

  it('keeps lightbox arrows within images instead of switching media behind the dialog', async () => {
    const user = userEvent.setup()
    render(<ProductImageGallery {...defaults} />)
    await user.click(screen.getByRole('button', { name: 'Show image 1 of 2' }))
    await user.click(screen.getByRole('button', { name: 'View larger image of Chair' }))
    const dialog = screen.getByRole('dialog')
    await user.keyboard('{ArrowLeft}')
    expect(within(dialog).getByAltText('Chair 3D model, image 2')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Next image' }))
    expect(within(dialog).getByAltText('Chair 3D model, image 1')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(counter()).toHaveTextContent('3 / 4')
  })
})
