# Picture to stitches: the state of the art (PX-R, 2026-11-13)

Research for Cycle 4 (`docs/roadmap.md`). What papers, patents and other tools do, what people who digitize by hand
do, where everyone falls short, and what we could build. Ideas and numbers only, each credited. **No one's source
code was read** for this: only papers, patents, manuals, help pages, marketing pages and forum or blog write-ups
(clean room, `AGENTS.md`). One paper's open-access PDF was read in full (Liu et al. 2023, §1.1). Where a claim comes
from a vendor's marketing or a third-party blog it says so; treat those as leads, not facts.

What we do today, for comparison (`docs/pictures.md`): colours learned once (24 k-means clusters merged by CIEDE2000
to the count asked), background found by position (a flood from the edge), textured pictures smoothed (Kuwahara),
specks folded or left out, shapes 1 mm or wider filled with tatami at one angle per shape (neighbours +90°), thinner
parts as triple runs, 0.35 mm overlap under later colours, an A* travel router that hides moves under fill still to
come, Line drawing and Cross-stitch styles. No satin in pictures, no direction that follows the form, no shading,
no score of how much the file looks like the picture.

## Contents
1. Academic work (and patents)
2. Commercial auto-digitizers
3. Professional digitizing practice, with numbers
4. The gap, and ten ideas
5. AI-generated art: what digitizes well, and a "make it stitchable" pre-pass
6. Ranked ideas mapped onto PX0-PX6
7. Patents to keep clear of

---

## 1. Academic work (and patents)

The short version: **almost no published work turns a picture into a machine file.** The field splits into (a) a
handful of patents and one graphics paper that make real stitch files, (b) a larger body that *renders pictures that
look embroidered* (no stitches), and (c) learned methods that are all of type (b). The useful building blocks come
from neighbouring fields: image abstraction, vectorization, direction fields, fabrication toolpaths, halftoning.

### 1.1 Picture to a stitch file

