# Launch Test Plan

A hands-on walk through the shop on `https://assethive3d.com`, done by a person before launch and
after any big change. Automated tests cover the code; this checks the real setup (email, Stripe,
storage, Cloudflare) together.

Use a private browser window and a fresh customer email you can read. Do it once on a computer and
once on a phone. Mark each line ✓ or write what went wrong.

## 1. Account

| # | Step | Expected |
|---|------|----------|
| 1.1 | Sign up at `/register` | "Check your email" message |
| 1.2 | Open the verification email | Arrives within 2 minutes, in the inbox (not spam), from the shop's own address |
| 1.3 | Click its link | Account verified; you can sign in |
| 1.4 | Sign in before verifying (second new account) | Refused, with a "resend" link that works |
| 1.5 | Sign out, then `/forgot-password` with your email | Same neutral message for a real and an unknown email |
| 1.6 | Open the reset email, set a new password | Old password stops working, new one works |
| 1.7 | Use the same reset link again | Refused as used or expired |
| 1.8 | Change the password in Dashboard → Password | Works; a security notice email arrives |
| 1.9 | Sign in with Google (if offered) | Signs you in; Dashboard shows the right name and email |

## 2. Browsing and the 3D viewer

Pick at least one real product of each type you sell (GLB, FBX, a large one over 20 MB).

| # | Step | Expected |
|---|------|----------|
| 2.1 | Home, `/3d-models`, a category, `/plugins` | Images load, no layout jumps, no error messages |
| 2.2 | Open a product, start the 3D preview | Model appears within a few seconds, centred and lit |
| 2.3 | Rotate, zoom, wireframe (if offered) | Smooth; nothing missing or black |
| 2.4 | Same on the phone | Touch rotate and pinch zoom work; the page does not scroll by itself |
| 2.5 | Product details | Price, formats, file size and the other details shown match the real file |
| 2.6 | Search and filters | Results match |

## 3. Buying (test mode first, then once in live mode with a refund)

Test mode card: `4242 4242 4242 4242`, any future date, any CVC.

| # | Step | Expected |
|---|------|----------|
| 3.1 | Add a model and a plugin to the cart | Cart total is right |
| 3.2 | Checkout | Stripe page shows the right items, total and the shop's name |
| 3.3 | Pay | Back on the shop's success page; order paid within a minute |
| 3.4 | Receipt email | Arrives, with the right items and total |
| 3.5 | Card `4000 0000 0000 0002` (declined) | Clear error, no order marked paid |
| 3.6 | Cancel on the Stripe page | Back on the shop, cart still full |

## 4. Downloads

| # | Step | Expected |
|---|------|----------|
| 4.1 | Dashboard → Downloads | Bought items are listed |
| 4.2 | Download the model | File downloads, has a sensible name, opens in the 3D program |
| 4.3 | Download the plugin | Archive opens; see section 5 |
| 4.4 | Browser downloads list → copy the file's address; open it again after 2 minutes | Refused as expired (links last about a minute) |
| 4.5 | Signed in as a different customer, Dashboard → Downloads | The first customer's items are not listed |
| 4.6 | Refund the order in Stripe | Downloads are no longer offered for it |

## 5. Plugin and catalog program

For every plugin before it goes on sale, on a clean Windows computer (or a fresh virtual machine)
with the supported 3ds Max version:

| # | Step | Expected |
|---|------|----------|
| 5.1 | Check the archive's contents | Only the files the readme lists; no leftover test files, personal paths or keys |
| 5.2 | Scan the archive and every `.exe` inside with the antivirus and on virustotal.com | Clean. A few unknown engines flagging an unsigned new `.exe` is common; a well-known engine flagging it needs a look |
| 5.3 | Check the `.exe` signature (right-click → Properties → Digital Signatures) | Signed with the company's code-signing certificate. Unsigned programs get a SmartScreen "Windows protected your PC" warning that scares buyers |
| 5.4 | Follow the readme exactly as a buyer would | Installs without admin rights unless the readme says so; works in 3ds Max |
| 5.5 | Uninstall as the readme says | Nothing left behind in 3ds Max |
| 5.6 | Product page | Lists supported 3ds Max versions, Windows only, and install steps |

## 6. Other pages and emails

| # | Step | Expected |
|---|------|----------|
| 6.1 | Contact form and custom project enquiry | Confirmation shown; the team inbox receives it |
| 6.2 | Terms, Privacy, About | Final wording, right company name and contact |
| 6.3 | An address that does not exist, e.g. `/nothing-here` | A "page not found" page |
| 6.4 | All emails above | Right shop name, working links to `assethive3d.com`, readable on a phone |

## 7. Admin console

| # | Step | Expected |
|---|------|----------|
| 7.1 | Sign in to `/console` with password and authenticator code | Works |
| 7.2 | Upload a product with its model and images | Visible on the shop after publishing |
| 7.3 | The test orders from section 3 | Listed with the right status |

## Record

| Date | Who | Device / browser | Sections done | Problems found |
|------|-----|------------------|---------------|----------------|
|      |     |                  |               |                |
