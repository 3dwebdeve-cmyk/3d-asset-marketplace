# Toy banner foreground

The Toys category uses a vehicle-free playroom background inside a rounded frame and one complete transparent vehicle layer extending below it. Each vehicle is rendered only once, so no tyre is split between two independently edited images. Both layers keep the same image scale and center position. Space below the banner keeps the overhang clear of the catalog controls. The wooden dog and red motorcycle remain absent.

- Source: `frontend/public/neww banner image/Colorful Toy Parade in the Playroom.png`
- Generated asset: `frontend/public/neww banner image/toy-parade-foreground.png`
- Active background: `frontend/public/neww banner image/toy-sunlit-backdrop.png`, derived from the supplied `Sunlit Toy-Filled Playroom Adventure (2).png`.
- Active foreground: `frontend/public/neww banner image/toy-vehicles-trio.png`, copied unchanged from the supplied `Colorful Toy Vehicles Trio (1).png`.
- Active canvas: 2079 × 756 pixels; foreground has alpha transparency.
- Generation mode: built-in imagegen, background extraction from the source image.

## Original foreground generation prompt

Use case: background-extraction. Edit target: the provided toy playroom image. Create a precisely aligned transparent foreground overlay for this SAME image, retaining ONLY the wooden pull-along dog, red motorcycle with sidecar, green motorcycle, orange expedition SUV, and yellow open-top jeep. Preserve these five objects' exact appearance, relative sizes, perspective, positions and scale in the original 2078 x 757 composition. Keep the original wide 2.745:1 canvas/aspect ratio and all surrounding transparent padding; do not tightly crop, center, rearrange, enlarge, or redesign the objects. Remove the entire playroom background, floor, teddy bears, blocks, rainbow and foreground rug, replacing all of that with true alpha transparency. Preserve complete tyre silhouettes and spokes with clean antialiased cutout edges and small soft contact shadows immediately below the tyres only. This layer will be laid pixel-aligned on top of the original photograph to let the tyres extend beyond a rounded website banner edge. No text, no labels, no new objects.

## Version 2 background prompt

Use case: precise-object-edit. Edit the provided playroom banner image. Remove ONLY the wooden pull-along dog including its colored rope at the left, and the red motorcycle with its red sidecar next to it. Reconstruct the now-empty left side with a seamless continuation of the existing wooden floor, softly blurred warm playroom shelves and room background. Leave this left side clear for website text. CRITICAL: preserve the green motorcycle, orange expedition SUV, yellow jeep, teddy bears, blocks, window, lighting, colors and all remaining scene details exactly in their current positions, sizes and perspective. Keep original 2078 x 757 canvas and exact composition without cropping, resizing, shifting or recentering remaining subjects. Do not add new toys, objects, text, labels or logos. Maintain the photographic 3D-render style.

## Version 2 foreground prompt

Use case: precise-object-edit / background-extraction. Edit the supplied transparent toy foreground overlay. Remove ONLY the wooden pull-along dog and its rope at the left and the entire red motorcycle with red sidecar. Make their entire former area fully alpha transparent. Keep ONLY the green motorcycle, orange expedition SUV and yellow open-top jeep, preserving their exact shapes, wheel silhouettes, lighting, relative sizes and original positions. Keep the exact original 2078 x 757 canvas and all transparent padding, including the large empty left region. Do not crop, enlarge, move, center, rearrange, redraw or change the remaining vehicles. Keep small contact shadows under their tyres. Background must remain genuinely transparent, not black, white, or checkerboard. No text, new objects, floor, room, bears or blocks.

## Version 3 background prompt

Use case: precise-object-edit. Create a clean background plate from the provided 2078 x 757 playroom image for a layered website banner. Remove the THREE foreground vehicles completely: green motorcycle, orange expedition SUV, and yellow jeep, including all vehicle tyres and their contact shadows. Fill those exact spaces seamlessly with the existing wooden playroom floor, softly blurred shelving and colored blocks behind them. Preserve the playroom, teddy bears on the right, blocks, shelves, window, decorations, lighting, perspective, colors and camera framing. The wooden dog and red motorcycle must remain absent. Do not add toys or text. Keep exact original 2078 x 757 canvas/aspect ratio and room composition. This background will sit behind a separate transparent vehicle layer; there must be ZERO remaining vehicle fragments or tyres in it.

## Version 3 foreground prompt

Use case: precise-object-edit / background-extraction. Clean up the supplied transparent foreground layer for a production website banner. Keep ONLY the green motorcycle, orange expedition SUV and yellow jeep with their complete tyres, in the same positions and proportions on the exact original 2078 x 757 wide canvas. Remove all red and yellow edge contamination, jagged halos, stray pixels and background remnants around the objects. Use smooth natural antialiased edges and actual alpha transparency everywhere else, including inside window openings and spaces between wheels. Preserve the vehicles' appearance and all details, retain only small soft neutral contact shadows below tyres. Keep the empty left half and surrounding transparent padding; no crop, recentering, moving subjects, added text, background, dog, red motorcycle, bears or blocks. All vehicle bodies and wheels must remain complete and continuous in this ONE foreground image.

## Current sunlit background prompt

The supplied foreground is used directly. Its CSS width is 58% of the banner with a 1.5% right inset, keeping the left area clear for text. The playroom's existing vehicles are removed from the background so no independently positioned duplicates can appear behind the foreground. The original source files in Downloads are unchanged.

Mode: built-in imagegen, editing the supplied playroom image.

Use case: precise-object-edit. Edit target: the supplied Sunlit Toy-Filled Playroom Adventure image, exact 2079 x 756 pixels. Create a background plate for a website banner by removing ONLY the three foreground vehicles: orange expedition SUV, yellow open-top jeep, red-and-yellow dump truck, including every wheel, body fragment, and their vehicle reflections/contact shadows. Reconstruct the exposed areas seamlessly using the existing glossy sunlit wooden floor and the playroom blocks behind the vehicles. Preserve all teddy bears, potted plants, wooden shelving, small shelf toys, large glowing sun wall decoration, blue wall, bright window, colored blocks, rug, lighting, perspective and overall composition exactly as provided. Keep the left area open for heading text. Do not change camera framing, crop, canvas ratio, scene brightness or subject positions. No vehicles, new subjects, added text, new logos, or watermarks. Output must keep the original 2079 x 756 canvas. A separate existing vehicle cutout will be composited over this clean room background.
