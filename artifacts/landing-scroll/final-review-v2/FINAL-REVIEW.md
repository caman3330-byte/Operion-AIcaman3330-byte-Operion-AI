# Final Cinematic Visual Review

## 1. Files Changed
- apps/dashboard/components/marketing/cinematic-scroll-hero.tsx
- apps/dashboard/app/globals.css
- apps/dashboard/public/merchant-journey-opening.webp
- Review artifacts and the repeatable validate.cjs browser check in this directory.

Existing unrelated local changes were preserved. No backend changes, migrations, commits, pushes, or deployments were performed in this pass.

## 2. Desktop First Frame
Removed the hydration-ready fallback that initially rendered the returning static hero. The server now includes the cinematic opening for a fresh visit. The browser check also verifies that this markup exists with JavaScript disabled. The opening image is prioritized. Image decoding still depends on device and network speed; the server markup check is not a filmstrip measurement of the first painted pixel.

## 3. Opening Realism
Replaced the opening CSS person with a custom realistic business-owner and office scene. It moves with a gentle camera push toward the laptop. The WebP asset is 1440 x 960 and 67,306 bytes. The approved overall palette and page architecture remain.

## 4. Documents
Documents have staggered, multi-point travel, perspective rotation, depth, shadows, and movement blur. Business information, bank statement, financial documents, revenue profile, and contact details remain represented.

## 5. AI Workers
Workers retain Idle, Working, and Complete states. Different rotation angles and distances make the stations less flat; paths and the central core connect the sequence. These are illustrative visual states, not live operational results.

## 6. Lender Network
Camera scale pulls back as neutral lender nodes emerge with staggered motion. Labels are Not the right fit, Reviewing, and Potential match. The funding-path copy says Information prepared and does not guarantee funding.

## 7. Return to Merchant
The environment returns with a traced path and an understated Next Step Ready notice. Scale and horizontal movement reverse the visual direction. This remains a stylized transition rather than a fully reconstructed physical reverse camera journey.

## 8. Homepage Transition
Network lines and the core settle into the hero visual. Removed the nested miniature website, duplicate headline, fake navigation, and inert preview buttons. Application and funding-result layers now fade completely instead of leaving ghost overlays. The real page navigation and final hero links remain usable.

## 9. Exact Scroll Timeline
The existing timeline is scroll-driven, not a fixed 20-second playback. Normalized cinematic progress p is page scroll progress / 0.7, clamped to 0..1 and spring-smoothed (stiffness 220, damping 30, mass 0.22). The journey section has a minimum height of 540vh.

| Layer | Cinematic progress keyframes | Opacity values |
| --- | --- | --- |
| Environment | 0, .18, .30, .78, .88, .94 | 1, 1, .24, .08, .78, 0 |
| Application | .08, .17, .34, .43 | 0, 1, 1, 0 |
| Core | .32, .42, .84, .91 | 0, 1, 1, 0 |
| Workers | .44, .53, .72 | 0, 1, 1 within core |
| Lenders | .58, .67, .84 | 0, 1, 1 within network |
| Funding result | .68, .76, .84 | 0, 1, 0 |
| Return | .78, .86, .94 | 0, 1, 0 |
| Homepage visual | .88, .97, 1 | 0, 1, 1 |

Story labels: 00:00-00:02 arrival; 00:02-00:04 application; 00:04-00:10 processing; 00:10-00:18 matching; 00:16-00:18 return; 00:18-00:20+ homepage. These overlapping labels are narrative cues, not actual playback duration.

## 10. Mobile
Compacted text and spacing, removed the duplicate opening logo, reserved space for Skip intro, and reduced the stage height. Native scrolling is retained. Touch was tested through Chromium mobile emulation, not a physical phone.

## 11. Performance
No new runtime dependency, WebGL, GIF, or image sequence. Existing Framer Motion, CSS, and SVG drive the animation. One optimized WebP supplies the opening realism. The final build reports 20.4 kB for the homepage route and 175 kB first-load JavaScript. No measured real-device frame-rate or battery-performance claim is made.

## 12. Validation
PASS: dashboard typecheck, lint, and production build. Browser evidence is stored in final-boss-results.json. It covers fresh desktop/mobile, incremental scrolling, fast wheel scrolling, keyboard, emulated touch, completion, returning session, skip, reduced motion, footer reachability, horizontal overflow, and browser errors. Recordings include the complete journey and subsequent behavior checks.

## 13. Remaining Limitations
- The opening is photographic; the internal system and return scene remain stylized layered graphics. They are not photorealistic 3D environments.
- Scene continuity is improved, but the return does not physically traverse every earlier object in reverse.
- Returning and reduced-motion states resolve during client initialization; a pre-hydration cinematic flash for those states has not been ruled out by filmstrip testing.
- One-time persistence uses sessionStorage, preserving the existing per-tab session behavior rather than remembering completion across all future sessions.
- Mobile validation is Chromium emulation. Safari and physical-device testing remain unverified.
- This is a local review build. Production was not changed.

## Opening Asset Provenance
Generated with the built-in image-generation tool, then resized and encoded as WebP with the installed Sharp library.

Prompt: Create one photorealistic editorial cinematic still for a premium business financing website's opening scene, no text, no logos, no UI. Wide 3:2 composition. A real small-business owner in a well-fitting navy jacket, seen from behind in three-quarter view at left foreground, calmly approaching a desk with an open laptop in a bright modern glass office. Natural believable anatomy and fabric, no posed stock-photo smile. Layered architectural depth, crisp glass partitions, subtle reflections, white and warm ivory materials, soft blue daylight, restrained mint plant accents. Soft morning sun, physically believable shadows, airy but with clear local contrast and detail. Eye-level camera 35mm lens, realistic photography, sophisticated restrained business environment. Main person and laptop in middle 70% safe region to allow responsive cropping. No artificial glows, no holograms, no dark atmosphere, no cartoon, no poster or collage. This standalone scene will sit behind a separately rendered interactive application with a gentle camera push.