| Work | Year, venue | Method | Numbers, and what it means for us |
|---|---|---|---|
| D. Goldman (Soft Sight, later Vistaprint), "Automatically generating embroidery designs from a scanned image", US 6,836,695 / 6,804,573 / 7,587,256 / 8,219,238 / 8,532,810 / 9,200,397 ([patent](https://patents.google.com/patent/US6804573B2/en)) | priority 1998; **expired 2018** | The template every auto-digitizer follows. Edge-preserving smoothing; region growing by colour; objects under 6 px merged into the nearest larger neighbour. Contours chain-coded; skeleton plus a (3,4) integer distance transform. **Thin vs thick** from statistics of the distance values on the skeleton (max, mean, standard deviation): thick → fill, thin and regular → satin. Fill: contour simplified, **16 candidate angles, the one giving the fewest fragments chosen**; fragments ordered to minimise cuts. Satin: end anchors where the contour turns sharper than ~30°, junction anchors matched to skeleton concavities within a distance tied to local thickness, occluded edges at junctions rebuilt by energy minimisation, stitch normals by least squares weighted by width, columns split at bends under ~45°. | Free to use (expired). Its satin-from-skeleton steps are exactly what PX2 needs: anchors at ends and junctions, columns split at sharp bends, normals fitted to both edges. Its fill angle rule (fewest fragments) is a cheap baseline for PX3. |
| K. Yamada (Brother), "Embroidery data creation apparatus", US 7,946,235 ([patent](https://patents.google.com/patent/US7946235B2/en)) and family US 7,693,598, 8,200,357, 8,271,123, 8,335,584, 8,903,536, 8,473,090, 8,065,030 | priority 2006; **US 7,946,235 active to 2030** (Google's assumption) | Brother's photo stitch. Each pixel gets an angle (normal to the luminance change, from four neighbour differences or Sobel) and a strength; weak images' strengths are boosted (threshold 50 of 100). One line segment per pixel at that angle, angle smoothed by strength-weighted neighbours; each segment's colour = mean of the image under a band around it, nearest thread in RGB; segments of a colour largely covered by later colours are removed; same-colour segments chained end to nearest end. Example: 3 threads per mm, 100 x 100 mm. | **Do not copy** (see §7). Useful as a description of what PE-DESIGN's Photo Stitch 1 does and why it looks "hairy": short independent segments, no regions. |
| Liu Zhenyuan, M. Piovarči, C. Hafner, R. Charrondière, B. Bickel, "Directionality-Aware Design of Embroidery Patterns" ([project](https://desmondlzy.me/publications/embroidery/), [DOI](https://doi.org/10.1111/cgf.14770)) | 2023, Computer Graphics Forum 42(2), Eurographics | The only graphics paper that makes sewn files from pictures. Input: a region, a direction field (user strokes interpolated) and a density field. Sources and sinks found from the field's divergence; streamlines traced from them; each streamline trimmed at its assigned sink (assignment by linear program); a regularisation pass evens spacing to 1/α; streamlines joined into **one connected path per region (no cuts)**. Shading: per region, PCA of the colours in CMY gives **two colours**; the lighter is a solid ground, the other sewn on top with spacing set so the visible share matches the blend. Thread pair picked by exhaustive search minimising ΔE00(s1,t1)+ΔE00(s2,t2)+10·max(0, contrast lost) (W3C relative contrast). A slider trades colour match against direction match. | Sewn on a Bernina B590. Flower petal: 1.58 s. Against Bernina DesignerPlus AutoDigitize: the commercial tool "only separates the input image into uniformly colored regions" and takes direction from the region's outline, so it can't show a gradient or follow brush strokes. Limits: no singularities in the field, simply connected regions only, two colours per region, directions drawn by hand. Their note on machines: "thread-cutting is slow and unreliable, often leaving strands", so cuts are the cost to minimise. |
| OriStitch, arXiv [2412.02891](https://arxiv.org/abs/2412.02891) | 2024 | Machine-embroidery workflow for self-folding textiles; stitch paths ordered greedily by nearest next path to cut jumps. | Confirms the research state: path order is nearest-neighbour; nobody publishes better routing than ours. |
| StitchOver, Z. Chang, T. C. Yu, Y. Gao, T. Roumen, arXiv [2609.08311](https://arxiv.org/abs/2609.08311) | 2026, CHI | Functional embroidery over seams: inserts jumps to clear seams; ~70 % of samples defective without them, none with. | Not pictures; shows the HCI community also measures sewn defects, not looks. |
| V. Nykyforov (Vistaprint), "Detecting suitability of an image to embroidery", US 8,706,286 ([patent](https://patents.google.com/patent/US8706286B2/en)) | priority 2011; **lapsed (fee)** | Reduce the image to the thread count; compare edge maps of original and reduced (share of matching edge pixels; example pass at 95 %); an **edge irregularity** score from how fast gradient direction changes in small neighbourhoods (40-bin histogram, high bins weighted); a stitch-count estimate from non-background blocks. Pass only if all three pass. | Free to use. A ready-made skeleton for PX6's "will this sew well" check: edge agreement after reduction, jaggedness, stitch count. |
| Levin, Huang, Mustakos, PEmbroider ([project page](https://studioforcreativeinquiry.org/project/pembroider)) | 2020 | Processing library for generative embroidery: shapes composed with computer-vision and geometry operations, several hatch fills. | A library, not a method paper; read for its stated feature list only. |

### 1.2 Pictures that look embroidered (renderers, no stitch files)

| Work | Year, venue | Method | Use to us |
|---|---|---|---|
| X. Chen, M. McCool, A. Kitamoto, S. Mann, "Embroidery modeling and rendering" ([thesis](https://uwspace.uwaterloo.ca/handle/10012/6056), [SIGGRAPH 2011 poster](https://history.siggraph.org/experience/embroidery-modeling-and-rendering-in-real-time-by-chen-mccool-and-kitamoto)) | 2011-2012, Graphics Interface | Image analysed into regions, boundaries and details; three basic stitch types placed in surface space; real-time lighting of each stitch as a thread. | Model for PX0's render: stitches as lit threads, not lines. |
| Cui, Sheng, Zhang, "Image-based embroidery modeling and rendering" ([DOI](https://doi.org/10.1002/cav.1725)) | 2017, Computer Animation and Virtual Worlds 28(2) | A 3D stitch model; image segmented into regions to set stitch parameters; stroke-based rendering with Phong lighting. | Region-then-stitch pipeline, as ours. |
| Shen et al., "Illumination-preserving embroidery simulation" | 2017, MMM (LNCS) | Intrinsic decomposition into reflectance and shading; stitches rendered per region keeping the photo's shading. | Idea for PX4: shading from the photo's shading layer, colour from its reflectance. |
| Yang & Sun, "Paint with stitches" (random-needle embroidery) | 2018, Multimedia Tools and Applications 77 | Chinese random-needle style: stitch units as primitives, a stitch dictionary and sparse coding; colour quantisation to a thread library per sub-region; local stitch-vector constraints against mosaic artefacts. | Layered crossing stitches as a shading idiom (PX4). |
| Ma & Sun, "Multilayered stitch generating for random-needle embroidery" | 2022, The Visual Computer 38(11) | Layers of intersecting stitches overlapped on purpose, example-based. | Same. |
| Guan et al., "Automatic embroidery texture synthesis for garment design and online display" | 2021, The Visual Computer 37(9) | Segment, assign a stitch category per region, synthesise texture by UV mapping. | Per-region stitch-type classification exists only as a renderer. |
| Shima Seiki, US 7,054,709 ([patent](https://patents.google.com/patent/US7054709B2/en)) | priority 2002; **lapsed 2018** | Each stitch drawn as a thread image, the end facing the light bright and the far end dark, brightness rising with the angle between thread and light. | Free to use for PX0's render. |
| Vistaprint, US 8,818,773 ([patent](https://patents.google.com/patent/US8818773B2/en)) | priority 2010; **lapsed (fee)** | Each stitch drawn as a photograph of one real stitch chosen by length and lighting angle from a database. | Free to use; we would need our own stitch photos. |

### 1.3 Learned (neural) methods

| Work | Year, venue | Method | Numbers |
|---|---|---|---|
| Beg & Yu, "Generating Embroidery Patterns Using Image-to-Image Translation" ([arXiv 2003.02909](https://arxiv.org/abs/2003.02909)) | 2020 | Neural style transfer and CycleGAN for a preview that looks embroidered. | 8,000+ user images with embroidered counterparts; Mechanical Turk real-vs-fake tests. |
| Ye et al., "Towards End-to-End Embroidery Style Generation: A Paired Dataset and Benchmark" | 2021, PRCV | Paired dataset for image-to-embroidered-image. | |
| Yang et al., "Unsupervised Embroidery Generation Using Embroidery Channel Attention" | 2022, VRCAI | Unpaired generation with channel attention. | |
| X. Hu et al., "MSEmbGAN: Multi-Stitch Embroidery Synthesis via Region-Aware Texture Generation" ([project](https://csai.wtu.edu.cn/TVCG/index.html), DOI 10.1109/TVCG.2024.3447351) | 2024, IEEE TVCG | A stitch classifier labels regions (three single-stitch types and multi-stitch), a texture sub-network makes each region's stitches from its shape, a colour network keeps the input's colours. | 30K+ multi-stitch images, 13K+ aligned pairs. FID 122.44 vs MUNIT 146.14, CycleGAN 153.49. Output is a picture. |
| J. Ma et al., "One-shot Embroidery Customization via Contrastive LoRA Modulation" ([arXiv 2509.18948](https://arxiv.org/abs/2509.18948)) | 2025, ACM TOG (SIGGRAPH Asia) | Diffusion; style separated from content with one reference pair. | States machine files as future work: "primitive embroidery instructions" learned jointly with images. |
| Diffusion for Cantonese embroidery style ([article](https://www.nature.com/articles/s40494-026-02342-9)) | 2026, Heritage Science | Stable Diffusion 1.5 with LoRA and ControlNet. | Pictures only. |
| Kaspar et al., "Neural Inverse Knitting" | 2019, ICML | Photo of a knit → machine instructions. | The nearest learned *inverse* fabrication work; nothing like it exists for embroidery. |

**Reading:** every learned method outputs pixels. There is no dataset of picture → stitch file, and none of these
nets runs in a browser at our budget. The useful part for us is the **region-aware stitch classifier** idea
(MSEmbGAN): stitch type is a per-region label decided from shape. We can do that with rules (Goldman's distance
statistics) and measure it, no training needed.

### 1.4 Building blocks from other fields

| Need | Work | Key idea for us |
|---|---|---|
| Flatten texture and noise, keep edges | Kuwahara; Kyprianidis, Kang, Döllner, "Anisotropic Kuwahara filtering", CGF 28(7) 2009; Winnemöller, Olsen, Gooch, "Real-time video abstraction", SIGGRAPH 2006; Xu, Lu, Xu, Jia, "Image smoothing via L0 gradient minimization", TOG 30(6) 2011; Xu, Yan, Xia, Jia, "Structure extraction from texture via relative total variation", TOG 31(6) 2012 | L0 smoothing makes piecewise-flat images directly (the count of edges is what it minimises: an AI picture's soft shading becomes flat shapes). Relative total variation separates *texture* from *structure*: exactly our "stitched-look sheet" case, where Kuwahara needed tuning. |
| Regions | Comaniciu & Meer, "Mean shift", TPAMI 2002; Felzenszwalb & Huttenlocher, "Efficient graph-based image segmentation", IJCV 2004; Achanta et al., "SLIC superpixels", TPAMI 2012; Kirillov et al., "Segment Anything", ICCV 2023 | A region adjacency graph with a merge cost is the right structure for "fewer, cleaner shapes" (PX1); SAM gives object masks but is too heavy for the page. |
| Curves | Schneider, "An algorithm for automatically fitting digitized curves", Graphics Gems 1990; Selinger, "Potrace", 2003; Kopf & Lischinski, "Depixelizing pixel art", TOG 30(4) 2011 | Fit Béziers to region boundaries before stitching: smooth edges instead of 0.125 mm stair-steps (roadmap B4). Kopf-Lischinski for small pixel-art inputs. |
| Vectors and layers | Li, Lukáč, Gharbi, Ragan-Kelley, "Diffvg", TOG 39(6) 2020; Ma et al., "LIVE: layer-wise image vectorization", CVPR 2022; SAMVG, ICASSP 2024 ([arXiv 2311.05276](https://arxiv.org/abs/2311.05276)); "Illustrator's Depth", [arXiv 2511.17454](https://arxiv.org/abs/2511.17454) (2025); AmodalSVG (2025-26, read only in review) | **Layer order and amodal completion**: predict which shape is in front, and complete the hidden part of shapes behind. This is how a person digitizes (sew the whole background shape, then the front on top) and is the root fix for our holes and stranded parts. |
| Skeletons | Blum, medial axis, 1967; Bai, Latecki, Liu, "Skeleton pruning by discrete curve evolution", TPAMI 2007 | Pruned skeletons for satin columns (PX2); DCE prunes by contour significance, not length, so letters keep serifs. |
| Direction fields | Kang, Lee, Chui, "Coherent line drawing" (edge tangent flow), NPAR 2007; Hertzmann & Zorin, "Illustrating smooth surfaces", SIGGRAPH 2000; Knöppel, Crane, Pinkall, Schröder, "Globally optimal direction fields", TOG 32(4) 2013 | A smooth 2-RoSy field (a direction without a sign, which is what a stitch row is) from the image's edges and the shape's outline, solved as one sparse linear problem with singularities allowed. Liu 2023 could not handle singularities; this can. |
| Evenly spaced rows that follow a field | Knöppel et al., "Stripe patterns on surfaces", TOG 34(4) 2015; Tricard et al., "Procedural phasor noise", TOG 38(4) 2019 | Rows as level lines of a stripe pattern: evenly spaced, curving with the field, singularities handled. Liu 2023 compared both and found streamlines more regular near density changes; for constant-density fills stripe patterns are simpler. |
| One path per region | Zhao et al., "Connected Fermat spirals for layered fabrication", TOG 35(4) SIGGRAPH 2016; Kaplan & Bosch, "TSP Art", Bridges 2005 | Fill a region with one continuous path: no cuts inside a region. Fermat spirals are the 3D-printing answer to "parts stranded behind finished rows". |
| Tone with lines | Floyd & Steinberg error diffusion 1976; Ostromoukhov, "Digital facial engraving", SIGGRAPH 1999; Secord, "Weighted Voronoi stippling", NPAR 2002; Pang et al., "Structure-aware halftoning", TOG 27(3) 2008; Birsak, Rist, Wonka, Musialski, "String art", CGF 37(2) 2018 | Engraving: tone from line *width/spacing* along a direction field (the satin/tatami analogue). String art: choose thread paths by optimisation against the target image, the closest precedent for "optimise stitches against the picture". |
| Colour | Sharma, Wu, Dalal, CIEDE2000 notes, Color Res. Appl. 2005; Chang et al., "Palette-based photo recoloring", TOG 34(4) 2015; Tan, Lien, Gingold, "Decomposing images into layers via RGB-space geometry", TOG 36(1) 2016; W3C relative contrast (used by Liu 2023) | Palettes as convex-hull vertices (Tan) explain a picture with few colours plus mixes: the mixes are where thread blends belong. Keep *contrast* between threads, not only nearness (Liu 2023's loss). |
| Strokes by optimisation | Hertzmann, "Painterly rendering with curved brush strokes", SIGGRAPH 1998; Huang, Heng, Zhou, "Learning to paint", ICCV 2019; Zou et al., "Stylized neural painting", CVPR 2021 | Place strokes greedily where the render differs most from the target, then refine: the loop for an optimised photo stitch (PX4). |
| Line art from photos | Chan, Durand, Isola, "Learning to generate line drawings that convey geometry and semantics", CVPR 2022 | Better Line drawing input than edge detection, but a net; for later. |
| Judging a result | Wang et al., SSIM, TIP 2004; Zhang & Wandell, S-CIELAB, SID 1996; Zhang et al., LPIPS, CVPR 2018; Ding et al., DISTS, TPAMI 2020 | S-CIELAB blurs both images by the eye's colour sensitivity at a viewing distance, then takes ΔE: the right measure for thread mixing, small and runnable in JS. DISTS tolerates texture (thread sheen) while scoring structure; LPIPS/DISTS need a net (an offline test tool, not the page). |
| Thread appearance | Kajiya & Kay, SIGGRAPH 1989; Irawan & Marschner, "Specular reflection from woven cloth", TOG 31(1) 2012; Sadeghi, Bisker, De Deken, Jensen, "A practical microcylinder appearance model for cloth rendering", TOG 32(2) 2013 | A highlight that depends on the thread's direction (Kajiya-Kay tangent shading) is most of what makes a render read as embroidery; it is also why stitch direction matters to the look. |

No published perceptual study scores *sewn* machine embroidery against its source picture. The closest: Beg & Yu's
real-vs-fake tests on renders, MSEmbGAN's FID/LPIPS on renders, and a 2025 textile study of how density, fabric and
thread affect rated appeal (Research Journal of Textile and Apparel, 100 raters).

---

## 2. Commercial auto-digitizers

Every product follows Goldman's 1998 shape: **reduce colours → regions → each region a fill (or a detail line) →
order by nearest join**. They differ in how much control they expose. Photo modes are a separate engine
(short segments or rows whose density or colour follows the image).

| Product | What it does, per its docs | Praised | Complaints |
|---|---|---|---|
| **Wilcom EmbroideryStudio** ([Smart Design](https://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Automatic/automatic/automatic-10.htm), [Prepare Bitmap Colors](https://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Automatic/automatic/automatic-4.htm), [Color PhotoStitch](https://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Automatic/automatic_photos/automatic_photos-8.htm), [auto-digitizing explained](https://help.wilcom.com/portal/en/kb/articles/autodigitizing-concept)) | *Prepare Bitmap Colors*: finds the main colour blocks, reduces colours (removing noise and anti-aliasing), lets you merge like colours; a **Details** slider filters out small colour areas ("More" = more objects). *Smart Design*: each colour is a **Fill**, a **Detail** (Satin, Column C or Double Run; outlines, pick-outs such as eyelashes) or **Omit** (background omitted by default); optional branched run **Outlines** round every block and a satin **Border** round the design; order by **closest join**; advice: "fills first, details last". *Instant Smart Design*: one step. *Color PhotoStitch*: multi-colour photo stitching with as few colours as possible, image up to 400 mm, "crisp images with well-defined subjects and strong contrasts". *PhotoFlash*: single colour, rows at a grain angle plus a skew angle. Also sold as a **web API** (EMB out, TrueView preview). Its own help: auto-digitizing "is not a substitute for expert digitizing"; fabric settings stay at defaults; stitch type and direction "reasonable but not always optimal"; "most embroidery uses 5-6 colors maximum". | Fills, stitch counts close to a professional's (useful for quotes), control over every step. | Price, Windows. Needs cleanup for production. |
| **Hatch** (Wilcom's home product; [auto-digitize](https://hatch.embroideryhelp.net/v3/en/OnlineHelp/Automatic/auto-digitize/Auto-digitize_embroidery.htm), [Color PhotoStitch](https://hatchembroidery.com/resources/blog/transform-cherished-memories-into-embroidered-art-with-color-photostitch-tool)) | Same engine and dialogs: classify each colour fill/detail/omit, reorder colours, thread matching three ways, details as centre line, satin line or satin fill, outlines, border. Color PhotoStitch at the Digitizer level. | Approachable; same quality engine as Wilcom. | A university makerspace guide warns that Instant Embroidery rarely gives good results and can crash Hatch, and that a signature's full stop was too small to stitch ([Northeastern](https://makerspaces.northeastern.edu/?p=2180)). Blogs: blurry/pixelated art gives jagged, over-dense edges. |
| **BERNINA DesignerPlus** (Wilcom-based; [help](https://softwarehelp.bernina.com/en/MainHelp/PART_Automatic/automatic/automatic-10.htm)) | AutoDigitize, Color PhotoStitch, prepare-image tools like Wilcom's. | | Liu et al. 2023 sewed both: AutoDigitize "only separates the input image into uniformly colored regions", direction from the region's boundary; no gradient, no brush-stroke direction. |
| **Brother PE-DESIGN 11** ([manual](https://download.brother.com/welcome/doch101410/ped11_im02en.pdf) pp. 143-157, 382-385) | *Auto Punch*: "images with few and distinct colors work best"; controls **Noise reduction**, **Segmentation sensitivity**, **Max. number of colors**, **Omit region colors / Omit line colors**, **Create Lines** (pick regions to sew as lines), a mask outline as a border. *Photo Stitch 1*: Color/Sepia/Gray/Mono; **Detail** (finer = more overlapping stitches), **Run pitch**, **Image type Photo** (threads mixed) vs **Cartoon** (not mixed), **Conversion priority: stitch quality vs jump reduction**, reserve threads, "Brother Chart (Photo Stitch)" adjusted so screen colours match thread; sewing order brightest first, fixed; images **300-500 px** suit it; minimum sizes **face 100 x 100 mm, head and face 130 x 180 mm**; bad: small subjects, dark or back-lit photos. *Photo Stitch 2*: four threads (CMYK, RGBK, CRYK, BMYK or auto), repeating zigzag rows with **Line interval**, **Max. density** and one **Direction**. *Cross Stitch*: cross size, colours, single/double/triple. *Design Center*: line image → regions, fill direction **Constant** or **Variable** ("varies the sewing direction according to the shape of the region"). Under sewing types for satin: edge only, region zigzag or piping, both, double; half stitch (evens density on curves); pull compensation as a slider. | Photo Stitch 1 faces at 100 x 100 mm and up. | Auto Punch: fills at 0° or one 45° angle ("sticker look"); shading read as extra colours; small "confetti" groups of 3-5 stitches that knot; more borders more gaps (fix: 0.3-0.5 mm overlap); inefficient travel ([lesson write-up](https://embroideryhooping.com/blogs/articles/pe-design-next-lesson-23-auto-punch-vs-manual-punch-and-how-to-fix-the-too-many-colors-problem-fast), a blog). |
| **Brother Artspira / Artspira+** ([Image to Embroidery](https://support.brother.com/g/s/hf/mobileapp_info/artspira/plan/func2/en.html), [Artspira AI](https://support.brother.com/g/s/hf/mobileapp_info/artspira/plan/func4/en.html)) | Phone app, subscription. Image to Embroidery: number of colours, one-tap background removal; fills "in one direction", or cross stitch. **Artspira AI restyles the photo first** into one of 11 styles, of which 7 can go to embroidery (Pop, Flat Portrait, Pixel, Simple, Black and White, Silhouette, Line-cute) and 4 cannot (Crayon, Crayon Sketch, Watercolor, Manga); detects faces, dogs and cats. | Easiest path for a phone user; the AI restyle is Brother's own "make it stitchable". | Brother's own list: unclear or jagged borders sew uneven; many small details mean more cuts; **thin lines come out broken or partly missing**. |
| **mySewnet / Creativate** (Husqvarna/Pfaff; [type guide](https://softwarehelp.mysewnet.com/MSM/140/Embroidery/Topics/Choose_Embroidery_Type.htm)) | ExpressDesign (Express Embroidery / Trace / Border): best with "well defined, flat color areas and outlines", "cartoon or coloring book style"; QuickStitch (click an area); Despeckle 1-100 px. PhotoStitch: Color, Sepia, Monochrome, **Color Tile** (diamond, square, hexagon blocks), **Linear** (one thread; linear, maze, spiral effects). | Photo effects with character. | |
| **Janome Artistic Digitizer** ([product](https://www.janome.com/software/artistic-digitizer/)) | Auto-digitize after bitmap colour preparation (the Wilcom-family flow per a university tutorial). Not checked further this round. | | |
| **Embrilliance StitchArtist** ([product](https://embrilliance.com/product/stitchartist-level-3)) | Says of itself it is "not a photo-to-stitch tool, nor an auto-digitizing program"; Magic Wand traces clean artwork into shapes (Level 2-3). | Honest scope. | |
| **Online services** ([Ember](https://emberdesign.net/), [Embify](https://www.embify.ai/home-embroidery-digitizing), [StitchAI](https://stitchai.us/), [EmbroidAI](https://www.embroidai.com/), [Click-stitch](https://click-stitch.com/)) | Upload → background removed → traced → stitch types chosen → PES/DST. Ember: browser editor, auto-digitize and click-to-stitch on Pro ($9.99/month). Embify: free preview, £5 a file; warns of lettering under ~4.5-5 mm, hairlines, and says gradients and photos are not supported. StitchAI: "AI digitizing", up to 5 colour zones, an unsourced "98.4 % accuracy". | Instant, on any device. | No method or measured quality published; several are waitlists. None publishes before/after sew-outs. |

What users say across all of them (forums and blogs; weak sources, consistent story): auto-digitizing **needs
cleanup**; it fails on **gradients, textures, blurry or pixelated art**; it makes **too many colours** from shading,
**confetti** specks, **gaps** where regions abut, **flat one-angle fills**, **too many trims**, and **broken thin
lines**; small text closes up. Every vendor's advice is the same: start from clean art with few flat colours.

---

## 3. Professional digitizing practice, with numbers

What a person does that the tools above don't, and the numbers they use. Ours in brackets where we already have it.

| Topic | Practice | Numbers and source |
|---|---|---|
| Stitch type by width | Run for lines, satin for columns, fill for areas. | Satin from ~1 mm (needle and thread width; 1.0-1.2 mm for text under 6 mm, [Ignition Drawing](https://www.ignitiondrawing.com/blog/Small-Lettering-Guide-Part-2)); satin to ~7 mm plain, split from 7 mm ([Wilcom Auto Split](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Quality/quality/quality-17.htm)); 10 mm recommended maximum, 12 possible, 15 risky ([Wilcom blog](https://wilcom.com/resources/blog/mastering-basic-stitch-types-satin-stitch-and-tatami-stitch)); fill above that. [Ours: no satin in pictures; triple run under 1 mm, tatami from 1 mm.] |
| Satin shape | Columns split at sharp bends; anchors at ends and junctions; stitches normal to both edges; "half stitch" / short stitches on the inside of curves. | Bends under ~45°, sharp ends under ~30° (Goldman). PE-DESIGN "Half Stitch" evens density on curves. |
| Fill angle | By eye: along the form (a leaf's length, a petal's radius), and neighbours differ so they read as separate. | Goldman: fewest fragments of 16 angles. PE-DESIGN Variable direction follows the region's shape. Auto Punch's flat 0°/45° is the main look complaint. [Ours: one angle per shape, neighbours +90°.] |
| Underlay | Centre run for narrow columns, edge run plus zigzag or tatami for wide columns and fills; none under tiny text. | Centre run for 2-3 mm columns; edge run with zigzag or tatami for large shapes; double underlay common ([Wilcom](https://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Quality/stabilizing/stabilizing-7.htm)). Lettering: none under 5 mm, centre run 6-10 mm, edge run above 10 mm ([Wilcom lettering](https://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Lettering/lettering_advanced/lettering_advanced-22.htm)). Underlay stitch 2.0 mm for small text (2.5 default). [Ours: fills edge run + rows at 2.5 mm.] |
| Pull compensation | Widen across the stitch direction; satin pulls in at the sides and pushes out at the ends. | Cotton/drill 0.20, T-shirt 0.35, fleece 0.40, lettering 0.2-0.3 mm ([Wilcom](https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Quality/underlays/Apply_automatic_pull_compensation.htm)); v28 lets each side differ. [Ours: these values for fills; pictures 0.05/0.15.] |
| Density | Lighter for large areas (stiffness, pull) and for tiny ones (bird nests). | Satin and tatami ~0.4 mm; dense ~5 lines/mm; fill stitch ~4 mm ([EduTech wiki](https://edutechwiki.unige.ch/en/Embroidery_stitch_type)). [Ours: 0.4 / 0.35, 24 hits per mm².] |
| Layering and overlap | Sew back to front; a shape behind is digitized *whole*, under what covers it, not cut round it; abutting shapes overlap. | 0.3-0.5 mm overlap. Wilcom: "fills first, details last". [Ours: 0.35 mm overlap, cut-round shapes.] |
| Trims and pathing | Finish a section before going on; travel under what will cover it; few colour changes; centre out on big designs. | Machines with 1 needle pay a stop per colour. Liu 2023: cutters "slow and unreliable". [Ours: A* travel under fill to come.] |
| Small details | Leave out or simplify what thread can't draw; outline instead of fill; enlarge eyes and text. | Lettering 4.5-5 mm minimum (Embify, the usual trade figure); thin art lines 1.5-2 mm at final size (blog advice); Goldman discards regions under 6 px at 300 dpi; Stitch Era deletes 30-50 % of traced shapes (`docs/pictures.md`). |
| Photos | Specialised stitches, not regions: short segments along edges (Brother PS1), zigzag rows at one angle over four threads (PS2), tiles, a single-thread spiral or maze. | PE-DESIGN: 300-500 px input; faces 100 mm or bigger. |

---

## 4. The gap, and ten ideas

### Where no tool does well today

1. **No one measures looks.** Tools show a render; none says how close the file is to the picture, or uses that to
   choose settings. Papers measure renders with FID; nobody measures files.
2. **Regions are cut round, not layered.** Every auto-digitizer turns colour regions into separate shapes that abut.
   The result: gaps at every border (the top complaint after "too many colours"), stranded parts, extra trims. A
   person sews the shape behind whole and lays the front on top.
3. **One angle per region.** Auto Punch's 0°/45°, Wilcom's "reasonable defaults", Bernina's boundary-derived angle.
   Direction following the *form* exists only in Liu 2023, with hand-drawn fields, two colours and no singularities.
4. **Thin things fail.** Thin lines break (Brother's own warning); satin from pictures only in Wilcom-family tools and
   only for colours you mark as details.
5. **Shading is either flat regions or a photo engine.** Nothing between: a clip-art apple with a soft highlight is
   either posterised into bands or sent to photo stitch. Liu 2023's two-thread blend is the only principled middle.
6. **Cleanup is the user's job.** The universal advice is "start from clean art", yet no tool shows the user the
   clean art it will actually sew, or makes it for them (bar Artspira AI's restyle, behind a subscription).
7. **AI art is treated as any other image**, though it has its own faults: soft glows, texture, pseudo-text, halos,
   hairlines, many near-identical colours.

### Ten ideas

Each: why it might beat the field, how to measure it, the risk.

**I1. Render and score, then search (closed loop).** Draw the *file* as thread (each stitch a capsule with a
Kajiya-Kay highlight along its direction, the far end darker, thread width by weight: ideas from Chen 2012 and the
lapsed Shima Seiki and Vistaprint patents) and score it against the picture: S-CIELAB ΔE at a viewing distance for
colour, edge agreement for structure (US 8,706,286's matched-edge share), plus the stitch scoreboard (trims, loose
threads, tiny stitches). Then let the page try a few settings (colour count, details level, angle rule) and offer the
best, as PE-DESIGN's "Select from Candidates" does for brightness. *Why:* no tool closes the loop; every later idea
needs a number to win on. *Measure:* the score's rank against human rankings of corpus renders and of the next sew-out
pack (Kendall τ); per round, score up and no scoreboard row worse. *Risk:* render ≠ sewn (sheen, pull, fabric); keep
the sew-out packs as ground truth; time on big pictures (score on a 2-4 px/mm copy).

**I2. Stitchable simplification as one optimisation.** Build the region adjacency graph (colour regions from today's
labelling), and merge greedily by `cost = look error (ΔE00 x area, edge loss) + λ · sewing cost`, where sewing cost
counts what thread can't draw: parts under the minimum width (a morphological opening by 1 mm for fills, 0.5 mm gaps
closed), pieces that each cost a trim and two locks, slivers between colours. Boundaries then fitted with curves
(Schneider) so fills follow smooth outlines. λ is the "Details" slider, but with a meaning. *Why:* tools filter by area
only (Wilcom's Details, Goldman's 6 px, despeckle); area misses thin necks, slivers and the trim each piece costs.
*Measure:* trims, pieces and holes (`picture_corpus` holes) down at an equal or better I1 score. *Risk:* merges that
erase something meaningful (an eye, a dot over an i): protect small high-contrast compact marks, as the current
"eyes" and text-dot rules do.

**I3. Layers with hidden parts completed.** Order regions front to back (smaller, enclosed, higher contrast and
convex-intruding regions are in front; Illustrator's Depth and amodal vectorization learn the same thing), then extend
each back region under the regions in front of it: its hidden boundary is closed with a smooth curve through where
it disappears (the "occluded boundary" step Goldman did for satin junctions, applied to fills). Sew back to front;
front shapes cover the joins. *Why:* removes the cause of gaps and stranded parts rather than patching them with
overlap; one back region becomes one piece instead of many. Nobody automatic does it. *Measure:* holes (20 patches
on the corpus at v29), stranded parts (107 on the 12 samples), trims; density never over 24 (hidden fill under front
fill adds hits: lay the hidden part as underlay-density rows, or leave the deep interior bare). *Risk:* stitch count
and stiffness up where layers stack; a wrong order puts a back shape over a front one: only extend under regions it
borders, and only by a bounded distance (a few mm).

**I4. Satin from the stroke graph.** Regions classified thin or thick by distance-to-edge statistics on their skeleton
(Goldman, expired); thin ones, 1-7 mm wide, become satin columns: pruned skeleton (discrete curve evolution), anchors
at ends and junctions, columns split at bends under 45°, normals fitted to both edges, widths read off the distance
transform; over 7 mm split satin or fill. Lines under 1 mm stay runs (triple or bean). *Why:* outlines and strokes are
what make a design look professionally digitized; today they are tatami strips or triple runs. Brother and every
online tool admit thin lines fail. *Measure:* I1 score on outlined clip art and lettering pictures; same-edge gap ≤
0.6 mm; satin through junctions without density over 24 (the lettering engine's fans and eased ends already solve
this for script). *Risk:* junctions (three columns meet) pile thread: reuse `Design.fan` and eased satin ends;
decisions.md lists "1-2 mm outlines as satin" as open for exactly this reason.

**I5. Direction that follows the form.** A smooth line field per region from two sources: the shape (gradient of the
distance to the edge, or the skeleton's tangent) and the picture (structure tensor or edge tangent flow, Kang 2007),
solved as one smooth 2-RoSy field (Knöppel 2013: one sparse solve, singularities allowed). Rows as evenly spaced level
lines of a stripe pattern on that field (Knöppel 2015), cut by the outline like today's rows. Simple regions keep a
straight angle chosen by Goldman's fewest-fragments rule or the region's long axis. *Why:* the one look that separates
hand digitizing from auto in every complaint ("sticker look"); Liu 2023 needed hand-drawn fields and failed on
singularities and holes. *Measure:* I1 score (the render's highlights carry direction); fragments per region; a sew-out
of a petal, a leaf and a face. *Risk:* row spacing varies where the field turns sharply (density over 24 on the
inside of turns): clip spacing to [0.35, 0.5] mm and break rows there; rows not straight make the tatami pattern
show oddly; more compute (a solve per region on a coarse grid is ms).

**I6. Contrast-keeping thread palette.** Choose the k colours and their threads together: candidates from the 24
clusters, threads from the owned or full chart, cost = Σ area·ΔE00(colour, thread) + w · Σ over neighbouring pairs of
max(0, contrast lost), the term Liu 2023 used for two colours, extended to every bordering pair. *Why:* our open
complaints are pastels and pinks matched to greys and an outline merging into the fill next to it; nearest thread one
by one loses the relation. *Measure:* contrast ratio between bordering regions before and after; the tester items
in roadmap (c). *Risk:* small; a slightly further thread for a colour, said in the swap list.

**I7. Two-thread blends for soft shading.** Where a region's colours lie along a line in colour space (Liu 2023's
PCA, or Tan 2016's hull edges), sew it as one solid ground plus a second thread whose row spacing varies to make the
blend; the rows follow I5's field. Extends the `blend` fill we already have. Optionally a third mode for photos: rows
or zigzags whose spacing follows tone, à la PE-DESIGN Photo Stitch 2, but with directions from I5. *Why:* the middle
ground no tool covers (soft highlights in AI clip art, skies, cheeks). *Measure:* S-CIELAB error at 30 cm viewing
against the posterised version; colour count unchanged or lower. *Risk:* density: two layers must stay under 24 per
mm² (the ground can be a lighter fill under the gradient's dark end); varying spacing shows bands unless dithered
along the rows.

**I8. Connected fills.** For compact regions, one path per region: rings joined into a Fermat spiral (Zhao 2016), or
streamlines joined as Liu 2023 does. *Why:* zero cuts inside a region; stranded parts behind finished rows disappear
by construction. *Measure:* trims and loose threads per region on the samples; look by I1. *Risk:* rings look
different from tatami (concentric sheen); our contour fill already exists (`ringFill`), so this is a router change, not
a new fill.

**I9. "Make it stitchable" pre-pass with a preview.** Before any stitch is planned, show the picture *as it will be
sewn*: flattened (L0 smoothing or relative-total-variation for texture), halos removed, colours reduced (I6), I2's
merges done, lines thickened or turned into runs, text under the readable size flagged. The person sees "this is what
we'll sew" next to their picture, and the verdict says why each change was made. *Why:* every vendor says "start from
clean art" and leaves the work to the user; Artspira does a restyle but only behind a subscription and a black box.
*Measure:* the I1 score of the sewn file against the *original* (did cleanup lose meaning?) and against the cleaned
picture (did the stitches keep it?); tester comprehension. *Risk:* the person disagrees with a change: every change
undoable by tap, as "Leave it out" / "Sew it" today.

**I10. Semantic protection (later).** Faces, eyes and lettering matter more than their area: weight I2's look error by
a saliency or face/text mask so merges never take an eye. On the page that means a small detector or a hosted vision
model, which a static site without a build step cannot carry cheaply. *Why:* Brother's Artspira AI detects faces, dogs
and cats for this reason. *Measure:* a corpus of faces and mascots; no feature lost at the default. *Risk:* model size
and licence (the clean-room asset rule applies: only a permissive model, committed as is); start with rules (small,
dark, compact, enclosed regions near the top of a round shape = eyes).

---

## 5. AI-generated art

### What digitizes well
From vendors' advice (all of them agree), Brother's own list of which AI styles it lets go to embroidery, and our
`docs/pictures.md` measurements:

| Digitizes well | Digitizes badly |
|---|---|
| Flat colour areas, 2-6 colours (Wilcom: most embroidery 5-6) | Gradients, glows, soft shadows, airbrush |
| Bold outlines that measure 1.5-2 mm at the sewn size | Hairlines under 1 mm (break or vanish) |
| Large simple shapes, clear borders | Fine texture, noise, "stitched-look" or painterly texture |
| A plain or see-through background | Busy or photographic backgrounds |
| Text at 5 mm cap height or more, or no text | Small text, AI pseudo-text |
| One subject, filling the frame | Many small subjects (each a trim) |
| Brother's embroiderable AI styles: Pop, Flat Portrait, Pixel, Simple, Black and White, Silhouette, Line-cute | Brother's non-embroiderable ones: Crayon, Crayon Sketch, Watercolor, Manga |

### Sizes in pixels
Rules in mm become rules in pixels once the sewn size is known: pixels per mm = image width in px / sewn width in
mm. At 1024 px over 100 mm that is 10 px/mm, so:

| Rule | mm | px at 1024 px / 100 mm | px at 1024 px / 50 mm |
|---|---|---|---|
| Thinnest line sewn as a line | 1 | 10 | 20 |
| Thinnest outline that reads bold (satin) | 1.5-2 | 15-20 | 30-40 |
| Smallest gap kept | 0.5 | 5 | 10 |
| Smallest shape worth a trim | ~2.5 across | 25 | 50 |
| Smallest letter (cap height) | 5 | 50 | 100 |

The guide (PX6) should give the person these numbers for *their* size, and the check should measure them.

### The pre-pass for AI art (I9, in order)
1. **Classify** the picture: flat illustration, line art, textured (stitched-look, painterly), or photo (today's
   `flatShare` is the start; add a gradient-energy share for soft shading and a JPEG-ringing share).
2. **Background** by position (have), plus AI's typical white or off-white vignette as background.
3. **Flatten**: L0 gradient minimisation or relative total variation for texture (Xu 2011, 2012), our Kuwahara
   where it already wins; soft shading split into flat bands or kept for a two-thread blend (I7).
4. **Halos and anti-aliasing** folded into the colour they border (have, for JPEG halos and soft shadows).
5. **Palette** to threads keeping contrast (I6).
6. **Widths**: lines under 1 mm thickened to 1 mm or sewn as runs; gaps under 0.5 mm closed; outlines 1-2 mm marked
   for satin (I4).
7. **Specks and slivers** merged by sewing cost (I2).
8. **Text**: regions that look like text (rows of similar small dark shapes) under 5 mm flagged, with "make it
   bigger" or "leave it out"; AI pseudo-text flagged as "this looks like writing but isn't".
9. **Show** the stitchable picture beside the original (I9) and score the file against both (I1).

### "Ask your AI for…" (for the PX6 guide)
A prompt that works, from vendors' advice: *"flat vector illustration, solid colours, no gradients, no shading, bold
dark outlines, at most 5 colours, large simple shapes, plain white background, no text"*. Add the size: *"lines at
least 2 % of the picture's width"* is the 1024 px / 100 mm row above in words.

---

## 6. Ranked ideas mapped onto the rounds

Ranked by value to a maker, times the chance it works, over effort. Every stitch round ends with a sew-out pack.

| Rank | Idea | Round | Why first | First step |
|---|---|---|---|---|
| 1 | I1 Render and score (closed loop later) | **PX0** | Everything after needs a number; the roadmap already puts it first | Thread render of the decoded file; S-CIELAB + edge agreement score in `picture_corpus` beside the scoreboard; an AI-style corpus (flat, logo, cartoon, mascot, photo) drawn or made here |
| 2 | I2 Stitchable simplification | **PX1** | Attacks the measured cause of trims (separate pieces) and the top complaint (confetti) | Region graph from today's labels; merge cost with min-width opening; curve-fitted boundaries |
| 3 | I3 Layers with hidden parts | **PX1** (order, completion) → **PX2** (sewing back to front) | Root fix for holes and stranded parts; nobody automatic does it | Front-to-back order from enclosure and contrast; extend back regions under front by ≤ 3 mm |
| 4 | I4 Satin from the stroke graph | **PX2** | The professional look; thin lines are every tool's failure | Thick/thin by skeleton distance statistics; columns 1-7 mm; reuse lettering's fans and eased ends at junctions |
| 5 | I9 Pre-pass with a preview, and I6 contrast palette | **PX1** (pre-pass), **PX6** (verdict, guide) | Makes AI art work and tells the person why; cheap given PX1 | L0/RTV flatten; widths to sewable; the "as it will be sewn" picture |
| 6 | I5 Form-following direction | **PX3** | The look that separates hand from auto | Per-region 2-RoSy field from shape + image; stripe-pattern rows; fewest-fragments straight angle as fallback |
| 7 | I7 Two-thread blends; photo rows along the field | **PX4** | The empty middle between flat and photo | Blend where a region's colours lie on a line; rows along I5's field |
| 8 | I8 Connected fills | **PX3** | Fewer cuts by construction | Fermat-spiral joining of `ringFill` rings for compact regions |
| 9 | I1's closed loop (try settings, offer the best) | **PX6** | Needs PX0's score and PX1-PX3's options | Three candidates scored in the worker; best one shown, others one tap away |
| 10 | I10 Semantic protection | later (after PX6) | Needs a model; rules first | Eye and text rules in I2's cost |
| - | Machines and hoops | **PX5** | No research novelty; data from makers' published specs | Janome, Bernina, Husqvarna/Pfaff, Tajima-format field sizes; JEF thread order measured |

Round notes:
- **PX0** also sets what "looks like the picture" means for every later round: a round is better when its I1 score
  rises on the corpus and no scoreboard row gets worse.
- **PX1** and **PX2** share the region graph: build it once (I2), then layer it (I3), then classify thick/thin (I4).
- **PX3**'s field is reused by PX4's blend rows.
- **PX6** turns the pre-pass's measurements into the verdict and the guide's numbers (§5).

---

## 7. Patents to keep clear of

Not legal advice; Google Patents' status is its own assumption. Before shipping anything close to a live patent, the
owner should check it.

| Patent | Status | Covers | Our position |
|---|---|---|---|
| Brother US 7,946,235 (Yamada) | **Active, to 2030** | Per-pixel angle characteristic and strength → one line segment per pixel at that angle → colour from a band round each segment → same-colour segments chained | Don't build photo stitch this way. I7's rows along a smooth region field with spacing for tone is a different method; keep it different. |
| Brother family US 7,693,598, 8,200,357, 8,271,123, 8,335,584, 8,903,536, 8,473,090, 8,065,030 | Not checked | Variants of the above (areas by frequency or angle, segment connection) | Check before PX4. |
| Goldman family (Soft Sight / Vistaprint) US 6,836,695 … 9,200,397 | Expired 2018 | Thin/thick classification, satin anchors, fewest-fragment fill angle | Free to use (I4, I5). |
| Vistaprint US 8,706,286 (suitability) | Lapsed (fee) | Edge agreement after colour reduction, edge irregularity, stitch estimate | Free to use (PX6). |
| Shima Seiki US 7,054,709; Vistaprint US 8,818,773 (rendering) | Lapsed | Lit thread images; per-stitch photos by length and angle | Free to use (PX0). |
