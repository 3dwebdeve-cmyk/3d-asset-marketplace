export function Preloader({ label = 'Loading marketplace...' }: { label?: string }) {
  return (
    <div className="site-preloader" role="status" aria-live="polite" aria-busy="true">
      <iframe
        className="site-preloader__animation"
        src="https://lottie.host/embed/488013ff-0d7b-45d3-856c-641ecf29dbb1/VKkkAlq0FN.lottie"
        title="Blue animated icon"
        loading="eager"
        tabIndex={-1}
        aria-hidden="true"
      />
      <p className="site-preloader__label">{label}</p>
    </div>
  )
}
