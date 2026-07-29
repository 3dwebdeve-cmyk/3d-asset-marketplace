import { create } from 'zustand'

interface CartUiState {
  isDrawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
}

export const useCartUiStore = create<CartUiState>((set) => ({
  isDrawerOpen: false,
  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
}))
