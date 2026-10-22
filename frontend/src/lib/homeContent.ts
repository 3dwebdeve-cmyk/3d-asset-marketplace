/** Shared by the visible homepage and its first HTML response. */
export const HOME_HEADING = 'Furniture & interior 3D models for visualization and design'

export const HOME_GUIDE = [
  {
    heading: 'Find 3D assets for your next scene',
    paragraphs: [
      'AssetHive3D brings together downloadable 3D models, plugins and custom project services. Explore furniture, interiors, lighting and plants for architectural visualization, or browse product models and props for advertising, animation and interactive scenes. Start with a category, then open individual listings to compare the assets that fit your project.',
      'Use the marketplace search to find a particular object or style. Category pages let you narrow the catalog by software, price, license and asset features. Check each listing rather than assuming that every model includes the same formats, materials or level of detail.',
    ],
    links: [
      { path: '/3d-models/furniture', label: 'Browse furniture 3D models' },
      { path: '/3d-models/interior-3d-models', label: 'Explore interior 3D models' },
      { path: '/3d-models/lights', label: 'Find lighting 3D models' },
      { path: '/3d-models/plants-vegetation', label: 'Browse plants and vegetation models' },
    ],
  },
  {
    heading: 'Check compatibility and licensing before you buy',
    paragraphs: [
      'Review the available file formats and software information against the application you use. Inspect the previews, polygon count and material details where provided, especially when a scene has a performance budget. A model intended for a detailed still render may have different requirements from an asset used in a real-time viewer.',
      'Read the license on the listing to understand the permitted use for your project. Compare the standard and extended options when available, and contact support if you need help with bulk licensing or a specific use case. Keep the product details and license terms with your project records.',
    ],
    links: [{ path: '/3d-models', label: 'Compare downloadable 3D models' }],
  },
  {
    heading: 'Extend your workflow with plugins and custom work',
    paragraphs: [
      'Explore plugins and tools when you want to simplify a repeated task in your 3D workflow. Check the supported application, version and installation information on the plugin listing before purchasing. Choose tools that match the software and workflow you already use.',
      'If the catalog does not contain the asset you need, send a custom project enquiry. Describe the intended use, preferred formats, visual references and delivery requirements. You can request modeling, texturing, rendering or animation services and discuss the scope before work begins.',
    ],
    links: [
      { path: '/plugins', label: 'Explore 3D plugins and tools' },
      { path: '/custom-projects', label: 'Request a custom 3D project' },
    ],
  },
] as const

export const HOME_FAQS = [
  {
    question: 'How do I choose a compatible 3D model?',
    answer: 'Check the formats, software, materials and model specifications on the listing. Match them to your target application and project requirements before you purchase.',
  },
  {
    question: 'Can I use a model in a commercial project?',
    answer: 'The license attached to each listing determines its permitted uses. Read those terms before buying and contact support if your project needs additional permissions.',
  },
  {
    question: 'What if I need a model that is not in the catalog?',
    answer: 'Use the custom project enquiry form to share your brief, reference images and required deliverables. Include the intended software and use case so the scope can be assessed.',
  },
] as const
