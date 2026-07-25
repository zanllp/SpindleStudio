# Test Prompts

Use these to verify image generation across providers, resolutions, and aspect ratios.

## Quick Sanity Checks

| # | Prompt | Ratio | Resolution | Notes |
|---|--------|-------|------------|-------|
| 1 | `a single red apple on a white table` | 1:1 | 1K | Simple subject, fast |
| 2 | `a blue sky with white clouds` | 16:9 | 1K | Landscape ratio |
| 3 | `a cute orange cat sitting on a chair` | 1:1 | 2K | Higher resolution test |

## Aspect Ratio Tests

Use one prompt across multiple ratios to verify each renders correctly:

**Prompt:** `a cozy cafe interior with warm lighting, wooden tables, and a barista behind the counter`

Run at: `auto`, `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9`

Expected: the scene adapts to fit each frame without stretching or letterboxing artifacts.

## Resolution Tests

**Prompt:** `a macro photograph of a dew-covered red rose petal with extreme detail`

| Resolution | Expected |
|------------|----------|
| 1K | Standard, usable |
| 2K | Noticeably sharper |
| 4K | Fine details visible (requires widescreen ratio for API Mart) |

## Style & Quality

| # | Prompt | Notes |
|---|--------|-------|
| S1 | `a majestic dragon flying over a mountain range at sunset, digital art style` | Complex composition |
| S2 | `a photorealistic portrait of an elderly fisherman with weathered skin, natural lighting` | Skin detail, realism |
| S3 | `a minimalist logo of a tree, flat vector style, clean lines, white background` | Vector/logo capability |
| S4 | `a watercolor painting of a japanese garden with cherry blossoms and a koi pond` | Artistic style transfer |
| S5 | `a futuristic cyberpunk city street at night with neon signs and rain, cinematic lighting` | Complex lighting, details |
| S6 | `an oil painting in the style of Van Gogh, starry night over a wheat field` | Style emulation |
| S7 | `pixel art of a retro video game character jumping over a barrel, 16-bit style` | Pixel art |

## Text Rendering

| # | Prompt | Notes |
|---|--------|-------|
| T1 | `a billboard that says "HELLO WORLD" in bold white letters on a black background` | Simple text |
| T2 | `a storefront sign reading "Coffee & Tea" with elegant typography` | Text + scene |

## Multi-image Generation (n > 1)

Test `n=2` or `n=4` with a simple prompt to verify multi-image output:

`a row of different colored balloons: red, blue, green, yellow`

## Reference Image (Image-to-Image)

1. Generate a base image: `a simple sketch of a house on a hill, black and white line art`
2. Use it as reference with: `add color and turn it into a watercolor painting`

## Provider-Specific

### OpenRouter — gpt-image-2 quality test
`a glass sphere containing a miniature galaxy with stars and nebulae, 8k photorealistic, studio lighting`
→ Test at 1K / 2K / 4K to verify quality tiers map correctly

### OpenRouter — Non-GPT model
Switch to a flux or seedream model and run:
`a surreal landscape with floating islands and upside-down waterfalls, fantasy concept art`

### API Mart — 4K widescreen constraint
`a panoramic view of the grand canyon at golden hour`
→ Ratio must be 16:9, 21:9, 9:16, 2:1, 1:2, or 9:21 for 4K to be available

## Edge Cases

| # | Prompt | Notes |
|---|--------|-------|
| E1 | (empty) | Should show validation error |
| E2 | `a` | Minimal prompt |
| E3 | `生成一只猫` | Chinese text |
| E4 | `猫が窓辺で寝ている、日光が差し込む部屋` | Japanese text |
| E5 | `🎨🐱🏙️` | Emoji-only prompt |
