"""Remove green screen with morphological edge cleanup."""
import colorsys
from PIL import Image

def is_greenish(r: int, g: int, b: int) -> bool:
    """Detect if a pixel is in the green hue range."""
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    hue_deg = h * 360
    return 60 <= hue_deg <= 180 and s > 0.35 and v > 0.25

def remove_green_screen(input_path: str, output_path: str):
    img = Image.open(input_path).convert("RGBA")
    pixels = img.load()
    width, height = img.size

    # Build initial mask
    mask = [[is_greenish(*pixels[x, y][:3]) for x in range(width)] for y in range(height)]

    # Apply mask: make green pixels transparent
    for y in range(height):
        for x in range(width):
            if mask[y][x]:
                pixels[x, y] = (*pixels[x, y][:3], 0)

    # Erode the foreground: for each non-transparent pixel near transparent,
    # if it's even slightly greenish, kill it
    for iteration in range(5):
        to_remove = []
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                if a == 0:
                    continue
                # Check if any neighbor is transparent
                has_transparent_neighbor = False
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < height and 0 <= nx < width:
                            if pixels[nx, ny][3] == 0:
                                has_transparent_neighbor = True
                                break
                    if has_transparent_neighbor:
                        break
                # If near transparent and slightly green, kill it
                if has_transparent_neighbor and g > 80 and g > r + 5 and g > b + 5:
                    to_remove.append((x, y))
        if not to_remove:
            break
        for x, y in to_remove:
            pixels[x, y] = (*pixels[x, y][:3], 0)

    # Desaturate remaining edge pixels
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            # If pixel has green cast, desaturate
            if g > r + 10 and g > b + 10 and g > 60:
                # Replace green with max of r,b plus small offset
                new_g = max(r, b) + 8
                pixels[x, y] = (r, new_g, b, a)

    img.save(output_path, "PNG")
    print(f"Saved: {output_path}")

if __name__ == "__main__":
    remove_green_screen(
        "c:/Users/zanllp/Desktop/repo/gpt-image-chat/src/assets/mascot-welcome.jpg",
        "c:/Users/zanllp/Desktop/repo/gpt-image-chat/src/assets/mascot-welcome.png",
    )
