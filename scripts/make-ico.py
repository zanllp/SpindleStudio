"""Generate icon.ico from the current build/icon.png."""
from PIL import Image

img = Image.open("c:/Users/zanllp/Desktop/repo/gpt-image-chat/build/icon.png")

# Save as ICO with multiple sizes
sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(
    "c:/Users/zanllp/Desktop/repo/gpt-image-chat/build/icon.ico",
    format="ICO",
    sizes=sizes,
)
print("Saved icon.ico with sizes:", sizes)
