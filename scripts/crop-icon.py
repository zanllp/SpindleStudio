"""Resize icon to exactly 512x512, allowing slight horizontal stretch."""
from PIL import Image

img = Image.open("c:/Users/zanllp/Desktop/repo/gpt-image-chat/build/icon-source.jpg")
print("Original size:", img.size)

# Take the left 80% of the image (witch + staff + portals), then resize to 512x512
# This will slightly stretch horizontally, but keeps the composition
width, height = img.size
crop_width = int(width * 0.85)

img_cropped = img.crop((0, 0, crop_width, height))
print("Cropped size:", img_cropped.size)

# Resize to exactly 512x512 (allowing non-proportional resize)
img_resized = img_cropped.resize((512, 512), Image.Resampling.LANCZOS)

img_resized.save("c:/Users/zanllp/Desktop/repo/gpt-image-chat/build/icon.png", "PNG", optimize=True)
print("Saved icon.png:", img_resized.size)
