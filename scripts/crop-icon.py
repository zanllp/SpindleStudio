"""Crop the witch icon to a proper square without distortion."""
from PIL import Image

img = Image.open("c:/Users/zanllp/Desktop/repo/gpt-image-chat/build/icon-source.jpg")
print("Original size:", img.size)  # 1254x1254

# The original is already square. We want to crop a centered square that
# focuses on the witch (left-center) without stretching.
# Take a square crop from the left side where the witch is.
width, height = img.size
crop_size = min(width, height)  # 1254

# Center the crop horizontally on the witch (she's left of center)
# and vertically centered.
left = int(width * 0.05)   # start slightly left
top = 0
right = left + crop_size
bottom = crop_size

# If right exceeds width, shift left
if right > width:
    right = width
    left = right - crop_size

img_cropped = img.crop((left, top, right, bottom))
print("Cropped size:", img_cropped.size)

# Resize to 512x512 with proper proportional scaling
img_resized = img_cropped.resize((512, 512), Image.Resampling.LANCZOS)

img_resized.save("c:/Users/zanllp/Desktop/repo/gpt-image-chat/build/icon.png", "PNG", optimize=True)
print("Saved icon.png:", img_resized.size)
