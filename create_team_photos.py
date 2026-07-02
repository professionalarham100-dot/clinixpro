from PIL import Image, ImageDraw, ImageFont
import os

# Create images/team folder if needed
team_dir = r"c:\Users\arham\Desktop\updated fyp clinix pro\FYP FYP FYP\Fyp\frontend\images\team"
os.makedirs(team_dir, exist_ok=True)

# Team members with colors
team_members = [
    ("awais", "Awais Ahmed\nCheema", "#2E86AB"),
    ("arham", "Arham\nAftab", "#A23B72"),
    ("talha", "Talha\nAsif", "#F18F01"),
    ("adil", "Sir Adil\nButt", "#06A77D")
]

# Create images
for filename, name, color in team_members:
    img = Image.new('RGB', (400, 400), color=color)
    draw = ImageDraw.Draw(img)
    
    # Try to use a nice font, fall back to default
    try:
        font = ImageFont.truetype("arial.ttf", 50)
    except:
        font = ImageFont.load_default()
    
    # Draw text in center
    text_bbox = draw.textbbox((0, 0), name, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    x = (400 - text_width) // 2
    y = (400 - text_height) // 2
    
    draw.text((x, y), name, fill="white", font=font)
    
    # Save image
    filepath = os.path.join(team_dir, f"{filename}.jpg")
    img.save(filepath)
    print(f"✓ Created {filepath}")

print("\nAll team member images created successfully!")
