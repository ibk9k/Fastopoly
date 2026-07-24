# Original art

Full-resolution sources for the images in `public/`. Kept **outside** `public/`
so Vercel never serves or ships them — nothing here reaches the browser.

The versions in `public/` are downscaled to roughly 4x their largest on-screen
size and recompressed. The board is capped at ~692px wide by the
`max-w-[1400px]` layout wrapper, so a tile icon never renders above ~58px; the
shipped assets are sized for that, plus headroom for a 3x DPR phone.

Restore an original with `cp assets/original/<file> public/<file>` if a design
change ever needs the art larger (board zoom, marketing, print).
