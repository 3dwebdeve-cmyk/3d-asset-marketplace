const BENEFITS = [
  {
    title: 'Secure Checkout',
    text: 'Safe transactions and privacy protection.',
    icon: '/images/benefit-secure.webp',
    alt: 'Secure checkout shield icon',
  },
  {
    title: 'Regular Updates',
    text: 'New models, plugins and tools added regularly.',
    icon: '/images/benefit-updates.webp',
    alt: 'Regular updates refresh icon',
  },
  {
    title: 'Instant Downloads',
    text: 'Access your files instantly anytime, anywhere.',
    icon: '/images/benefit-downloads.webp',
    alt: 'Instant downloads cloud icon',
  },
  {
    title: 'Fair Pricing',
    text: 'Best value for premium quality assets.',
    icon: '/images/benefit-pricing.webp',
    alt: 'Fair pricing tag icon',
  },
  {
    title: 'Global Support',
    text: 'Dedicated support for your queries worldwide.',
    icon: '/images/benefit-support.webp',
    alt: 'Global support globe icon',
  },
] as const

export function SiteBenefitsBanner() {
  return (
    <section className="site-benefits" aria-label="Why shop with us">
      <div className="site-benefits__inner">
        {BENEFITS.map((item) => (
          <div key={item.title} className="site-benefits__item">
            <img
              className="site-benefits__icon"
              src={item.icon}
              alt=""
              width={48}
              height={48}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              aria-hidden="true"
            />
            <div>
              <p className="site-benefits__title">{item.title}</p>
              <p className="site-benefits__text">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
